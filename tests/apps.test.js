// Menguji logika menu aplikasi: urutan & dok tersimpan, pencarian, navigasi grid, animasi gelombang.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/core/apps.js');

const IDS = ['beranda', 'kerja', 'pribadi', 'fokus', 'musik'];

test('fold: huruf kecil tanpa aksen & spasi rapat', () => {
  assert.equal(A.fold('  Rencana   Kérja '), 'rencana kerja');
  assert.equal(A.fold(null), '');
});

test('normalizeOrder: buang id asing/ganda, sisipkan aplikasi baru di posisi bawaan', () => {
  assert.deepEqual(A.normalizeOrder(['musik', 'kerja', 'x', 'kerja', 3], IDS), ['beranda', 'musik', 'kerja', 'pribadi', 'fokus']);
  const out = A.normalizeOrder(['musik', 'kerja'], IDS);
  assert.deepEqual([...out].sort(), [...IDS].sort());
  assert.equal(out[0], 'beranda'); // tanpa tetangga sebelumnya → paling depan
  assert.ok(out.indexOf('pribadi') === out.indexOf('kerja') + 1); // setelah tetangga bawaan
  assert.deepEqual(A.normalizeOrder(null, IDS), IDS);
  assert.deepEqual(A.normalizeOrder(['fokus', 'beranda', 'musik', 'pribadi', 'kerja'], IDS), ['fokus', 'beranda', 'musik', 'pribadi', 'kerja']);
});

test('cleanLayout: data rusak → bawaan; dok unik, dikenal, maks. 5', () => {
  assert.deepEqual(A.cleanLayout('rusak', IDS, { dock: ['beranda', 'musik'] }), { order: IDS, dock: ['beranda', 'musik'], groups: {}, collapsed: [] });
  const l = A.cleanLayout({ order: ['musik'], dock: ['musik', 'musik', 'x', 'kerja'] }, IDS);
  assert.deepEqual(l.order, ['beranda', 'kerja', 'pribadi', 'fokus', 'musik']);
  assert.deepEqual(l.dock, ['musik', 'kerja']);
  const many = A.cleanLayout({ dock: [...IDS, 'beranda'] }, [...IDS, 'a', 'b'], {});
  assert.equal(many.dock.length, A.DOCK_MAX);
  // Dok kosong yang disimpan tetap kosong (bukan kembali ke bawaan).
  assert.deepEqual(A.cleanLayout({ dock: [] }, IDS, { dock: ['beranda'] }).dock, []);
});

