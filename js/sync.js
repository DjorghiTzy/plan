/**
 * Sinkronisasi antarperangkat (klien).
 *
 * - Data tetap disimpan di perangkat (bisa dipakai offline); perubahan dicatat
 *   per entri lalu dikirim ke server /api/sync.
 * - Perubahan dari perangkat lain ditarik berkala (tiap 4 detik saat aktif,
 *   lebih jarang saat diam) dan langsung saat tab kembali terlihat/online.
 * - Konflik diselesaikan per entri: yang diubah paling akhir menang.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const M = P.syncmap;

  const API = 'api';
  // Versi format data klien; server memakainya untuk melindungi data dari tab versi lama.
  const CLIENT_VERSION = '10';
  const SESSION_KEY = 'rencana-harian/session';
  const META_KEY = 'rencana-harian/sync';
  const FRESH_KEY = 'rencana-harian/sync-fresh'; // diisi halaman masuk (mode pribadi)
  const BATCH = 400;
  const ACTIVE_MS = 3000;
  const IDLE_MS = 20000;

  const s = {
    available: false,
    checked: false,
    private: false,
    session: null, // {token, user}
    rev: 0,
    shadow: {}, // kunci → JSON terakhir yang sama dengan server
    dirty: {}, // kunci → {t} perubahan lokal yang belum terkirim
    status: 'local', // local | idle | syncing | offline | error
    error: '',
    lastSyncAt: 0,
  };

  const statusFns = new Set();
  let timer = null;
  let scanTimer = null;
  let busy = false;
  let failures = 0;
  let lastInteraction = Date.now();
  let applying = false;

  // ----- Penyimpanan lokal -----

  const readJSON = (k) => {
    try {
      return JSON.parse(root.localStorage.getItem(k) || 'null');
    } catch {
      return null;
    }
  };
  const writeJSON = (k, v) => {
    try {
      if (v == null) root.localStorage.removeItem(k);
      else root.localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* penyimpanan penuh/diblokir: sinkron tetap jalan di memori */
    }
  };
  const readRaw = (k) => {
    try {
      return root.localStorage.getItem(k);
    } catch {
      return null;
    }
  };
  const saveMeta = () => writeJSON(META_KEY, { rev: s.rev, shadow: s.shadow, dirty: s.dirty, lastSyncAt: s.lastSyncAt });
  function loadMeta() {
    const m = readJSON(META_KEY) || {};
    s.rev = Number(m.rev) || 0;
    s.shadow = m.shadow || {};
    s.dirty = m.dirty || {};
    s.lastSyncAt = m.lastSyncAt || 0;
  }

  function setStatus(status, error = '') {
    s.status = status;
    s.error = error;
    statusFns.forEach((fn) => fn(info()));
  }

  function info() {
    return {
      available: s.available,
      checked: s.checked,
      private: s.private,
      loggedIn: Boolean(s.session),
      user: s.session ? s.session.user : null,
      status: s.session ? s.status : 'local',
      error: s.error,
      pending: Object.keys(s.dirty).length,
      lastSyncAt: s.lastSyncAt,
      loading: Boolean(s.loading),
    };
  }

  // ----- HTTP -----

  class ApiError extends Error {
    constructor(status, message, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function api(path, { method = 'GET', body, auth = true, timeout = 15000 } = {}) {
    const headers = { 'Content-Type': 'application/json', 'X-Client-Version': CLIENT_VERSION };
    if (auth && s.session) headers.Authorization = `Bearer ${s.session.token}`;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    let res;
    try {
      res = await root.fetch(`${API}/${path}`, {
        method, headers, body: body ? JSON.stringify(body) : undefined, signal: ctrl && ctrl.signal, cache: 'no-store',
      });
    } catch {
      throw new ApiError(0, 'Tidak ada koneksi ke server.', 'offline');
    } finally {
      if (t) clearTimeout(t);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || `Server menjawab ${res.status}.`, data.code);
    return data;
  }

  // ----- Inti sinkron -----

  function scan() {
    if (!s.session || applying) return;
    const flat = M.flatten(P.store.state);
    const { changed, removed, json } = M.diff(flat, s.shadow);
    const now = Date.now();
    for (const k of changed) {
      // Kejadian tugas berulang buatan otomatis diberi waktu sangat lama
      // agar tidak pernah menimpa perubahan asli dari perangkat lain.
      const auto = flat[k] && flat[k].auto === true;
      if (!s.dirty[k] || s.dirty[k].json !== json[k]) s.dirty[k] = { t: auto ? 1 : now, json: json[k] };
    }
    for (const k of removed) {
      if (!s.dirty[k] || !s.dirty[k].d) s.dirty[k] = { t: now, d: true };
    }
    // Perubahan yang dibatalkan kembali ke nilai semula tidak perlu dikirim.
    for (const k of Object.keys(s.dirty)) {
      if (!s.dirty[k].d && s.shadow[k] === json[k]) delete s.dirty[k];
      if (s.dirty[k] && s.dirty[k].d && !(k in s.shadow) && !(k in flat)) delete s.dirty[k];
    }
    saveMeta();
  }

  function scheduleScan() {
    if (!s.session) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      // Bandingkan seluruh data saat browser senggang, agar tidak bertabrakan dengan klik berikutnya.
      const run = () => {
        scan();
        if (Object.keys(s.dirty).length) sync();
      };
      if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, 700);
  }

  /** Terapkan perubahan dari server ke status lokal. */
  function apply(changes) {
    const todo = [];
    for (const [k, e] of Object.entries(changes || {})) {
      const local = s.dirty[k];
      if (local && local.t > e.t) continue; // perubahan lokal lebih baru; akan dikirim
      const json = e.d ? null : JSON.stringify(e.v);
      if (!local && s.shadow[k] === json) continue; // gema dari kiriman sendiri
      if (!local && e.d && !(k in s.shadow)) continue;
      todo.push([k, e, json]);
    }
    if (!todo.length) return 0;
    applying = true;
    try {
      P.store.commit((state) => {
        for (const [k, e, json] of todo) {
          M.applyEntry(state, k, e);
          if (json === null) delete s.shadow[k];
          else s.shadow[k] = json;
          delete s.dirty[k];
        }
        // Lengkapi field yang hilang agar data dari perangkat lain selalu aman dirender.
        const clean = P.store.normalize(state);
        for (const key of ['settings', 'tasks', 'series', 'habits', 'habitLog', 'water', 'journal', 'weekNotes', 'ibadah', 'focusSessions', 'templates', 'projects', 'timer']) {
          state[key] = clean[key];
        }
      }, { source: 'remote' });
    } finally {
      applying = false;
    }
    if (P.app && todo.some(([k]) => k === 'settings:theme')) P.app.applyTheme();
    return todo.length;
  }

  async function pushBatch() {
    const flat = M.flatten(P.store.state);
    const keys = Object.keys(s.dirty).slice(0, BATCH);
    const changes = {};
    const sent = {};
    for (const k of keys) {
      const d = s.dirty[k];
      if (d.d || !(k in flat)) {
        changes[k] = { d: true, t: d.t };
        sent[k] = null;
      } else {
        changes[k] = { v: flat[k], t: d.t };
        sent[k] = JSON.stringify(flat[k]);
      }
    }
    const res = await api('sync', { method: 'POST', body: { since: s.rev, changes } });
    for (const k of res.written || []) {
      if (sent[k] === null) delete s.shadow[k];
      else s.shadow[k] = sent[k];
      // Hapus dari antrean kecuali sudah diubah lagi selama pengiriman.
      const d = s.dirty[k];
      if (d && (sent[k] === null ? d.d : d.json === sent[k])) delete s.dirty[k];
    }
    for (const k of res.rejected || []) delete s.dirty[k]; // versi server lebih baru, ikuti server
    apply(res.changes);
    s.rev = res.rev;
  }

  async function sync() {
    if (!s.session || busy) return;
    busy = true;
    setStatus('syncing');
    try {
      scan();
      let rounds = 0;
      while (Object.keys(s.dirty).length && rounds < 20) {
        await pushBatch();
        rounds += 1;
      }
      if (!rounds) {
        const res = await api(`sync?since=${s.rev}`);
        apply(res.changes);
        s.rev = res.rev;
      }
      s.lastSyncAt = Date.now();
      failures = 0;
      saveMeta();
      setStatus('idle');
    } catch (err) {
      failures += 1;
      if (err.status === 401) {
        endSession();
        setStatus('error', 'Sesi berakhir. Silakan masuk lagi.');
        if (s.private) root.location.replace('masuk.html');
      } else if (err.status === 0) {
        setStatus('offline', err.message);
      } else {
        setStatus('error', err.message);
      }
      saveMeta();
    } finally {
      busy = false;
      schedule();
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!s.session) return;
    if (root.document.hidden) return; // dilanjutkan saat tab terlihat lagi
    let wait = Date.now() - lastInteraction < 120000 ? ACTIVE_MS : IDLE_MS;
    if (failures) wait = Math.min(60000, 2000 * 2 ** Math.min(failures, 5));
    timer = setTimeout(sync, wait);
  }

  // ----- Akun -----

  function device() {
    const ua = root.navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    return 'Browser';
  }

  function hasLocalData() {
    const st = P.store.state;
    if (st.settings.isSample) return false;
    return st.tasks.length + st.habits.length + Object.keys(st.journal).length + st.focusSessions.length + (st.templates || []).length
      + (st.projects || []).length + Object.keys(st.ibadah || {}).length > 0;
  }

  /**
   * Mulai sesi baru.
   * @param {'merge'|'replace'} mode merge = gabungkan data perangkat ini ke akun
   *   tanpa menimpa data akun; replace = pakai data akun saja
   */
  async function startSession(session, mode) {
    s.session = session;
    writeJSON(SESSION_KEY, session);
    s.rev = 0;
    s.shadow = {};
    s.dirty = {};
    if (mode === 'replace' || !hasLocalData()) {
      P.store.resetLocal({ silent: true });
    } else {
      const flat = M.flatten(P.store.state);
      for (const k of Object.keys(flat)) s.dirty[k] = { t: 1, json: JSON.stringify(flat[k]) };
    }
    saveMeta();
    // Tarik dulu seluruh data akun, lalu kirim data lokal yang belum ada di server.
    // Selama itu tampilan menunjukkan kerangka & bilah pemuatan, bukan halaman kosong.
    s.loading = true;
    P.ui.busy.start();
    P.store.commit(() => {}, { source: 'remote' });
    try {
      const res = await api('sync?since=0');
      apply(res.changes);
      s.rev = res.rev;
    } finally {
      s.loading = false;
      P.ui.busy.stop();
      P.store.commit(() => {}, { source: 'remote' });
    }
    await sync();
  }

  async function authRequest(path, body, mode) {
    const res = await api(path, { method: 'POST', body: { ...body, device: device() }, auth: false });
    await startSession({ token: res.token, user: res.user }, mode);
    return res.user;
  }

  function endSession() {
    clearTimeout(timer);
    s.session = null;
    s.rev = 0;
    s.shadow = {};
    s.dirty = {};
    writeJSON(SESSION_KEY, null);
    writeJSON(META_KEY, null);
  }

  async function logout() {
    // Perangkat yang keluar tidak lagi menerima pengingat push untuk akun ini.
    if (P.reminder) await P.reminder.detach().catch(() => {});
    try {
      await api('logout', { method: 'POST' });
    } catch {
      /* tetap keluar di perangkat ini */
    }
    endSession();
    setStatus('local');
    if (s.private) root.location.replace('masuk.html');
  }

  async function deleteAccount(password) {
    await api('account', { method: 'DELETE', body: { password } });
    endSession();
    setStatus('local');
    if (s.private) root.location.replace('masuk.html');
  }

  const createPairCode = () => api('pair', { method: 'POST', body: {} });

  // ----- Mulai -----

  async function checkServer() {
    if (!/^https?:$/.test(root.location.protocol)) return false;
    try {
      const h = await api('health', { auth: false, timeout: 5000 });
      s.private = Boolean(h && h.private);
      return Boolean(h && h.sync);
    } catch {
      return false;
    }
  }

  async function init() {
    s.session = readJSON(SESSION_KEY);
    loadMeta();
    P.store.onCommit((state, opts) => {
      if (opts.source !== 'remote') scheduleScan();
    });

    const markActive = () => {
      const idle = Date.now() - lastInteraction > 120000;
      lastInteraction = Date.now();
      if (idle && s.session) sync();
    };
    root.addEventListener('pointerdown', markActive, { passive: true });
    root.addEventListener('keydown', markActive);
    root.addEventListener('online', () => sync());
    root.document.addEventListener('visibilitychange', () => {
      if (!root.document.hidden) sync();
    });
    // Tab lain di browser yang sama menyimpan perubahan → muat ulang di sini.
    root.addEventListener('storage', (e) => {
      if (e.key === 'rencana-harian/v1' && e.newValue) P.store.reload();
      if (e.key === META_KEY) loadMeta();
      if (e.key === SESSION_KEY) {
        s.session = readJSON(SESSION_KEY);
        setStatus(s.session ? 'idle' : 'local');
      }
    });

    s.available = await checkServer();
    s.checked = true;

    // Baru masuk lewat halaman masuk: ambil data akun (gabung bila perangkat punya data sendiri).
    const fresh = readRaw(FRESH_KEY);
    if (fresh && s.session && s.available) {
      try {
        root.localStorage.removeItem(FRESH_KEY);
      } catch {
        /* abaikan */
      }
      setStatus('syncing');
      try {
        await startSession(s.session, hasLocalData() ? 'merge' : 'replace');
        if (fresh.startsWith('name:') && !P.store.state.settings.name) P.store.setSettings({ name: fresh.slice(5).slice(0, 30) });
      } catch (err) {
        setStatus(err.status === 0 ? 'offline' : 'error', err.message);
      }
      return;
    }

    if (s.available && s.session) {
      setStatus('syncing');
      sync();
    } else {
      setStatus(s.session ? 'offline' : 'local');
    }
  }

  P.sync = {
    init,
    info,
    onStatus(fn) {
      statusFns.add(fn);
      return () => statusFns.delete(fn);
    },
    syncNow: () => sync(),
    hasLocalData,
    register: (body, mode) => authRequest('register', body, mode),
    login: (body, mode) => authRequest('login', body, mode),
    claimCode: (code, mode) => authRequest('pair', { code }, mode),
    logout,
    deleteAccount,
    createPairCode,
    api,
    _state: s,
  };
})(typeof self !== 'undefined' ? self : this);
