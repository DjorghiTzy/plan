/**
 * Rute lari: pilih target jarak, lalu aplikasi mencarikan beberapa rute putar dari lokasimu
 * (selisih maks. 300 m) lewat jalan sungguhan. Rute bisa dibuka di Google Maps, diunduh
 * sebagai GPX, dan coach AI memberi saran rute mana yang paling cocok.
 * Peta memakai Leaflet + ubin OpenStreetMap, dimuat hanya saat tab ini dibuka.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const G = P.geo;
  const R = P.run;
  const D = P.date;
  const { esc, icon } = P.ui;
  const doc = root.document;

  const KM_CHOICES = [3, 5, 8, 10, 15, 21.1];
  const DEFAULT_KM = 5;
  const DEFAULT_PACE = 420; // 7:00/km bila belum ada catatan lari
  // Warna rute dibuat sangat berbeda (biru, oranye, magenta) agar mudah dibedakan di atas peta.
  const COLORS = { A: '#1d4ed8', B: '#ea580c', C: '#c026d3', D: '#0f766e' };
  const ROUTING = 'https://routing.openstreetmap.de/routed-foot';
  const FALLBACK_VIEW = { center: [-2.5, 118], zoom: 4 }; // Indonesia
  const LEAFLET = 'js/vendor/leaflet/leaflet';

  const S = {
    loc: null, // {lat, lng, acc, source: 'gps' | 'peta'}
    locating: false,
    locError: null,
    results: null, // {target, tolerance, withinTolerance, routes, km, key}
    selected: null,
    busy: false,
    error: null,
    seed: 0,
    advice: null, // {status: 'loading' | 'done' | 'error', key, recommended, summary, notes, message}
    mapError: false,
  };
  let map = null;
  let mapEl = null;
  let routeLayer = null;
  let startMarker = null;
  let drawn = '';
  let leaflet = null;

  const loggedIn = () => P.sync.info().loggedIn;
  const refresh = () => P.app && P.app.refresh();
  const kmOf = (ctx) => {
    const v = Number(ctx && ctx.prefs ? ctx.prefs.routeKm : NaN);
    return v >= 0.5 && v <= 42.2 ? v : DEFAULT_KM;
  };
  const TYPES = [['semua', 'Semua'], ['putar', 'Putar'], ['lurus', 'Lurus']];
  const typeOf = (ctx) => {
    const t = ctx && ctx.prefs ? ctx.prefs.routeType : '';
    return TYPES.some(([k]) => k === t) ? t : 'semua';
  };
  const kmText = (m) => R.formatKm(Math.round(m / 10) / 100, 2);
  const diffText = (m) => (Math.abs(m) < 10 ? 'pas' : `${m > 0 ? '+' : '−'}${Math.abs(Math.round(m / 10) * 10)} m`);

  /** Pace kamu dari 10 lari terakhir yang mencatat waktu (detik/km). */
  function userPace() {
    const recent = [...P.store.state.runs].filter((r) => r.sec > 0 && r.km > 0).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10);
    return R.paceOf(recent) || null;
  }

  // ----- Peta (Leaflet) -----

  function loadLeaflet() {
    if (root.L) return Promise.resolve(root.L);
    if (!leaflet) {
      leaflet = new Promise((resolve, reject) => {
        const css = doc.createElement('link');
        css.rel = 'stylesheet';
        css.href = `${LEAFLET}.css?v=1.9.4`;
        doc.head.appendChild(css);
        const js = doc.createElement('script');
        js.src = `${LEAFLET}.js?v=1.9.4`;
        js.onload = () => resolve(root.L);
        js.onerror = () => {
          leaflet = null;
          reject(new Error('Peta gagal dimuat.'));
        };
        doc.head.appendChild(js);
      });
    }
    return leaflet;
  }

  function createMap(el) {
    const L = root.L;
    if (map) {
      // Hentikan animasi zoom yang masih berjalan sebelum peta lama dibuang.
      map.stop();
      map.off();
      map.remove();
    }
    map = L.map(el, { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    startMarker = null;
    mapEl = el;
    drawn = '';
    map.on('click', (e) => setStart([e.latlng.lat, e.latlng.lng], 'peta'));
    if (S.loc) map.setView([S.loc.lat, S.loc.lng], 15);
    else map.setView(FALLBACK_VIEW.center, FALLBACK_VIEW.zoom);
  }

  function drawMap() {
    const L = root.L;
    const res = S.results;
    const sig = `${res ? res.key : ''}|${S.selected}|${S.loc ? `${S.loc.lat},${S.loc.lng}` : ''}`;
    if (sig === drawn) return;
    const fit = !res || !drawn.startsWith(`${res.key}|`);
    drawn = sig;
    routeLayer.clearLayers();
    if (res) {
      // Rute terpilih digambar terakhir agar berada di atas.
      const order = [...res.routes].sort((a, b) => (a.id === S.selected) - (b.id === S.selected));
      for (const r of order) {
        const on = r.id === S.selected;
        L.polyline(r.coords, { color: '#fff', weight: on ? 10 : 7, opacity: on ? 0.95 : 0.8, interactive: false }).addTo(routeLayer);
        const line = L.polyline(r.coords, { color: COLORS[r.id], weight: on ? 6 : 4, opacity: on ? 1 : 0.8, dashArray: on ? null : '10 7' }).addTo(routeLayer);
        const tag = L.marker(r.far || r.coords[Math.floor(r.coords.length / 2)], {
          keyboard: false,
          title: `Rute ${r.id}`,
          zIndexOffset: on ? 500 : 0,
          icon: L.divIcon({ className: `route-tag${on ? ' on' : ''}`, html: `<span style="background:${COLORS[r.id]}">${r.id}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
        }).addTo(routeLayer);
        for (const el of [line, tag]) {
          el.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            pick(r.id);
          });
        }
      }
    }
    if (S.loc) {
      const at = [S.loc.lat, S.loc.lng];
      if (!startMarker) {
        startMarker = L.marker(at, {
          draggable: true,
          keyboard: false,
          title: 'Titik mulai (geser untuk memindahkan)',
          icon: L.divIcon({ className: 'route-start', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        }).addTo(map);
        startMarker.on('dragend', () => {
          const p = startMarker.getLatLng();
          setStart([p.lat, p.lng], 'peta');
        });
      } else {
        startMarker.setLatLng(at);
      }
    } else if (startMarker) {
      startMarker.remove();
      startMarker = null;
    }
    if (fit && res && res.routes.length) {
      map.fitBounds(L.latLngBounds(res.routes.flatMap((r) => r.coords)), { padding: [24, 24], maxZoom: 17, animate: false });
    }
  }

  /** Dipanggil setelah setiap render: pasang peta pada wadahnya dan gambar ulang bila perlu. */
  function syncMap() {
    const el = doc.querySelector('[data-route-map]');
    if (!el) return;
    if (!root.L) {
      loadLeaflet().then(syncMap).catch(() => {
        S.mapError = true;
        refresh();
      });
      return;
    }
    if (!map || mapEl !== el) createMap(el);
    drawMap();
  }

  // ----- Lokasi & pencarian -----

  function setStart(p, source, acc = null) {
    const prev = S.loc;
    S.loc = { lat: p[0], lng: p[1], acc, source };
    S.locError = null;
    // Titik mulai pindah: rute lama tidak berlaku lagi.
    if (S.results && (!prev || G.distance([prev.lat, prev.lng], p) > 60)) {
      S.results = null;
      S.advice = null;
      S.selected = null;
    }
    if (map && mapEl && mapEl.isConnected && source === 'gps') map.setView(p, Math.max(map.getZoom(), 15), { animate: false });
    refresh();
  }

  function locate() {
    const geo = root.navigator.geolocation;
    if (!geo) {
      S.locError = 'Perangkat ini tidak bisa membaca lokasi. Ketuk peta untuk memilih titik mulai.';
      refresh();
      return Promise.resolve(false);
    }
    S.locating = true;
    S.locError = null;
    refresh();
    return new Promise((resolve) => {
      geo.getCurrentPosition(
        (pos) => {
          S.locating = false;
          setStart([pos.coords.latitude, pos.coords.longitude], 'gps', pos.coords.accuracy);
          resolve(true);
        },
        (err) => {
          S.locating = false;
          S.locError = err && err.code === 1
            ? 'Izin lokasi ditolak. Izinkan lokasi untuk situs ini di browser, atau ketuk peta untuk memilih titik mulai.'
            : 'Lokasi belum terbaca. Coba lagi di tempat terbuka, atau ketuk peta untuk memilih titik mulai.';
          refresh();
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
      );
    });
  }

  /**
   * Cari rute langsung dari browser ke layanan rute OpenStreetMap (cepat, tanpa antre di server).
   * Bila tidak bisa terhubung, coba lewat server aplikasi.
   */
  async function findRoutes(q) {
    try {
      const client = P.loops.osrmClient(ROUTING, { fetchFn: (url, opts) => root.fetch(url, { ...opts, credentials: 'omit' }), concurrency: 3, timeoutMs: 8000 });
      return await P.loops.suggest(q, client, { budgetMs: 15000 });
    } catch (err) {
      if (['far_from_road', 'no_route', 'straight_too_long'].includes(err.code)) throw err;
      if (!loggedIn()) throw err;
      return P.sync.api('coach', { method: 'POST', timeout: 40000, body: { action: 'route', ...q } });
    }
  }

  async function search(ctx, { again = false, button = null } = {}) {
    if (S.busy) return;
    const km = kmOf(ctx);
    if (!S.loc && !(await locate())) return;
    if (again) S.seed += 1;
    S.busy = true;
    S.error = null;
    S.advice = null;
    refresh();
    try {
      const res = await P.ui.withBusy(button, () => findRoutes({ lat: S.loc.lat, lng: S.loc.lng, km, seed: S.seed, type: typeOf(ctx) }));
      S.results = { ...res, km, key: `${Date.now()}` };
      S.selected = res.routes.length ? res.routes[0].id : null;
      if (!res.withinTolerance) {
        P.ui.toast(`Belum ada rute dengan selisih ≤ ${res.tolerance} m di sekitar sini. Ini rute terdekat; coba "Rute lain" atau pindahkan titik mulai.`, { tone: 'warn', duration: 8000 });
      }
    } catch (err) {
      S.error = err.message || 'Gagal mencari rute.';
    } finally {
      S.busy = false;
      refresh();
    }
    if (S.results && S.results.routes.length > 1 && P.coachUI.isAvailable()) askCoach(km);
  }

  async function askCoach(km) {
    const res = S.results;
    const pace = userPace() || DEFAULT_PACE;
    S.advice = { status: 'loading', key: res.key };
    refresh();
    try {
      const out = await P.sync.api('coach', {
        method: 'POST',
        timeout: 60000,
        body: {
          action: 'routes',
          target: km,
          today: D.todayKey(),
          now: D.formatTime(D.minutesOfDay(new Date())),
          context: P.coachUI.context(),
          routes: res.routes.map((r) => ({
            id: r.id,
            type: r.type,
            shape: r.shape,
            km: Math.round(r.distance / 10) / 100,
            diff_m: r.diff,
            direction: r.direction,
            turns: r.turns,
            overlap_pct: Math.round(r.overlap * 100),
            est_min: Math.round(((r.distance / 1000) * pace) / 60),
            streets: r.streets,
          })),
        },
      });
      if (!S.results || S.results.key !== res.key) return;
      S.advice = { status: 'done', key: res.key, ...out.advice };
    } catch (err) {
      if (!S.results || S.results.key !== res.key) return;
      S.advice = { status: 'error', key: res.key, message: err.message || 'Saran coach belum bisa diambil.' };
    }
    refresh();
  }

  function pick(id) {
    if (!S.results || !S.results.routes.some((r) => r.id === id)) return;
    S.selected = id;
    refresh();
  }

  function downloadGpx(r) {
    const name = `Rute ${r.id} ${kmText(r.distance)} km`;
    P.ui.download(`rute-lari-${r.id.toLowerCase()}-${kmText(r.distance).replace(',', '-')}km.gpx`, G.gpx(name, r.coords), 'application/gpx+xml');
  }

  // ----- Tampilan -----

  function formCard(ctx) {
    const km = kmOf(ctx);
    const type = typeOf(ctx);
    const loc = S.loc;
    let locLine;
    if (S.locating) locLine = `<span class="route-loc-text">Membaca lokasimu…</span>`;
    else if (loc) {
      const acc = loc.acc ? ` · akurasi ±${Math.round(loc.acc)} m` : '';
      locLine = `<span class="route-loc-text"><strong>${loc.source === 'gps' ? 'Lokasimu sekarang' : 'Titik pilihan di peta'}</strong>${esc(acc)}</span>`;
    } else locLine = '<span class="route-loc-text muted">Belum ada titik mulai</span>';
    return `
      <section class="panel route-form">
        <h2>Mau lari berapa km?</h2>
        <div class="route-chips" role="group" aria-label="Pilih jarak">
          ${KM_CHOICES.map((k) => `<button type="button" class="route-chip ${Math.abs(k - km) < 0.001 ? 'on' : ''}" data-route-km="${k}" aria-pressed="${Math.abs(k - km) < 0.001}">${esc(R.formatKm(k, 1))} km</button>`).join('')}
        </div>
        <label class="route-custom">
          <span>Jarak lain</span>
          <input type="number" inputmode="decimal" min="0.5" max="42.2" step="0.1" value="${km}" data-route-km-input aria-label="Target jarak (km)">
          <span class="muted">km</span>
        </label>
        <div class="route-type-pick">
          <span>Jenis rute</span>
          <div class="segmented small" role="group" aria-label="Jenis rute">
            ${TYPES.map(([k, label]) => `<button type="button" data-route-type="${k}" aria-pressed="${type === k}">${label}</button>`).join('')}
          </div>
        </div>
        <div class="route-loc">
          ${icon('pin')}
          ${locLine}
          <button type="button" class="link-btn" data-route-locate ${S.locating ? 'disabled' : ''}>${icon('locate')}${loc && loc.source === 'gps' ? 'Perbarui' : 'Pakai lokasiku'}</button>
        </div>
        ${S.locError ? `<p class="route-note warn">${esc(S.locError)}</p>` : ''}
        <button type="button" class="btn primary route-go" data-route-go ${S.busy ? 'disabled' : ''}>${icon('route')}Cari rute ${esc(R.formatKm(km, 1))} km</button>
        <p class="hint"><b>Putar</b>: memutar lalu kembali ke titikmu. <b>Lurus</b>: lari lurus menjauh, lalu balik lewat jalan yang sama. Selisih maksimal 300 m dari target, paling jauh 7 km dari titikmu. Ketuk atau geser penanda di peta untuk memindahkan titik mulai.</p>
      </section>`;
  }

  function adviceCard() {
    const a = S.advice;
    if (!a || !S.results || a.key !== S.results.key) return '';
    if (a.status === 'loading') {
      return `<section class="panel route-advice loading" aria-live="polite"><p class="route-advice-head">${icon('sparkle')}Saran coach</p><p class="muted">Coach sedang membandingkan rute dengan profil dan riwayat larimu…</p></section>`;
    }
    if (a.status === 'error') {
      return `<section class="panel route-advice"><p class="route-advice-head">${icon('sparkle')}Saran coach</p><p class="muted">${esc(a.message)}</p></section>`;
    }
    return `
      <section class="panel route-advice" aria-live="polite">
        <p class="route-advice-head">${icon('sparkle')}Saran coach</p>
        <p>${esc(P.coach.tidyText(a.summary))}</p>
        ${a.recommended && a.recommended !== S.selected ? `<button type="button" class="link-btn" data-route-pick="${esc(a.recommended)}">Tampilkan Rute ${esc(a.recommended)}</button>` : ''}
      </section>`;
  }

  function routeCard(r, pace) {
    const on = r.id === S.selected;
    const a = S.advice && S.advice.status === 'done' && S.advice.key === S.results.key ? S.advice : null;
    const note = a && (a.notes || []).find((x) => x.id === r.id);
    const mins = Math.round(((r.distance / 1000) * (pace || DEFAULT_PACE)) / 60);
    const streets = r.streets.slice(0, 3).join(', ');
    return `
      <li class="route-item ${on ? 'on' : ''}" data-id="route-${esc(r.id)}" style="--route: ${COLORS[r.id]}">
        <button type="button" class="route-item-main" data-route-pick="${esc(r.id)}" aria-pressed="${on}">
          <span class="route-item-head">
            <span class="route-letter" aria-hidden="true">${esc(r.id)}</span>
            <strong>Rute ${esc(r.id)}</strong>
            <span class="route-kind">${r.type === 'lurus' ? 'Lurus bolak-balik' : 'Putar'}</span>
            <span class="muted">ke ${esc(r.direction)}</span>
            ${a && a.recommended === r.id ? `<span class="route-badge">${icon('sparkle')}Pilihan coach</span>` : ''}
          </span>
          <span class="route-item-km"><b>${esc(kmText(r.distance))} km</b><small class="${Math.abs(r.diff) <= 300 ? '' : 'warn'}">${esc(diffText(r.diff))}</small></span>
          <span class="route-item-meta">±${mins} mnt${pace ? '' : ' (pace 7:00/km)'} · ${r.turns} belokan · maks. ${esc(R.formatKm(Math.round((r.maxDist || 0) / 100) / 10, 1))} km dari titikmu${r.type !== 'lurus' && r.overlap >= 0.15 ? ` · ${Math.round(r.overlap * 100)}% bolak-balik` : ''}</span>
          ${streets ? `<span class="route-item-streets">${esc(streets)}</span>` : ''}
          ${note ? `<span class="route-item-note">${icon('sparkle')}${esc(P.coach.tidyText(note.note))}</span>` : ''}
        </button>
        <div class="route-item-actions">
          <a class="btn primary small" href="${esc(G.googleMapsUrl(r.start, r.waypoints))}" target="_blank" rel="noopener" data-route-gmaps="${esc(r.id)}">${icon('external')}Buka di Google Maps</a>
          <button type="button" class="btn ghost small" data-route-gpx="${esc(r.id)}" title="Unduh GPX untuk Strava, Garmin, dll.">${icon('download')}GPX</button>
          <button type="button" class="btn ghost small" data-route-log="${esc(r.id)}" title="Catat lari dengan rute ini">${icon('plus')}Catat</button>
        </div>
      </li>`;
  }

  function resultsCard() {
    if (S.busy) {
      return `<section class="panel route-results" aria-busy="true"><div class="panel-head"><h2>Mencari rute…</h2></div><p class="muted">Menghitung rute lewat jalan di sekitarmu. Biasanya 1 sampai 3 detik.</p>${P.ui.skeleton(3)}</section>`;
    }
    if (S.error) return `<section class="panel route-results"><p class="route-note warn">${esc(S.error)}</p></section>`;
    const res = S.results;
    if (!res) return '';
    const pace = userPace();
    return `
      <section class="panel route-results">
        <div class="panel-head">
          <h2>${res.routes.length} rute untuk ${esc(R.formatKm(res.km, 1))} km</h2>
          <button type="button" class="link-btn" data-route-again>${icon('refresh')}Rute lain</button>
        </div>
        <ul class="route-list">${res.routes.map((r) => routeCard(r, pace)).join('')}</ul>
        <p class="hint">Jarak dihitung dari peta OpenStreetMap; di Google Maps angkanya bisa sedikit berbeda. ${pace ? `Waktu memakai pace rata-ratamu ${esc(R.formatPace(pace))}/km.` : ''}</p>
      </section>`;
  }

  function render(ctx) {
    root.requestAnimationFrame(syncMap);
    return `
      <div class="route" data-route>
        <div class="route-grid">
          <section class="panel route-map-card">
            <div class="route-map" data-route-map data-morph-keep data-key="route-map" role="application" aria-label="Peta rute lari"></div>
            ${S.mapError ? '<p class="route-note warn">Peta gagal dimuat. Periksa koneksi, lalu buka ulang halaman ini.</p>' : ''}
          </section>
          <div class="route-side">
            ${formCard(ctx)}
            ${adviceCard()}
            ${resultsCard()}
          </div>
        </div>
      </div>`;
  }

  function mount(el, ctx) {
    el.addEventListener('click', (e) => {
      const t = e.target;
      if (!t.closest('[data-route]')) return undefined;
      const kind = t.closest('[data-route-type]');
      if (kind) return ctx.setPref('routeType', kind.dataset.routeType);
      const chip = t.closest('[data-route-km]');
      if (chip) return ctx.setPref('routeKm', Number(chip.dataset.routeKm));
      if (t.closest('[data-route-locate]')) return locate();
      const go = t.closest('[data-route-go]');
      if (go) return search(ctx, { button: go });
      const again = t.closest('[data-route-again]');
      if (again) return search(ctx, { again: true, button: again });
      const choose = t.closest('[data-route-pick]');
      if (choose) return pick(choose.dataset.routePick);
      const find = (a) => S.results && S.results.routes.find((r) => r.id === a);
      const gpx = t.closest('[data-route-gpx]');
      if (gpx && find(gpx.dataset.routeGpx)) return downloadGpx(find(gpx.dataset.routeGpx));
      const log = t.closest('[data-route-log]');
      if (log && find(log.dataset.routeLog)) {
        const r = find(log.dataset.routeLog);
        return P.lari.openRunEditor(null, { date: D.todayKey(), km: Math.round(r.distance / 10) / 100, note: `Rute ${r.id} ke ${r.direction}` });
      }
      return undefined;
    });
    el.addEventListener('change', (e) => {
      const input = e.target.closest('[data-route-km-input]');
      if (!input) return;
      const v = Number(String(input.value).replace(',', '.'));
      if (v >= 0.5 && v <= 42.2) ctx.setPref('routeKm', Math.round(v * 10) / 10);
      else {
        input.value = kmOf(ctx);
        P.ui.toast('Jarak harus antara 0,5 dan 42,2 km.', { tone: 'warn' });
      }
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('[data-route-km-input]')) e.target.blur();
    });
  }

  P.routeUI = { render, mount, _state: S };
})(typeof self !== 'undefined' ? self : this);
