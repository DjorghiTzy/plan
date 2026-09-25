/**
 * Notifikasi push (Web Push + VAPID) untuk pengingat per jam, tanpa dependensi.
 *
 * - Kunci VAPID dibuat sekali lalu disimpan di Redis (atau diambil dari variabel
 *   lingkungan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY bila diisi).
 * - Pesan dikirim TANPA isi (payload kosong), jadi tidak perlu enkripsi; service
 *   worker menampilkan teks pengingatnya sendiri.
 * - tick() dipanggil penjadwal eksternal tiap jam (lihat api/remind.js). Setiap
 *   langganan hanya dikirimi satu pengingat per jam lokal pemiliknya, di dalam
 *   rentang jam aktif yang dipilih (mis. 07.00–21.00).
 */
'use strict';

const crypto = require('node:crypto');
const { HttpError } = require('./http');
const { keys: docKeys } = require('./auth');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url');

const KEYS = {
  vapid: 'push:vapid',
  all: 'push:all',
  user: (userId) => `push:u:${userId}`,
  sub: (id) => `push:s:${id}`,
  sent: (id, slot) => `push:sent:${id}:${slot}`,
  tick: 'push:tick',
  lock: 'push:lock',
};

// Hanya layanan push resmi browser (mencegah server dipakai mengirim permintaan ke alamat sembarang).
const PUSH_HOST_RE = /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/i;

const DEFAULT_TZ = 'Asia/Jakarta';

// ----- Kunci VAPID -----

function generateVapidKeys() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
  return { publicKey: b64u(pub), privateKey: jwk.d };
}

/** @returns {Promise<{publicKey: string, privateKey: string}>} base64url (65 byte publik, 32 byte privat) */
async function vapidKeys(store) {
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) return { publicKey: envPub.trim(), privateKey: envPriv.trim() };
  const saved = await store.get(KEYS.vapid);
  if (saved) return JSON.parse(saved);
  // NX: bila dua fungsi membuat kunci bersamaan, hanya satu yang dipakai.
  await store.set(KEYS.vapid, JSON.stringify(generateVapidKeys()), { nx: true });
  return JSON.parse(await store.get(KEYS.vapid));
}

function privateKeyObject(keys) {
  const pub = fromB64u(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('Kunci publik VAPID tidak valid.');
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)), d: keys.privateKey },
    format: 'jwk',
  });
}

/** JWT ES256 untuk header Authorization VAPID (RFC 8292). */
function vapidJwt(audience, keys, subject, now = Date.now()) {
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = b64u(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const data = `${header}.${payload}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: privateKeyObject(keys), dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64u(sig)}`;
}

const subject = () => process.env.VAPID_SUBJECT || 'mailto:pengingat@rencana-harian.app';

/**
 * Kirim satu push tanpa isi.
 * @returns {Promise<number>} status HTTP dari layanan push
 */
async function sendPush(sub, keys, { ttl = 1800, fetchImpl = fetch, now = Date.now() } = {}) {
  const url = new URL(sub.endpoint);
  const jwt = vapidJwt(url.origin, keys, subject(), now);
  const res = await fetchImpl(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(ttl), // pengingat yang terlambat lebih dari 30 menit tidak ada gunanya
      Urgency: 'normal',
      Topic: 'pengingat-jam', // pengingat yang belum terkirim diganti yang terbaru
      Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
    },
    body: '',
  });
  return res.status;
}

// ----- Waktu lokal pemilik langganan -----

function validTz(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Jam lokal & kunci slot per jam ("2026-09-25T14") di zona waktu tertentu. */
function localSlot(tz, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: validTz(tz) ? tz : DEFAULT_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  return { hour, slot: `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, '0')}` };
}

/** Rentang jam aktif (inklusif); boleh melewati tengah malam, mis. 20 → 2. */
function inWindow(hour, from, to) {
  return from <= to ? hour >= from && hour <= to : hour >= from || hour <= to;
}

// ----- Langganan -----

const subId = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

function hourOf(v, fallback) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}

/** Validasi data langganan dari browser. @throws {HttpError} */
function cleanSubscription(raw) {
  const endpoint = raw && typeof raw.endpoint === 'string' ? raw.endpoint : '';
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    throw new HttpError(400, 'Data langganan notifikasi tidak valid.', 'bad_subscription');
  }
  if (url.protocol !== 'https:' || !PUSH_HOST_RE.test(url.hostname) || endpoint.length > 1024) {
    throw new HttpError(400, 'Layanan notifikasi browser ini tidak dikenali.', 'bad_subscription');
  }
  const keys = raw.keys && typeof raw.keys === 'object' ? raw.keys : {};
  return {
    endpoint,
    keys: {
      p256dh: String(keys.p256dh || '').slice(0, 200),
      auth: String(keys.auth || '').slice(0, 100),
    },
  };
}

