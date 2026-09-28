/**
 * Cuaca BMKG di lokasi pengguna untuk coach lari:
 * koordinat → desa/kelurahan terdekat (kode wilayah tingkat IV, data/desa.txt.gz) → prakiraan cuaca
 * BMKG per 3 jam (api.bmkg.go.id/publik/prakiraan-cuaca) → ringkasan: cuaca sekarang, 24 jam ke depan,
 * dan per hari. BMKG tidak memberi angka "peluang hujan"; persentase di sini = bagian periode 3 jam
 * yang diprakirakan hujan. Hasil BMKG disimpan 30 menit per desa (batas BMKG 60 permintaan/menit).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { HttpError } = require('./http');

const DATA = path.join(__dirname, 'data', 'desa.txt.gz');
const BMKG_URL = (process.env.BMKG_URL || 'https://api.bmkg.go.id/publik/prakiraan-cuaca').replace(/\/$/, '');
const CACHE_SECONDS = 30 * 60;
const DAILY_LIMIT = Math.max(1, Number(process.env.WEATHER_DAILY_LIMIT) || 300);
const MAX_KM = 60; // lebih jauh dari desa mana pun: di luar Indonesia
const TIMEOUT_MS = 8000;

let villages = null;
/** Muat daftar desa sekali per instans fungsi (±80 ribu baris, ±100 ms). */
function load() {
  if (villages) return villages;
  const lines = zlib.gunzipSync(fs.readFileSync(DATA)).toString('utf8').split('\n').filter(Boolean);
  const codes = new Array(lines.length);
  const lat = new Float64Array(lines.length);
  const lng = new Float64Array(lines.length);
  lines.forEach((line, i) => {
    const [c, a, b] = line.split(' ');
    codes[i] = c;
    lat[i] = Number(a) / 1e4;
    lng[i] = Number(b) / 1e4;
  });
  villages = { codes, lat, lng };
  return villages;
}

const dotted = (c) => `${c.slice(0, 2)}.${c.slice(2, 4)}.${c.slice(4, 6)}.${c.slice(6)}`;
const rad = (d) => (d * Math.PI) / 180;
function km(a1, o1, a2, o2) {
  const x = rad(o2 - o1) * Math.cos(rad((a1 + a2) / 2));
  const y = rad(a2 - a1);
  return Math.sqrt(x * x + y * y) * 6371;
}

/** `k` desa terdekat: [{adm4, km}] (terdekat dulu). */
function nearestVillages(lat, lng, k = 3) {
  const v = load();
  const cos = Math.cos(rad(lat));
  const best = [];
  for (let i = 0; i < v.codes.length; i += 1) {
    const dx = (v.lng[i] - lng) * cos;
    const dy = v.lat[i] - lat;
    const d = dx * dx + dy * dy;
    if (best.length < k || d < best[best.length - 1].d) {
      best.push({ i, d });
      best.sort((a, b) => a.d - b.d);
      if (best.length > k) best.pop();
    }
  }
  return best.map(({ i }) => ({ adm4: dotted(v.codes[i]), km: Math.round(km(lat, lng, v.lat[i], v.lng[i]) * 10) / 10 }));
}

let fetcher = (url, opts) => fetch(url, opts);
/** Hanya untuk uji & server dev lokal: ganti pengambil data BMKG. */
function setWeatherFetch(fn) {
  fetcher = fn || ((url, opts) => fetch(url, opts));
}

const unreachable = () => new HttpError(502, 'Data cuaca BMKG sedang tidak bisa diambil. Coba lagi sebentar lagi.', 'weather_unavailable');

