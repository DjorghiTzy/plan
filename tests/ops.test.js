// Operasional kerja: catatan ketuk-coret, rutinitas, Retur (SLA hari), Delivery Order (SLA menit),
// serta pengingat retur harian lewat push server.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SYNC_STORE = 'memory';
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;

const memory = new Map();
globalThis.self = {
  Planner: { date: require('../js/core/date.js'), logic: require('../js/core/logic.js') },
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
  },
};
require('../js/data/sample.js');
require('../js/data/templates.js');
require('../js/store.js');
const S = globalThis.self.Planner.store;
const L = require('../js/core/logic.js');
const M = require('../js/core/syncmap.js');
const push = require('../api/_lib/push');
const sync = require('../api/_lib/sync');
const { memory: memStore } = require('../api/_lib/store');

const KEY = 'rencana-harian/v1';
const fresh = (data = { tasks: [] }) => {
  memory.set(KEY, JSON.stringify(data));
  return S.load();
};
const FRI = '2026-09-25';

test('rutinitas kerja bawaan sesuai rutinitas harian pengguna', () => {
  fresh();
  const titles = S.state.settings.workRoutine.map((r) => r.title);
  assert.deepEqual(titles, ['Penambahan mobil 1 dan 2', 'Mengurus Delivery Order', 'Mengurusi Retur', 'Merapikan Gudang']);
  assert.deepEqual(S.state.settings.workRoutine.map((r) => r.link || null), [null, 'do', 'retur', null]);
  assert.equal(S.state.settings.returSla, 7);
  assert.equal(S.state.settings.doSla, 60);
  assert.equal(S.state.settings.returRemindAt, '15:00');
});

test('catatan kerja: ketuk = coret, per tanggal, catatan tambahan bisa dihapus & diurungkan', () => {
  fresh();
  S.toggleRoutine(FRI, 'rt-gudang');
  assert.deepEqual(S.workNoteFor(FRI).done, ['rt-gudang']);
  assert.deepEqual(S.workNoteFor('2026-09-26').done, [], 'besok mulai belum tercoret');
  S.toggleRoutine(FRI, 'rt-gudang');
  assert.equal(FRI in S.state.workNotes, false, 'tanggal kosong dibersihkan');
  const n = S.addWorkNote(FRI, '  Telepon ekspedisi  ');
  assert.equal(n.text, 'Telepon ekspedisi');
  assert.equal(S.addWorkNote(FRI, '   '), null);
  S.toggleWorkNote(FRI, n.id);
  assert.equal(S.workNoteFor(FRI).items[0].done, true);
  const removed = S.deleteWorkNote(FRI, n.id);
  assert.equal(S.workNoteFor(FRI).items.length, 0);
  S.restoreWorkNote(FRI, removed);
  assert.equal(S.workNoteFor(FRI).items[0].text, 'Telepon ekspedisi');
  assert.ok(M.flatten(S.state)[`workNote:${FRI}`], 'ikut sinkron');
});

test('atur rutinitas: dibersihkan, id tetap unik', () => {
  fresh();
  S.setWorkRoutine([{ title: ' Cek stok ' }, { title: '' }, { id: 'rt-x', title: 'A' }, { id: 'rt-x', title: 'B', link: 'retur' }]);
  const r = S.state.settings.workRoutine;
  assert.deepEqual(r.map((x) => x.title), ['Cek stok', 'A', 'B']);
  assert.equal(new Set(r.map((x) => x.id)).size, 3);
  assert.equal(r[2].link, 'retur');
});

