// Skenario database per fungsi yang dijalankan pada dua penyimpanan: memori & Redis sungguhan.
const assert = require('node:assert/strict');
const DB = require('../../js/core/databases');
const sync = require('../../api/_lib/sync');
const { keys } = require('../../api/_lib/auth');

const entry = (k, v, t, d = false) => ({ k, t, d, payload: d ? 'null' : JSON.stringify(v) });

/** Data lama (dokumen tunggal) seperti yang ditulis server versi sebelumnya. */
function legacyEntries(t) {
  return [
    entry('task:t-kerja', { id: 't-kerja', title: 'Rapat', area: 'kerja', subtasks: [] }, t),
    entry('task:t-katkerja', { id: 't-katkerja', title: 'Laporan', category: 'kerja' }, t),
    entry('task:t-pribadi', { id: 't-pribadi', title: 'Belanja', category: 'rumah', subtasks: [] }, t),
    entry('task:t-hapus', null, t, true),
    entry('series:s-1', { id: 's-1', title: 'Olahraga pagi', category: 'kesehatan' }, t),
    entry('project:p-1', { id: 'p-1', name: 'Gudang' }, t),
    entry('project:p-2', { id: 'p-2', name: 'Renovasi rumah', area: 'pribadi' }, t),
    entry('case:c-1', { id: 'c-1', type: 'retur', startDate: '2026-09-01' }, t),
    entry('workNote:2026-09-30', { done: ['rt-do'], extra: [] }, t),
    entry('ibadah:2026-09-30', ['subuh'], t),
    entry('run:r-1', { id: 'r-1', km: 5.2, date: '2026-09-30' }, t),
    entry('coach:k-1', { id: 'k-1', title: 'Rencana 10K', messages: [] }, t),
    entry('savedroute:sr-1', { id: 'sr-1', name: 'Putar taman', km: 3 }, t),
    entry('habit:h-1', { id: 'h-1', name: 'Minum air' }, t),
    entry('habitLog:2026-09-30', ['h-1'], t),
    entry('water:2026-09-30', 6, t),
    entry('journal:2026-09-30', { mood: 4, gratitude: ['', '', ''] }, t),
    entry('weekNote:2026-W40', 'Selesaikan proposal', t),
    entry('focus:f-1', { id: 'f-1', minutes: 25 }, t),
    entry('timer', { status: 'idle' }, t),
    entry('settings:name', 'Sari', t),
    entry('template:tp-1', { id: 'tp-1', name: 'Hari kerja', tasks: [] }, t),
    entry('lainnya:x', { a: 1 }, t),
  ];
}

const EXPECT = {
  kerja: ['case:c-1', 'project:p-1', 'task:t-katkerja', 'task:t-kerja', 'workNote:2026-09-30'],
  pribadi: ['ibadah:2026-09-30', 'project:p-2', 'series:s-1', 'task:t-hapus', 'task:t-pribadi'],
  olahraga: ['coach:k-1', 'run:r-1', 'savedroute:sr-1'],
  kebiasaan: ['habit:h-1', 'habitLog:2026-09-30', 'water:2026-09-30'],
  jurnal: ['journal:2026-09-30', 'weekNote:2026-W40'],
  fokus: ['focus:f-1', 'timer'],
  umum: ['lainnya:x', 'settings:name', 'template:tp-1'],
};

