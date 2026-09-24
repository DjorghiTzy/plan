/**
 * Sinkronisasi dokumen per pengguna.
 * Dokumen = kumpulan entri { kunci → {v: nilai, t: waktu ubah, d: dihapus} }.
 * Klien mengirim entri yang berubah dan menerima entri yang berubah sejak revisi terakhirnya.
 */
'use strict';

const { HttpError } = require('./http');
const { keys } = require('./auth');

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

/**
 * Entri yang berubah setelah revisi `since`, ditambah kunci di `extra`
 * (mis. kiriman klien yang kalah karena server punya versi lebih baru).
 */
async function pull(store, userId, since, extra = []) {
  const k = keys.doc(userId);
  const rev = await store.rev(k.rev);
  if (rev <= since && !extra.length) return { rev, changes: {} };
  const all = await store.hgetall(k.doc);
  const want = new Set(extra);
  const changes = {};
  for (const [key, raw] of Object.entries(all)) {
    const e = JSON.parse(raw);
    if (e.r > since || want.has(key)) changes[key] = { v: e.v, t: e.t, d: e.d };
  }
  return { rev, changes };
}

async function push(store, userId, entries) {
  if (!entries.length) return { rev: await store.rev(keys.doc(userId).rev), written: [] };
  return store.merge(keys.doc(userId), entries);
}

module.exports = { validateChanges, pull, push, MAX_ENTRIES };
