/**
 * Akun, kata sandi (scrypt), sesi, pembatasan percobaan, dan kode pasangan perangkat.
 */
'use strict';

const crypto = require('node:crypto');
const { HttpError, bearer, clientIp } = require('./http');
const { getStore } = require('./store');

const SESSION_TTL = 60 * 60 * 24 * 180; // 180 hari
const PAIR_TTL = 60 * 10; // 10 menit
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
const PAIR_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tanpa 0/O/1/I

const keys = {
  email: (email) => `u:email:${email}`,
  username: (name) => `u:name:${name}`,
  user: (id) => `u:${id}`,
  sessions: (id) => `u:${id}:s`,
  session: (hash) => `sess:${hash}`,
  pair: (code) => `pair:${code}`,
  doc: (id) => ({ doc: `d:${id}`, ts: `dt:${id}`, rev: `dr:${id}` }),
  limit: (kind, who) => `rl:${kind}:${who}`,
};

/**
 * Mode pribadi: bila ALLOWED_EMAILS diisi (pisahkan dengan koma/spasi), hanya
 * email-email itu yang boleh mendaftar, masuk, atau memakai kode perangkat,
 * dan middleware.js menutup seluruh halaman bagi yang belum masuk.
 */
function allowedEmails() {
  return String(process.env.ALLOWED_EMAILS || '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Mode AKUN PEMILIK: bila LOGIN_USERNAME diisi, hanya ada satu akun yang masuk
 * dengan nama pengguna + kata sandi dari variabel lingkungan (LOGIN_PASSWORD_HASH
 * hasil `npm run hash-password`, atau LOGIN_PASSWORD). Pendaftaran ditutup.
 * Kredensial tidak pernah disimpan di kode maupun di Redis.
 */
const normalizeUsername = (raw) => String(raw || '').trim().toLowerCase();

function ownerLogin() {
  const username = normalizeUsername(process.env.LOGIN_USERNAME);
  if (!username) return null;
  const password = process.env.LOGIN_PASSWORD || '';
  const hash = process.env.LOGIN_PASSWORD_HASH || '';
  // Sidik kredensial: disimpan di setiap sesi, jadi mengganti kata sandi di Vercel
  // langsung mengeluarkan semua perangkat. middleware.js menghitung nilai yang sama.
  const key = sha256(`${username}\n${hash || password}`).slice(0, 32);
  return { username, password, hash, key };
}

/** Data sesi masih sah untuk mode aktif? (Mode akun pemilik: nama + sidik kredensial cocok.) */
function sessionMatches(n, k) {
  const owner = ownerLogin();
  return !owner || (n === owner.username && k === owner.key);
}

const authMode = () => (ownerLogin() ? 'username' : 'email');
const isPrivate = () => Boolean(ownerLogin()) || allowedEmails().length > 0;

function isAllowed(email) {
  const list = allowedEmails();
  return !list.length || list.includes(String(email || '').toLowerCase());
}

/** Akun boleh dipakai di mode yang sedang aktif? */
function userAllowed(user) {
  const owner = ownerLogin();
  if (owner) return Boolean(user && user.username === owner.username);
  return Boolean(user) && isAllowed(user.email);
}

function requireStore() {
  const store = getStore();
  if (!store) {
    throw new HttpError(503, 'Sinkronisasi belum diaktifkan di server ini. Tambahkan Upstash Redis di Vercel.', 'not_configured');
  }
  return store;
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new HttpError(400, 'Alamat email tidak valid.', 'email');
  }
  return email;
}

function checkPassword(raw) {
  const pw = String(raw || '');
  if (pw.length < 8) throw new HttpError(400, 'Kata sandi minimal 8 karakter.', 'password');
  if (pw.length > 200) throw new HttpError(400, 'Kata sandi terlalu panjang.', 'password');
  return pw;
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)));
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${SCRYPT.N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, , saltB64, keyB64] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Batasi percobaan; lempar 429 bila melewati batas dalam jendela waktu. */
async function limit(store, kind, who, max, seconds) {
  const count = await store.hit(keys.limit(kind, who), seconds);
  if (count > max) {
    throw new HttpError(429, 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.', 'rate_limited');
  }
}

const publicUser = (u) => ({
  id: u.id, email: u.email || null, username: u.username || null, name: u.name || '', createdAt: u.createdAt,
});

async function createSession(store, userId, device, owner) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = sha256(token);
  // Mode akun pemilik: `n` = nama pengguna, `k` = sidik kredensial (lihat ownerLogin).
  const value = JSON.stringify({
    u: userId, n: owner ? owner.username : undefined, k: owner ? owner.key : undefined,
    at: Date.now(), device: String(device || '').slice(0, 80),
  });
  await store.set(keys.session(hash), value, { ex: SESSION_TTL });
  await store.sadd(keys.sessions(userId), hash);
  return token;
}

