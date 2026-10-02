/**
 * Sinkronisasi data per pengguna, terbagi dalam database per fungsi (Kerja, Pribadi,
 * Olahraga, Kebiasaan, Jurnal, Fokus, Umum; lihat js/core/databases.js).
 * Tiap database = kumpulan entri { kunci → {v: nilai, t: waktu ubah, d: dihapus, r: revisi} }.
 * Klien mengirim entri yang berubah dan menerima entri yang berubah sejak revisi terakhirnya.
 */
'use strict';

const { HttpError } = require('./http');
const { keys } = require('./auth');
const DB = require('../../js/core/databases');

const MAX_ENTRIES = 500;
const MAX_ENTRY_BYTES = 100 * 1024;
const KEY_RE = /^[a-zA-Z]{2,20}(:[\w.:-]{1,160})?$/;

function validateChanges(changes, now = Date.now()) {
  if (changes == null) return [];
  if (typeof changes !== 'object' || Array.isArray(changes)) {
    throw new HttpError(400, 'Format perubahan tidak valid.', 'bad_changes');
  }
  const list = Object.entries(changes);
  if (list.length > MAX_ENTRIES) {
    throw new HttpError(413, `Maksimal ${MAX_ENTRIES} perubahan per kiriman.`, 'too_many');
  }
  return list.map(([k, e]) => {
    if (!KEY_RE.test(k) || !e || typeof e !== 'object') {
      throw new HttpError(400, `Kunci data tidak valid: ${String(k).slice(0, 40)}`, 'bad_key');
    }
    const t = Number(e.t);
    if (!Number.isFinite(t) || t < 0) throw new HttpError(400, 'Waktu perubahan tidak valid.', 'bad_time');
    const d = e.d === true;
    const payload = d ? 'null' : JSON.stringify(e.v === undefined ? null : e.v);
    if (Buffer.byteLength(payload) > MAX_ENTRY_BYTES) {
      throw new HttpError(413, 'Salah satu data terlalu besar.', 'too_large');
    }
    // Jam perangkat yang terlalu maju tidak boleh menang selamanya.
    return { k, t: Math.min(Math.floor(t), now + 60 * 1000), d, payload };
  });
}

// Cadangan dokumen lama setelah dipindah ke database per fungsi: disimpan 90 hari.
const BACKUP_TTL = 60 * 60 * 24 * 90;
const migrated = new WeakMap(); // store → Set id akun yang sudah dipastikan pindah

/** Pastikan data akun sudah dipindah ke database per fungsi (sekali per akun, atomik). */
async function ensureDatabases(store, userId) {
  let done = migrated.get(store);
  if (!done) {
    done = new Set();
    migrated.set(store, done);
  }
  if (done.has(userId)) return;
  await store.migrate(keys.doc(userId), { routing: DB.ROUTING, ids: DB.IDS, backupTtl: BACKUP_TTL });
  done.add(userId);
}

/** Isi database (hash) yang diminta: {db → {kunci → JSON entri}}. */
async function readDbs(store, userId, ids = DB.IDS) {
  await ensureDatabases(store, userId);
  const k = keys.doc(userId);
  const all = await store.hgetallMany(ids.map(k.db));
  return Object.fromEntries(ids.map((id, i) => [id, all[i] || {}]));
}

/**
 * Entri yang berubah setelah revisi `since`, ditambah kunci di `extra`
 * (mis. kiriman klien yang kalah karena server punya versi lebih baru).
 * Hanya database yang berubah sejak `since` yang dibaca.
 */
async function pull(store, userId, since, extra = []) {
  const k = keys.doc(userId);
  const rev = await store.rev(k.rev);
  if (rev <= since && !extra.length) return { rev, changes: {} };
  await ensureDatabases(store, userId);
  const revs = await store.mget(DB.IDS.map(k.dbRev));
  const want = new Set(extra);
  const extraDbs = new Set(extra.flatMap((key) => DB.family(key)));
  const ids = DB.IDS.filter((id, i) => Number(revs[i] || 0) > since || extraDbs.has(id));
  const dbs = await readDbs(store, userId, ids);
  const changes = {};
  for (const id of ids) {
    for (const [key, raw] of Object.entries(dbs[id])) {
      const e = JSON.parse(raw);
      if (e.r > since || want.has(key)) changes[key] = { v: e.v, t: e.t, d: e.d };
    }
  }
  return { rev, changes };
}

/** Database tujuan tiap entri: [target, ...database lain sekeluarga]. */
function routeEntry(e) {
  const fam = DB.family(e.k);
  if (e.d || fam.length === 1) return fam;
  let value = null;
  try {
    value = JSON.parse(e.payload);
  } catch {
    /* sudah divalidasi; tidak terjadi */
  }
  const target = DB.dbOf(e.k, value);
  return [target, ...fam.filter((id) => id !== target)];
}

async function push(store, userId, entries) {
  const k = keys.doc(userId);
  if (!entries.length) return { rev: await store.rev(k.rev), written: [] };
  await ensureDatabases(store, userId);
  return store.mergeDb(k, entries.map((e) => ({ ...e, dbs: routeEntry(e) })));
}

module.exports = { validateChanges, pull, push, readDbs, ensureDatabases, routeEntry, BACKUP_TTL, MAX_ENTRIES };
