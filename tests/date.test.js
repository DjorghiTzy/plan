const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/core/date.js');

test('toKey dan fromKey saling kebalikan', () => {
  const key = '2026-09-24';
  assert.equal(D.toKey(D.fromKey(key)), key);
});

test('isKey menolak tanggal yang tidak ada', () => {
  assert.equal(D.isKey('2026-02-29'), false);
  assert.equal(D.isKey('2028-02-29'), true);
  assert.equal(D.isKey('24-09-2026'), false);
});

test('addDays melewati batas bulan dan tahun', () => {
  assert.equal(D.addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(D.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(D.addDays('2026-03-01', -1), '2026-02-28');
});

test('diffDays menghitung selisih hari', () => {
  assert.equal(D.diffDays('2026-09-20', '2026-09-24'), 4);
  assert.equal(D.diffDays('2026-09-24', '2026-09-20'), -4);
});

test('formatLong memakai nama hari dan bulan Indonesia', () => {
  assert.equal(D.formatLong('2026-09-24'), 'Kamis, 24 September 2026');
  assert.equal(D.formatShort('2026-08-17'), '17 Agu');
});

test('pasaran Jawa mengikuti acuan 17 Agustus 1945 = Jumat Legi', () => {
  assert.equal(D.dayName('1945-08-17'), 'Jumat');
  assert.equal(D.pasaran('1945-08-17'), 'Legi');
  assert.equal(D.pasaran('1945-08-18'), 'Pahing');
  assert.equal(D.pasaran('1945-08-22'), 'Legi');
  assert.equal(D.pasaran('2026-09-24'), 'Wage');
});

test('parseTime menerima titik dan titik dua', () => {
  assert.equal(D.parseTime('14:30'), 870);
  assert.equal(D.parseTime('14.30'), 870);
  assert.equal(D.parseTime('0930'), 570);
  assert.equal(D.parseTime('9'), 540);
  assert.equal(D.parseTime('24:00'), null);
  assert.equal(D.parseTime('abc'), null);
});

test('formatTime dan formatDuration', () => {
  assert.equal(D.formatTime(545), '09:05');
  assert.equal(D.formatDuration(45), '45 mnt');
  assert.equal(D.formatDuration(90), '1 j 30 mnt');
  assert.equal(D.formatDuration(120), '2 jam');
});

test('dayPart mengikuti sapaan pagi/siang/sore/malam', () => {
  assert.equal(D.dayPart(D.parseTime('05:00')), 'pagi');
  assert.equal(D.dayPart(D.parseTime('12:00')), 'siang');
  assert.equal(D.dayPart(D.parseTime('16:00')), 'sore');
  assert.equal(D.dayPart(D.parseTime('20:00')), 'malam');
  assert.equal(D.dayPart(D.parseTime('02:00')), 'malam');
  assert.equal(D.dayPart(null), 'kapan');
});

test('monthMatrix dimulai hari Minggu', () => {
  const weeks = D.monthMatrix(2026, 8); // September 2026
  assert.equal(weeks.length, 6);
  assert.equal(D.dayIndex(weeks[0][0]), 0);
  assert.ok(weeks[0].includes('2026-09-01'));
});

test('relativeLabel', () => {
  assert.equal(D.relativeLabel('2026-09-24', '2026-09-24'), 'Hari ini');
  assert.equal(D.relativeLabel('2026-09-25', '2026-09-24'), 'Besok');
  assert.equal(D.relativeLabel('2026-09-23', '2026-09-24'), 'Kemarin');
  assert.equal(D.relativeLabel('2026-09-30', '2026-09-24'), null);
});

test('weekKeys dimulai hari Senin', () => {
  const keys = D.weekKeys('2026-09-24');
  assert.equal(keys[0], '2026-09-21');
  assert.equal(keys[6], '2026-09-27');
  assert.equal(D.weekStart('2026-09-27'), '2026-09-21');
});

test('isoWeek', () => {
  assert.equal(D.isoWeek('2026-09-24'), 39);
  assert.equal(D.isoWeek('2026-01-01'), 1);
  assert.equal(D.isoWeek('2027-01-01'), 53);
});