async function loadUser(store, id) {
  const raw = await store.get(keys.user(id));
  return raw ? JSON.parse(raw) : null;
}

/** @returns {{store, user, sessionHash}} atau lempar 401 */
async function authenticate(req) {
  const store = requireStore();
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'Silakan masuk terlebih dahulu.', 'unauthorized');
  const hash = sha256(token);
  const raw = await store.get(keys.session(hash));
  if (!raw) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.', 'unauthorized');
  const { u, n, k } = JSON.parse(raw);
  if (!sessionMatches(n, k)) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.', 'unauthorized');
  const user = await loadUser(store, u);
  if (!user) throw new HttpError(401, 'Akun tidak ditemukan.', 'unauthorized');
  // Akun lama yang tidak termasuk mode aktif (mis. setelah beralih ke akun pemilik) ditolak.
  if (!userAllowed(user)) throw new HttpError(401, 'Akun ini tidak diizinkan di aplikasi ini.', 'unauthorized');
  return { store, user, sessionHash: hash };
}

/** Versi ringan untuk polling: hanya cek sesi & revisi (satu perintah Redis). */
async function authPoll(req) {
  const store = requireStore();
  const token = bearer(req);
  if (!token) throw new HttpError(401, 'Silakan masuk terlebih dahulu.', 'unauthorized');
  const { userId, rev, username, key } = await store.poll(keys.session(sha256(token)));
  if (!userId || !sessionMatches(username, key)) throw new HttpError(401, 'Sesi berakhir. Silakan masuk lagi.', 'unauthorized');
  return { store, userId, rev };
}

