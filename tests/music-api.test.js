// Pustaka musik akun lewat /api/sync?music=…: unggah per potongan, daftar, unduh, hapus, batas.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.SYNC_STORE = 'memory';
process.env.MUSIC_LIMIT_MB = '3';
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const { resetStore } = require('../api/_lib/store');
const PL = require('../js/core/playlist.js');
const { createServer } = require('../scripts/dev-server');

let server;
let base;
test.before(async () => {
  resetStore();
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

let seq = 0;
async function newToken() {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.7.0.${(seq += 1)}` },
    body: JSON.stringify({ email: `musik${seq}.${Date.now()}@contoh.id`, password: 'rahasia123' }),
  });
  return (await res.json()).token;
}
const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {});
const post = (token, body) => fetch(`${base}/api/sync?music=1`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth(token) }, body: JSON.stringify(body) });
const get = (token, qs) => fetch(`${base}/api/sync?${qs}`, { headers: auth(token) });

async function upload(token, id, bytes, extra = {}) {
  const track = { id, title: 'Lagu Uji', artist: 'Band', type: 'audio/mpeg', size: bytes.length, duration: 185, ...extra };
  const b = await post(token, { action: 'begin', track });
  if (b.status !== 200) return b;
  const n = PL.chunkCount(bytes.length);
  for (let i = 0; i < n; i += 1) {
    const r = await post(token, { action: 'chunk', id, index: i, data: bytes.subarray(i * PL.CHUNK_BYTES, (i + 1) * PL.CHUNK_BYTES).toString('base64') });
    assert.equal(r.status, 200, `potongan ${i}`);
  }
  return post(token, { action: 'finish', id });
}

test('unggah per potongan → daftar → unduh sama persis → hapus', async () => {
  const token = await newToken();
  assert.deepEqual((await (await get(token, 'music=list')).json()).tracks, []);
  const bytes = crypto.randomBytes(PL.CHUNK_BYTES * 2 + 1234);
  const fin = await upload(token, 'tr-abc123def', bytes, { art: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.equal(fin.status, 200);
  const done = await fin.json();
  assert.equal(done.track.chunks, 3);
  const list = await (await get(token, 'music=list')).json();
  assert.equal(list.tracks.length, 1);
  assert.equal(list.tracks[0].title, 'Lagu Uji');
  assert.equal(list.tracks[0].art, 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(list.used, bytes.length);
  assert.equal(list.limit, 3 * 1024 * 1024);
  const parts = [];
  for (let i = 0; i < 3; i += 1) {
    const r = await get(token, `music=chunk&id=tr-abc123def&i=${i}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/octet-stream');
    parts.push(Buffer.from(await r.arrayBuffer()));
  }
  assert.ok(Buffer.concat(parts).equals(bytes), 'isi lagu utuh');
  // Lagu yang sama diunggah lagi (perangkat lain): tidak diunggah ulang.
  const again = await (await post(token, { action: 'begin', track: { id: 'tr-abc123def', title: 'x', type: 'audio/mpeg', size: bytes.length } })).json();
  assert.equal(again.exists, true);
  // Akun lain tidak melihatnya.
  const other = await newToken();
  assert.deepEqual((await (await get(other, 'music=list')).json()).tracks, []);
  assert.equal((await get(other, 'music=chunk&id=tr-abc123def&i=0')).status, 404);
  assert.equal((await post(token, { action: 'delete', id: 'tr-abc123def' })).status, 200);
  assert.deepEqual((await (await get(token, 'music=list')).json()).tracks, []);
  assert.equal((await get(token, 'music=chunk&id=tr-abc123def&i=0')).status, 404, 'potongan ikut terhapus');
});

test('batas & galat: perlu masuk, ukuran, format, potongan salah, unggahan belum lengkap, ruang penuh', async () => {
  assert.equal((await get(null, 'music=list')).status, 401);
  assert.equal((await post(null, { action: 'begin' })).status, 401);
  const token = await newToken();
  const big = await post(token, { action: 'begin', track: { id: 'tr-besar0001', title: 'x', type: 'audio/mpeg', size: PL.MAX_TRACK_BYTES + 1 } });
  assert.equal(big.status, 413);
  assert.equal((await post(token, { action: 'begin', track: { id: 'tr-video0001', title: 'x', type: 'video/mp4', size: 1000 } })).status, 415);
  assert.equal((await post(token, { action: 'begin', track: { id: '../jahat', title: 'x', type: 'audio/mpeg', size: 1000 } })).status, 400);
  assert.equal((await post(token, { action: 'nyanyi' })).status, 400);
  const b = await post(token, { action: 'begin', track: { id: 'tr-kurang001', title: 'x', type: 'audio/mpeg', size: PL.CHUNK_BYTES + 10 } });
  assert.equal(b.status, 200);
  const wrong = await post(token, { action: 'chunk', id: 'tr-kurang001', index: 0, data: Buffer.alloc(100).toString('base64') });
  assert.equal(wrong.status, 400, 'ukuran potongan tidak sesuai');
  await post(token, { action: 'chunk', id: 'tr-kurang001', index: 0, data: Buffer.alloc(PL.CHUNK_BYTES).toString('base64') });
  const early = await post(token, { action: 'finish', id: 'tr-kurang001' });
  assert.equal(early.status, 409);
  assert.match((await early.json()).error, /1\/2/);
  assert.deepEqual((await (await get(token, 'music=list')).json()).tracks, [], 'belum selesai → belum tampil');
  // Ruang 3 MB: 2 MB + 2 MB tidak muat.
  assert.equal((await upload(token, 'tr-duamega01', crypto.randomBytes(2 * 1024 * 1024))).status, 200);
  const full = await post(token, { action: 'begin', track: { id: 'tr-duamega02', title: 'x', type: 'audio/mpeg', size: 2 * 1024 * 1024 } });
  assert.equal(full.status, 413);
  assert.match((await full.json()).error, /Ruang musik di akun penuh/);
});
