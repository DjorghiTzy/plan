// Database terpisah per fungsi: pembagian entri & status, dan skenario server di penyimpanan memori.
const test = require('node:test');
const assert = require('node:assert/strict');
const DB = require('../js/core/databases');
const { memory } = require('../api/_lib/store');
const { runScenarios } = require('./helpers/db-scenarios');

test('dbOf: setiap prefiks masuk database fungsinya', () => {
  assert.equal(DB.dbOf('run:r-1', { km: 5 }), 'olahraga');
  assert.equal(DB.dbOf('coachbin:k-1'), 'olahraga');
  assert.equal(DB.dbOf('case:c-1'), 'kerja');
  assert.equal(DB.dbOf('workNote:2026-09-30'), 'kerja');
  assert.equal(DB.dbOf('ibadah:2026-09-30'), 'pribadi');
  assert.equal(DB.dbOf('water:2026-09-30', 5), 'kebiasaan');
  assert.equal(DB.dbOf('journal:2026-09-30'), 'jurnal');
  assert.equal(DB.dbOf('timer'), 'fokus');
  assert.equal(DB.dbOf('settings:theme', 'dark'), 'umum');
  assert.equal(DB.dbOf('baru:x'), 'umum', 'prefiks tak dikenal → Pengaturan & Template');
});

test('dbOf: tugas & proyek ikut Kerja/Pribadi seperti di aplikasi', () => {
  assert.equal(DB.dbOf('task:a', { area: 'kerja' }), 'kerja');
  assert.equal(DB.dbOf('task:a', { area: 'pribadi', category: 'kerja' }), 'pribadi', 'area menang atas kategori');
  assert.equal(DB.dbOf('task:a', { category: 'kerja' }), 'kerja');
  assert.equal(DB.dbOf('task:a', { category: 'ibadah' }), 'pribadi');
  assert.equal(DB.dbOf('task:a', null), 'pribadi');
  assert.equal(DB.dbOf('series:s', { category: 'kerja' }), 'kerja');
  assert.equal(DB.dbOf('project:p', { name: 'X' }), 'kerja', 'proyek bawaan = kerja');
  assert.equal(DB.dbOf('project:p', { area: 'pribadi' }), 'pribadi');
  assert.deepEqual(DB.family('task:a'), ['kerja', 'pribadi']);
  assert.deepEqual(DB.family('run:r'), ['olahraga']);
});

test('split/join: status dibagi per database lalu utuh kembali', () => {
  const state = {
    version: 1,
    settings: { name: 'Sari' },
    tasks: [{ id: 'a', area: 'kerja' }, { id: 'b', category: 'rumah' }, { id: 'c', category: 'kerja' }],
    series: [{ id: 's', category: 'kerja' }],
    projects: [{ id: 'p', area: 'pribadi' }, { id: 'q', area: 'kerja' }],
    habits: [{ id: 'h' }], habitLog: { '2026-09-30': ['h'] }, water: { '2026-09-30': 4 },
    journal: { '2026-09-30': { mood: 3 } }, weekNotes: {}, ibadah: { '2026-09-30': ['subuh'] }, workNotes: {},
    focusSessions: [{ id: 'f' }], templates: [], cases: [{ id: 'c1' }], runs: [{ id: 'r' }], runExtras: {},
    coachChats: [], coachTrash: [], savedRoutes: [], timer: { status: 'idle' },
  };
  const parts = DB.split(state);
  assert.deepEqual(parts.kerja.tasks.map((x) => x.id), ['a', 'c']);
  assert.deepEqual(parts.pribadi.tasks.map((x) => x.id), ['b']);
  assert.deepEqual(parts.kerja.series.map((x) => x.id), ['s']);
  assert.deepEqual(parts.pribadi.series, []);
  assert.deepEqual(parts.pribadi.projects.map((x) => x.id), ['p']);
  assert.deepEqual(parts.olahraga.runs, [{ id: 'r' }]);
  assert.deepEqual(parts.kebiasaan.water, { '2026-09-30': 4 });
  assert.deepEqual(parts.fokus.timer, { status: 'idle' });
  assert.equal(parts.umum.version, 1);
  assert.ok(!('tasks' in parts.olahraga), 'database lain tidak membawa field yang bukan miliknya');
  const back = DB.join(parts);
  for (const key of Object.keys(state)) {
    if (Array.isArray(state[key])) assert.deepEqual([...back[key]].sort((x, y) => x.id.localeCompare(y.id)), [...state[key]].sort((x, y) => x.id.localeCompare(y.id)), key);
    else assert.deepEqual(back[key], state[key], key);
  }
  const k = DB.counts('kerja', parts.kerja);
  assert.deepEqual(k.find((x) => x.field === 'tasks'), { field: 'tasks', label: 'tugas', count: 2 });
  assert.equal(DB.counts('olahraga', parts.olahraga).find((x) => x.field === 'runs').count, 1);
});

test('server (memori): pindah dari dokumen lama, routing, pindah database, hapus, tulisan nyasar', async () => {
  await runScenarios(memory(), 'memori');
});
