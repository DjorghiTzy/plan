'use strict';

const { route, send, query, HttpError } = require('./_lib/http');
const { getStore } = require('./_lib/store');
const push = require('./_lib/push');

/**
 * GET/POST /api/remind — dipanggil penjadwal eksternal SETIAP JAM (mis. cron-job.org
 * atau GitHub Actions; cron Vercel paket Hobby hanya sekali sehari).
 * Mengirim pengingat "waktunya mengisi rencana" ke perangkat yang sedang di jam aktifnya.
 *
 * Aman dipanggil siapa saja: tiap perangkat paling banyak menerima satu pengingat
 * per jam. Bila CRON_SECRET / REMINDER_SECRET diisi, wajib menyertakan
 * `Authorization: Bearer <rahasia>` atau `?key=<rahasia>`.
 */
async function handle(req, res) {
  const secret = process.env.CRON_SECRET || process.env.REMINDER_SECRET;
  if (secret) {
    const given = query(req).get('key') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (given !== secret) throw new HttpError(401, 'Kunci penjadwal salah.', 'unauthorized');
  }
  const store = getStore();
  if (!store) {
    send(res, 503, { error: 'Penyimpanan (Upstash Redis) belum terhubung.', code: 'no_store' });
    return;
  }
  // Pemanggilan beruntun dalam satu menit cukup dijalankan sekali.
  if (!(await store.set(push.KEYS.lock, '1', { nx: true, ex: 50 }))) {
    send(res, 200, { ok: true, skipped: 'baru saja dijalankan' });
    return;
  }
  const result = await push.tick(store);
  send(res, 200, { ok: true, ...result });
}

module.exports = route({ GET: handle, POST: handle });
