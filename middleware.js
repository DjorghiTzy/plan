/**
 * Middleware Vercel untuk MODE PRIBADI.
 *
 * Aktif hanya bila variabel lingkungan ALLOWED_EMAILS diisi. Setiap permintaan
 * halaman/berkas diperiksa di server Vercel sebelum dikirim: tanpa cookie sesi
 * yang masih berlaku di Redis, pengunjung hanya bisa membuka halaman masuk.
 * Endpoint /api/* tidak lewat sini; masing-masing sudah memeriksa sesinya sendiri.
 *
 * Tanpa dependensi: `next()` di bawah sama dengan `next()` dari @vercel/functions
 * (Response kosong dengan header `x-middleware-next: 1`).
 */

export const config = { matcher: ['/((?!api/).*)'] };

const COOKIE = 'rh_session';

// Berkas yang boleh dibuka tanpa masuk (hanya yang dibutuhkan halaman masuk).
const PUBLIC_PATHS = new Set([
  '/masuk.html',
  '/js/gate.js',
  '/css/styles.css',
  '/icons/icon.svg',
  '/manifest.webmanifest',
  '/robots.txt',
]);

export function isPrivate(env) {
  return String((env && env.ALLOWED_EMAILS) || '').trim().length > 0;
}

export function isPublic(pathname) {
  return pathname.startsWith('/api/') || PUBLIC_PATHS.has(pathname);
}

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cek sesi di Upstash Redis (satu perintah EXISTS). */
export async function sessionExists(token, env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const auth = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !auth) return false;
  try {
    const res = await fetch(url.replace(/\/+$/, ''), {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['EXISTS', `sess:${await sha256hex(token)}`]),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return Number(body.result) === 1;
  } catch {
    return false; // gagal tertutup: lebih baik minta masuk ulang daripada terbuka
  }
}

const next = () => new Response(null, { headers: { 'x-middleware-next': '1' } });

export default async function middleware(request) {
  const env = (typeof process !== 'undefined' && process.env) || {};
  if (!isPrivate(env)) return next();

  const url = new URL(request.url);
  if (isPublic(url.pathname)) return next();

  const token = readCookie(request.headers.get('cookie'), COOKIE);
  // Server dev lokal menyuntikkan pemeriksa sesi berbasis memori lewat globalThis.
  const verify = globalThis.__rhVerifySession || sessionExists;
  if (token && /^[A-Za-z0-9_-]{20,200}$/.test(token) && (await verify(token, env))) return next();

  const accept = request.headers.get('accept') || '';
  if (request.method === 'GET' && accept.includes('text/html')) {
    return new Response(null, {
      status: 307,
      headers: { Location: '/masuk.html', 'Cache-Control': 'no-store' },
    });
  }
  return new Response('Perlu masuk.', {
    status: 401,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