test('move: pindah item tanpa mengubah aslinya', () => {
  const src = ['a', 'b', 'c', 'd'];
  assert.deepEqual(A.move(src, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(A.move(src, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(A.move(src, 1, 99), ['a', 'c', 'd', 'b']);
  assert.deepEqual(A.move(src, 9, 0), src);
  assert.deepEqual(src, ['a', 'b', 'c', 'd']);
});

test('toggleDock: sematkan, lepas, dok penuh', () => {
  assert.deepEqual(A.toggleDock(['a'], 'b'), { dock: ['a', 'b'], changed: true, full: false });
  assert.deepEqual(A.toggleDock(['a', 'b'], 'a'), { dock: ['b'], changed: true, full: false });
  assert.deepEqual(A.toggleDock(['a'], 'a', true), { dock: ['a'], changed: false, full: false });
  assert.deepEqual(A.toggleDock(['a', 'b'], 'c', null, 2), { dock: ['a', 'b'], changed: false, full: true });
});

const APPS = [
  { id: 'kerja', label: 'Rencana Kerja', keywords: ['kantor', 'tugas'] },
  { id: 'pribadi', label: 'Rencana Pribadi', keywords: ['tugas'] },
  { id: 'fokus', label: 'Fokus', keywords: ['pomodoro', 'timer'] },
  { id: 'musik', label: 'Musik', keywords: ['lagu', 'putar'] },
  { id: 'kebiasaan', label: 'Kebiasaan', keywords: ['habit'] },
];

test('score & search: nama, awal kata, kata kunci, huruf berurutan', () => {
  assert.deepEqual(A.search(APPS, 'musik').map((a) => a.id), ['musik']);
  assert.deepEqual(A.search(APPS, 'KERJA').map((a) => a.id), ['kerja']);
  assert.deepEqual(A.search(APPS, 'lagu').map((a) => a.id), ['musik']);
  assert.deepEqual(A.search(APPS, 'timer').map((a) => a.id), ['fokus']);
  assert.deepEqual(A.search(APPS, 'rencana').map((a) => a.id), ['kerja', 'pribadi']);
  assert.deepEqual(A.search(APPS, 'tugas').map((a) => a.id), ['kerja', 'pribadi']);
  assert.deepEqual(A.search(APPS, 'rkrj').map((a) => a.id), ['kerja']);
  assert.deepEqual(A.search(APPS, 'rencana kantor').map((a) => a.id), ['kerja']);
  assert.deepEqual(A.search(APPS, 'zzz'), []);
  assert.equal(A.search(APPS, '  ').length, APPS.length);
  // Awal nama menang atas kata kunci.
  assert.ok(A.score(APPS[2], 'fo') > A.score(APPS[3], 'pu'));
});

test('matchRange: posisi sorotan di nama', () => {
  assert.deepEqual(A.matchRange('Rencana Kerja', 'kerj'), [8, 12]);
  assert.equal(A.matchRange('Musik', 'lagu'), null);
  assert.equal(A.matchRange('Musik', ''), null);
});

test('gridStep: panah, Home/End, tidak keluar grid', () => {
  // 10 item, 4 kolom: baris 0-3, 4-7, 8-9
  assert.equal(A.gridStep(0, 'ArrowRight', 4, 10), 1);
  assert.equal(A.gridStep(0, 'ArrowLeft', 4, 10), 0);
  assert.equal(A.gridStep(1, 'ArrowDown', 4, 10), 5);
  assert.equal(A.gridStep(6, 'ArrowDown', 4, 10), 6); // baris terakhir tidak punya kolom 2
  assert.equal(A.gridStep(9, 'ArrowUp', 4, 10), 5);
  assert.equal(A.gridStep(2, 'ArrowUp', 4, 10), 2);
  assert.equal(A.gridStep(9, 'ArrowRight', 4, 10), 9);
  assert.equal(A.gridStep(5, 'Home', 4, 10), 0);
  assert.equal(A.gridStep(5, 'End', 4, 10), 9);
  assert.equal(A.gridStep(0, 'ArrowDown', 4, 0), -1);
});

test('waveDelay: bertambah dengan jarak dan dibatasi', () => {
  assert.equal(A.waveDelay(0, 0), 0);
  assert.ok(A.waveDelay(100, 0) < A.waveDelay(300, 400));
  assert.equal(A.waveDelay(5000, 5000), 420);
});

const DEFS = [
  { id: 'harian', apps: ['beranda'] },
  { id: 'kerja', apps: ['kerja', 'fokus'] },
  { id: 'pribadi', apps: ['pribadi', 'musik'] },
];

test('cleanLayout: pindahan database & database diciutkan hanya yang dikenal', () => {
  const l = A.cleanLayout({ groups: { musik: 'kerja', fokus: 'x', y: 'kerja', beranda: 5 }, collapsed: ['kerja', 'kerja', 'zz'] }, IDS, { groupIds: ['harian', 'kerja', 'pribadi'] });
  assert.deepEqual(l.groups, { musik: 'kerja' });
  assert.deepEqual(l.collapsed, ['kerja']);
  assert.deepEqual(A.cleanLayout({ groups: ['rusak'], collapsed: 'x' }, IDS, { groupIds: ['kerja'] }).groups, {});
});

test('groupApps: aplikasi per database mengikuti urutan & pindahan pengguna', () => {
  const order = ['musik', 'beranda', 'fokus', 'kerja', 'pribadi'];
  assert.deepEqual(A.groupApps(order, DEFS), [
    { id: 'harian', apps: ['beranda'] },
    { id: 'kerja', apps: ['fokus', 'kerja'] },
    { id: 'pribadi', apps: ['musik', 'pribadi'] },
  ]);
  const moved = A.groupApps(order, DEFS, { musik: 'harian', fokus: 'tidak-ada' });
  assert.deepEqual(moved[0].apps, ['musik', 'beranda']);
  assert.deepEqual(moved[1].apps, ['fokus', 'kerja'], 'pindahan ke database tak dikenal diabaikan');
  assert.equal(A.groupOf('baru-ada', DEFS), 'harian', 'aplikasi baru tanpa database → database pertama');
  assert.deepEqual(A.groupOverrides({ musik: 'harian', kerja: 'kerja', fokus: 'pribadi' }, DEFS), { musik: 'harian', fokus: 'pribadi' });
});

test('navStep: panah mengikuti letak ikon di grid yang terbagi per database', () => {
  // Baris 1: 3 ikon (database A), baris 2: 1 ikon (database B), baris 3: 4 ikon (database C).
  const R = (x, y) => ({ x, y, w: 80, h: 100 });
  const rects = [R(0, 0), R(100, 0), R(200, 0), R(0, 160), R(0, 320), R(100, 320), R(200, 320), R(300, 320)];
  assert.equal(A.navStep(rects, 2, 'ArrowDown'), 3, 'turun ke baris berikutnya walau hanya 1 ikon');
  assert.equal(A.navStep(rects, 3, 'ArrowDown'), 4);
  assert.equal(A.navStep(rects, 7, 'ArrowUp'), 3, 'naik ke ikon terdekat di baris atas');
  assert.equal(A.navStep(rects, 5, 'ArrowUp'), 3);
  assert.equal(A.navStep(rects, 1, 'ArrowUp'), 1, 'baris teratas: tetap');
  assert.equal(A.navStep(rects, 6, 'ArrowDown'), 6, 'baris terbawah: tetap');
  assert.equal(A.navStep(rects, 3, 'ArrowRight'), 4);
  assert.equal(A.navStep(rects, 0, 'End'), 7);
  assert.equal(A.navStep([], 0, 'ArrowDown'), -1);
});
