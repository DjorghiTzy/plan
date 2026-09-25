// Template yang bisa diubah, pembersihan contoh data, dan sinkronisasi template.
const test = require('node:test');
const assert = require('node:assert/strict');

const memory = new Map();
globalThis.self = {
  Planner: { date: require('../js/core/date.js'), logic: require('../js/core/logic.js') },
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
  },
};
require('../js/data/sample.js');
const SUGGESTIONS = require('../js/data/templates.js');
require('../js/store.js');
const S = globalThis.self.Planner.store;
const M = require('../js/core/syncmap.js');
const L = require('../js/core/logic.js');
const D = require('../js/core/date.js');

const KEY = 'rencana-harian/v1';
function fresh(data = { tasks: [] }) {
  memory.set(KEY, JSON.stringify(data));
  return S.load();
}

test('kunjungan pertama dimulai kosong, tanpa contoh data', () => {
  memory.delete(KEY);
  const { state } = S.load();
  assert.equal(state.tasks.length, 0);
  assert.equal(state.series.length, 0);
  assert.equal(state.habits.length, 0);
  assert.deepEqual(state.templates, []);
  assert.equal(state.settings.isSample, false);
  assert.ok(memory.has(KEY), 'status kosong langsung disimpan');
});

test('perangkat yang masih memuat contoh data dikosongkan, pengaturan tetap', () => {
  const today = D.todayKey();
  const sample = globalThis.self.Planner.sample.build(today, 600);
  const { state, purged } = fresh({ ...sample, settings: { isSample: true, name: 'Dimas', theme: 'dark' } });
  assert.equal(purged, true);
  assert.equal(state.tasks.length, 0);
  assert.equal(state.series.length, 0);
  assert.equal(state.habits.length, 0);
  assert.deepEqual(state.journal, {});
  assert.equal(state.settings.name, 'Dimas');
  assert.equal(state.settings.theme, 'dark');
  assert.equal(state.settings.isSample, false);
  const saved = JSON.parse(memory.get(KEY));
  assert.equal(saved.tasks.length, 0, 'hasil pembersihan tersimpan');
});

test('contoh data yang pernah "disimpan" dibuang, data buatan pengguna tetap', () => {
  const today = D.todayKey();
  const sample = globalThis.self.Planner.sample.build(today, 600);
  const mine = { id: 't-milikku', date: today, title: 'Tugas saya sendiri', category: 'kerja', priority: 'tinggi' };
  const myHabit = { id: 'h-milikku', name: 'Jalan kaki', color: 'kesehatan' };
  const yesterday = D.addDays(today, -1);
  const data = {
    ...sample,
    tasks: [...sample.tasks, mine],
    habits: [...sample.habits, myHabit],
    habitLog: { ...sample.habitLog, [yesterday]: [...(sample.habitLog[yesterday] || []), 'h-milikku'] },
    journal: { ...sample.journal, '2020-01-01': { mood: 5, gratitude: ['Hari ulang tahun', '', ''], notes: 'Catatan asli' } },
    water: { ...sample.water, '2020-01-01': 3 },
    settings: { isSample: false },
  };
  const { state, purged } = fresh(data);
  assert.equal(purged, true);
  assert.deepEqual(state.tasks.map((t) => t.id), ['t-milikku']);
  assert.deepEqual(state.habits.map((h) => h.id), ['h-milikku']);
  assert.equal(state.series.length, 0);
  assert.equal(state.focusSessions.length, 0);
  assert.deepEqual(state.habitLog, { [yesterday]: ['h-milikku'] });
  assert.deepEqual(Object.keys(state.journal), ['2020-01-01'], 'jurnal contoh dibuang, jurnal asli tetap');
  assert.deepEqual(Object.keys(state.water), ['2020-01-01']);
});

test('data biasa tidak tersentuh pembersihan', () => {
  const { state, purged } = fresh({ tasks: [{ id: 't1', date: '2026-09-25', title: 'A' }], journal: { '2026-09-24': { mood: 4, gratitude: ['Tidur cukup semalam', '', ''] } } });
  assert.equal(purged, false);
  assert.equal(state.tasks.length, 1);
  assert.equal(Object.keys(state.journal).length, 1, 'tanpa jejak contoh, jurnal mirip contoh pun dibiarkan');
});

test('saran template valid: kategori/prioritas dikenal, jam berurutan, unik', () => {
  const cats = L.CATEGORIES.map((c) => c.id);
  const prios = L.PRIORITIES.map((c) => c.id);
  const ids = new Set();
  assert.ok(SUGGESTIONS.length >= 12);
  for (const tpl of SUGGESTIONS) {
    assert.ok(!ids.has(tpl.id), `id ganda ${tpl.id}`);
    ids.add(tpl.id);
    assert.ok(tpl.name && tpl.emoji && tpl.description, tpl.id);
    assert.ok(tpl.tasks.length >= 4, tpl.id);
    let last = '';
    for (const t of tpl.tasks) {
      assert.ok(cats.includes(t.category), `${tpl.id}: ${t.category}`);
      assert.ok(prios.includes(t.priority), `${tpl.id}: ${t.priority}`);
      if (t.start) {
        assert.ok(t.start >= last, `${tpl.id}: urutan ${t.title}`);
        last = t.start;
        if (t.end) assert.ok(t.end > t.start, `${tpl.id}: ${t.title}`);
      }
    }
    assert.deepEqual(S.cleanTemplateTasks(tpl.tasks), tpl.tasks.map((t) => ({ ...t })), `${tpl.id} sudah bersih`);
  }
});

