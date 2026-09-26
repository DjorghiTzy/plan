// Pengenalan kegiatan yang luwes (salah ketik, ejaan tak baku) & rekomendasi waktu.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/core/smart.js');
const { KINDS } = require('../js/data/activities.js');
const L = require('../js/core/logic.js');

const kind = (text) => {
  const d = S.detect(text);
  return d ? d.kind.id : null;
};

const PRAYERS = { subuh: 266, dzuhur: 707, ashar: 896, maghrib: 1071, isya: 1140 };
const SETTINGS = { workStart: '08:00', workEnd: '17:00', breakStart: '12:00', breakEnd: '13:00', workDays: [1, 2, 3, 4, 5] };
const FRI = '2026-09-25';
const SAT = '2026-09-26';
const rec = (text, extra = {}) => S.recommend({ detection: S.detect(text), date: FRI, settings: SETTINGS, prayers: PRAYERS, ...extra });

test('kamus kegiatan valid', () => {
  const cats = L.CATEGORIES.map((c) => c.id);
  const ids = new Set();
  for (const k of KINDS) {
    assert.ok(!ids.has(k.id), `id ganda ${k.id}`);
    ids.add(k.id);
    assert.ok(cats.includes(k.category), `${k.id}: ${k.category}`);
    assert.ok(k.words.length && k.label && k.emoji && k.group, k.id);
    for (const w of k.windows) assert.match(w, /^(work|work-start|work-end|rest|@[a-z]+[+-]\d+|\d\d:\d\d-\d\d:\d\d)( (we|wd|d[0-6]))?$/, `${k.id}: ${w}`);
  }
});

test('mengenali kegiatan dari bahasa sehari-hari', () => {
  assert.equal(kind('padel'), 'padel');
  assert.equal(S.detect('Main padel sama teman').kind.group, 'Olahraga');
  assert.equal(S.detect('padel').kind.category, 'kesehatan');
  assert.equal(kind('bultang malam'), 'badminton');
  assert.equal(kind('nge-gym'), 'gym');
  assert.equal(kind('Rapat tim 14.00'), 'rapat');
  assert.equal(kind('zoom sama vendor'), 'rapat');
  assert.equal(kind('bersih-bersih rumah'), 'bersih');
  assert.equal(kind('jalan2 ke mall'), 'liburan');
  assert.equal(kind('Tilawah 1 juz'), 'ngaji');
  assert.equal(kind('Sholat Jumat'), 'jumat');
  assert.equal(kind('Sholat Dhuha'), 'dhuha', 'jenis khusus mengalahkan yang umum');
  assert.equal(kind('Olahraga padel'), 'padel');
  assert.equal(kind('Uji coba fitur login'), 'coding');
});

test('salah ketik & ejaan tak baku tetap terbaca', () => {
  for (const t of ['solad', 'sholad', 'shalat', 'salat', 'solaaat', 'SHOLAT']) {
    assert.equal(S.detect(t).kind.category, 'ibadah', t);
  }
  assert.equal(S.detect('solad isya').prayer, 'isya');
  assert.equal(S.detect('solat zuhur berjamaah').prayer, 'dzuhur');
  assert.equal(S.detect('magrib').prayer, 'maghrib');
  assert.equal(kind('batminton'), 'badminton');
  assert.equal(kind('belnja bulanan'), 'belanja', 'salah ketik 1 huruf');
  assert.equal(kind('tahajut'), 'tahajud');
  assert.equal(S.detect('belnja bulanan').level, 1);
});

test('tidak asal menebak', () => {
  assert.equal(kind('nanti lagi'), null, '"lagi" bukan "lari"');
  assert.equal(kind('makan salad'), 'makan', '"salad" bukan "salat"');
  assert.equal(kind('Isa Almasih'), null, 'nama orang, bukan sholat Isya');
  assert.equal(S.detect('solat isa').prayer, 'isya', 'tapi "solat isa" tetap Isya');
  assert.deepEqual(S.detect('ngaji habis isa').anchor, { prayer: 'isya', offset: 15 });
  assert.equal(kind(''), null);
  assert.equal(S.distance('padel', 'pedal', 1), 2);
});

test('petunjuk waktu dari kalimat', () => {
  assert.deepEqual(S.detect('ngaji habis maghrib').anchor, { prayer: 'maghrib', offset: 15 });
  assert.deepEqual(S.detect('lari subuh').anchor, { prayer: 'subuh', offset: 15 });
  assert.equal(S.detect('lari pagi').part, 'pagi');
  assert.equal(S.describe(S.detect('padel')), '🎾 Olahraga · Padel');
  assert.equal(S.describe(S.detect('solad ashar')), '🕌 Ibadah · Sholat Ashar');
});