async function register({ email: rawEmail, password: rawPw, name, device }, req) {
  const store = requireStore();
  if (ownerLogin()) {
    throw new HttpError(403, 'Pendaftaran tidak tersedia. Aplikasi ini memakai satu akun pemilik.', 'registration_closed');
  }
  const email = normalizeEmail(rawEmail);
  const password = checkPassword(rawPw);
  await limit(store, 'register', clientIp(req), 20, 3600);
  if (!isAllowed(email)) {
    throw new HttpError(403, 'Aplikasi ini pribadi. Pendaftaran akun baru ditutup.', 'registration_closed');
  }
  const id = crypto.randomUUID();
  const claimed = await store.set(keys.email(email), id, { nx: true });
  if (!claimed) throw new HttpError(409, 'Email ini sudah terdaftar. Silakan masuk.', 'email_taken');
  const user = {
    id,
    email,
    name: String(name || '').trim().slice(0, 40),
    pw: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  await store.set(keys.user(id), JSON.stringify(user));
  const token = await createSession(store, id, device);
  return { token, user: publicUser(user) };
}

/** Cocokkan kata sandi pemilik dengan hash (disarankan) atau teks di variabel lingkungan. */
async function checkOwnerPassword(owner, password) {
  if (owner.hash) return verifyPassword(password, owner.hash);
  if (!owner.password) return false;
  const a = crypto.createHash('sha256').update(String(password)).digest();
  const b = crypto.createHash('sha256').update(owner.password).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Akun data untuk pemilik: dibuat sekali, dipakai ulang di setiap login. */
async function ownerAccount(store, owner) {
  let id = await store.get(keys.username(owner.username));
  let user = id ? await loadUser(store, id) : null;
  if (user) return user;
  id = crypto.randomUUID();
  if (!(await store.set(keys.username(owner.username), id, { nx: true }))) {
    return loadUser(store, await store.get(keys.username(owner.username)));
  }
  user = { id, username: owner.username, email: null, name: '', createdAt: new Date().toISOString() };
  await store.set(keys.user(id), JSON.stringify(user));
  return user;
}

async function loginUsername({ username, password, device }, req, owner) {
  const store = requireStore();
  const name = String(username || '').trim().toLowerCase().slice(0, 64);
  await limit(store, 'login-ip', clientIp(req), 30, 900);
  await limit(store, 'login', `name:${name}`, 10, 900);
  const nameOk = name === owner.username;
  const passOk = await checkOwnerPassword(owner, String(password || ''));
  if (!nameOk || !passOk) throw new HttpError(401, 'Nama pengguna atau kata sandi salah.', 'bad_credentials');
  const user = await ownerAccount(store, owner);
  const token = await createSession(store, user.id, device, owner);
  return { token, user: publicUser(user) };
}

async function login(body, req) {
  const owner = ownerLogin();
  if (owner) return loginUsername(body, req, owner);
  return loginEmail(body, req);
}

async function loginEmail({ email: rawEmail, password, device }, req) {
  const store = requireStore();
  const email = normalizeEmail(rawEmail);
  await limit(store, 'login-ip', clientIp(req), 30, 900);
  await limit(store, 'login', email, 10, 900);
  // Di mode pribadi, email di luar daftar diperlakukan seperti akun yang tidak ada.
  const id = isAllowed(email) ? await store.get(keys.email(email)) : null;
  const user = id ? await loadUser(store, id) : null;
  // Tetap hitung scrypt meski email tidak ada supaya waktu respons tidak membocorkan info.
  const ok = await verifyPassword(String(password || ''), user ? user.pw : 'scrypt$0$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
  if (!user || !ok) throw new HttpError(401, 'Email atau kata sandi salah.', 'bad_credentials');
  const token = await createSession(store, id, device);
  return { token, user: publicUser(user) };
}

async function logout(ctx) {
  await ctx.store.del(keys.session(ctx.sessionHash));
  await ctx.store.srem(keys.sessions(ctx.user.id), ctx.sessionHash);
}

function randomCode() {
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const b of bytes) code += PAIR_ALPHABET[b % PAIR_ALPHABET.length];
  return code;
}

async function createPairCode(ctx) {
  await limit(ctx.store, 'pair-new', ctx.user.id, 20, 3600);
  const code = randomCode();
  await ctx.store.set(keys.pair(code), ctx.user.id, { ex: PAIR_TTL });
  return { code, expiresAt: Date.now() + PAIR_TTL * 1000 };
}

async function claimPairCode({ code: raw, device }, req) {
  const store = requireStore();
  await limit(store, 'pair-claim', clientIp(req), 20, 900);
  const code = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 8) throw new HttpError(400, 'Kode terdiri dari 8 karakter.', 'bad_code');
  const userId = await store.getdel(keys.pair(code));
  if (!userId) throw new HttpError(404, 'Kode salah atau sudah kedaluwarsa. Buat kode baru di perangkat lain.', 'bad_code');
  const user = await loadUser(store, userId);
  if (!userAllowed(user)) throw new HttpError(404, 'Akun tidak ditemukan.', 'bad_code');
  const token = await createSession(store, userId, device, ownerLogin());
  return { token, user: publicUser(user) };
}

async function deleteAccount(ctx, password) {
  const owner = ownerLogin();
  const ok = owner && ctx.user.username
    ? await checkOwnerPassword(owner, String(password || ''))
    : await verifyPassword(String(password || ''), ctx.user.pw);
  if (!ok) throw new HttpError(403, 'Kata sandi salah.', 'bad_credentials');
  const { store, user } = ctx;
  const sessions = await store.smembers(keys.sessions(user.id));
  const doc = keys.doc(user.id);
  await store.del(
    ...sessions.map(keys.session),
    keys.sessions(user.id), keys.user(user.id),
    ...(user.email ? [keys.email(user.email)] : []),
    ...(user.username ? [keys.username(user.username)] : []),
    doc.doc, doc.ts, doc.rev,
  );
}

module.exports = {
  SESSION_TTL, allowedEmails, isPrivate, isAllowed, ownerLogin, authMode,
  keys, requireStore, authenticate, authPoll, register, login, logout, createPairCode, claimPairCode,
  deleteAccount, publicUser, normalizeEmail, hashPassword, verifyPassword, limit,
};