test('buat, ubah, hapus, pulihkan template milik pengguna', () => {
  fresh();
  assert.throws(() => S.saveTemplate({ name: ' ', tasks: [{ title: 'x' }] }), /nama/i);
  assert.throws(() => S.saveTemplate({ name: 'Kosong', tasks: [{ title: '  ' }] }), /kegiatan/i);
  const tpl = S.saveTemplate({
    name: '  Senin Produktif ',
    emoji: '🚀',
    tasks: [
      { title: 'Rapat', start: '10:00', end: '11:00', category: 'kerja', priority: 'tinggi', starred: true },
      { title: 'Olahraga', start: '06:00', end: '05:00', category: 'bukan-kategori', priority: 'aneh' },
      { title: 'Tanpa jam', start: 'besok', category: 'rumah' },
      { title: '' },
    ],
  });
  assert.equal(tpl.name, 'Senin Produktif');
  assert.deepEqual(tpl.tasks.map((t) => t.title), ['Olahraga', 'Rapat', 'Tanpa jam'], 'diurutkan, baris kosong dibuang');
  assert.equal(tpl.tasks[0].end, null, 'jam selesai sebelum mulai dibuang');
  assert.equal(tpl.tasks[0].category, 'pribadi');
  assert.equal(tpl.tasks[0].priority, 'sedang');
  assert.equal(tpl.tasks[2].start, null);

  const again = S.saveTemplate({ id: tpl.id, name: 'Senin Fokus', tasks: [{ title: 'Kerja dalam', start: '08:00', end: '10:00' }] });
  assert.equal(again.id, tpl.id);
  assert.equal(S.state.templates.length, 1);
  assert.equal(S.state.templates[0].name, 'Senin Fokus');
  assert.equal(again.createdAt, tpl.createdAt);

  const removed = S.deleteTemplate(tpl.id);
  assert.equal(S.state.templates.length, 0);
  S.restoreTemplate(removed);
  assert.equal(S.state.templates.length, 1);
});

test('mengubah saran menyimpan salinan (from) dan saran bisa disembunyikan/dipulihkan', () => {
  fresh();
  const pagi = SUGGESTIONS.find((x) => x.id === 'pagi');
  const copy = S.saveTemplate({ ...pagi, id: undefined, from: 'pagi', name: 'Pagi versiku' });
  assert.equal(copy.from, 'pagi');
  S.hideSuggestion('kerja');
  S.hideSuggestion('kerja');
  assert.deepEqual(S.state.settings.hiddenTemplates, ['kerja']);
  S.hideSuggestion('kerja', false);
  assert.deepEqual(S.state.settings.hiddenTemplates, []);
  S.hideSuggestion('belajar');
  S.showAllSuggestions();
  assert.deepEqual(S.state.settings.hiddenTemplates, []);
});

test('terapkan template membuat tugas; jam kosong tetap tugas tanpa jam', () => {
  fresh();
  const tpl = S.saveTemplate({ name: 'Uji', tasks: [{ title: 'A', start: '07:00', end: '08:00', starred: true }, { title: 'B' }] });
  const ids = S.applyTemplate(tpl, '2026-09-26');
  assert.equal(ids.length, 2);
  const made = S.state.tasks.filter((t) => ids.includes(t.id));
  assert.deepEqual(made.map((t) => [t.title, t.start, t.starred]), [['A', '07:00', true], ['B', null, false]]);
});

test('simpan hari sebagai template', () => {
  fresh({
    tasks: [
      { id: 'a', date: '2026-09-26', title: 'Sore', start: '16:00', end: '17:00', category: 'rumah', priority: 'rendah' },
      { id: 'b', date: '2026-09-26', title: 'Pagi', start: '06:00', end: '06:30', category: 'kesehatan', priority: 'sedang', starred: true },
      { id: 'c', date: '2026-09-27', title: 'Hari lain' },
    ],
  });
  const data = S.templateFromDate('2026-09-26');
  assert.deepEqual(data.tasks.map((t) => t.title), ['Pagi', 'Sore']);
  assert.equal(data.tasks[0].starred, true);
});

test('kosongkan semua rencana tetap menyimpan template & pengaturan', () => {
  fresh({ tasks: [{ id: 't', date: '2026-09-26', title: 'X' }], series: [], habits: [{ id: 'h', name: 'H' }], settings: { name: 'Sari' } });
  S.saveTemplate({ name: 'Tetap', tasks: [{ title: 'A' }] });
  S.hideSuggestion('pagi');
  S.clearAll();
  assert.equal(S.state.tasks.length, 0);
  assert.equal(S.state.habits.length, 0);
  assert.equal(S.state.templates.length, 1);
  assert.equal(S.state.settings.name, 'Sari');
  assert.deepEqual(S.state.settings.hiddenTemplates, ['pagi']);
});

test('template ikut sinkron sebagai entri terpisah', () => {
  fresh();
  const tpl = S.saveTemplate({ name: 'Sinkron', tasks: [{ title: 'A' }] });
  const flat = M.flatten(S.state);
  assert.ok(flat[`template:${tpl.id}`]);
  assert.deepEqual(flat['settings:hiddenTemplates'], []);
  const other = S.normalize({});
  M.applyEntry(other, `template:${tpl.id}`, { v: tpl, t: 5 });
  assert.equal(other.templates.length, 1);
  M.applyEntry(other, `template:${tpl.id}`, { d: true, t: 6 });
  assert.equal(other.templates.length, 0);
});

test('template rusak dari impor/perangkat lain dibersihkan', () => {
  const s = S.normalize({ templates: [null, { name: 'Tanpa kegiatan' }, { name: 'Oke', tasks: [{ title: 'A', start: '25:00' }, 3] }], settings: { hiddenTemplates: 'bukan-larik' } });
  assert.equal(s.templates.length, 1);
  assert.equal(s.templates[0].tasks[0].start, null);
  assert.deepEqual(s.settings.hiddenTemplates, []);
});
