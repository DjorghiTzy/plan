'use strict';

const { route, send, readJson, HttpError } = require('./_lib/http');
const auth = require('./_lib/auth');
const routes = require('./_lib/routes');

// Batas pencarian per akun per hari (UTC): layanan rute OSM gratis, jadi dipakai secukupnya.
const DAILY_LIMIT = Math.max(1, Number(process.env.ROUTE_DAILY_LIMIT) || 60);

/**
 * POST /api/route {lat, lng, km, seed} → {target, tolerance, withinTolerance, routes, remaining}
 * Saran rute lari putar dari titik mulai dengan jarak mendekati `km` (selisih maks. 300 m).
 */
module.exports = route({
  POST: async (req, res) => {
    const ctx = await auth.authenticate(req);
    const body = await readJson(req);
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
      out = await routes.suggest({ lat, lng, km, seed: Number.isInteger(body.seed) ? body.seed : 0 });
    } catch (err) {
      if (err instanceof routes.RouteError) throw new HttpError(err.status, err.message, err.code);
      console.error(err);
      throw new HttpError(502, 'Layanan rute sedang tidak bisa dihubungi. Coba lagi sebentar lagi.', 'route_unavailable');
    }
    send(res, 200, { ...out, remaining: DAILY_LIMIT - used });
  },
});
