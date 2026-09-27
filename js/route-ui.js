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
  // Sampai 10 rute, masing-masing dengan warna yang jelas berbeda di atas peta.
  const COLORS = { A: '#1d4ed8', B: '#ea580c', C: '#c026d3', D: '#0f766e', E: '#dc2626', F: '#6d28d9', G: '#65a30d', H: '#92400e', I: '#db2777', J: '#0891b2' };
  const SAVED_COLOR = '#15803d';
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
    // Rute yang sudah ditampilkan untuk titik/jarak/jenis yang sama: pencarian berikutnya memberi rute lain.
    history: { key: '', lines: [] },
    viewSaved: null, // id rute tersimpan yang sedang ditampilkan di peta
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
    const saved = S.viewSaved ? P.store.state.savedRoutes.find((r) => r.id === S.viewSaved) : null;
    const sig = `${res ? res.key : ''}|${S.selected}|${S.loc ? `${S.loc.lat},${S.loc.lng}` : ''}|${saved ? saved.id : ''}`;
    if (sig === drawn) return;
    const fit = !res || !drawn.startsWith(`${res.key}|`);
    const fitSaved = saved && !drawn.endsWith(`|${saved.id}`);
    drawn = sig;
    routeLayer.clearLayers();
    if (res) {
      // Semua rute tampil sekaligus dengan gaya yang sama; yang membedakan hanya warnanya.
      // Rute yang diketuk hanya dipindah ke lapisan paling atas.
      const order = [...res.routes].sort((a, b) => (a.id === S.selected) - (b.id === S.selected));
      for (const r of order) {
        L.polyline(r.coords, { color: '#fff', weight: 8, opacity: 0.9, interactive: false }).addTo(routeLayer);
        const line = L.polyline(r.coords, { color: COLORS[r.id], weight: 5, opacity: 0.95 }).addTo(routeLayer);
        line.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          pick(r.id, { fromMap: true });
        });
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
    if (saved) {
      L.polyline(saved.coords, { color: '#fff', weight: 11, opacity: 0.95, interactive: false }).addTo(routeLayer);
      L.polyline(saved.coords, { color: SAVED_COLOR, weight: 6, opacity: 1 }).addTo(routeLayer);
      L.marker(saved.far || saved.coords[Math.floor(saved.coords.length / 2)], {
        keyboard: false,
        title: saved.name,
        zIndexOffset: 800,
        icon: L.divIcon({ className: 'route-tag on', html: `<span style="background:${SAVED_COLOR}">★</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).addTo(routeLayer);
    }
    if (fitSaved) {
      map.fitBounds(L.latLngBounds(saved.coords), { padding: [24, 24], maxZoom: 17, animate: false });
    } else if (fit && res && res.routes.length) {
      map.fitBounds(L.latLngBounds(res.routes.flatMap((r) => r.coords)), { padding: [24, 24], maxZoom: 17, animate: false });
    }
    if (res) placeTags(res);
  }

  /**
   * Label huruf tiap rute di titik terjauhnya; bila bertumpuk dengan label lain (< 30 px di layar),
   * pindah ke titik lain di sepanjang rute itu.
   */
  function placeTags(res) {
    const L = root.L;
    const used = [];
    const px = (p) => map.latLngToContainerPoint(p);
    const order = [...res.routes].sort((a, b) => (b.id === S.selected) - (a.id === S.selected));
    for (const r of order) {
      const on = r.id === S.selected;
      const spots = [r.far || r.coords[Math.floor(r.coords.length / 2)], ...G.pointsAlong(r.coords, [0.3, 0.7, 0.2, 0.8, 0.4, 0.6])];
      const at = spots.find((p) => used.every((q) => px(p).distanceTo(q) >= 30)) || spots[0];
      used.push(px(at));
      const tag = L.marker(at, {
        keyboard: false,
        title: `Rute ${r.id}`,
        zIndexOffset: on ? 500 : 0,
        icon: L.divIcon({ className: 'route-tag', html: `<span style="background:${COLORS[r.id]}">${r.id}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).addTo(routeLayer);
      tag.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        pick(r.id, { fromMap: true });
      });
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
  let osrm = null; // satu klien untuk seluruh sesi: jawaban yang sama diambil dari tembolok
  async function findRoutes(q, avoid) {
    try {
      if (!osrm) osrm = P.loops.osrmClient(ROUTING, { fetchFn: (url, opts) => root.fetch(url, { ...opts, credentials: 'omit' }), concurrency: 3, gapMs: 120, timeoutMs: 8000 });
      return await P.loops.suggest(q, osrm, { budgetMs: 16000, avoid });
    } catch (err) {
      if (['far_from_road', 'no_route', 'straight_too_long', 'no_candidates'].includes(err.code)) throw err;
      if (!loggedIn()) throw err;
      return P.sync.api('coach', { method: 'POST', timeout: 40000, body: { action: 'route', ...q, avoid: avoid.map((c) => G.simplify(c, 15)) } });
    }
  }

  async function search(ctx, { again = false, button = null } = {}) {
    if (S.busy) return;
    const km = kmOf(ctx);
    if (!S.loc && !(await locate())) return;
    // Setiap pencarian di titik, jarak, dan jenis yang sama menghindari rute yang sudah pernah muncul.
    const key = `${S.loc.lat.toFixed(4)},${S.loc.lng.toFixed(4)}|${km}|${typeOf(ctx)}`;
    if (S.history.key !== key || S.history.lines.length > 40) S.history = { key, lines: [] };
    S.seed += again || S.history.lines.length ? 1 : 0;
    const avoid = S.history.lines.slice();
    S.busy = true;
    S.viewSaved = null;
    S.error = null;
    S.advice = null;
    refresh();
    try {
      const res = await P.ui.withBusy(button, () => findRoutes({ lat: S.loc.lat, lng: S.loc.lng, km, seed: S.seed, type: typeOf(ctx) }, avoid));
      S.results = { ...res, km, key: `${Date.now()}` };
      S.history.lines.push(...res.routes.filter((r) => !r.seen).map((r) => r.coords));
      S.selected = res.routes.length ? res.routes[0].id : null;
      if (!res.withinTolerance) {
        const st = res.stats || {};
        let msg = `Belum ada rute dengan selisih ≤ ${res.tolerance} m di sekitar sini. Ini yang terdekat; coba "Rute lain" atau geser titik mulai ke jalan yang lebih besar.`;
        if (st.busy) msg = 'Layanan rute sedang membatasi permintaan karena terlalu sering mencari, jadi hasilnya belum lengkap. Tunggu sekitar 1 menit, lalu coba lagi.';
        else if (st.failed) msg = `Sebagian permintaan ke layanan rute gagal, jadi hasilnya belum lengkap. Coba lagi sebentar lagi.`;
        else if (res.type === 'putar') msg = `Belum ada rute putar dengan selisih ≤ ${res.tolerance} m di sekitar sini (jalannya jarang). Ini yang terdekat; coba jenis Semua atau Lurus.`;
        P.ui.toast(msg, { tone: 'warn', duration: 9000 });
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

  /** Tandai satu rute di daftar (peta tetap menampilkan semua rute); dari peta, gulir ke kartunya. */
  function pick(id, { fromMap = false } = {}) {
    if (!S.results || !S.results.routes.some((r) => r.id === id)) return;
    S.selected = id;
    refresh();
    if (fromMap) {
      root.requestAnimationFrame(() => {
        const card = doc.querySelector(`[data-id="route-${id}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  }

  function downloadGpx(r, title = '') {
    const name = title || `Rute ${r.id} ${kmText(r.distance)} km`;
    const file = title ? `rute-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : `rute-lari-${r.id.toLowerCase()}-${kmText(r.distance).replace(',', '-')}km`;
    P.ui.download(`${file}.gpx`, G.gpx(name, r.coords), 'application/gpx+xml');
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
        <p class="hint"><b>Putar</b>: memutar lalu kembali ke titikmu. <b>Lurus</b>: lari lurus menjauh, lalu balik lewat jalan yang sama. Selisih maksimal 300 m dari target, paling jauh 25 km dari titikmu. Ketuk atau geser penanda di peta untuk memindahkan titik mulai.</p>
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

  const routeSig = (r) => `${r.type}|${r.distance}|${(r.far || r.coords[Math.floor(r.coords.length / 2)]).map((v) => v.toFixed(4)).join(',')}`;
  const savedFor = (r) => P.store.state.savedRoutes.find((x) => routeSig(x) === routeSig(r)) || null;
  const routeName = (r) => `${r.type === 'lurus' ? 'Lurus' : 'Putar'} ${kmText(r.distance)} km ke ${r.direction}`;

  function saveRoute(r) {
    if (savedFor(r)) return;
    const saved = P.store.saveRoute({ ...r, id: null, name: routeName(r) });
    if (saved) P.ui.toast(`"${saved.name}" disimpan di Rute tersimpan.`);
  }

  function savedCard() {
    const list = P.store.state.savedRoutes;
    if (!list.length) return '';
    return `
      <section class="panel route-saved-card">
        <div class="panel-head"><h2>Rute tersimpan <span class="muted">${list.length}</span></h2></div>
        <ul class="saved-list">${list.map((r) => `
          <li class="saved-item ${S.viewSaved === r.id ? 'on' : ''}" data-id="saved-${esc(r.id)}">
            <button type="button" class="saved-main" data-saved-show="${esc(r.id)}" aria-pressed="${S.viewSaved === r.id}">
              <strong>${esc(r.name)}</strong>
              <small>${esc(kmText(r.distance))} km · ${r.type === 'lurus' ? 'Lurus bolak-balik' : 'Putar'} · ${r.turns} belokan · disimpan ${esc(D.formatShort(D.todayKey(new Date(r.savedAt))))}</small>
            </button>
            <div class="saved-actions">
              <a class="icon-btn" href="${esc(G.googleMapsUrl(r.start, r.waypoints))}" target="_blank" rel="noopener" title="Buka di Google Maps" aria-label="Buka ${esc(r.name)} di Google Maps">${icon('external')}</a>
              <button type="button" class="icon-btn" data-saved-gpx="${esc(r.id)}" title="Unduh GPX" aria-label="Unduh GPX ${esc(r.name)}">${icon('download')}</button>
              <button type="button" class="icon-btn" data-saved-del="${esc(r.id)}" title="Hapus" aria-label="Hapus ${esc(r.name)}">${icon('trash')}</button>
            </div>
          </li>`).join('')}</ul>
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
            ${r.seen ? '<span class="route-seen" title="Rute ini sudah pernah muncul di pencarian sebelumnya">pernah muncul</span>' : ''}
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
          ${savedFor(r)
            ? `<button type="button" class="btn ghost small route-saved" disabled>${icon('check')}Tersimpan</button>`
            : `<button type="button" class="btn ghost small" data-route-save="${esc(r.id)}" title="Simpan rute ini untuk dipakai lagi">${icon('bookmark')}Simpan</button>`}
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
        ${res.withinTolerance && res.routes.length < 3 ? `<p class="route-note warn">Baru ketemu ${res.routes.length} rute berbeda di sekitar sini (jalannya jarang). Coba geser titik mulai ke jalan lain, pilih jenis Semua, atau ubah jaraknya.</p>` : ''}
        <ul class="route-list">${res.routes.map((r) => routeCard(r, pace)).join('')}</ul>
        <p class="hint">Jarak dihitung dari peta OpenStreetMap; di Google Maps angkanya bisa sedikit berbeda. ${pace ? `Waktu memakai pace rata-ratamu ${esc(R.formatPace(pace))}/km.` : ''}</p>
        ${res.stats ? `<p class="route-diag" data-route-diag>${res.method === 'iterate' ? 'cara cadangan' : 'tabel jarak'} · ${res.stats.requests} permintaan${res.stats.failed ? ` · ${res.stats.failed} gagal` : ''}</p>` : ''}
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
            ${savedCard()}
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
      if (choose) {
        S.viewSaved = null;
        return pick(choose.dataset.routePick);
      }
      const show = t.closest('[data-saved-show]');
      if (show) {
        S.viewSaved = S.viewSaved === show.dataset.savedShow ? null : show.dataset.savedShow;
        refresh();
        const mapBox = doc.querySelector('[data-route-map]');
        if (S.viewSaved && mapBox && mapBox.getBoundingClientRect().top < 0) mapBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return undefined;
      }
      const savedOf = (id) => P.store.state.savedRoutes.find((r) => r.id === id);
      const sgpx = t.closest('[data-saved-gpx]');
      if (sgpx && savedOf(sgpx.dataset.savedGpx)) return downloadGpx(savedOf(sgpx.dataset.savedGpx), savedOf(sgpx.dataset.savedGpx).name);
      const del = t.closest('[data-saved-del]');
      if (del) {
        const removed = P.store.deleteSavedRoute(del.dataset.savedDel);
        if (!removed) return undefined;
        if (S.viewSaved === removed.id) S.viewSaved = null;
        P.ui.toast(`"${removed.name}" dihapus.`, { action: 'Urungkan', onAction: () => P.store.restoreSavedRoute(removed) });
        return undefined;
      }
      const find = (a) => S.results && S.results.routes.find((r) => r.id === a);
      const gpx = t.closest('[data-route-gpx]');
      if (gpx && find(gpx.dataset.routeGpx)) return downloadGpx(find(gpx.dataset.routeGpx));
      const save = t.closest('[data-route-save]');
      if (save && find(save.dataset.routeSave)) return saveRoute(find(save.dataset.routeSave));
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
