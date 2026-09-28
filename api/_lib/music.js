/**
 * Pustaka musik akun: lagu yang diimpor pengguna disimpan di database server (Redis), supaya
 * muncul di semua perangkat. Berkas audio dipecah jadi potongan ±384 KB (base64 ±512 KB, di bawah
 * batas satu permintaan Upstash & Vercel), daftarnya satu kunci JSON per akun.
 *
 *   mu:list:<akun>          → [{id, title, artist, album, type, size, chunks, duration, art, addedAt, status}]
 *   mu:c:<akun>:<id>:<i>    → potongan ke-i (base64)
 *
 * Dipanggil lewat /api/sync?music=… (paket Hobby Vercel membatasi jumlah fungsi).
 */
'use strict';

const { HttpError } = require('./http');
const PL = require('../../js/core/playlist.js');

const LIMIT_BYTES = Math.max(1, Number(process.env.MUSIC_LIMIT_MB) || 100) * 1024 * 1024;
const MAX_TRACKS = 100;
const MAX_ART_CHARS = 90000; // sampul kecil sebagai data URL
const DAILY_CHUNKS = 3000; // unggah + unduh potongan per akun per hari
const STALE_UPLOAD_MS = 60 * 60 * 1000;
const TYPES = /^audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|ogg|opus|wav|x-wav|wave|webm|flac|x-flac)$/;

const listKey = (uid) => `mu:list:${uid}`;
const chunkKey = (uid, id, i) => `mu:c:${uid}:${id}:${i}`;
const validId = (id) => typeof id === 'string' && /^tr-[a-z0-9]{6,40}$/.test(id);

