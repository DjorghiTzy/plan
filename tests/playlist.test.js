// Musik: urutan putar, lagu berikut/sebelumnya, format waktu, nama berkas, tag ID3.
const test = require('node:test');
const assert = require('node:assert/strict');
const PL = require('../js/core/playlist.js');

test('urutan putar: acak menaruh lagu yang sedang jalan di depan, lainnya teracak', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(PL.playOrder(ids), ids);
  let x = 0.37;
  const rand = () => (x = (x * 9301 + 49297) % 233280 / 233280);
  const o = PL.playOrder(ids, { shuffle: true, current: 'c', rand });
  assert.equal(o[0], 'c');
  assert.deepEqual([...o].sort(), ids);
  assert.notDeepEqual(o, ['c', 'a', 'b', 'd', 'e']);
});

test('berikut/sebelumnya dengan ulangi mati, semua, satu', () => {
  const o = ['a', 'b', 'c'];
  assert.equal(PL.nextId(o, 'a'), 'b');
  assert.equal(PL.nextId(o, 'c'), 'a', 'tombol berikutnya di akhir daftar → kembali ke awal');
  assert.equal(PL.nextId(o, 'c', { auto: true }), null, 'lagu habis di akhir daftar tanpa ulangi → berhenti');
  assert.equal(PL.nextId(o, 'c', { auto: true, repeat: 'all' }), 'a');
  assert.equal(PL.nextId(o, 'b', { auto: true, repeat: 'one' }), 'b');
  assert.equal(PL.nextId(o, 'b', { repeat: 'one' }), 'c', 'tombol berikutnya tetap pindah lagu');
  assert.equal(PL.nextId(o, 'zz'), 'a');
  assert.equal(PL.nextId([], 'a'), null);
  assert.equal(PL.prevId(o, 'b'), 'a');
  assert.equal(PL.prevId(o, 'a'), 'c');
  assert.deepEqual(['off', 'all', 'one', 'off'].map((r, i, arr) => (i ? PL.nextRepeat(arr[i - 1]) : r)), ['off', 'all', 'one', 'off']);
});

test('format waktu & judul dari nama berkas', () => {
  assert.equal(PL.formatTime(0), '0:00');
  assert.equal(PL.formatTime(192.7), '3:12');
  assert.equal(PL.formatTime(3723), '1:02:03');
  assert.equal(PL.formatTime(NaN), '0:00');
  assert.deepEqual(PL.parseName('Different_Heaven_-_Safe_And_Sound_House_NCS_-_Copyright_Free_Music.mp3'), { artist: 'Different Heaven', title: 'Safe And Sound House NCS - Copyright Free Music' });
  assert.deepEqual(PL.parseName('Alan Walker - Fade [NCS Release].mp3'), { artist: 'Alan Walker', title: 'Fade' });
  assert.deepEqual(PL.parseName('lagu-pagi.m4a'), { artist: '', title: 'lagu-pagi' });
  assert.equal(PL.chunkCount(1), 1);
  assert.equal(PL.chunkCount(PL.CHUNK_BYTES * 2 + 1), 3);
});

/** Tag ID3v2.3 buatan: TIT2 (UTF-16 BOM), TPE1 (latin1), TALB (UTF-8), APIC (PNG kecil). */
function id3v23() {
  const frame = (id, body) => {
    const b = Buffer.from(body);
    const h = Buffer.alloc(10);
    h.write(id, 0, 'latin1');
    h.writeUInt32BE(b.length, 4);
    return Buffer.concat([h, b]);
  };
  const utf16 = (s) => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const frames = Buffer.concat([
    frame('TIT2', utf16('Pagi Cerah ☀')),
    frame('TPE1', Buffer.concat([Buffer.from([0]), Buffer.from('Band Lari', 'latin1')])),
    frame('TALB', Buffer.concat([Buffer.from([3]), Buffer.from('Album Ü', 'utf8')])),
    frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0', 'latin1'), Buffer.from([3]), Buffer.from('sampul\0', 'latin1'), png])),
  ]);
  const size = frames.length;
  const head = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
  return { buf: Buffer.concat([head, frames, Buffer.from([0xff, 0xfb, 0x90, 0])]), png };
}

test('tag ID3: judul, artis, album, sampul; berkas tanpa tag → kosong', () => {
  const { buf, png } = id3v23();
  const t = PL.readId3(new Uint8Array(buf));
  assert.equal(t.title, 'Pagi Cerah ☀');
  assert.equal(t.artist, 'Band Lari');
  assert.equal(t.album, 'Album Ü');
  assert.equal(t.picture.mime, 'image/png');
  assert.deepEqual(Buffer.from(t.picture.data), png);
  const none = PL.readId3(new Uint8Array([0xff, 0xfb, 0x90, 0, 1, 2, 3, 4, 5, 6, 7]));
  assert.deepEqual(none, { title: null, artist: null, album: null, picture: null });
  // Lagu NCS yang diunggah: ID3v2.4 hanya berisi TXXX/TSSE (tanpa judul).
  const fs = require('node:fs');
  const path = require('node:path');
  const mp3 = fs.readFileSync(path.join(__dirname, '..', 'audio', 'different-heaven-safe-and-sound.mp3'));
  assert.deepEqual(PL.readId3(new Uint8Array(mp3.subarray(0, 4096))), { title: null, artist: null, album: null, picture: null });
});