async function runScenarios(store, label) {
  const t = Date.now() - 60000;
  const u = `mig-${label}`;
  const k = keys.doc(u);

  // 1. Dokumen lama → database per fungsi (sekali, atomik, nilai disalin apa adanya).
  await store.merge(k, legacyEntries(t));
  const legacyRaw = await store.hgetall(k.doc);
  const before = await store.rev(k.rev);
  const pulled = await sync.pull(store, u, 0);
  assert.equal(pulled.rev, before, `${label}: revisi akun tidak berubah karena pindah`);
  assert.equal(Object.keys(pulled.changes).length, legacyEntries(t).length, `${label}: semua entri tetap terbaca`);
  assert.deepEqual(pulled.changes['task:t-kerja'].v, { id: 't-kerja', title: 'Rapat', area: 'kerja', subtasks: [] }, `${label}: larik kosong tetap larik`);
  assert.equal(pulled.changes['task:t-hapus'].d, true);
  const dbs = await sync.readDbs(store, u);
  for (const id of DB.IDS) {
    assert.deepEqual(Object.keys(dbs[id]).sort(), EXPECT[id], `${label}: isi ${id}`);
    for (const [key, raw] of Object.entries(dbs[id])) {
      assert.equal(raw, legacyRaw[key], `${label}: ${key} disalin apa adanya`);
      // Aturan di skrip migrasi sama dengan modul bersama.
      const e = JSON.parse(raw);
      if (!e.d) assert.equal(DB.dbOf(key, e.v), id, `${label}: ${key} → ${id} sama dengan dbOf`);
    }
  }
  assert.equal(await store.exists(k.doc), 0, `${label}: dokumen lama sudah dipindah`);
  assert.equal(await store.exists(k.backup), 1, `${label}: cadangan disimpan`);
  const ttl = await store.ttl(k.backup);
  assert.ok(ttl > 89 * 86400 && ttl <= 90 * 86400, `${label}: cadangan kedaluwarsa 90 hari (${ttl})`);
  assert.equal(await store.migrate(k, { routing: DB.ROUTING, ids: DB.IDS, backupTtl: 1 }), -1, `${label}: tidak dipindah dua kali`);

  // 2. Kiriman baru hanya mengubah database-nya; tarikan berikutnya hanya membaca itu.
  const rev1 = (await sync.pull(store, u, 0)).rev;
  const w1 = await sync.push(store, u, [entry('run:r-2', { id: 'r-2', km: 10 }, t + 1000)]);
  assert.deepEqual(w1.written, ['run:r-2']);
  const revs = await store.mget(DB.IDS.map(k.dbRev));
  assert.equal(Number(revs[DB.IDS.indexOf('olahraga')]), w1.rev, `${label}: revisi Olahraga naik`);
  assert.ok(DB.IDS.filter((id) => id !== 'olahraga').every((id) => Number(revs[DB.IDS.indexOf(id)]) <= rev1), `${label}: database lain tidak tersentuh`);
  const p1 = await sync.pull(store, u, rev1);
  assert.deepEqual(Object.keys(p1.changes), ['run:r-2']);

  // 3. Tugas pindah Kerja → Pribadi: tidak tertinggal di Kerja.
  const w2 = await sync.push(store, u, [entry('task:t-kerja', { id: 't-kerja', title: 'Rapat keluarga', area: 'pribadi' }, t + 2000)]);
  assert.deepEqual(w2.written, ['task:t-kerja']);
  let now = await sync.readDbs(store, u, ['kerja', 'pribadi']);
  assert.ok(!('task:t-kerja' in now.kerja) && 'task:t-kerja' in now.pribadi, `${label}: tugas pindah database`);
  const p2 = await sync.pull(store, u, w1.rev);
  assert.equal(p2.changes['task:t-kerja'].v.title, 'Rapat keluarga');

  // 4. Versi lebih lama kalah dan tidak memindahkan apa pun.
  const w3 = await sync.push(store, u, [entry('task:t-kerja', { id: 't-kerja', title: 'lama', area: 'kerja' }, t + 1500)]);
  assert.deepEqual(w3.written, []);
  now = await sync.readDbs(store, u, ['kerja', 'pribadi']);
  assert.ok(!('task:t-kerja' in now.kerja) && JSON.parse(now.pribadi['task:t-kerja']).v.title === 'Rapat keluarga');

  // 5. Hapus: tanda hapus disimpan di database yang memuatnya.
  const w4 = await sync.push(store, u, [entry('task:t-katkerja', null, t + 3000, true), entry('task:t-kerja', null, t + 3000, true)]);
  assert.deepEqual(w4.written.sort(), ['task:t-katkerja', 'task:t-kerja']);
  now = await sync.readDbs(store, u, ['kerja', 'pribadi']);
  assert.equal(JSON.parse(now.kerja['task:t-katkerja']).d, true);
  assert.equal(JSON.parse(now.pribadi['task:t-kerja']).d, true);
  assert.ok(!('task:t-kerja' in now.kerja));

  // 6. Tulisan "nyasar" ke dokumen lama (server versi lama saat deploy) ikut dipindah bila lebih baru.
  await store.merge(k, [
    entry('journal:2026-09-30', { mood: 5 }, t + 5000),
    entry('run:r-stray', { id: 'r-stray', km: 3 }, t + 5000),
    entry('run:r-2', { id: 'r-2', km: 1 }, t), // lebih lama dari yang ada: diabaikan
  ]);
  const strayRev = await store.rev(k.rev);
  const moved = await store.migrate(k, { routing: DB.ROUTING, ids: DB.IDS, backupTtl: 60 });
  assert.equal(moved, 2, `${label}: dua entri nyasar dipindah`);
  assert.equal(await store.exists(k.doc), 0);
  now = await sync.readDbs(store, u, ['jurnal', 'olahraga']);
  assert.equal(JSON.parse(now.jurnal['journal:2026-09-30']).v.mood, 5);
  assert.ok('run:r-stray' in now.olahraga);
  assert.equal(JSON.parse(now.olahraga['run:r-2']).v.km, 10, `${label}: versi nyasar yang lebih lama tidak menimpa`);
  const p3 = await sync.pull(store, u, w4.rev);
  assert.ok('journal:2026-09-30' in p3.changes && 'run:r-stray' in p3.changes, `${label}: entri nyasar ikut tertarik`);
  assert.ok(strayRev > w4.rev);

  // 7. Akun baru tanpa dokumen lama: langsung ke database per fungsi.
  const n = `baru-${label}`;
  const kn = keys.doc(n);
  const w5 = await sync.push(store, n, [entry('settings:name', 'Budi', Date.now()), entry('habit:h-9', { id: 'h-9', name: 'Baca' }, Date.now())]);
  assert.deepEqual(w5.written.sort(), ['habit:h-9', 'settings:name']);
  assert.equal(await store.exists(kn.doc), 0);
  assert.equal(await store.exists(kn.backup), 0);
  const fresh = await sync.readDbs(store, n, ['umum', 'kebiasaan']);
  assert.ok('settings:name' in fresh.umum && 'habit:h-9' in fresh.kebiasaan);
  const p4 = await sync.pull(store, n, 0);
  assert.deepEqual(Object.keys(p4.changes).sort(), ['habit:h-9', 'settings:name']);
}

module.exports = { runScenarios, legacyEntries, EXPECT };