async function readList(store, uid) {
  const raw = await store.get(listKey(uid));
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const writeList = (store, uid, list) => store.set(listKey(uid), JSON.stringify(list));
const used = (list) => list.reduce((a, t) => a + (Number(t.size) || 0), 0);
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function cleanMeta(t) {
  if (!t || typeof t !== 'object') throw new HttpError(400, 'Data lagu tidak valid.', 'bad_track');
  if (!validId(t.id)) throw new HttpError(400, 'Kode lagu tidak valid.', 'bad_track');
  const size = Math.round(Number(t.size));
  if (!(size > 0)) throw new HttpError(400, 'Ukuran lagu tidak valid.', 'bad_track');
  if (size > PL.MAX_TRACK_BYTES) throw new HttpError(413, `Lagu terlalu besar (maks. ${PL.MAX_TRACK_BYTES / 1048576} MB per lagu).`, 'track_too_large');
  const type = str(t.type, 40).toLowerCase() || 'audio/mpeg';
  if (!TYPES.test(type)) throw new HttpError(415, 'Format audio tidak didukung. Pakai MP3, M4A, AAC, OGG, WAV, atau FLAC.', 'bad_type');
  const art = typeof t.art === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(t.art) && t.art.length <= MAX_ART_CHARS ? t.art : null;
  return {
    id: t.id,
    title: str(t.title, 120) || 'Lagu tanpa judul',
    artist: str(t.artist, 120),
    album: str(t.album, 120),
    type,
    size,
    chunks: PL.chunkCount(size),
    duration: Number(t.duration) > 0 ? Math.round(Number(t.duration)) : null,
    art,
    addedAt: Date.now(),
  };
}

async function budget(ctx) {
  const day = new Date().toISOString().slice(0, 10);
  const n = await ctx.store.hit(`mu:q:${ctx.user.id}:${day}`, 2 * 86400);
  if (n > DAILY_CHUNKS) throw new HttpError(429, 'Batas harian unggah/unduh musik tercapai. Coba lagi besok.', 'music_quota');
}

/** Buang unggahan yang tidak selesai lebih dari 1 jam (beserta potongannya). */
async function dropStale(ctx, list) {
  const now = Date.now();
  const stale = list.filter((t) => t.status === 'uploading' && now - (t.addedAt || 0) > STALE_UPLOAD_MS);
  for (const t of stale) await removeChunks(ctx, t);
  return list.filter((t) => !stale.includes(t));
}

async function removeChunks(ctx, t) {
  const keys = Array.from({ length: t.chunks || 0 }, (_, i) => chunkKey(ctx.user.id, t.id, i));
  for (let i = 0; i < keys.length; i += 50) await ctx.store.del(...keys.slice(i, i + 50));
}

const pub = (t) => ({ id: t.id, title: t.title, artist: t.artist, album: t.album, type: t.type, size: t.size, chunks: t.chunks, duration: t.duration, art: t.art, addedAt: t.addedAt });

/** GET ?music=list → {tracks, used, limit} (hanya lagu yang selesai diunggah). */
async function list(ctx) {
  const all = await readList(ctx.store, ctx.user.id);
  const ready = all.filter((t) => t.status === 'ready');
  return { tracks: ready.map(pub), used: used(all), limit: LIMIT_BYTES, maxTrack: PL.MAX_TRACK_BYTES };
}

/** POST {action: "begin", track} → mulai unggah (cek kuota); lagu yang sudah ada → {exists: true}. */
async function begin(ctx, body) {
  const meta = cleanMeta(body.track);
  let all = await dropStale(ctx, await readList(ctx.store, ctx.user.id));
  const prev = all.find((t) => t.id === meta.id);
  if (prev && prev.status === 'ready') return { ok: true, exists: true };
  all = all.filter((t) => t.id !== meta.id);
  if (all.length >= MAX_TRACKS) throw new HttpError(409, `Paling banyak ${MAX_TRACKS} lagu tersimpan di akun.`, 'music_full');
  if (used(all) + meta.size > LIMIT_BYTES) {
    throw new HttpError(413, `Ruang musik di akun penuh (${Math.round(used(all) / 1048576)} dari ${Math.round(LIMIT_BYTES / 1048576)} MB). Hapus lagu lain dulu.`, 'music_full');
  }
  all.push({ ...meta, status: 'uploading' });
  await writeList(ctx.store, ctx.user.id, all);
  return { ok: true, chunks: meta.chunks };
}

/** POST {action: "chunk", id, index, data(base64)} → simpan satu potongan. */
async function putChunk(ctx, body) {
  if (!validId(body.id)) throw new HttpError(400, 'Kode lagu tidak valid.', 'bad_track');
  const all = await readList(ctx.store, ctx.user.id);
  const t = all.find((x) => x.id === body.id && x.status === 'uploading');
  if (!t) throw new HttpError(404, 'Unggahan lagu tidak ditemukan. Mulai lagi.', 'no_upload');
  const i = Number(body.index);
  if (!Number.isInteger(i) || i < 0 || i >= t.chunks) throw new HttpError(400, 'Potongan lagu tidak valid.', 'bad_chunk');
  const data = typeof body.data === 'string' ? body.data : '';
  const max = Math.ceil(PL.CHUNK_BYTES / 3) * 4;
  if (!data || data.length > max || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(400, 'Potongan lagu rusak.', 'bad_chunk');
  const bytes = Buffer.from(data, 'base64').length;
  const expect = i < t.chunks - 1 ? PL.CHUNK_BYTES : t.size - PL.CHUNK_BYTES * (t.chunks - 1);
  if (bytes !== expect) throw new HttpError(400, 'Ukuran potongan lagu tidak sesuai.', 'bad_chunk');
  await budget(ctx);
  await ctx.store.set(chunkKey(ctx.user.id, t.id, i), data);
  return { ok: true };
}

/** POST {action: "finish", id} → semua potongan ada → lagu siap diputar di semua perangkat. */
async function finish(ctx, body) {
  if (!validId(body.id)) throw new HttpError(400, 'Kode lagu tidak valid.', 'bad_track');
  const all = await readList(ctx.store, ctx.user.id);
  const t = all.find((x) => x.id === body.id);
  if (!t) throw new HttpError(404, 'Unggahan lagu tidak ditemukan.', 'no_upload');
  if (t.status === 'ready') return { ok: true, track: pub(t) };
  const keys = Array.from({ length: t.chunks }, (_, i) => chunkKey(ctx.user.id, t.id, i));
  let have = 0;
  for (let i = 0; i < keys.length; i += 50) have += await ctx.store.exists(...keys.slice(i, i + 50));
  if (have !== t.chunks) throw new HttpError(409, `Unggahan belum lengkap (${have}/${t.chunks}).`, 'upload_incomplete');
  t.status = 'ready';
  await writeList(ctx.store, ctx.user.id, all);
  return { ok: true, track: pub(t) };
}

/** POST {action: "delete", id} → hapus lagu & potongannya. */
async function remove(ctx, body) {
  if (!validId(body.id)) throw new HttpError(400, 'Kode lagu tidak valid.', 'bad_track');
  const all = await readList(ctx.store, ctx.user.id);
  const t = all.find((x) => x.id === body.id);
  if (!t) return { ok: true };
  await removeChunks(ctx, t);
  await writeList(ctx.store, ctx.user.id, all.filter((x) => x !== t));
  return { ok: true };
}

/** GET ?music=chunk&id=…&i=N → isi potongan (biner). */
async function getChunk(ctx, id, index) {
  if (!validId(id)) throw new HttpError(400, 'Kode lagu tidak valid.', 'bad_track');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i > 1000) throw new HttpError(400, 'Potongan lagu tidak valid.', 'bad_chunk');
  await budget(ctx);
  const data = await ctx.store.get(chunkKey(ctx.user.id, id, i));
  if (!data) throw new HttpError(404, 'Potongan lagu tidak ditemukan.', 'no_chunk');
  return Buffer.from(data, 'base64');
}

module.exports = { list, begin, putChunk, finish, remove, getChunk, LIMIT_BYTES, MAX_TRACKS };