/** Ambil prakiraan BMKG satu desa → {lokasi, analysis, slots} ringkas, null bila kode tidak dikenal BMKG. */
async function fetchBmkg(adm4) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetcher(`${BMKG_URL}?adm4=${encodeURIComponent(adm4)}`, { headers: { Accept: 'application/json', 'User-Agent': 'RencanaHarian/1.0 (coach lari, aplikasi pribadi)' }, signal: ctrl ? ctrl.signal : undefined });
  } catch {
    throw unreachable();
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw unreachable();
  const json = await res.json().catch(() => null);
  const data = json && Array.isArray(json.data) ? json.data[0] : null;
  const days = data && Array.isArray(data.cuaca) ? data.cuaca : [];
  const slots = days.flat().filter((s) => s && typeof s.local_datetime === 'string').map((s) => ({
    utc: String(s.utc_datetime || '').slice(0, 16),
    local: s.local_datetime.slice(0, 16),
    desc: String(s.weather_desc || '').slice(0, 40),
    code: Number.isFinite(Number(s.weather)) ? Number(s.weather) : null,
    t: num(s.t),
    hu: num(s.hu),
    tcc: num(s.tcc),
    tp: num(s.tp),
    ws: num(s.ws),
    wd: String(s.wd || '').slice(0, 4),
  }));
  if (!slots.length) return null;
  const l = (json && json.lokasi) || (data && data.lokasi) || {};
  const first = days.flat().find((s) => s && s.analysis_date);
  return {
    lokasi: {
      desa: String(l.desa || '').slice(0, 60),
      kecamatan: String(l.kecamatan || '').slice(0, 60),
      kota: String(l.kotkab || '').slice(0, 60),
      provinsi: String(l.provinsi || '').slice(0, 60),
      timezone: String(l.timezone || '').slice(0, 40),
    },
    analysis: first ? String(first.analysis_date).slice(0, 16) : null,
    slots,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/** Hujan / petir menurut kode cuaca BMKG (60 ke atas) atau deskripsinya. */
const rainy = (s) => (s.code !== null && s.code >= 60) || /hujan|petir|gerimis/i.test(s.desc);
const slotOut = (s) => ({ time: s.local.slice(11, 16), date: s.local.slice(0, 10), desc: s.desc, t: s.t, hu: s.hu, tcc: s.tcc, tp: s.tp, ws: s.ws, wd: s.wd, rain: rainy(s) });

/**
 * Ringkasan untuk coach & tampilan. `nowMs` = waktu sekarang; periode dipilih dari waktu UTC BMKG.
 * @returns {{source, place, analysis, now, next, rainChance24h, rainyNext24h, days}}
 */
function summarize(raw, place, nowMs = Date.now()) {
  const slots = [...raw.slots].sort((a, b) => (a.utc < b.utc ? -1 : 1));
  const t = (s) => Date.parse(`${s.utc.replace(' ', 'T')}:00Z`);
  // Periode yang sedang berjalan (3 jam) dan sesudahnya.
  let from = slots.findIndex((s) => Number.isFinite(t(s)) && t(s) + 3 * 3600e3 > nowMs);
  if (from < 0) from = slots.length - 1;
  const upcoming = slots.slice(from);
  const next = upcoming.slice(0, 8);
  const byDay = new Map();
  for (const s of upcoming) {
    const d = s.local.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(s);
  }
  const pct = (list) => (list.length ? Math.round((100 * list.filter(rainy).length) / list.length) : 0);
  return {
    source: 'BMKG (prakiraan per 3 jam)',
    place: { ...raw.lokasi, adm4: place.adm4, jarakKm: place.km },
    analysis: raw.analysis,
    now: next[0] ? slotOut(next[0]) : null,
    next: next.map(slotOut),
    // Bukan angka resmi BMKG: bagian periode 3 jam dalam 24 jam ke depan yang diprakirakan hujan.
    rainChance24h: pct(next),
    rainyNext24h: next.filter(rainy).map((s) => `${s.local.slice(11, 16)} ${s.desc}`),
    days: [...byDay.entries()].slice(0, 3).map(([date, list]) => ({
      date,
      tMin: Math.min(...list.map((s) => s.t).filter((v) => v !== null)),
      tMax: Math.max(...list.map((s) => s.t).filter((v) => v !== null)),
      rainChance: pct(list),
      rainy: list.filter(rainy).map((s) => `${s.local.slice(11, 16)} ${s.desc}`),
    })),
  };
}

/**
 * POST /api/coach {action: "weather", lat, lng} → {weather}. Desa terdekat yang dikenal BMKG
 * (dicoba sampai 3 desa terdekat; data desa bisa sedikit berbeda versi dengan BMKG).
 */
async function getWeather(ctx, body) {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!(lat >= -12 && lat <= 7) || !(lng >= 94 && lng <= 142)) {
    throw new HttpError(400, 'Cuaca BMKG hanya tersedia untuk lokasi di Indonesia.', 'outside_indonesia');
  }
  const day = new Date().toISOString().slice(0, 10);
  const used = await ctx.store.hit(`weather:q:${ctx.user.id}:${day}`, 2 * 86400);
  if (used > DAILY_LIMIT) throw new HttpError(429, 'Batas harian cek cuaca tercapai. Coba lagi besok.', 'weather_quota');
  const near = nearestVillages(lat, lng, 3);
  if (!near.length || near[0].km > MAX_KM) throw new HttpError(400, 'Cuaca BMKG hanya tersedia untuk lokasi di Indonesia.', 'outside_indonesia');
  for (const place of near) {
    const key = `bmkg:${place.adm4}`;
    let raw = null;
    const cached = await ctx.store.get(key);
    if (cached) {
      try {
        raw = JSON.parse(cached);
      } catch {
        raw = null;
      }
    }
    if (!raw) {
      raw = await fetchBmkg(place.adm4);
      if (!raw) continue;
      await ctx.store.set(key, JSON.stringify(raw), { ex: CACHE_SECONDS });
    }
    return summarize(raw, place);
  }
  throw new HttpError(404, 'Prakiraan BMKG untuk desa di sekitarmu belum tersedia.', 'weather_not_found');
}

module.exports = { getWeather, nearestVillages, summarize, fetchBmkg, setWeatherFetch, rainy, DAILY_LIMIT };