async function saveSubscription(store, userId, body) {
  const clean = cleanSubscription(body.subscription);
  const id = subId(clean.endpoint);
  const old = await store.get(KEYS.sub(id));
  const prev = old ? JSON.parse(old) : null;
  if (prev && prev.userId !== userId) await store.srem(KEYS.user(prev.userId), id);
  const record = {
    id,
    ...clean,
    userId,
    from: hourOf(body.from, 7),
    to: hourOf(body.to, 21),
    // Klien lama tidak mengirim `hourly`: dulu langganan hanya dibuat bila pengingat per jam aktif.
    hourly: body.hourly !== false,
    returAt: body.returAt == null ? null : hourOf(body.returAt, null),
    tz: validTz(body.tz) ? String(body.tz) : DEFAULT_TZ,
    device: String(body.device || '').slice(0, 60),
    createdAt: prev ? prev.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  await store.set(KEYS.sub(id), JSON.stringify(record));
  await store.sadd(KEYS.user(userId), id);
  await store.sadd(KEYS.all, id);
  return record;
}

async function removeSubscription(store, id, userId) {
  const raw = await store.get(KEYS.sub(id));
  const rec = raw ? JSON.parse(raw) : null;
  if (rec && userId && rec.userId !== userId) return false;
  await store.del(KEYS.sub(id));
  await store.srem(KEYS.all, id);
  if (rec) await store.srem(KEYS.user(rec.userId), id);
  return Boolean(rec);
}

/** Hapus semua langganan milik satu akun (dipakai saat akun dihapus). */
async function removeUser(store, userId) {
  const ids = await store.smembers(KEYS.user(userId));
  for (const id of ids) await removeSubscription(store, id);
  await store.del(KEYS.user(userId));
}

// ----- Pengiriman per jam -----

/** Apakah akun ini punya retur yang belum selesai (sudah dimulai) pada tanggal lokal `date`. */
async function hasOpenRetur(store, userId, date) {
  const all = await store.hgetall(docKeys.doc(userId).doc);
  for (const [key, raw] of Object.entries(all || {})) {
    if (!key.startsWith('case:')) continue;
    try {
      const e = JSON.parse(raw);
      const v = e && !e.d ? e.v : null;
      if (v && v.type === 'retur' && !v.endDate && typeof v.startDate === 'string' && v.startDate <= date) return true;
    } catch {
      /* entri rusak dilewati */
    }
  }
  return false;
}

/**
 * Kirim pengingat ke langganan yang sedang berada di jam aktifnya, dan pengingat retur
 * harian (mis. pukul 15.00) ke akun yang masih punya retur aktif.
 * @param {object} opts
 * @param {string} [opts.userId] hanya langganan akun ini (untuk tes)
 * @param {boolean} [opts.force] abaikan jam aktif & batas satu per jam (untuk tes)
 */
async function tick(store, { now = Date.now(), userId = null, force = false, fetchImpl = fetch } = {}) {
  const keys = await vapidKeys(store);
  const ids = await store.smembers(userId ? KEYS.user(userId) : KEYS.all);
  const result = { total: ids.length, sent: 0, skipped: 0, removed: 0, failed: 0 };
  const returCache = new Map(); // satu kali baca data per akun per tick
  await Promise.all(ids.map(async (id) => {
    const raw = await store.get(KEYS.sub(id));
    if (!raw) {
      await store.srem(KEYS.all, id);
      result.removed += 1;
      return;
    }
    const sub = JSON.parse(raw);
    if (!force) {
      const { hour, slot } = localSlot(sub.tz, now);
      const hourly = sub.hourly !== false && inWindow(hour, sub.from, sub.to);
      let retur = false;
      if (!hourly && sub.returAt === hour) {
        const key = `${sub.userId}|${slot.slice(0, 10)}`;
        if (!returCache.has(key)) returCache.set(key, hasOpenRetur(store, sub.userId, slot.slice(0, 10)));
        retur = await returCache.get(key);
      }
      if (!hourly && !retur) {
        result.skipped += 1;
        return;
      }
      // Satu pengingat per jam walau penjadwal terpanggil berkali-kali.
      if (!(await store.set(KEYS.sent(id, slot), '1', { nx: true, ex: 2 * 3600 }))) {
        result.skipped += 1;
        return;
      }
    }
    try {
      const status = await sendPush(sub, keys, { fetchImpl, now });
      if (status === 404 || status === 410) {
        await removeSubscription(store, id); // langganan kedaluwarsa / dicabut pengguna
        result.removed += 1;
      } else if (status >= 200 && status < 300) {
        result.sent += 1;
      } else {
        result.failed += 1;
      }
    } catch {
      result.failed += 1;
    }
  }));
  if (!userId) await store.set(KEYS.tick, String(now));
  return result;
}

async function lastTick(store) {
  const v = await store.get(KEYS.tick);
  return v ? Number(v) : null;
}

module.exports = {
  KEYS, generateVapidKeys, vapidKeys, vapidJwt, sendPush, localSlot, inWindow, validTz,
  cleanSubscription, saveSubscription, removeSubscription, removeUser, subId, tick, lastTick, hasOpenRetur,
};