test('retur: SLA 7 hari dihitung dari hari mulai (hari ke-1)', () => {
  const r = { type: 'retur', title: 'Toko A', startDate: '2026-09-20', sla: 7, endDate: null, createdAt: 1 };
  assert.equal(L.returDue(r), '2026-09-26');
  assert.deepEqual(pick(L.returStatus(r, '2026-09-20')), { day: 1, left: 6, late: 0, tone: 'ok' });
  assert.deepEqual(pick(L.returStatus(r, '2026-09-25')), { day: 6, left: 1, late: 0, tone: 'soon' });
  assert.deepEqual(pick(L.returStatus(r, '2026-09-26')), { day: 7, left: 0, late: 0, tone: 'soon' });
  assert.deepEqual(pick(L.returStatus(r, '2026-09-28')), { day: 9, left: -2, late: 2, tone: 'late' });
  const done = L.returStatus({ ...r, endDate: '2026-09-24' }, '2026-09-30');
  assert.deepEqual([done.done, done.day, done.late], [true, 5, 0]);
  assert.equal(L.returStatus({ ...r, endDate: '2026-09-27' }, '2026-09-30').late, 1);
  assert.equal(L.returSummary([r, { ...r, title: 'Toko B', startDate: '2026-09-15' }], '2026-09-25'), 'Toko A (hari ke-6/7), Toko B (lewat SLA 4 hari)');
});

function pick(s) {
  return { day: s.day, left: s.left, late: s.late, tone: s.tone };
}

test('delivery order: SLA 1 jam sejak jam DO diterima', () => {
  const c = { type: 'do', title: 'DO-1', date: FRI, time: '09:00', sla: 60, doneAt: null };
  const at = (h, m) => new Date(2026, 8, 25, h, m).getTime();
  assert.deepEqual([L.doStatus(c, at(9, 20)).left, L.doStatus(c, at(9, 20)).tone], [40, 'ok']);
  assert.equal(L.doStatus(c, at(9, 50)).tone, 'soon');
  assert.deepEqual([L.doStatus(c, at(10, 12)).late, L.doStatus(c, at(10, 12)).tone], [12, 'late']);
  assert.equal(L.doStatus({ ...c, doneAt: at(9, 55) }, 0).late, 0);
  assert.equal(L.doStatus({ ...c, doneAt: at(10, 5) }, 0).late, 5);
  const late = { ...c, date: '2026-09-24', time: '23:30' };
  assert.equal(new Date(L.doStatus(late, 0).dueTs).getDate(), 25, 'batas bisa melewati tengah malam');
});

test('simpan retur & DO: SLA dari pengaturan saat dibuat, selesai/batal, hapus/urungkan', () => {
  fresh();
  assert.throws(() => S.saveCase({ type: 'retur', title: ' ' }), /customer/);
  assert.throws(() => S.saveCase({ type: 'retur', title: 'X', startDate: '2026-09-20', endDate: '2026-09-19' }), /sebelum/);
  const r = S.saveCase({ type: 'retur', title: 'Toko Sumber Rejeki', note: '3 dus', startDate: '2026-09-20' });
  assert.equal(r.sla, 7);
  S.setSettings({ returSla: 5 });
  const r2 = S.saveCase({ type: 'retur', title: 'Toko B', startDate: FRI });
  assert.equal(r2.sla, 5, 'retur baru memakai SLA terbaru');
  assert.equal(S.saveCase({ id: r.id, type: 'retur', title: 'Toko Sumber Rejeki', startDate: '2026-09-21' }).sla, 7, 'retur lama tetap SLA lamanya');
  S.toggleCaseDone(r.id, new Date(2026, 8, 25, 10));
  assert.equal(S.findCase(r.id).endDate, FRI);
  S.toggleCaseDone(r.id);
  assert.equal(S.findCase(r.id).endDate, null);
  const d = S.saveCase({ type: 'do', title: 'DO-0925-001', date: FRI, time: '14:05' });
  assert.deepEqual([d.sla, d.time, d.doneAt], [60, '14:05', null]);
  S.toggleCaseDone(d.id, new Date(2026, 8, 25, 14, 50));
  assert.equal(S.findCase(d.id).doneAt, new Date(2026, 8, 25, 14, 50).getTime());
  assert.deepEqual(L.openReturs(S.state.cases, FRI).map((c) => c.title), ['Toko Sumber Rejeki', 'Toko B']);
  assert.deepEqual(L.openDOs(S.state.cases), []);
  const removed = S.deleteCase(r2.id);
  assert.equal(S.findCase(r2.id), null);
  S.restoreCase(removed);
  assert.ok(S.findCase(r2.id));
  assert.ok(M.flatten(S.state)[`case:${r.id}`], 'ikut sinkron');
});

