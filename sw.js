/*
 * Service worker:
 * - Berkas aplikasi (JS/CSS/ikon) langsung dari cache lalu diperbarui di latar
 *   (stale-while-revalidate) → aplikasi terbuka cepat walau sinyal lemah.
 * - Halaman (navigasi) tetap dari jaringan dulu agar gerbang mode pribadi berlaku;
 *   saat offline memakai salinan terakhir.
 * - Menampilkan notifikasi pengingat per jam dari server (Web Push).
 */
// Naikkan VERSION setiap rilis (sama dengan ?v= di index.html & masuk.html).
const VERSION = '9';
const CACHE = `rencana-harian-v${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/badge-96.png',
  `./css/styles.css?v=${VERSION}`,
  `./js/core/date.js?v=${VERSION}`,
  `./js/core/logic.js?v=${VERSION}`,
  `./js/core/prayer.js?v=${VERSION}`,
  `./js/data/proverbs.js?v=${VERSION}`,
  `./js/data/templates.js?v=${VERSION}`,
  `./js/data/sample.js?v=${VERSION}`,
  `./js/core/syncmap.js?v=${VERSION}`,
  `./js/store.js?v=${VERSION}`,
  `./js/morph.js?v=${VERSION}`,
  `./js/sync.js?v=${VERSION}`,
  `./js/account.js?v=${VERSION}`,
  './js/vendor/qrcode.js',
  `./js/ui.js?v=${VERSION}`,
  `./js/components.js?v=${VERSION}`,
  `./js/templates-ui.js?v=${VERSION}`,
  `./js/work.js?v=${VERSION}`,
  `./js/reminder.js?v=${VERSION}`,
  `./js/timer.js?v=${VERSION}`,
  `./js/ambient.js?v=${VERSION}`,
  `./js/ritual.js?v=${VERSION}`,
  `./js/views/beranda.js?v=${VERSION}`,
  `./js/views/rencana.js?v=${VERSION}`,
  `./js/views/pekan.js?v=${VERSION}`,
  `./js/views/kebiasaan.js?v=${VERSION}`,
  `./js/views/fokus.js?v=${VERSION}`,
  `./js/views/jurnal.js?v=${VERSION}`,
  `./js/views/statistik.js?v=${VERSION}`,
  `./js/views/pengaturan.js?v=${VERSION}`,
  `./js/app.js?v=${VERSION}`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // Satu berkas gagal (mis. 401 di mode pribadi sebelum masuk) tidak menggagalkan pemasangan.
      .then((cache) => Promise.all(ASSETS.map((a) => cache.add(a).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function saveCopy(request, response) {
  if (response && response.ok && response.type === 'basic' && !response.redirected) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Hanya berkas aplikasi sendiri; font & API langsung ke jaringan.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => saveCopy(request, res))
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request).then((res) => saveCopy(request, res));
      if (hit) {
        event.waitUntil(network.catch(() => {}));
        return hit;
      }
      return network;
    }),
  );
});

// ----- Pengingat per jam -----

const MESSAGES = [
  'Apa yang sudah kamu kerjakan satu jam terakhir? Catat sebentar, lalu lanjut lagi.',
  'Cek rencanamu: centang yang selesai, tambahkan yang baru.',
  'Satu menit untuk rencanamu. Isi, rapikan, lanjut! 💪',
  'Masih sesuai rencana? Sesuaikan jadwal satu jam ke depan.',
  'Catat kemajuanmu, lalu minum segelas air. 💧',
  'Tulis satu hal yang selesai jam ini, sekecil apa pun.',
];

function reminderText(date) {
  const h = date.getHours();
  return {
    title: `Pengingat ${String(h).padStart(2, '0')}.00 · Rencana Harian`,
    body: MESSAGES[h % MESSAGES.length],
  };
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const text = reminderText(new Date());
  event.waitUntil(self.registration.showNotification(data.title || text.title, {
    body: data.body || text.body,
    tag: 'pengingat-jam',
    renotify: true,
    icon: './icons/icon-192.png',
    badge: './icons/badge-96.png',
    data: { url: './#isi' },
    actions: [{ action: 'isi', title: 'Isi sekarang' }],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './#isi', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) {
      await win.focus();
      win.postMessage({ type: 'isi' });
      return;
    }
    await self.clients.openWindow(target);
  })());
});
