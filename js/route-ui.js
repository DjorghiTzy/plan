/**
 * Rute lari: pilih target jarak, lalu aplikasi mencarikan sampai 12 rute putar & lurus dari lokasimu
 * (selisih maks. 300 m) lewat jalan sungguhan, atau gambar rute sendiri (ketuk titik / coret bebas)
 * yang dirapikan otomatis dan dihitung jaraknya. Rute bisa dibuka di Google Maps, diunduh
 * sebagai GPX, disimpan, dan coach AI memberi saran rute mana yang paling cocok.
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
  // Sampai 12 rute, masing-masing dengan warna yang jelas berbeda di atas peta.
  const COLORS = {
    A: '#1d4ed8', B: '#ea580c', C: '#c026d3', D: '#0f766e', E: '#dc2626', F: '#6d28d9',
    G: '#65a30d', H: '#92400e', I: '#db2777', J: '#0891b2', K: '#ca8a04', L: '#475569',
  };
  const SAVED_COLOR = '#15803d';
  const DRAW_COLOR = '#7c3aed';
  const DRAW_TOOLS = [['titik', 'Ketuk titik'], ['bebas', 'Coret bebas']];
  const ROUTING = 'https://routing.openstreetmap.de/routed-foot';
  const FALLBACK_VIEW = { center: [-2.5, 118], zoom: 4 }; // Indonesia
  const LEAFLET = 'js/vendor/leaflet/leaflet';

  const S = {
    loc: null, // {lat, lng, acc, source: 'gps' | 'peta'}
    locating: false,
    locError: null,
    results: null, // {target, tolerance, withinTolerance, partial, routes, km, key}
    selected: null, // rute yang diketuk: ditebalkan di peta, rute lain dipudarkan
    focus: null, // id rute yang perlu ditampilkan penuh di peta pada gambar berikutnya ('*' = semua rute)
    busy: false,
    search: 0, // nomor pencarian yang sedang berjalan; pencarian lama yang dibatalkan diabaikan
    cancel: null, // hentikan penantian pencarian yang sedang berjalan
    error: null,
    seed: 0,
    // Rute yang sudah ditampilkan untuk titik/jarak/jenis yang sama: pencarian berikutnya memberi rute lain.
    history: { key: '', lines: [] },
    viewSaved: null, // id rute tersimpan yang sedang ditampilkan di peta
    advice: null, // {status: 'loading' | 'done' | 'error', key, recommended, summary, notes, message}
    mapError: false,
    mode: 'cari', // 'cari' (saran otomatis) | 'gambar' (gambar sendiri)
    // Gambar sendiri: setiap aksi = satu ketukan atau satu coretan (Urungkan membuang aksi terakhir).
    draw: { tool: 'titik', loop: true, actions: [], route: null, busy: false, error: null, v: 0, seq: 0, stale: false },
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
    map.on('click', onMapClick);
    // Coret bebas: gambar dengan jari/mouse (peta tidak digeser selama mode ini).
    el.addEventListener('pointerdown', strokeDown);
    el.addEventListener('pointermove', strokeMove);
    el.addEventListener('pointerup', strokeUp);
    el.addEventListener('pointercancel', strokeCancel);
    if (S.loc) map.setView([S.loc.lat, S.loc.lng], 15);
    else map.setView(FALLBACK_VIEW.center, FALLBACK_VIEW.zoom);
  }

  function drawMap() {
    const L = root.L;
    const drawing = S.mode === 'gambar';
    const res = drawing ? null : S.results;
    const saved = S.viewSaved ? P.store.state.savedRoutes.find((r) => r.id === S.viewSaved) : null;
    const free = drawing && S.draw.tool === 'bebas';
    if (free === map.dragging.enabled()) map.dragging[free ? 'disable' : 'enable']();
    mapEl.classList.toggle('drawing', free);
    const sig = drawing
      ? `gambar:${S.draw.v}:${S.draw.seq}:${S.draw.route ? 1 : 0}:${S.draw.tool}|${S.loc ? `${S.loc.lat},${S.loc.lng}` : ''}|${saved ? saved.id : ''}`
      : `${res ? `${res.key}:${res.routes.length}` : ''}|${S.selected}|${S.loc ? `${S.loc.lat},${S.loc.lng}` : ''}|${saved ? saved.id : ''}`;
    if (sig === drawn) return;
    // Pencarian baru: peta menyesuaikan ke semua rute. Rute tambahan (hasil bertahap): hanya bila
    // ada yang keluar dari tampilan peta sekarang dan belum ada rute yang dipilih.
    const sel = res && res.routes.some((r) => r.id === S.selected) ? S.selected : null;
    const bounds = res && res.routes.length ? L.latLngBounds(res.routes.flatMap((r) => r.coords)) : null;
    const fresh = !res || !drawn.startsWith(`${res.key}:`);
    const fit = !drawing && (fresh || (!sel && bounds && !drawn.startsWith(`${res.key}:${res.routes.length}|`) && !map.getBounds().contains(bounds)));
    const fitSaved = saved && !drawn.endsWith(`|${saved.id}`);
    // Kartu rute diketuk: peta langsung pindah ke rute itu ('*' = kembali ke semua rute).
    const focus = !drawing && S.focus && res ? (S.focus === '*' ? { coords: res.routes.flatMap((r) => r.coords) } : res.routes.find((r) => r.id === S.focus)) : null;
    S.focus = null;
    drawn = sig;
    routeLayer.clearLayers();
    if (res) {
      // Semua rute tampil sekaligus, dibedakan warnanya. Rute yang dipilih ditebalkan dan
      // diletakkan paling atas; rute lain dipudarkan agar yang dipilih jelas terlihat.
      const order = [...res.routes].sort((a, b) => (a.id === sel) - (b.id === sel));
      for (const r of order) {
        const on = r.id === sel;
        const dim = Boolean(sel) && !on;
        L.polyline(r.coords, { color: '#fff', weight: on ? 13 : dim ? 6 : 8, opacity: on ? 1 : dim ? 0.5 : 0.9, interactive: false }).addTo(routeLayer);
        const line = L.polyline(r.coords, { color: COLORS[r.id], weight: on ? 8 : dim ? 3.5 : 5, opacity: on ? 1 : dim ? 0.45 : 0.95 }).addTo(routeLayer);
        line.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          pick(r.id, { fromMap: true });
        });
      }
    }
    if (drawing) drawSketch(free);
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
    // Coret bebas: coretan boleh dimulai tepat di titik mulai (penanda tidak ikut tergeser).
    if (startMarker && startMarker.dragging) startMarker.dragging[free ? 'disable' : 'enable']();
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
    } else if (focus && focus.coords.length) {
      map.fitBounds(L.latLngBounds(focus.coords), { padding: [40, 40], maxZoom: 17, animate: false });
    } else if (fit && bounds) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17, animate: false });
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
        icon: L.divIcon({ className: `route-tag${on ? ' on' : S.selected ? ' dim' : ''}`, html: `<span style="background:${COLORS[r.id]}">${r.id}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] }),
      }).addTo(routeLayer);
      tag.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        pick(r.id, { fromMap: true });
      });
    }
  }

  // ----- Gambar rute sendiri -----

  const drawPoints = () => S.draw.actions.flatMap((a) => a.points);

  /** Rute gambar hasil perapian + titik-titik ketukan (bisa digeser, ketuk untuk menghapus). */
  function drawSketch(free) {
    const L = root.L;
    const r = S.draw.route;
    if (r) {
      L.polyline(r.coords, { color: '#fff', weight: 8, opacity: 0.9, interactive: false }).addTo(routeLayer);
      L.polyline(r.coords, { color: DRAW_COLOR, weight: 5, opacity: 0.95, interactive: false }).addTo(routeLayer);
      L.marker(r.far, {
        keyboard: false,
        interactive: false,
        zIndexOffset: 600,
        icon: L.divIcon({ className: 'route-km-tag', html: `<span>${esc(kmText(r.distance))} km</span>`, iconSize: [0, 0] }),
      }).addTo(routeLayer);
    }
    for (const a of S.draw.actions) {
      if (a.kind !== 'titik') continue;
      // Saat coret bebas, titik ketukan hanya ditampilkan (tidak menghalangi coretan).
      const m = L.marker(a.points[0], {
        draggable: !free,
        interactive: !free,
        keyboard: false,
        title: 'Geser untuk memindahkan, ketuk untuk menghapus',
        icon: L.divIcon({ className: 'draw-point', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).addTo(routeLayer);
      m.on('dragend', () => {
        const p = m.getLatLng();
        a.points = [[p.lat, p.lng]];
        drawChanged();
      });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        S.draw.actions = S.draw.actions.filter((x) => x !== a);
        drawChanged();
      });
    }
  }

  function onMapClick(e) {
    const p = [e.latlng.lat, e.latlng.lng];
    if (S.mode !== 'gambar') return setStart(p, 'peta');
    if (S.draw.tool === 'bebas') return undefined; // ketukan ditangani lewat coretan
    if (!S.loc) return setStart(p, 'peta'); // ketukan pertama = titik mulai
    return addDrawPoints('titik', [p]);
  }

  function addDrawPoints(kind, points) {
    const room = P.loops.DRAW_MAX_POINTS - drawPoints().length;
    if (room <= 0) {
      P.ui.toast(`Paling banyak ${P.loops.DRAW_MAX_POINTS} titik. Urungkan atau hapus sebagian dulu.`, { tone: 'warn' });
      return;
    }
    S.draw.actions.push({ kind, points: points.slice(0, room) });
    drawChanged();
  }

  let stroke = null; // coretan yang sedang digambar: {id, pts, px, line}
  const strokeOn = () => S.mode === 'gambar' && S.draw.tool === 'bebas' && map;

  function strokeDown(e) {
    if (!strokeOn()) return;
    // Jari kedua (cubit untuk zoom): batalkan coretan.
    if (stroke) {
      if (e.pointerId !== stroke.id) strokeCancel();
      return;
    }
    if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('.leaflet-control')) return;
    const p = map.mouseEventToLatLng(e);
    stroke = { id: e.pointerId, pts: [[p.lat, p.lng]], px: [e.clientX, e.clientY], line: root.L.polyline([p], { color: DRAW_COLOR, weight: 4, opacity: 0.75, dashArray: '6 8', interactive: false }).addTo(map) };
    try {
      mapEl.setPointerCapture(e.pointerId);
    } catch {
      // tidak didukung: coretan tetap jalan selama jari di atas peta
    }
    e.preventDefault();
  }

  function strokeMove(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    if (Math.hypot(e.clientX - stroke.px[0], e.clientY - stroke.px[1]) < 4) return;
    stroke.px = [e.clientX, e.clientY];
    const p = map.mouseEventToLatLng(e);
    stroke.pts.push([p.lat, p.lng]);
    stroke.line.addLatLng(p);
    e.preventDefault();
  }

  function strokeUp(e) {
    if (!stroke || e.pointerId !== stroke.id) return;
    const { pts, line } = stroke;
    stroke = null;
    line.remove();
    if (!S.loc) return setStart(pts[0], 'peta');
    if (pts.length < 3 || G.lineLength(pts) < 20) return addDrawPoints('titik', [pts[0]]);
    // Coretan disederhanakan (±6 piksel layar) lalu paling banyak 25 titik antara.
    const mpp = (40075016.686 * Math.cos((pts[0][0] * Math.PI) / 180)) / 2 ** (map.getZoom() + 8);
    let simple = G.simplify(pts, Math.max(8, mpp * 6));
    if (simple.length > 25) simple = G.pointsAlong(pts, Array.from({ length: 25 }, (_, i) => i / 24));
    return addDrawPoints('coret', simple);
  }

  function strokeCancel() {
    if (!stroke) return;
    stroke.line.remove();
    stroke = null;
  }

  let drawTimer = null;
  /** Gambar berubah: rapikan ulang lewat jalan sungguhan (ditunda sebentar agar tidak banjir permintaan). */
  function drawChanged() {
    const d = S.draw;
    d.v += 1;
    d.stale = false;
    clearTimeout(drawTimer);
    const pts = drawPoints();
    const seq = (d.seq += 1);
    if (!S.loc || !pts.length) {
      Object.assign(d, { route: null, busy: false, error: null });
      refresh();
      return;
    }
    d.busy = true;
    d.error = null;
    refresh();
    drawTimer = setTimeout(async () => {
      const start = [S.loc.lat, S.loc.lng];
      try {
        const r = await P.loops.snapDrawing(routing(), start, pts, { loop: d.loop });
        if (seq !== d.seq) return;
        d.route = r;
      } catch (err) {
        if (seq !== d.seq) return;
        // Ada titik yang tidak terjangkau lewat jalan: cari titiknya, buang, lalu rapikan ulang.
        if (err.code === 'no_route' && (await dropUnreachable(start, pts, seq))) return;
        if (seq !== d.seq) return;
        d.route = null;
        d.error = err.code === 'no_route'
          ? 'Sebagian titik tidak bisa dijangkau lewat jalan dari titik mulai. Ketuk Urungkan untuk membuang titik terakhir, atau Hapus semua.'
          : err.message || 'Rute gagal dirapikan. Coba lagi.';
      }
      d.busy = false;
      d.v += 1;
      refresh();
    }, 250);
  }

  /** Buang titik gambar yang tak terjangkau lewat jalan; true bila ada yang dibuang (lalu dirapikan ulang). */
  async function dropUnreachable(start, pts, seq) {
    let bad;
    try {
      bad = await P.loops.unreachable(routing(), start, pts);
    } catch {
      return false;
    }
    if (seq !== S.draw.seq || !bad.length) return false;
    if (bad.length === pts.length) {
      S.draw.route = null;
      S.draw.busy = false;
      S.draw.error = 'Titik mulai tidak terhubung dengan titik-titik gambar lewat jalan. Geser titik mulai ke jalan yang lebih besar.';
      S.draw.v += 1;
      refresh();
      return true;
    }
    const drop = new Set(bad);
    let k = 0;
    S.draw.actions = S.draw.actions.map((a) => ({ ...a, points: a.points.filter(() => !drop.has(k++)) })).filter((a) => a.points.length);
    P.ui.toast(`${bad.length} titik tidak bisa dijangkau lewat jalan dari titik mulai (mis. di seberang sungai atau laut), jadi dihapus.`, { tone: 'warn', duration: 7000 });
    drawChanged();
    return true;
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
    // Titik mulai pindah: rute lama tidak berlaku lagi, pencarian yang sedang jalan dibatalkan.
    if ((S.results || S.busy) && (!prev || G.distance([prev.lat, prev.lng], p) > 60)) {
      S.results = null;
      S.advice = null;
      S.selected = null;
      if (S.busy) {
        S.search += 1;
        S.busy = false;
        if (S.cancel) S.cancel();
      }
    }
    if (map && mapEl && mapEl.isConnected && source === 'gps') map.setView(p, Math.max(map.getZoom(), 15), { animate: false });
    // Titik gambar yang jauh dari titik mulai baru (mis. digambar di kota lain) dibuang: rute
    // paling jauh 25 km dari titik mulai, dan titik itu membuat seluruh rute gagal.
    const near = (q) => G.distance(p, q) <= P.loops.MAX_RADIUS_M;
    const before = drawPoints().length;
    if (before && !drawPoints().every(near)) {
      S.draw.actions = S.draw.actions.map((a) => ({ ...a, points: a.points.filter(near) })).filter((a) => a.points.length);
      P.ui.toast(`${before - drawPoints().length} titik gambar yang jauh dari titik mulai baru (lebih dari 25 km) dihapus.`, { duration: 6000 });
    }
    // Rute gambar mengikuti titik mulai yang baru (di mode Cari: dirapikan ulang saat mode Gambar dibuka).
    if (before && S.mode === 'gambar') drawChanged();
    else {
      if (before) S.draw.stale = true;
      refresh();
    }
  }

  /** Baca lokasi GPS. `fresh` (tombol Perbarui/Pakai lokasiku): jangan pakai posisi lama yang tersimpan. */
  function locate({ fresh = false } = {}) {
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
        { enableHighAccuracy: true, timeout: 15000, maximumAge: fresh ? 0 : 60000 },
      );
    });
  }

  /**
   * Cari rute langsung dari browser ke layanan rute OpenStreetMap (cepat, tanpa antre di server).
   * Bila tidak bisa terhubung, coba lewat server aplikasi.
   */
  let osrm = null; // satu klien untuk seluruh sesi: jawaban yang sama diambil dari tembolok
  const routing = () => osrm || (osrm = P.loops.osrmClient(ROUTING, { fetchFn: (url, opts) => root.fetch(url, { ...opts, credentials: 'omit' }), concurrency: 2, gapMs: 200, timeoutMs: 8000 }));
  async function findRoutes(q, avoid, { onProgress, stopped }) {
    try {
      return await P.loops.suggest(q, routing(), { budgetMs: 22000, avoid, onProgress, stopped });
    } catch (err) {
      if (['far_from_road', 'no_route', 'straight_too_long', 'no_candidates'].includes(err.code)) throw err;
      if (!loggedIn() || stopped()) throw err;
      return P.sync.api('coach', { method: 'POST', timeout: 40000, body: { action: 'route', ...q, avoid: avoid.map((c) => G.simplify(c, 15)) } });
    }
  }

  async function search(ctx, { again = false, button = null } = {}) {
    if (S.busy) return;
    const km = kmOf(ctx);
    if (!S.loc && !(await locate())) return;
    // Setiap pencarian di titik, jarak, dan jenis yang sama menghindari rute yang sudah pernah muncul.
    const key = `${S.loc.lat.toFixed(4)},${S.loc.lng.toFixed(4)}|${km}|${typeOf(ctx)}`;
    if (S.history.key !== key || S.history.lines.length > 60) S.history = { key, lines: [] };
    S.seed += again || S.history.lines.length ? 1 : 0;
    const avoid = S.history.lines.slice();
    S.busy = true;
    S.search += 1;
    const id = S.search;
    const current = () => S.search === id;
    const resKey = `${Date.now()}`;
    S.viewSaved = null;
    S.error = null;
    S.advice = null;
    refresh();
    // Rute yang sudah ketemu langsung tampil; pencarian jalan terus sampai 12 rute atau waktunya habis.
    // Belum ada rute yang dipilih: semua tampil sama sampai salah satu kartunya diketuk.
    const show = (res) => {
      if (!S.results || S.results.key !== resKey || !res.routes.some((r) => r.id === S.selected)) S.selected = null;
      S.results = { ...res, km, key: resKey };
    };
    const onProgress = (res) => {
      if (!current()) return;
      show(res);
      refresh();
    };
    // Dibatalkan: tombol langsung bisa dipakai lagi; pencarian lama berhenti sendiri di putaran berikutnya.
    const cancelled = new Promise((resolve) => {
      S.cancel = resolve;
    });
    try {
      const res = await P.ui.withBusy(button, () => Promise.race([findRoutes({ lat: S.loc.lat, lng: S.loc.lng, km, seed: S.seed, type: typeOf(ctx) }, avoid, { onProgress, stopped: () => !current() }), cancelled]));
      if (!current()) return;
      show(res);
      S.history.lines.push(...res.routes.filter((r) => !r.seen).map((r) => r.coords));
      if (!res.withinTolerance) {
        const st = res.stats || {};
        let msg = `Belum ada rute dengan selisih ≤ ${res.tolerance} m di sekitar sini. Ini yang terdekat; coba "Rute lain" atau geser titik mulai ke jalan yang lebih besar.`;
        if (st.busy) msg = 'Layanan rute sedang membatasi permintaan karena terlalu sering mencari, jadi hasilnya belum lengkap. Tunggu sekitar 1 menit, lalu coba lagi.';
        else if (st.failed) msg = `Sebagian permintaan ke layanan rute gagal, jadi hasilnya belum lengkap. Coba lagi sebentar lagi.`;
        else if (res.type === 'putar') msg = `Belum ada rute putar dengan selisih ≤ ${res.tolerance} m di sekitar sini (jalannya jarang). Ini yang terdekat; coba jenis Semua atau Lurus.`;
        P.ui.toast(msg, { tone: 'warn', duration: 9000 });
      }
    } catch (err) {
      if (!current()) return;
      S.error = err.message || 'Gagal mencari rute.';
    } finally {
      if (current()) {
        S.busy = false;
        refresh();
      }
    }
    if (current() && S.results && S.results.routes.length > 1 && P.coachUI.isAvailable()) askCoach(km);
  }

  /** "Cukup": hentikan pencarian dan pakai rute yang sudah tampil. */
  function stopSearch() {
    if (!S.busy || !S.results || !S.results.partial) return;
    S.search += 1;
    S.busy = false;
    if (S.cancel) S.cancel();
    S.results = { ...S.results, partial: false };
    S.history.lines.push(...S.results.routes.filter((r) => !r.seen).map((r) => r.coords));
    refresh();
    if (S.results.routes.length > 1 && P.coachUI.isAvailable()) askCoach(S.results.km);
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

  /**
   * Pilih satu rute: ditebalkan di peta (rute lain dipudarkan). Dari kartu: peta langsung pindah ke
   * rute itu (dan digulir ke peta bila peta tidak terlihat, mis. di HP); ketuk lagi = semua rute.
   * Dari peta: kartunya disorot dan digulir ke tampilan.
   */
  function pick(id, { fromMap = false } = {}) {
    if (!S.results || !S.results.routes.some((r) => r.id === id)) return;
    if (!fromMap && S.selected === id) {
      showAll();
      return;
    }
    S.selected = id;
    if (!fromMap) S.focus = id;
    refresh();
    root.requestAnimationFrame(() => {
      if (fromMap) {
        const card = doc.querySelector(`[data-id="route-${id}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      // Peta tidak (cukup) terlihat, mis. di HP saat membaca daftar di bawahnya: gulir ke peta
      // (tepat di bawah bilah atas yang menempel).
      const box = doc.querySelector('[data-route-map]');
      const bar = doc.querySelector('.topbar');
      const top = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      const r = box && box.getBoundingClientRect();
      const seen = r ? Math.min(r.bottom, root.innerHeight) - Math.max(r.top, top) : 0;
      if (r && seen < r.height * 0.7) root.scrollTo({ top: root.scrollY + r.top - top - 8, behavior: 'smooth' });
    });
  }

  /** Kembali menampilkan semua rute sama tebal. */
  function showAll() {
    S.selected = null;
    S.focus = '*';
    refresh();
  }

  function downloadGpx(r, title = '') {
    const name = title || `Rute ${r.id} ${kmText(r.distance)} km`;
    const file = title ? `rute-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : `rute-lari-${r.id.toLowerCase()}-${kmText(r.distance).replace(',', '-')}km`;
    P.ui.download(`${file}.gpx`, G.gpx(name, r.coords), 'application/gpx+xml');
  }

  // ----- Tampilan -----

  const modeSwitch = () => `
    <div class="segmented route-mode" role="group" aria-label="Cara membuat rute">
      <button type="button" data-route-mode="cari" aria-pressed="${S.mode === 'cari'}">${icon('search')}Cari otomatis</button>
      <button type="button" data-route-mode="gambar" aria-pressed="${S.mode === 'gambar'}">${icon('edit')}Gambar sendiri</button>
    </div>`;

  function locBlock() {
    const loc = S.loc;
    let locLine;
    if (S.locating) locLine = `<span class="route-loc-text">Membaca lokasimu…</span>`;
    else if (loc) {
      const acc = loc.acc ? ` · akurasi ±${Math.round(loc.acc)} m` : '';
      locLine = `<span class="route-loc-text"><strong>${loc.source === 'gps' ? 'Lokasimu sekarang' : 'Titik pilihan di peta'}</strong>${esc(acc)}</span>`;
    } else locLine = '<span class="route-loc-text muted">Belum ada titik mulai</span>';
    return `
        <div class="route-loc">
          ${icon('pin')}
          ${locLine}
          <button type="button" class="link-btn" data-route-locate ${S.locating ? 'disabled' : ''}>${icon('locate')}${loc && loc.source === 'gps' ? 'Perbarui' : 'Pakai lokasiku'}</button>
        </div>
        ${S.locError ? `<p class="route-note warn">${esc(S.locError)}</p>` : ''}`;
  }

  function drawCard() {
    const d = S.draw;
    const none = !d.actions.length;
    return `
      <section class="panel route-form route-draw">
        ${modeSwitch()}
        <h2>Gambar rute sendiri</h2>
        <div class="route-type-pick">
          <span>Cara</span>
          <div class="segmented small" role="group" aria-label="Cara menggambar">
            ${DRAW_TOOLS.map(([k, label]) => `<button type="button" data-draw-tool="${k}" aria-pressed="${d.tool === k}">${label}</button>`).join('')}
          </div>
        </div>
        <label class="route-check"><input type="checkbox" data-draw-loop ${d.loop ? 'checked' : ''}><span>Kembali ke titik mulai</span></label>
        ${locBlock()}
        <div class="draw-tools">
          <button type="button" class="btn ghost small" data-draw-undo ${none ? 'disabled' : ''}>${icon('reset')}Urungkan</button>
          <button type="button" class="btn ghost small" data-draw-clear ${none ? 'disabled' : ''}>${icon('trash')}Hapus semua</button>
        </div>
        <p class="hint">${d.tool === 'bebas'
          ? '<b>Coret bebas</b>: tarik jari atau mouse di peta mengikuti jalan yang ingin dilewati. Selama mode ini peta tidak bisa digeser; pakai dua jari atau tombol +/− untuk zoom.'
          : '<b>Ketuk titik</b>: ketuk peta di jalan yang ingin dilewati, berurutan. Titik bisa digeser, atau diketuk untuk menghapusnya.'}
          Rute otomatis mengikuti jalan sungguhan, masuk-keluar gang yang tidak perlu dibuang, lalu jaraknya dihitung.</p>
      </section>`;
  }

  function formCard(ctx) {
    if (S.mode === 'gambar') return drawCard();
    const km = kmOf(ctx);
    const type = typeOf(ctx);
    return `
      <section class="panel route-form">
        ${modeSwitch()}
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
        ${locBlock()}
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
  const KIND = { putar: 'Putar', lurus: 'Lurus bolak-balik', gambar: 'Gambar sendiri' };
  const routeName = (r) => (r.type === 'gambar'
    ? `Gambar ${kmText(r.distance)} km${r.loop === false ? ' sekali jalan' : ''} ke ${r.direction}`
    : `${r.type === 'lurus' ? 'Lurus' : 'Putar'} ${kmText(r.distance)} km ke ${r.direction}`);
  const mapsUrl = (r) => G.googleMapsUrl(r.start, r.waypoints, r.end || r.start);

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
              <small>${esc(kmText(r.distance))} km · ${KIND[r.type] || 'Putar'} · ${r.turns} belokan · disimpan ${esc(D.formatShort(D.todayKey(new Date(r.savedAt))))}</small>
            </button>
            <div class="saved-actions">
              <a class="icon-btn" href="${esc(mapsUrl(r))}" target="_blank" rel="noopener" title="Buka di Google Maps" aria-label="Buka ${esc(r.name)} di Google Maps">${icon('external')}</a>
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

  /** Hasil rute gambar: jarak (dan selisih dari target), perapian, Google Maps, GPX, Simpan. */
  function drawResultCard(ctx) {
    const d = S.draw;
    const count = drawPoints().length;
    if (!count) {
      let msg = 'Tentukan titik mulai dulu: ketuk "Pakai lokasiku" atau ketuk peta.';
      if (S.loc) msg = d.tool === 'bebas' ? 'Coret di peta mengikuti jalan yang ingin kamu lewati.' : 'Ketuk peta untuk menambah titik pertama rutemu.';
      return `<section class="panel route-results route-drawn"><p class="muted">${msg}</p></section>`;
    }
    const r = d.route;
    const km = kmOf(ctx);
    const pace = userPace();
    let body = '';
    if (r) {
      const diff = r.distance - Math.round(km * 1000);
      const gap = Math.abs(diff) >= 1000 ? `${kmText(Math.abs(diff))} km` : `${Math.round(Math.abs(diff) / 10) * 10} m`;
      const vsTarget = Math.abs(diff) < 10 ? 'pas' : `${diff > 0 ? 'lebih' : 'kurang'} ${gap}`;
      const mins = Math.round(((r.distance / 1000) * (pace || DEFAULT_PACE)) / 60);
      const streets = r.streets.slice(0, 3).join(', ');
      body = `
        <div class="drawn-km"><b data-drawn-km>${esc(kmText(r.distance))} km</b><small>${r.loop ? 'kembali ke titik mulai' : 'sekali jalan'} · target ${esc(R.formatKm(km, 1))} km: ${esc(vsTarget)}</small></div>
        <p class="route-item-meta">±${mins} mnt${pace ? '' : ' (pace 7:00/km)'} · ${r.turns} belokan · maks. ${esc(R.formatKm(Math.round((r.maxDist || 0) / 100) / 10, 1))} km dari titikmu · ${count} titik</p>
        ${r.trimmed >= 20 ? `<p class="route-note">${icon('check')}Dirapikan otomatis: ${esc(kmText(r.trimmed))} km masuk-keluar gang atau jalan samping dibuang.</p>` : ''}
        ${streets ? `<p class="route-item-streets">${esc(streets)}</p>` : ''}
        <div class="route-item-actions">
          <a class="btn primary small" href="${esc(mapsUrl(r))}" target="_blank" rel="noopener" data-draw-gmaps>${icon('external')}Buka di Google Maps</a>
          <button type="button" class="btn ghost small" data-draw-gpx title="Unduh GPX untuk Strava, Garmin, dll.">${icon('download')}GPX</button>
          ${savedFor(r)
            ? `<button type="button" class="btn ghost small route-saved" disabled>${icon('check')}Tersimpan</button>`
            : `<button type="button" class="btn ghost small" data-draw-save title="Simpan rute ini untuk dipakai lagi">${icon('bookmark')}Simpan</button>`}
        </div>`;
    }
    return `
      <section class="panel route-results route-drawn"${d.busy ? ' aria-busy="true"' : ''}>
        <div class="panel-head"><h2>Rute gambaranmu</h2></div>
        ${d.busy ? `<p class="route-more" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>Merapikan rute lewat jalan sungguhan…</span></p>` : ''}
        ${d.error ? `<p class="route-note warn">${esc(d.error)}</p>` : ''}
        ${body}
      </section>`;
  }

  function resultsCard(ctx) {
    if (S.mode === 'gambar') return drawResultCard(ctx);
    // Masih mencari, tapi sebagian rute sudah ketemu: tampilkan dulu, sisanya menyusul.
    const more = S.busy && S.results && S.results.partial;
    if (S.busy && !more) {
      return `<section class="panel route-results" aria-busy="true"><div class="panel-head"><h2>Mencari rute…</h2></div><p class="muted">Menghitung rute lewat jalan di sekitarmu. Rute pertama biasanya muncul dalam beberapa detik, lalu terus bertambah.</p>${P.ui.skeleton(3)}</section>`;
    }
    if (S.error) return `<section class="panel route-results"><p class="route-note warn">${esc(S.error)}</p></section>`;
    const res = S.results;
    if (!res) return '';
    const pace = userPace();
    return `
      <section class="panel route-results"${more ? ' aria-busy="true"' : ''}>
        <div class="panel-head">
          <h2>${res.routes.length} rute untuk ${esc(R.formatKm(res.km, 1))} km</h2>
          ${more ? '' : `<button type="button" class="link-btn" data-route-again>${icon('refresh')}Rute lain</button>`}
        </div>
        ${more ? `<p class="route-more" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>Mencari rute lain… Rute yang sudah muncul bisa langsung dipakai.</span><button type="button" class="link-btn" data-route-stop>Cukup</button></p>` : ''}
        ${res.routes.some((r) => r.id === S.selected) ? `<p class="route-picked" style="--route: ${COLORS[S.selected]}"><span class="route-letter" aria-hidden="true">${esc(S.selected)}</span><span>Rute ${esc(S.selected)} ditampilkan tebal di peta.</span><button type="button" class="link-btn" data-route-all>Lihat semua</button></p>` : ''}
        ${!more && res.withinTolerance && res.routes.length < 3 ? `<p class="route-note warn">Baru ketemu ${res.routes.length} rute berbeda di sekitar sini (jalannya jarang). Coba geser titik mulai ke jalan lain, pilih jenis Semua, atau ubah jaraknya.</p>` : ''}
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
            ${S.mode === 'gambar' ? '' : adviceCard()}
            ${resultsCard(ctx)}
            ${savedCard()}
          </div>
        </div>
      </div>`;
  }

  function mount(el, ctx) {
    el.addEventListener('click', (e) => {
      const t = e.target;
      if (!t.closest('[data-route]')) return undefined;
      const mode = t.closest('[data-route-mode]');
      if (mode) {
        S.mode = mode.dataset.routeMode === 'gambar' ? 'gambar' : 'cari';
        S.viewSaved = null;
        strokeCancel();
        // Titik mulai pindah selama di mode Cari: rute gambar dirapikan ulang dari titik yang baru.
        if (S.mode === 'gambar' && S.draw.stale) return drawChanged();
        return refresh();
      }
      const tool = t.closest('[data-draw-tool]');
      if (tool) {
        S.draw.tool = tool.dataset.drawTool === 'bebas' ? 'bebas' : 'titik';
        return refresh();
      }
      if (t.closest('[data-draw-undo]')) {
        S.draw.actions.pop();
        return drawChanged();
      }
      if (t.closest('[data-draw-clear]')) {
        const before = S.draw.actions;
        S.draw.actions = [];
        drawChanged();
        if (before.length) {
          P.ui.toast('Gambar rute dihapus.', { action: 'Urungkan', onAction: () => {
            S.draw.actions = before;
            drawChanged();
          } });
        }
        return undefined;
      }
      if (t.closest('[data-draw-gpx]') && S.draw.route) return downloadGpx(S.draw.route, routeName(S.draw.route));
      if (t.closest('[data-draw-save]') && S.draw.route) return saveRoute(S.draw.route);
      const kind = t.closest('[data-route-type]');
      if (kind) return ctx.setPref('routeType', kind.dataset.routeType);
      const chip = t.closest('[data-route-km]');
      if (chip) return ctx.setPref('routeKm', Number(chip.dataset.routeKm));
      if (t.closest('[data-route-locate]')) return locate({ fresh: true });
      const go = t.closest('[data-route-go]');
      if (go) return search(ctx, { button: go });
      if (t.closest('[data-route-stop]')) return stopSearch();
      if (t.closest('[data-route-all]')) return showAll();
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
      const loop = e.target.closest('[data-draw-loop]');
      if (loop) {
        S.draw.loop = loop.checked;
        drawChanged();
        return;
      }
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