test('rekomendasi: jendela wajar, di luar jam kerja untuk urusan pribadi', () => {
  assert.deepEqual(rec('padel').map((r) => r.start), ['17:00', '18:30'], 'hari kerja: setelah pulang');
  assert.deepEqual(S.recommend({ detection: S.detect('padel'), date: SAT, settings: SETTINGS, prayers: PRAYERS }).map((r) => r.start), ['16:00', '06:00', '17:30']);
  assert.deepEqual(rec('rapat').map((r) => r.label), ['Jam kerja', 'Jam kerja', 'Jam kerja']);
  assert.ok(rec('rapat').every((r) => r.start >= '08:00' && r.end <= '17:00' && !(r.start < '13:00' && r.end > '12:00')), 'rapat di jam kerja, bukan jam istirahat');
  assert.deepEqual(rec('makan siang').map((r) => r.start), ['12:00'], 'makan siang di jam istirahat');
  assert.deepEqual(rec('lari pagi').map((r) => r.start), ['05:30']);
  assert.deepEqual(rec('puasa'), [], 'tanpa jam khusus');
});

test('rekomendasi: waktu sholat & jangkar', () => {
  const r = rec('solad dzuhur');
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].label, r[0].start, r[0].clash], ['Dzuhur', '11:47', false], 'sholat boleh di sela jam kerja');
  assert.deepEqual(rec('solat', { nowMin: 800 }).map((x) => x.label), ['Ashar', 'Maghrib', 'Isya'], 'hanya yang belum lewat');
  assert.equal(rec('ngaji habis maghrib')[0].label, 'Setelah Maghrib');
  assert.equal(rec('ngaji habis maghrib')[0].start, '18:06');
  assert.equal(rec('Sholat Jumat')[0].start, '11:40');
});

test('rekomendasi: melewati jadwal yang terisi, jam yang sudah lewat, dan belajar dari kebiasaan', () => {
  const busy = [{ id: 'x', date: FRI, title: 'Rapat', start: '17:00', end: '19:00' }];
  assert.equal(rec('padel', { tasks: busy })[0].start, '19:00');
  assert.deepEqual(rec('padel', { nowMin: 1260 }), [], 'sudah terlalu malam');
  const past = [
    { id: 'a', date: '2026-09-20', start: '06:15', end: '07:00', title: 'Lari pagi' },
    { id: 'b', date: '2026-09-22', start: '06:30', end: '07:00', title: 'jogging' },
    { id: 'c', date: '2026-09-23', start: '06:30', end: '07:15', title: 'running', kind: 'lari' },
  ];
  const r = rec('lari', { tasks: past });
  assert.deepEqual([r[0].label, r[0].start], ['Biasanya', '06:30']);
});

test('pencarian luwes: salah ketik & nama jenis kegiatan', () => {
  const tasks = [
    { id: '1', date: FRI, title: 'Main padel', category: 'kesehatan' },
    { id: '2', date: FRI, title: 'Sholat Dhuha', category: 'ibadah' },
    { id: '3', date: FRI, title: 'Rapat klien', category: 'kerja' },
  ];
  const ids = (q) => S.searchTasks(tasks, q, FRI).map((t) => t.id);
  assert.deepEqual(ids('olahraga'), ['1']);
  assert.deepEqual(ids('solat'), ['2']);
  assert.deepEqual(ids('dhuha'), ['2']);
  assert.deepEqual(ids('ibadah'), ['2']);
  assert.deepEqual(ids('meeting'), [], 'kata lain tidak asal cocok');
  assert.deepEqual(ids('rap'), ['3'], 'awalan kata');
  assert.deepEqual(ids('rapt'), ['3'], 'kurang satu huruf');
  assert.deepEqual(ids('klein'), ['3'], 'huruf tertukar');
});

test('jumlah per jenis kegiatan', () => {
  const rows = S.kindCounts([
    { title: 'Padel', done: true },
    { title: 'main padel' },
    { title: 'solad' },
    { title: 'Sesuatu yang tidak dikenal' },
  ]);
  assert.deepEqual(rows.map((r) => [r.kind.id, r.total, r.done]), [['padel', 2, 1], ['sholat', 1, 0]]);
});
