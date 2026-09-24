/* Service worker: menyimpan berkas aplikasi agar tetap bisa dibuka tanpa internet. */
const CACHE = 'rencana-harian-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './css/styles.css',
  './js/core/date.js',
  './js/core/logic.js',
  './js/core/prayer.js',
  './js/data/proverbs.js',
  './js/data/templates.js',
  './js/data/sample.js',
  './js/core/syncmap.js',
  './js/store.js',
  './js/morph.js',
  './js/sync.js',
  './js/account.js',
  './js/vendor/qrcode.js',
  './js/ui.js',
  './js/components.js',
  './js/timer.js',
  './js/ambient.js',
  './js/ritual.js',
  './js/views/beranda.js',
  './js/views/rencana.js',
  './js/views/pekan.js',
  './js/views/kebiasaan.js',
  './js/views/fokus.js',
  './js/views/jurnal.js',
  './js/views/statistik.js',
  './js/views/pengaturan.js',
  './js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Jaringan dulu (supaya pembaruan langsung terlihat), cadangan dari cache saat offline.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Hanya berkas aplikasi sendiri yang di-cache; font & API langsung ke jaringan.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
  );
});
