/**
 * Coach Lari (tampilan): percakapan dengan coach AI yang membaca data lari & kesehatan,
 * impor tangkapan layar Strava/Garmin/dll. menjadi catatan lari, profil kesehatan, dan riwayat sesi.
 * Dengan lokasi dihidupkan: cuaca BMKG di desa terdekat ikut dibaca coach, dan saran jarak dari coach
 * langsung diberi rute sungguhan (kartu rute di chat). Seluruh isi sesi dikirim setiap bertanya; bila
 * sesi sangat panjang, pesan lama diringkas coach (disimpan di sesi) agar tetap diingat.
 * Permintaan ke AI lewat /api/coach (server) — kunci API tidak pernah ada di browser.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const C = P.coach;
  const R = P.run;
  const { esc, icon } = P.ui;
  const doc = root.document;

  const CURRENT_KEY = 'rencana-harian/coach-current';
  const PROMPTS = [
    'Evaluasi lari minggu ini',
    'Kapan sebaiknya aku lari besok, dan berapa jauh? Kasih rutenya',
    'Bagaimana cuaca untuk lari hari ini dan besok pagi?',
    'Buat rencana latihan 4 minggu sesuai targetku',
    'Apakah detak jantungku terlalu tinggi saat lari?',
    'Apa yang harus kuperbaiki dari pola lariku?',
  ];

  let available = null; // null = belum dicek; true/false dari /api/health
  let remaining = null;
  let draft = '';
  let controller = null;
  let paintQueued = false;
  /** Status jawaban yang sedang mengalir / impor yang sedang dibaca. */
  const live = { chatId: null, text: '', pending: false, importing: false, error: null };
  /** Lokasi (hanya di memori, tidak disimpan) & cuaca BMKG untuk coach. */
  const geo = { loc: null, at: 0, locating: false, error: null, weather: null, weatherAt: 0, loading: false, weatherError: null, tried: false, open: false };
  const LOC_FRESH_MS = 15 * 60000;
  const WEATHER_FRESH_MS = 30 * 60000;
  const MEMORY_AT = 50000; // sesi lebih besar dari ini: pesan lama diringkas dulu
  const MEMORY_KEEP = 10; // pesan terbaru yang tetap utuh saat meringkas
  const routeJobs = new Set(); // kartu rute yang sedang dicari (kunci: id sesi + waktu pesan)
  const openMemory = new Set(); // sesi yang ringkasannya sedang dibuka

  let currentId = null;
  try {
    currentId = root.localStorage.getItem(CURRENT_KEY);
  } catch {
    /* opsional */
  }
  function setCurrent(id) {
    currentId = id;
    try {
      if (id) root.localStorage.setItem(CURRENT_KEY, id);
      else root.localStorage.removeItem(CURRENT_KEY);
    } catch {
      /* opsional */
    }
  }

  const st = () => P.store.state;
  const locOn = () => Boolean(st().settings.coachLocation);
  const loggedIn = () => P.sync.info().loggedIn;
  const current = () => (currentId && P.store.findCoachChat(currentId)) || null;
  const nowHHMM = () => D.formatTime(D.minutesOfDay(new Date()));
  const refresh = () => P.app && P.app.refresh();

  // ----- Markdown sederhana & aman (teks di-escape dulu, tanpa tautan/HTML mentah) -----

  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  }

  function md(src) {
    const lines = esc(C.tidyText(src)).split('\n');
    const out = [];
    let i = 0;
    const para = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join('<br>'))}</p>`);
      para.length = 0;
    };
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();
      if (!t) {
        flushPara();
        i += 1;
      } else if (t.startsWith('```')) {
        flushPara();
        const code = [];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
        i += 1;
        out.push(`<pre>${code.join('\n')}</pre>`);
      } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
        flushPara();
        out.push('<hr>');
        i += 1;
      } else if (/^#{1,6}\s/.test(t)) {
        flushPara();
        out.push(`<h4>${inline(t.replace(/^#{1,6}\s+/, ''))}</h4>`);
        i += 1;
      } else if (/^\|.*\|$/.test(t)) {
        flushPara();
        const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) rows.push(lines[i++].trim());
        const cells = (r) => r.slice(1, -1).split('|').map((c) => inline(c.trim()));
        const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
        const [first, ...rest] = body;
        out.push(`<div class="coach-table"><table><thead><tr>${cells(first).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      } else if (/^([-*•])\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
        flushPara();
        const ordered = /^\d+[.)]\s+/.test(t);
        const items = [];
        while (i < lines.length) {
          const u = lines[i].trim();
          if (ordered ? /^\d+[.)]\s+/.test(u) : /^([-*•])\s+/.test(u)) items.push(u.replace(ordered ? /^\d+[.)]\s+/ : /^([-*•])\s+/, ''));
          else if (u && items.length && /^\s{2,}/.test(lines[i])) items[items.length - 1] += `<br>${u}`;
          else break;
          i += 1;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
      } else {
        para.push(t);
        i += 1;
      }
    }
    flushPara();
    return out.join('');
  }

  // ----- Data untuk coach -----

  function prayersFor(date) {
    const s = st().settings;
    if (!s.prayerEnabled || !P.prayer) return null;
    const city = P.prayer.findCity(s.prayerCity);
    return P.prayer.times(date, city).map((p) => ({ name: p.name || p.id, time: D.formatTime(p.minutes) }));
  }

  function context() {
    const today = D.todayKey();
    const s = st().settings;
    const prayers = s.prayerEnabled ? { city: P.prayer.findCity(s.prayerCity).name, today: prayersFor(today), tomorrow: prayersFor(D.addDays(today, 1)) } : null;
    const ctx = C.buildContext(st(), { today, prayers });
    // Lokasi: hanya nama wilayah (koordinat tidak dikirim ke AI) dan prakiraan cuaca BMKG.
    const w = geo.weather;
    if (locOn() && w) {
      ctx.location = { desa: w.place.desa, kecamatan: w.place.kecamatan, kota: w.place.kota, provinsi: w.place.provinsi };
      ctx.weather = { source: w.source, analysis: w.analysis, now: w.now, next: w.next, rainChance24h: w.rainChance24h, rainyNext24h: w.rainyNext24h, days: w.days };
    } else {
      ctx.location = locOn() && geo.loc ? 'lokasi aktif, cuaca BMKG belum tersedia' : 'lokasi belum dihidupkan';
    }
    return ctx;
  }

  const kmText = (m) => R.formatKm(Math.round(m / 10) / 100, 2);
  const KIND = { putar: 'Putar', lurus: 'Lurus bolak-balik', semua: 'Putar atau lurus' };

  /** Pesan impor dikirim ke AI sebagai teks data (gambar tidak dikirim ulang); rute yang ditampilkan ikut diingat. */
  function toApi(m) {
    if (m.kind === 'import') {
      return { role: 'user', content: `Aku mengimpor tangkapan layar aktivitas${m.data && m.data.source_app ? ` dari ${m.data.source_app}` : ''}. Data yang terbaca: ${JSON.stringify(m.data || {})}` };
    }
    const r = m.route && m.route.status === 'ok' && m.route.routes[m.route.pick || 0];
    if (r) {
      const streets = r.streets.length ? ` lewat ${r.streets.join(', ')}` : '';
      return { role: m.role, content: `${m.text}\n\n[Rute yang ditampilkan aplikasi: ${kmText(r.distance)} km, ${r.type === 'lurus' ? 'lurus bolak-balik' : 'putar'}, ke ${r.direction}${streets}]` };
    }
    return { role: m.role, content: m.text };
  }

  // ----- Lokasi & cuaca BMKG -----

  function readGps() {
    return new Promise((resolve, reject) => {
      const g = root.navigator.geolocation;
      if (!g) {
        reject(new Error('Perangkat ini tidak bisa membaca lokasi.'));
        return;
      }
      g.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
        (err) => reject(new Error(err && err.code === 1
          ? 'Izin lokasi ditolak. Izinkan lokasi untuk situs ini di pengaturan browser, lalu coba lagi.'
          : 'Lokasi belum terbaca. Pastikan GPS/lokasi perangkat hidup, lalu coba lagi.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5 * 60000 },
      );
    });
  }

  async function ensureLocation({ force = false } = {}) {
    if (!force && geo.loc && Date.now() - geo.at < LOC_FRESH_MS) return geo.loc;
    geo.locating = true;
    refresh();
    try {
      geo.loc = await readGps();
      geo.at = Date.now();
      geo.error = null;
      return geo.loc;
    } catch (err) {
      geo.error = err.message;
      return null;
    } finally {
      geo.locating = false;
      refresh();
    }
  }

  /** Cuaca BMKG di desa terdekat (disimpan 30 menit). */
  async function refreshWeather({ force = false } = {}) {
    if (!locOn() || !loggedIn()) return null;
    const loc = await ensureLocation({ force });
    if (!loc) return null;
    if (!force && geo.weather && Date.now() - geo.weatherAt < WEATHER_FRESH_MS) return geo.weather;
    geo.loading = true;
    refresh();
    try {
      const out = await P.sync.api('coach', { method: 'POST', timeout: 20000, body: { action: 'weather', lat: loc.lat, lng: loc.lng } });
      geo.weather = out.weather;
      geo.weatherAt = Date.now();
      geo.weatherError = null;
    } catch (err) {
      geo.weatherError = err.message || 'Cuaca BMKG belum bisa diambil.';
    } finally {
      geo.loading = false;
      refresh();
    }
    return geo.weather;
  }

  async function enableLocation() {
    if (!loggedIn()) {
      needAccess();
      return;
    }
    P.store.setSettings({ coachLocation: true });
    await refreshWeather({ force: true });
    // Kartu rute yang menunggu lokasi langsung dicarikan.
    const chat = current();
    if (geo.loc && chat) for (const m of chat.messages) if (m.route && m.route.status === 'need_location') buildRoute(chat.id, m.t);
  }

  function disableLocation() {
    P.store.setSettings({ coachLocation: false });
    Object.assign(geo, { loc: null, at: 0, weather: null, weatherAt: 0, error: null, weatherError: null, open: false });
    refresh();
  }

  // ----- Rute dari saran coach -----

  const jobKey = (chatId, t) => `${chatId}:${t}`;

  function updateRoute(chatId, t, patch) {
    const chat = P.store.findCoachChat(chatId);
    if (!chat) return;
    P.store.saveCoachChat({ ...chat, messages: chat.messages.map((m) => (m.t === t && m.route ? { ...m, route: { ...m.route, ...patch } } : m)) });
  }

  /** Cari rute untuk saran jarak coach dari lokasi pengguna (lewat mesin rute tab Rute). */
  async function buildRoute(chatId, t, { seed = 0 } = {}) {
    const key = jobKey(chatId, t);
    const chat = P.store.findCoachChat(chatId);
    const m = chat && chat.messages.find((x) => x.t === t && x.route);
    if (!m || routeJobs.has(key)) return;
    if (!locOn()) {
      updateRoute(chatId, t, { status: 'need_location' });
      return;
    }
    routeJobs.add(key);
    refresh();
    try {
      const loc = await ensureLocation();
      if (!loc) {
        updateRoute(chatId, t, { status: 'need_location' });
        return;
      }
      const res = await P.routeUI.routesFor({ lat: loc.lat, lng: loc.lng, km: m.route.km, type: m.route.type, seed }, { max: 3 });
      if (!res.routes.length) throw new Error('Belum ketemu rute di sekitarmu.');
      updateRoute(chatId, t, { status: 'ok', routes: res.routes, pick: 0, within: res.withinTolerance, error: undefined });
    } catch (err) {
      updateRoute(chatId, t, { status: 'error', error: err.message || 'Rute belum bisa dicari.' });
    } finally {
      routeJobs.delete(key);
      refresh();
    }
  }

  /** Gambar kecil bentuk rute (tanpa ubin peta): garis rute + titik mulai. */
  function routeSketch(r) {
    const lat0 = (r.coords[0][0] * Math.PI) / 180;
    const xy = r.coords.map(([a, o]) => [o * Math.cos(lat0), -a]);
    const xs = xy.map((p) => p[0]);
    const ys = xy.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const W = 160;
    const H = 96;
    const k = Math.min((W - 16) / Math.max(x1 - x0, 1e-9), (H - 16) / Math.max(y1 - y0, 1e-9));
    const ox = (W - (x1 - x0) * k) / 2;
    const oy = (H - (y1 - y0) * k) / 2;
    const pt = ([x, y]) => `${(ox + (x - x0) * k).toFixed(1)},${(oy + (y - y0) * k).toFixed(1)}`;
    const [sx, sy] = pt(xy[0]).split(',');
    return `<svg class="coach-route-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bentuk rute"><polyline points="${xy.map(pt).join(' ')}" fill="none" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${sx}" cy="${sy}" r="4.5"/></svg>`;
  }

  const savedName = (r) => `${r.type === 'lurus' ? 'Lurus' : 'Putar'} ${kmText(r.distance)} km ke ${r.direction} (coach)`;
  const isSaved = (r) => P.store.state.savedRoutes.some((x) => x.distance === r.distance && x.coords.length && Math.abs(x.coords[Math.floor(x.coords.length / 2)][0] - r.coords[Math.floor(r.coords.length / 2)][0]) < 5e-4 && x.type === r.type);

  function routeCard(m) {
    const rt = m.route;
    const busy = routeJobs.has(jobKey(currentId, m.t));
    const head = `<p class="coach-route-head">${icon('route')}<strong>Rute ${esc(R.formatKm(rt.km, 1))} km</strong><span class="route-kind">${esc(KIND[rt.type] || KIND.semua)}</span></p>`;
    let body;
    if (busy) body = '<p class="coach-typing">Mencari rute dari lokasimu<span></span></p>';
    else if (rt.status === 'need_location') {
      body = `<p class="muted">Hidupkan lokasi supaya coach bisa memberi rute dari tempatmu.</p><button type="button" class="btn small primary" data-coach-loc>${icon('pin')}Hidupkan lokasi</button>`;
    } else if (rt.status === 'error') {
      body = `<p class="route-note warn">${esc(rt.error || 'Rute belum bisa dicari.')}</p><button type="button" class="btn small ghost" data-coach-route-retry="${m.t}">${icon('refresh')}Coba lagi</button>`;
    } else if (rt.status !== 'ok') {
      body = `<button type="button" class="btn small primary" data-coach-route-retry="${m.t}">${icon('route')}Cari rutenya</button>`;
    } else {
      const r = rt.routes[rt.pick || 0];
      const pace = R.paceOf([...st().runs].filter((x) => x.sec > 0 && x.km > 0).slice(-10)) || 420;
      const mins = Math.round(((r.distance / 1000) * pace) / 60);
      const diff = Math.abs(r.diff) < 10 ? 'pas' : `${r.diff > 0 ? '+' : '−'}${Math.abs(Math.round(r.diff / 10) * 10)} m`;
      body = `
        <div class="coach-route-body">
          ${routeSketch(r)}
          <div>
            <p class="coach-route-km"><b data-coach-route-km>${esc(kmText(r.distance))} km</b> <small>${esc(diff)}</small></p>
            <p class="coach-route-meta">${esc(r.type === 'lurus' ? 'Lurus bolak-balik' : 'Putar')} · ke ${esc(r.direction)} · ${r.turns} belokan · ±${mins} mnt</p>
            ${r.streets.length ? `<p class="coach-route-streets">${esc(r.streets.join(', '))}</p>` : ''}
            ${rt.within === false ? '<p class="route-note warn">Belum ada rute dengan selisih ≤ 300 m di sekitarmu; ini yang terdekat.</p>' : ''}
          </div>
        </div>
        <div class="coach-route-actions">
          <a class="btn primary small" href="${esc(P.geo.googleMapsUrl(r.start, r.waypoints))}" target="_blank" rel="noopener" data-coach-route-gmaps>${icon('external')}Google Maps</a>
          <button type="button" class="btn ghost small" data-coach-route-map="${m.t}">${icon('pin')}Lihat di peta</button>
          ${rt.routes.length > 1 ? `<button type="button" class="btn ghost small" data-coach-route-next="${m.t}">${icon('refresh')}Rute lain (${(rt.pick || 0) + 1}/${rt.routes.length})</button>` : ''}
          ${isSaved(r) ? `<button type="button" class="btn ghost small" disabled>${icon('check')}Tersimpan</button>` : `<button type="button" class="btn ghost small" data-coach-route-save="${m.t}">${icon('bookmark')}Simpan</button>`}
        </div>`;
    }
    return `<div class="coach-route" data-coach-route="${m.t}">${head}${body}</div>`;
  }

  /** Strip lokasi & cuaca di atas chat. */
  function geoStrip() {
    if (!loggedIn() || available === false) return '';
    if (!locOn()) {
      return `<div class="coach-geo"><button type="button" class="coach-geo-btn" data-coach-loc>${icon('pin')}<span><b>Lokasi mati.</b> Hidupkan agar coach tahu cuaca BMKG di tempatmu dan bisa memberi rute.</span></button></div>`;
    }
    const w = geo.weather;
    let text;
    if (geo.locating) text = 'Membaca lokasimu…';
    else if (geo.loading && !w) text = 'Mengambil prakiraan cuaca BMKG…';
    else if (w) text = `<b>${esc(w.place.desa || w.place.kecamatan)}</b> · ${esc(w.now ? `${w.now.desc} ${Math.round(w.now.t)}°C` : 'cuaca')} · hujan ${w.rainChance24h}% (24 jam)`;
    else text = `<span class="warn">${esc(geo.error || geo.weatherError || 'Cuaca belum tersedia.')}</span>`;
    return `
      <div class="coach-geo on">
        <button type="button" class="coach-geo-btn" ${w ? 'data-coach-weather' : 'data-coach-loc'} aria-expanded="${Boolean(w && geo.open)}">${icon('pin')}<span>${text}</span></button>
        <button type="button" class="link-btn" data-coach-loc-off>Matikan</button>
      </div>
      ${w && geo.open ? weatherPanel(w) : ''}`;
  }

  function weatherPanel(w) {
    const day = (d) => (d === D.todayKey() ? 'Hari ini' : d === D.addDays(D.todayKey(), 1) ? 'Besok' : D.formatShort(d));
    return `
      <div class="coach-weather" data-coach-weather-panel>
        <p class="coach-weather-place">${esc([w.place.desa, w.place.kecamatan, w.place.kota].filter(Boolean).join(', '))}</p>
        <ul class="coach-weather-slots">${w.next.map((s) => `
          <li class="${s.rain ? 'rain' : ''}"><b>${esc(s.time)}</b><span>${esc(s.desc)}</span><span>${Math.round(s.t)}°C · ${Math.round(s.hu)}%</span></li>`).join('')}</ul>
        <p class="coach-weather-days">${w.days.map((d) => `<span>${esc(day(d.date))}: ${Math.round(d.tMin)}-${Math.round(d.tMax)}°C, hujan ${d.rainChance}%</span>`).join('')}</p>
        <p class="hint">Sumber: BMKG, prakiraan per 3 jam di desa terdekat (±${esc(String(w.place.jarakKm))} km). "Hujan %" = bagian periode 3 jam yang diprakirakan hujan. Kelembapan dalam %.</p>
      </div>`;
  }

  // ----- Tampilan -----

  function importCard(m) {
    const x = m.data || {};
    const parts = [];
    if (x.distance_km) parts.push(`${R.formatKm(x.distance_km)} km`);
    const sec = x.moving_time_sec || x.elapsed_time_sec;
    if (sec) parts.push(R.formatClock(sec));
    if (x.avg_pace_sec_per_km) parts.push(`${R.formatPace(x.avg_pace_sec_per_km)} /km`);
    if (x.avg_heart_rate) parts.push(`❤ ${x.avg_heart_rate} bpm`);
    if (x.calories) parts.push(`${x.calories} kkal`);
    const saved = m.runId && P.store.findRun(m.runId);
    return `
      <div class="coach-import">
        <p class="coach-import-head">${icon('camera')}${esc(x.source_app || 'Tangkapan layar')}${x.title ? ` · ${esc(x.title)}` : ''}${x.date ? ` · ${esc(D.formatShort(x.date))}` : ''}</p>
        <p class="coach-import-stats">${parts.map(esc).join(' · ') || 'Data tidak lengkap'}</p>
        ${saved
          ? `<p class="coach-import-saved">${icon('check')}Tersimpan di catatan lari</p>`
          : `<button type="button" class="btn small secondary" data-coach-save-import="${m.t}">${icon('plus')}Simpan ke catatan lari</button>`}
      </div>`;
  }

  function bubble(m) {
    if (m.kind === 'import') return `<div class="coach-msg user import">${importCard(m)}</div>`;
    const who = m.role === 'user' ? 'user' : 'coach';
    const route = who === 'coach' && m.route ? routeCard(m) : '';
    return `<div class="coach-msg ${who}">${who === 'coach' ? `<span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span>` : ''}<div class="coach-md">${who === 'coach' ? md(m.text) : `<p>${esc(m.text).replace(/\n/g, '<br>')}</p>`}${route}</div></div>`;
  }

  /** Catatan di awal sesi yang pesan lamanya sudah diringkas. */
  function memoryNote(chat) {
    if (!chat || !chat.memory) return '';
    const open = openMemory.has(chat.id);
    return `
      <div class="coach-memory">
        <p>${icon('check')}<span>${chat.compacted || 'Beberapa'} pesan lama di sesi ini sudah diringkas coach dan tetap diingat.</span><button type="button" class="link-btn" data-coach-memory>${open ? 'Tutup' : 'Lihat ringkasan'}</button></p>
        ${open ? `<div class="coach-md">${md(chat.memory)}</div>` : ''}
      </div>`;
  }

  function liveBubble(chat) {
    if (!(live.pending || live.error || live.importing) || live.chatId !== (chat ? chat.id : null)) return '';
    if (live.importing) {
      return `<div class="coach-msg coach" data-coach-live><span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span><div class="coach-md"><p class="coach-typing">Membaca tangkapan layar<span></span></p></div></div>`;
    }
    if (live.error && !live.pending) {
      return `
        <div class="coach-msg coach error" data-coach-live>
          <span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span>
          <div class="coach-md"><p>${esc(live.error)}</p><button type="button" class="btn small ghost" data-coach-retry>${icon('refresh')}Coba lagi</button></div>
        </div>`;
    }
    return `
      <div class="coach-msg coach" data-coach-live>
        <span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span>
        <div class="coach-md">${live.text ? md(C.stripRouteTag(live.text)) : '<p class="coach-typing">Coach sedang menganalisis datamu<span></span></p>'}</div>
      </div>`;
  }

  function banner() {
    if (!loggedIn()) {
      return `
        <div class="coach-banner">
          <p><strong>Masuk dulu untuk memakai coach.</strong> Permintaan ke AI lewat server aplikasimu supaya kunci API tetap aman.</p>
          <button type="button" class="btn small primary" data-coach-login>Masuk</button>
        </div>`;
    }
    if (available === false) {
      return `
        <div class="coach-banner warn">
          <p><strong>Coach belum aktif di server.</strong> Buka Vercel → proyek <em>plan</em> → Settings → Environment Variables, tambahkan <code>GEMINI_API_KEY</code> (gratis dari aistudio.google.com → Get API key), lalu Redeploy.</p>
        </div>`;
    }
    return '';
  }

  function profileCard() {
    const p = C.cleanProfile(st().settings.coachProfile);
    const max = C.maxHrOf(p);
    const zones = C.hrZones(p);
    const row = (label, value) => (value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : '');
    const filled = Object.values(p).some((v) => v !== null && v !== '');
    return `
      <section class="panel coach-profile">
        <div class="panel-head"><h2>Profil kesehatan</h2><button type="button" class="link-btn" data-coach-profile>${icon('edit')}${filled ? 'Ubah' : 'Isi'}</button></div>
        ${filled ? `
          <dl class="coach-dl">
            ${row('Usia', p.age ? `${p.age} th${p.sex ? ` · ${esc(p.sex)}` : ''}` : '')}
            ${row('Tinggi · berat', p.heightCm || p.weightKg ? `${p.heightCm ? `${p.heightCm} cm` : '–'} · ${p.weightKg ? `${p.weightKg} kg` : '–'}` : '')}
            ${row('HR istirahat', p.restingHr ? `${p.restingHr} bpm` : '')}
            ${row('HR maks', max ? `${max.value} bpm${p.maxHr ? '' : ' <span class="muted">(perkiraan)</span>'}` : '')}
            ${row('Target', esc(p.goal))}
            ${row('Kondisi', esc(p.health))}
            ${row('Waktu luang', esc(p.availability))}
          </dl>
          ${zones ? `<p class="coach-zones">${zones.zones.map((z) => `<span title="${esc(z.zone)}">${esc(z.zone.split(' ')[0])} ${z.from}–${z.to}</span>`).join('')}</p>` : ''}`
          : '<p class="muted">Isi usia, berat, detak jantung, target, dan kondisi kesehatan (mis. cedera) supaya saran coach lebih tepat.</p>'}
      </section>`;
  }

  const trashItems = () => st().coachTrash.filter((c) => C.trashDaysLeft(c.deletedAt) > 0).sort((a, b) => b.deletedAt - a.deletedAt);

  function sessionsCard(chat) {
    const list = [...st().coachChats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    const bin = trashItems().length;
    return `
      <section class="panel coach-sessions">
        <div class="panel-head"><h2>Sesi</h2><button type="button" class="link-btn" data-coach-new>${icon('plus')}Baru</button></div>
        ${list.length ? `<ul>${list.map((c) => `
          <li class="${chat && c.id === chat.id ? 'on' : ''}">
            <button type="button" class="coach-session" data-coach-open="${esc(c.id)}"><span>${esc(c.title)}</span><small>${esc(D.formatShort(D.todayKey(new Date(c.updatedAt))))} · ${c.messages.length} pesan</small></button>
            <button type="button" class="icon-btn" data-coach-del="${esc(c.id)}" aria-label="Hapus sesi ${esc(c.title)}" title="Hapus" ${live.pending && c.id === currentId ? 'disabled' : ''}>${icon('trash')}</button>
          </li>`).join('')}</ul>` : '<p class="muted">Belum ada sesi. Mulai dengan pertanyaan di samping.</p>'}
        <button type="button" class="link-btn coach-bin-link" data-coach-bin>${icon('trash')}Sampah${bin ? ` <span class="coach-bin-count">${bin}</span>` : ''}</button>
      </section>`;
  }

  function render() {
    const chat = current();
    const msgs = chat ? chat.messages : [];
    const busy = live.pending || live.importing;
    const off = !loggedIn() || available === false;
    return `
      <div class="coach" data-coach>
        ${banner()}
        <div class="coach-grid">
          <section class="panel coach-chat" data-key="coach-chat">
            <div class="coach-head">
              <div>
                <h2>${esc(chat ? chat.title : 'Tanya coach lari')}</h2>
                <p class="muted">Menganalisis catatan lari, profil kesehatan, kebiasaan, dan jadwalmu</p>
              </div>
              ${chat ? `<button type="button" class="btn ghost small" data-coach-new>${icon('plus')}Sesi baru</button>` : ''}
            </div>
            ${geoStrip()}
            <div class="coach-log" data-coach-log>
              ${memoryNote(chat)}
              ${msgs.length ? msgs.map(bubble).join('') : `
                <div class="coach-intro">
                  <span class="coach-avatar big" aria-hidden="true">${icon('sparkle')}</span>
                  <p><strong>Halo! Aku coach larimu.</strong> Kirim tangkapan layar dari Strava untuk kurangkum, atau tanya apa saja soal latihan: kapan sebaiknya lari, berapa jauh, pace dan detak jantung, sampai rencana menuju targetmu.</p>
                </div>`}
              ${liveBubble(chat)}
            </div>
            ${msgs.length ? '' : `<div class="coach-prompts">${PROMPTS.map((q) => `<button type="button" class="coach-chip" data-coach-prompt="${esc(q)}" ${off || busy ? 'disabled' : ''}>${esc(q)}</button>`).join('')}</div>`}
            <form class="coach-input" data-coach-form autocomplete="off">
              <button type="button" class="icon-btn" data-coach-attach title="Impor tangkapan layar Strava" aria-label="Impor tangkapan layar" ${off || busy ? 'disabled' : ''}>${icon('camera')}</button>
              <textarea name="q" rows="1" maxlength="4000" placeholder="Tanya coach… mis. Kapan sebaiknya aku lari besok?" aria-label="Pertanyaan untuk coach" data-coach-q ${off ? 'disabled' : ''}>${esc(draft)}</textarea>
              ${live.pending
                ? `<button type="button" class="btn secondary coach-send" data-coach-stop aria-label="Hentikan jawaban" title="Hentikan">${icon('stop')}</button>`
                : `<button type="submit" class="btn primary coach-send" aria-label="Kirim" title="Kirim (Enter)" ${off || busy ? 'disabled' : ''}>${icon('send')}</button>`}
            </form>
            <p class="coach-foot">${remaining !== null ? `Sisa ${remaining} permintaan hari ini · ` : ''}Coach AI bisa keliru dan bukan pengganti dokter.</p>
          </section>
          <aside class="coach-side">
            ${profileCard()}
            ${sessionsCard(chat)}
            <p class="hint coach-privacy">Saat bertanya, aplikasi mengirim ringkasan profil, catatan lari, kebiasaan, air minum, suasana hati, dan jadwalmu ke Gemini (Google) lewat servermu. Bila lokasi hidup, koordinatmu dikirim ke servermu untuk mencari desa terdekat & cuaca BMKG (tidak disimpan); ke Gemini hanya nama desa/kecamatan dan prakiraan cuacanya. Tangkapan layar hanya dikirim saat diimpor dan tidak disimpan di aplikasi. Di paket gratis, Google dapat memakai data yang dikirim untuk meningkatkan layanannya.</p>
          </aside>
        </div>
      </div>`;
  }

  // ----- Aliran jawaban -----

  function scrollLog(force = false) {
    const log = doc.querySelector('[data-coach-log]');
    if (!log) return;
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    if (force || near) log.scrollTop = log.scrollHeight;
  }

  function paintLive() {
    if (paintQueued) return;
    paintQueued = true;
    root.requestAnimationFrame(() => {
      paintQueued = false;
      const box = doc.querySelector('[data-coach-live] .coach-md');
      if (box && live.text) box.innerHTML = md(C.stripRouteTag(live.text));
      scrollLog();
    });
  }

  function needAccess() {
    if (!loggedIn()) {
      P.ui.toast('Masuk dulu untuk memakai coach.', { action: 'Masuk', onAction: () => P.account.openAccount() });
      return true;
    }
    if (available === false) {
      P.ui.toast('Coach belum aktif. Pasang GEMINI_API_KEY di Vercel.', { tone: 'warn' });
      return true;
    }
    return false;
  }

  /**
   * Sesi yang sudah sangat panjang (hampir melewati batas satu entri sinkron): pesan lama diringkas
   * coach lalu dibuang, ringkasannya disimpan di sesi dan selalu ikut dikirim.
   */
  async function compactChat(chat) {
    if (JSON.stringify(chat.messages).length < MEMORY_AT || chat.messages.length <= MEMORY_KEEP + 2) return chat;
    const old = chat.messages.slice(0, -MEMORY_KEEP);
    try {
      const out = await P.sync.api('coach', { method: 'POST', timeout: 60000, body: { action: 'memory', memory: chat.memory || '', messages: old.map(toApi) } });
      if (Number.isFinite(out.remaining)) remaining = out.remaining;
      const fresh = P.store.findCoachChat(chat.id) || chat;
      return P.store.saveCoachChat({ ...fresh, memory: out.memory, compacted: (fresh.compacted || 0) + old.length, messages: fresh.messages.filter((m) => !old.includes(m)) });
    } catch {
      return chat; // gagal meringkas: kirim apa adanya (server tetap menerima seluruh pesan)
    }
  }

  async function stream(chat) {
    live.chatId = chat.id;
    live.text = '';
    live.error = null;
    live.pending = true;
    refresh();
    root.requestAnimationFrame(() => scrollLog(true));
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    let stopped = false;
    try {
      chat = await compactChat(chat);
      // Lokasi hidup: cuaca BMKG terbaru ikut dibaca coach (disimpan 30 menit).
      if (locOn()) await Promise.race([refreshWeather(), new Promise((r) => setTimeout(r, 12000))]);
      await P.sync.apiStream('coach', {
        signal: controller && controller.signal,
        body: {
          action: 'chat',
          today: D.todayKey(),
          now: nowHHMM(),
          context: context(),
          memory: chat.memory || '',
          messages: chat.messages.map(toApi),
        },
        onEvent(e) {
          if (e.t === 'start' && Number.isFinite(e.remaining)) remaining = e.remaining;
          else if (e.t === 'text') {
            live.text += e.v;
            paintLive();
          } else if (e.t === 'error') live.error = e.message;
        },
      });
    } catch (err) {
      if (err && err.name === 'AbortError') stopped = true;
      else live.error = err.message || 'Coach sedang tidak bisa dihubungi.';
      if (err && err.code === 'coach_off') available = false;
    }
    controller = null;
    live.pending = false;
    const text = live.text.trim();
    if (text) {
      const fresh = P.store.findCoachChat(chat.id) || chat;
      const note = live.error ? `\n\n_(Jawaban terputus: ${live.error})_` : stopped ? '\n\n_(Dihentikan)_' : '';
      live.text = '';
      live.error = null;
      // Saran rute dari coach ("[[RUTE 5 km putar]]") → kartu rute sungguhan dari lokasimu.
      const tag = C.routeTag(text);
      const msg = { role: 'assistant', text: C.tidyText(C.stripRouteTag(text)) + note, t: Date.now() };
      if (tag) msg.route = { km: tag.km, type: tag.type, status: 'pending' };
      P.store.saveCoachChat({ ...fresh, messages: [...fresh.messages, msg] });
      if (tag) buildRoute(fresh.id, msg.t);
    } else if (stopped) {
      live.error = null;
    }
    refresh();
    root.requestAnimationFrame(() => scrollLog(true));
  }

  function ask(text, { fromInput = false } = {}) {
    const q = String(text || '').trim();
    if (!q || live.pending || live.importing || needAccess()) return;
    if (fromInput) {
      // Kolom yang sedang fokus tidak disentuh render (morph), jadi dikosongkan langsung di sini.
      draft = '';
      const box = doc.querySelector('[data-coach-q]');
      if (box) {
        box.value = '';
        box.style.height = '';
      }
    }
    const existing = current();
    const chat = existing || { id: `cc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: C.chatTitle(q), createdAt: Date.now(), messages: [] };
    const saved = P.store.saveCoachChat({ ...chat, messages: [...chat.messages, { role: 'user', text: q, t: Date.now() }] });
    setCurrent(saved.id);
    stream(saved);
  }

  // ----- Impor tangkapan layar -----

  function pickImage() {
    return new Promise((resolve) => {
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), { once: true });
      input.click();
    });
  }

  /** Perkecil gambar (maks. 1600 px) lalu jadikan JPEG base64 agar hemat kuota & cepat dikirim. */
  async function toJpeg(file) {
    const url = root.URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new root.Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('Gambar tidak bisa dibuka.'));
        im.src = url;
      });
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = doc.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
    } finally {
      root.URL.revokeObjectURL(url);
    }
  }

  /** Data hasil baca yang disimpan di pesan impor (ringkas, tanpa ringkasan panjang). */
  function compact(x) {
    const keep = ['source_app', 'activity_type', 'title', 'date', 'start_time', 'distance_km', 'moving_time_sec', 'elapsed_time_sec',
      'avg_pace_sec_per_km', 'avg_heart_rate', 'max_heart_rate', 'calories', 'elevation_gain_m', 'avg_cadence_spm', 'location', 'splits', 'notes'];
    const out = {};
    for (const k of keep) if (x[k] !== null && x[k] !== undefined && !(Array.isArray(x[k]) && !x[k].length)) out[k] = x[k];
    if (Array.isArray(out.splits)) out.splits = out.splits.slice(0, 30);
    return out;
  }

  function openDraft(x, chatId, t) {
    const draftRun = C.draftFromExtract(x, D.todayKey());
    P.lari.openRunEditor(null, {
      ...draftRun,
      stay: Boolean(chatId), // di Coach: tetap di percakapan, jangan pindah bulan
      onSaved(saved) {
        if (!chatId) return;
        const chat = P.store.findCoachChat(chatId);
        if (!chat) return;
        P.store.saveCoachChat({ ...chat, messages: chat.messages.map((m) => (m.kind === 'import' && m.t === t ? { ...m, runId: saved.id } : m)) });
      },
    });
  }

  /**
   * Pilih gambar → coach membaca datanya → dialog Catat lari terisi (dengan ringkasan coach).
   * @param {{toChat?: boolean}} opts toChat: catat juga di sesi chat coach yang sedang dibuka
   */
  async function importScreenshot({ toChat = false } = {}) {
    if (live.pending || live.importing || needAccess()) return;
    const file = await pickImage();
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      P.ui.toast('Pilih berkas gambar (tangkapan layar).', { tone: 'warn' });
      return;
    }
    let image;
    try {
      image = await toJpeg(file);
    } catch (err) {
      P.ui.toast(err.message, { tone: 'warn' });
      return;
    }
    let chat = toChat ? current() : null;
    if (toChat && !chat) {
      chat = P.store.saveCoachChat({ id: `cc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: 'Impor tangkapan layar', createdAt: Date.now(), messages: [] });
      setCurrent(chat.id);
    }
    live.chatId = chat ? chat.id : null;
    live.importing = true;
    live.error = null;
    refresh();
    let res;
    try {
      res = await P.ui.withBusy(null, () => P.sync.api('coach', {
        method: 'POST',
        timeout: 90000,
        body: { action: 'extract', image, today: D.todayKey(), context: context() },
      }));
    } catch (err) {
      live.importing = false;
      if (err && err.code === 'coach_off') available = false;
      refresh();
      P.ui.toast(err.message || 'Gagal membaca tangkapan layar.', { tone: 'warn', duration: 7000 });
      return;
    }
    live.importing = false;
    if (Number.isFinite(res.remaining)) remaining = res.remaining;
    const x = res.run || {};
    if (!x.is_activity_screenshot || !(x.distance_km > 0)) {
      refresh();
      P.ui.toast('Coach tidak menemukan data lari di gambar itu. Coba tangkapan layar ringkasan aktivitas.', { tone: 'warn', duration: 7000 });
      return;
    }
    let t = null;
    if (chat) {
      t = Date.now();
      const fresh = P.store.findCoachChat(chat.id) || chat;
      P.store.saveCoachChat({
        ...fresh,
        title: fresh.messages.length ? fresh.title : C.chatTitle(`${x.title || 'Lari'} ${x.distance_km ? `${R.formatKm(x.distance_km)} km` : ''}`),
        messages: [
          ...fresh.messages,
          { role: 'user', kind: 'import', text: `Impor tangkapan layar ${x.source_app || ''}`.trim(), data: compact(x), t },
          { role: 'assistant', text: x.summary ? C.tidyText(x.summary) : 'Data terbaca.', t: t + 1 },
        ],
      });
    }
    refresh();
    root.requestAnimationFrame(() => scrollLog(true));
    openDraft(x, chat ? chat.id : null, t);
  }

  // ----- Profil -----

  function openProfile() {
    const p = C.cleanProfile(st().settings.coachProfile);
    const v = (x) => (x === null || x === undefined ? '' : x);
    const numF = (name, label, suffix, min, max, step = 1) => `
      <div class="field compact">
        <label for="cp-${name}">${label}</label>
        <div class="with-suffix"><input id="cp-${name}" name="${name}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${v(p[name])}"><span>${suffix}</span></div>
      </div>`;
    P.ui.openDialog({
      title: 'Profil kesehatan',
      body: `
        <form class="form" novalidate>
          <p class="dialog-text">Dipakai coach untuk menghitung zona detak jantung dan menyesuaikan saran. Semua opsional.</p>
          <div class="field-row">
            ${numF('age', 'Usia', 'th', 10, 100)}
            <div class="field compact">
              <label for="cp-sex">Jenis kelamin</label>
              <select id="cp-sex" name="sex"><option value="">–</option><option value="pria" ${p.sex === 'pria' ? 'selected' : ''}>Pria</option><option value="wanita" ${p.sex === 'wanita' ? 'selected' : ''}>Wanita</option></select>
            </div>
          </div>
          <div class="field-row">${numF('heightCm', 'Tinggi', 'cm', 100, 230)}${numF('weightKg', 'Berat', 'kg', 25, 250, 0.1)}</div>
          <div class="field-row">${numF('restingHr', 'HR istirahat', 'bpm', 30, 120)}${numF('maxHr', 'HR maks', 'bpm', 120, 230)}</div>
          <p class="hint">HR istirahat: hitung denyut nadi 1 menit saat bangun tidur. HR maks kosongkan bila belum tahu (diperkirakan dari usia).</p>
          <div class="field">
            <label for="cp-goal">Target lari</label>
            <input id="cp-goal" name="goal" type="text" maxlength="200" value="${esc(p.goal)}" placeholder="Mis. 10K di bawah 60 menit bulan Desember">
          </div>
          <div class="field">
            <label for="cp-health">Kondisi kesehatan / cedera</label>
            <textarea id="cp-health" name="health" rows="3" maxlength="500" placeholder="Mis. lutut kiri kadang nyeri, asma ringan, tidur rata-rata 6 jam">${esc(p.health)}</textarea>
          </div>
          <div class="field">
            <label for="cp-availability">Waktu luang untuk lari</label>
            <input id="cp-availability" name="availability" type="text" maxlength="200" value="${esc(p.availability)}" placeholder="Mis. pagi setelah Subuh, akhir pekan lebih lama">
          </div>
          <div class="dialog-actions">
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn primary">Simpan</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const data = {};
          for (const [k, val] of fd.entries()) data[k] = String(val).trim();
          P.store.setCoachProfile(data);
          P.ui.toast('Profil kesehatan disimpan.', { tone: 'success' });
          close();
        });
      },
    });
  }

  // ----- Interaksi -----

  async function checkAvailable() {
    if (available !== null) return;
    try {
      const res = await root.fetch('api/health', { cache: 'no-store' });
      const data = await res.json();
      available = Boolean(data.coach);
    } catch {
      available = null;
    }
    refresh();
  }

  // ----- Hapus & Sampah (seperti "Baru dihapus" di galeri) -----

  async function deleteChat(id) {
    const chat = P.store.findCoachChat(id);
    if (!chat || (live.pending && id === currentId)) return;
    const ok = await P.ui.confirmDialog({
      title: 'Hapus sesi ini?',
      message: `"${chat.title}" dipindahkan ke Sampah dan terhapus permanen setelah ${C.TRASH_DAYS} hari. Sebelum itu kamu masih bisa memulihkannya.`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    const removed = P.store.deleteCoachChat(id);
    if (!removed) return;
    if (removed.id === currentId) setCurrent(null);
    refresh();
    P.ui.toast('Sesi dipindahkan ke Sampah.', { action: 'Urungkan', onAction: () => P.store.restoreCoachChat(removed.id) });
  }

  function trashHtml(confirmId) {
    const items = trashItems();
    if (!items.length) return '<p class="coach-bin-empty muted">Sampah kosong.</p>';
    const row = (c) => {
      const left = C.trashDaysLeft(c.deletedAt);
      const confirming = confirmId === c.id;
      return `
        <li class="coach-bin-item ${confirming ? 'confirm' : ''}">
          <div class="coach-bin-text">
            <strong>${esc(c.title)}</strong>
            <small>${confirming ? 'Hapus permanen? Tidak bisa dibatalkan.' : `Dihapus ${esc(D.formatShort(D.todayKey(new Date(c.deletedAt))))} · ${c.messages.length} pesan · ${left > 1 ? `terhapus dalam ${left} hari` : 'terhapus besok'}`}</small>
          </div>
          <div class="coach-bin-actions">
            ${confirming
              ? `<button type="button" class="btn ghost small" data-bin-cancel>Batal</button>
                 <button type="button" class="btn danger small" data-bin-purge-yes="${esc(c.id)}">Hapus permanen</button>`
              : `<button type="button" class="btn secondary small" data-bin-restore="${esc(c.id)}">Pulihkan</button>
                 <button type="button" class="icon-btn" data-bin-purge="${esc(c.id)}" aria-label="Hapus permanen ${esc(c.title)}" title="Hapus permanen">${icon('trash')}</button>`}
          </div>
        </li>`;
    };
    const emptying = confirmId === '*';
    return `
      <ul class="coach-bin-list">${items.map(row).join('')}</ul>
      <div class="coach-bin-foot">
        ${emptying
          ? `<span>Hapus permanen ${items.length} sesi?</span>
             <button type="button" class="btn ghost small" data-bin-cancel>Batal</button>
             <button type="button" class="btn danger small" data-bin-empty-yes>Ya, kosongkan</button>`
          : '<button type="button" class="btn ghost small danger-text" data-bin-empty>Kosongkan Sampah</button>'}
      </div>`;
  }

  function openTrash() {
    P.store.purgeOldCoachTrash();
    P.ui.openDialog({
      title: 'Sampah',
      body: `
        <p class="dialog-text">Sesi yang dihapus disimpan di sini selama ${C.TRASH_DAYS} hari, lalu terhapus permanen otomatis.</p>
        <div class="coach-bin" data-bin>${trashHtml()}</div>`,
      onMount(el) {
        const box = el.querySelector('[data-bin]');
        const paint = (confirmId) => {
          box.innerHTML = trashHtml(confirmId);
        };
        box.addEventListener('click', (e) => {
          const t = e.target;
          const restore = t.closest('[data-bin-restore]');
          if (restore) {
            const chat = P.store.restoreCoachChat(restore.dataset.binRestore);
            if (chat) P.ui.toast(`"${chat.title}" dipulihkan.`);
            return paint();
          }
          const purge = t.closest('[data-bin-purge]');
          if (purge) return paint(purge.dataset.binPurge);
          const yes = t.closest('[data-bin-purge-yes]');
          if (yes) {
            P.store.purgeCoachChat(yes.dataset.binPurgeYes);
            P.ui.toast('Sesi dihapus permanen.');
            return paint();
          }
          if (t.closest('[data-bin-empty]')) return paint('*');
          if (t.closest('[data-bin-empty-yes]')) {
            const n = P.store.emptyCoachTrash();
            if (n) P.ui.toast(`${n} sesi dihapus permanen.`);
            return paint();
          }
          if (t.closest('[data-bin-cancel]')) return paint();
          return undefined;
        });
      },
    });
  }

  function mount(el) {
    checkAvailable();
    P.store.purgeOldCoachTrash();
    root.requestAnimationFrame(() => scrollLog(true));
    // Lokasi sudah dihidupkan sebelumnya: baca lokasi & cuaca BMKG sekali saat coach dibuka.
    if (locOn() && loggedIn() && !geo.tried) {
      geo.tried = true;
      refreshWeather();
    }

    el.addEventListener('input', (e) => {
      const q = e.target.closest('[data-coach-q]');
      if (!q) return;
      draft = q.value;
      q.style.height = 'auto';
      q.style.height = `${Math.min(q.scrollHeight, 180)}px`;
    });
    el.addEventListener('keydown', (e) => {
      const q = e.target.closest('[data-coach-q]');
      if (q && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        ask(q.value, { fromInput: true });
      }
    });
    el.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-coach-form]');
      if (!form) return;
      e.preventDefault();
      ask(form.querySelector('[data-coach-q]').value, { fromInput: true });
    });
    el.addEventListener('click', async (e) => {
      const t = e.target;
      const prompt = t.closest('[data-coach-prompt]');
      if (prompt) return ask(prompt.dataset.coachPrompt);
      if (t.closest('[data-coach-attach]')) return importScreenshot({ toChat: true });
      if (t.closest('[data-coach-stop]')) {
        if (controller) controller.abort();
        return undefined;
      }
      if (t.closest('[data-coach-retry]')) {
        const chat = current();
        if (chat && !needAccess()) stream(chat);
        return undefined;
      }
      if (t.closest('[data-coach-login]')) return P.account.openAccount();
      if (t.closest('[data-coach-loc]')) return enableLocation();
      if (t.closest('[data-coach-loc-off]')) return disableLocation();
      if (t.closest('[data-coach-weather]')) {
        geo.open = !geo.open;
        if (Date.now() - geo.weatherAt > WEATHER_FRESH_MS) refreshWeather();
        return refresh();
      }
      if (t.closest('[data-coach-memory]')) {
        const chat = current();
        if (chat) {
          if (openMemory.has(chat.id)) openMemory.delete(chat.id);
          else openMemory.add(chat.id);
        }
        return refresh();
      }
      const routeMsg = (attr) => {
        const el2 = t.closest(`[${attr}]`);
        const chat = current();
        const m = el2 && chat && chat.messages.find((x) => String(x.t) === el2.getAttribute(attr) && x.route);
        return m ? { chat, m } : null;
      };
      const retry = routeMsg('data-coach-route-retry');
      if (retry) return buildRoute(retry.chat.id, retry.m.t);
      const next = routeMsg('data-coach-route-next');
      if (next) return updateRoute(next.chat.id, next.m.t, { pick: ((next.m.route.pick || 0) + 1) % next.m.route.routes.length });
      const onMap = routeMsg('data-coach-route-map');
      if (onMap) {
        const rt = onMap.m.route;
        P.routeUI.showRoutes({ routes: rt.routes, km: rt.km, type: rt.type, pick: rt.pick || 0, start: rt.routes[0].start });
        P.app.go('rute');
        return undefined;
      }
      const saveR = routeMsg('data-coach-route-save');
      if (saveR) {
        const r = saveR.m.route.routes[saveR.m.route.pick || 0];
        const saved = P.store.saveRoute({ ...r, name: savedName(r) });
        if (saved) P.ui.toast(`"${saved.name}" disimpan di Rute tersimpan.`);
        return refresh();
      }
      if (t.closest('[data-coach-profile]')) return openProfile();
      if (t.closest('[data-coach-new]')) {
        if (live.pending) return undefined;
        setCurrent(null);
        live.error = null;
        refresh();
        const q = doc.querySelector('[data-coach-q]');
        if (q) q.focus();
        return undefined;
      }
      const open = t.closest('[data-coach-open]');
      if (open) {
        if (live.pending) return undefined;
        setCurrent(open.dataset.coachOpen);
        live.error = null;
        refresh();
        root.requestAnimationFrame(() => scrollLog(true));
        return undefined;
      }
      const del = t.closest('[data-coach-del]');
      if (del) return deleteChat(del.dataset.coachDel);
      if (t.closest('[data-coach-bin]')) return openTrash();
      const save = t.closest('[data-coach-save-import]');
      if (save) {
        const chat = current();
        const m = chat && chat.messages.find((x) => x.kind === 'import' && String(x.t) === save.dataset.coachSaveImport);
        if (m) {
          const summary = chat.messages[chat.messages.indexOf(m) + 1];
          openDraft({ ...m.data, is_activity_screenshot: true, summary: summary && summary.role === 'assistant' ? summary.text : null }, chat.id, m.t);
        }
      }
      return undefined;
    });
  }

  P.coachUI = { render, mount, importScreenshot, openProfile, openTrash, md, context, checkAvailable, isAvailable: () => available === true && loggedIn(), _live: live };
})(typeof self !== 'undefined' ? self : this);
