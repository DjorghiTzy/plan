'use strict';

const { HttpError } = require('./http');
const routes = require('./routes');

// Batas pencarian per akun per hari (UTC): layanan rute OSM gratis, jadi dipakai secukupnya.
const DAILY_LIMIT = Math.max(1, Number(process.env.ROUTE_DAILY_LIMIT) || 60);

/** Rute yang sudah pernah ditampilkan (maks. 60 rute × 2000 titik), agar pencarian lewat server juga memberi rute baru. */
function validAvoid(list) {
  if (!Array.isArray(list)) return [];
  const ok = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isFinite(v));
  return list.slice(0, 60).filter((line) => Array.isArray(line)).map((line) => line.slice(0, 2000).filter(ok)).filter((line) => line.length > 1);
}

/**
 * Saran rute lari putar dari titik mulai dengan jarak mendekati `km` (selisih maks. 300 m).
 * Dipanggil lewat POST /api/coach {action: "route", lat, lng, km, seed}; tidak butuh kunci Gemini.
 * (Bukan berkas api/ tersendiri: paket Hobby Vercel membatasi jumlah fungsi per deployment.)
 * @returns {Promise<{target, tolerance, withinTolerance, routes, remaining}>}
 */
async function findRoutes(ctx, body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const km = Number(body.km);
  if (!(lat >= -85 && lat <= 85) || !(lng >= -180 && lng <= 180)) throw new HttpError(400, 'Lokasi tidak valid.', 'bad_location');
  if (!(km >= 0.5 && km <= 42.2)) throw new HttpError(400, 'Jarak harus antara 0,5 dan 42,2 km.', 'bad_distance');
  const day = new Date().toISOString().slice(0, 10);
  const used = await ctx.store.hit(`route:q:${ctx.user.id}:${day}`, 2 * 86400);
  if (used > DAILY_LIMIT) throw new HttpError(429, `Batas harian pencarian rute tercapai (${DAILY_LIMIT} kali). Coba lagi besok.`, 'route_quota');
  let out;
  try {
    out = await routes.suggest(
      { lat, lng, km, seed: Number.isInteger(body.seed) ? body.seed : 0, type: ['semua', 'putar', 'lurus'].includes(body.type) ? body.type : 'semua' },
      { avoid: validAvoid(body.avoid) },
    );
  } catch (err) {
    if (err instanceof routes.RouteError) throw new HttpError(err.status, err.message, err.code);
    console.error(err);
    throw new HttpError(502, 'Layanan rute sedang tidak bisa dihubungi. Coba lagi sebentar lagi.', 'route_unavailable');
  }
  return { ...out, remaining: DAILY_LIMIT - used };
}

module.exports = { findRoutes, DAILY_LIMIT };
