/**
 * Pengingat per jam: "Waktunya mengisi rencana".
 *
 * Dua jalur, saling melengkapi:
 * 1. Lokal — selama aplikasi terbuka (termasuk di tab latar), tepat di menit :00
 *    pada jam aktif muncul toast "Isi sekarang" dan (bila tab tersembunyi) notifikasi.
 * 2. Push — saat aplikasi tertutup, server mengirim notifikasi tiap jam (Web Push).
 *    Butuh akun (masuk) + izin notifikasi + penjadwal per jam yang memanggil /api/remind.
 * Kedua jalur memakai tag notifikasi yang sama, jadi tidak muncul dobel.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const doc = root.document;
  const nav = root.navigator;
  const LAST_KEY = 'rencana-harian/hourly-last';
  const TAG = 'pengingat-jam';

  const state = {
    server: null, // {available, publicKey, lastTick, devices}
    subscribed: false,
    error: null,
  };

  const settings = () => P.store.state.settings;

  function support() {
    const notif = 'Notification' in root;
    const push = notif && 'serviceWorker' in nav && 'PushManager' in root;
    const ios = /iPhone|iPad|iPod/i.test(nav.userAgent || '');
    const standalone = (root.matchMedia && root.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true;
    return { notif, push, ios, standalone };
  }

  const permission = () => ('Notification' in root ? root.Notification.permission : 'unsupported');

  /** Jam aktif inklusif; boleh melewati tengah malam. */
  function inWindow(hour, from, to) {
    return from <= to ? hour >= from && hour <= to : hour >= from || hour <= to;
  }

  function hoursLabel() {
    const s = settings();
    const f = (h) => `${String(h).padStart(2, '0')}.00`;
    return `${f(s.hourlyFrom)}–${f(s.hourlyTo)}`;
  }

  // ----- Push -----

  function keyBytes(b64url) {
    const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
    const raw = root.atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }

  function sameKey(a, b) {
    if (!a || !b) return false;
    const x = new Uint8Array(a);
    if (x.length !== b.length) return false;
    return x.every((v, i) => v === b[i]);
  }

  async function registration() {
    if (!('serviceWorker' in nav)) return null;
    try {
      return await Promise.race([
        nav.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
    } catch {
      return null;
    }
  }

  async function serverInfo() {
    try {
      state.server = await P.sync.api('push', { timeout: 8000 });
    } catch {
      state.server = { available: false };
    }
    return state.server;
  }

  /**
   * Pastikan perangkat ini berlangganan push dan server tahu jam aktifnya.
   * Aman dipanggil berulang (mis. setiap aplikasi dibuka atau jam aktif diubah).
   */
  async function ensurePush() {
    state.error = null;
    const sup = support();
    if (!settings().hourly || !sup.push || permission() !== 'granted') return false;
    if (!P.sync.info().loggedIn) return false;
    const info = state.server && state.server.publicKey ? state.server : await serverInfo();
    if (!info.available || !info.publicKey) return false;
    const reg = await registration();
    if (!reg || !reg.pushManager) return false;
    try {
      const key = keyBytes(info.publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && sub.options && sub.options.applicationServerKey && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const s = settings();
      await P.sync.api('push', {
        method: 'POST',
        body: {
          subscription: sub.toJSON(),
          from: s.hourlyFrom,
          to: s.hourlyTo,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          device: deviceName(),
        },
      });
      state.subscribed = true;
      return true;
    } catch (err) {
      state.subscribed = false;
      state.error = err && err.message ? err.message : 'Gagal mengaktifkan notifikasi push.';
      return false;
    }
  }

  /** Berhenti berlangganan push di perangkat ini (server & browser). */
  async function detach() {
    const reg = await registration();
    const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    if (P.sync.info().loggedIn) {
      try {
        await P.sync.api('push', { method: 'DELETE', body: { endpoint: sub.endpoint } });
      } catch {
        /* tetap lepas di browser */
      }
    }
    try {
      await sub.unsubscribe();
    } catch {
      /* abaikan */
    }
    state.subscribed = false;
  }

  function deviceName() {
    const ua = nav.userAgent || '';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    return 'Browser';
  }

  // ----- Aktif / nonaktif (dipanggil dari Pengaturan) -----

  async function enable() {
    const sup = support();
    if (!sup.notif) {
      P.store.setSettings({ hourly: true });
      P.ui.toast('Browser ini tidak mendukung notifikasi. Pengingat muncul di dalam aplikasi saat terbuka.', { tone: 'warn', duration: 7000 });
      return;
    }
    let perm = permission();
    if (perm === 'default') {
      try {
        perm = await root.Notification.requestPermission();
      } catch {
        perm = permission();
      }
    }
    P.store.setSettings({ hourly: true });
    if (perm !== 'granted') {
      P.ui.toast('Izin notifikasi ditolak. Pengingat hanya muncul di dalam aplikasi saat terbuka.', { tone: 'warn', duration: 7000 });
      return;
    }
    const ok = await P.ui.withBusy(null, () => ensurePush());
    if (ok) P.ui.toast(`Pengingat per jam aktif (${hoursLabel()}), juga saat aplikasi tertutup.`, { tone: 'success', duration: 6000 });
    else P.ui.toast(`Pengingat per jam aktif (${hoursLabel()}) selama aplikasi terbuka.`, { tone: 'success', duration: 6000 });
    if (P.app) P.app.refresh();
  }

  async function disable() {
    P.store.setSettings({ hourly: false });
    await P.ui.withBusy(null, () => detach());
    P.ui.toast('Pengingat per jam dimatikan.');
    if (P.app) P.app.refresh();
  }

  async function test() {
    if (permission() !== 'granted') {
      P.ui.toast('Izinkan notifikasi terlebih dahulu.', { tone: 'warn' });
      return;
    }
    if (state.subscribed && P.sync.info().loggedIn) {
      try {
        const r = await P.ui.withBusy(null, () => P.sync.api('push', { method: 'POST', body: { test: true } }));
        if (r.sent) {
          P.ui.toast(`Notifikasi tes dikirim lewat server ke ${r.sent} perangkat. Tunggu beberapa detik.`, { tone: 'success', duration: 6000 });
          return;
        }
      } catch (err) {
        P.ui.toast(err.message, { tone: 'warn' });
      }
    }
    await showLocal(true);
    P.ui.toast('Notifikasi tes ditampilkan dari perangkat ini.', { tone: 'success' });
  }

  // ----- Pengingat lokal (aplikasi terbuka) -----

  function message(hour) {
    const list = [
      'Apa yang sudah kamu kerjakan satu jam terakhir? Catat sebentar, lalu lanjut lagi.',
      'Cek rencanamu: centang yang selesai, tambahkan yang baru.',
      'Satu menit untuk rencanamu. Isi, rapikan, lanjut! 💪',
      'Masih sesuai rencana? Sesuaikan jadwal satu jam ke depan.',
      'Catat kemajuanmu, lalu minum segelas air. 💧',
      'Tulis satu hal yang selesai jam ini, sekecil apa pun.',
    ];
    return list[hour % list.length];
  }

  async function showLocal(force = false) {
    if (permission() !== 'granted') return false;
    const h = new Date().getHours();
    const title = `Pengingat ${String(h).padStart(2, '0')}.00 · Rencana Harian`;
    const opts = {
      body: message(h), tag: TAG, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: './#isi' },
    };
    try {
      const reg = await registration();
      if (reg && reg.showNotification) {
        await reg.showNotification(title, { ...opts, actions: [{ action: 'isi', title: 'Isi sekarang' }] });
        return true;
      }
      if (force || doc.hidden) {
        const n = new root.Notification(title, opts);
        n.onclick = () => {
          root.focus();
          fill();
        };
        return true;
      }
    } catch {
      /* notifikasi bersifat opsional */
    }
    return false;
  }

  /** Dipanggil app.js tiap menit berganti. */
  function onMinute(now = new Date()) {
    const s = settings();
    if (!s.hourly || now.getMinutes() !== 0 || !inWindow(now.getHours(), s.hourlyFrom, s.hourlyTo)) return;
    const slot = `${P.date.todayKey(now)}T${now.getHours()}`;
    // Satu kali per jam walau aplikasi terbuka di beberapa tab.
    try {
      if (root.localStorage.getItem(LAST_KEY) === slot) return;
      root.localStorage.setItem(LAST_KEY, slot);
    } catch {
      /* tanpa localStorage tetap jalan */
    }
    if (!doc.hidden) {
      P.ui.toast(`⏰ ${message(now.getHours())}`, { tone: 'info', duration: 15000, action: 'Isi sekarang', onAction: fill });
    }
    // Bila push aktif di perangkat ini, notifikasi sistem datang dari server (tidak dobel).
    if (doc.hidden && !state.subscribed) showLocal();
  }

  /** Buka Beranda dan fokus ke kotak tambah cepat. */
  function fill() {
    if (!P.app) return;
    P.app.go('beranda');
    P.ui.afterPaint(() => {
      P.ui.afterPaint(() => {
        const q = doc.getElementById('quick-add');
        if (q) {
          q.focus();
          q.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    });
  }

  let serverAt = 0;
  /** Segarkan status server (mis. kapan penjadwal terakhir berjalan) paling sering tiap menit. */
  async function refreshServer() {
    if (Date.now() - serverAt < 60000 || !P.sync.info().available) return false;
    serverAt = Date.now();
    await serverInfo();
    return true;
  }

  function init() {
    if ('serviceWorker' in nav) {
      nav.serviceWorker.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'isi') fill();
      });
    }
    // Setelah aplikasi siap (dan sesi sinkron diketahui), perbarui langganan push.
    setTimeout(() => {
      if (settings().hourly) ensurePush().then(() => P.app && P.app.refresh());
    }, 2500);
  }

  P.reminder = {
    init, support, permission, enable, disable, test, ensurePush, detach, onMinute, fill, inWindow, hoursLabel, refreshServer,
    get info() {
      return { ...state };
    },
  };
})(typeof self !== 'undefined' ? self : this);