test('data rusak dibersihkan', () => {
  const s = S.normalize({
    cases: [{ type: 'retur', title: 'A', startDate: 'x', sla: 999 }, { type: 'lain', title: 'B' }, { type: 'do', title: 'C', time: '25:00' }, { type: 'do', title: ' ' }],
    workNotes: { salah: { done: [] }, [FRI]: { done: ['a', 3], items: [{ text: 'ok' }, { text: '' }, 'x'] } },
    settings: { workRoutine: 'bukan-larik' },
  });
  assert.equal(s.cases.length, 2);
  assert.equal(s.cases[0].sla, 7);
  assert.equal(s.cases[1].time, '08:00');
  assert.deepEqual(Object.keys(s.workNotes), [FRI]);
  assert.deepEqual(s.workNotes[FRI].done, ['a']);
  assert.deepEqual(s.workNotes[FRI].items.map((i) => i.text), ['ok']);
  assert.equal(s.settings.workRoutine.length, 4, 'rutinitas rusak → bawaan');
});

test('laporan kerja memuat bagian tambahan', () => {
  const text = L.workReport({ date: FRI, tasks: [], sections: [{ title: '📦 Retur', lines: ['⏳ Toko A: hari ke-3/7'] }, { title: 'Kosong', lines: [] }] });
  assert.match(text, /\*📦 Retur\*\n⏳ Toko A: hari ke-3\/7/);
  assert.doesNotMatch(text, /Kosong/);
});

test('push: pengingat retur pukul 15 hanya bila masih ada retur aktif', async () => {
  const store = memStore();
  const fcm = 'https://fcm.googleapis.com/fcm/send/retur';
  await push.saveSubscription(store, 'u9', { subscription: { endpoint: fcm, keys: { p256dh: 'x', auth: 'y' } }, hourly: false, returAt: 15, tz: 'Asia/Jakarta' });
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { status: 201 };
  };
  const at = (h) => Date.UTC(2026, 8, 25, h - 7, 0, 30); // jam WIB
  let r = await push.tick(store, { now: at(15), fetchImpl });
  assert.deepEqual([r.sent, r.skipped], [0, 1], 'belum ada retur');
  await sync.push(store, 'u9', sync.validateChanges({
    'case:c1': { v: { id: 'c1', type: 'retur', title: 'Toko A', startDate: '2026-09-22', endDate: null, sla: 7 }, t: 1 },
  }));
  r = await push.tick(store, { now: at(14), fetchImpl });
  assert.equal(r.sent, 0, 'bukan jamnya');
  r = await push.tick(store, { now: at(15), fetchImpl });
  assert.equal(r.sent, 1, 'pukul 15 WIB dikirim');
  r = await push.tick(store, { now: at(15) + 600000, fetchImpl });
  assert.equal(r.sent, 0, 'sekali per jam');
  await sync.push(store, 'u9', sync.validateChanges({
    'case:c1': { v: { id: 'c1', type: 'retur', title: 'Toko A', startDate: '2026-09-22', endDate: '2026-09-25', sla: 7 }, t: 2 },
  }));
  r = await push.tick(store, { now: at(15) + 86400000, fetchImpl });
  assert.equal(r.sent, 0, 'retur selesai → tidak diingatkan lagi');
  // Langganan lama (tanpa flag hourly) tetap dianggap pengingat per jam.
  await push.saveSubscription(store, 'u8', { subscription: { endpoint: `${fcm}2`, keys: {} }, from: 0, to: 23 });
  const rec = JSON.parse(await store.get(push.KEYS.sub(push.subId(`${fcm}2`))));
  assert.deepEqual([rec.hourly, rec.returAt], [true, null]);
});
