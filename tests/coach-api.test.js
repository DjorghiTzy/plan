// Uji API coach lari lewat server dev, dengan klien Gemini tiruan (tanpa panggilan sungguhan).
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SYNC_STORE = 'memory';
process.env.COACH_DAILY_LIMIT = '6';
delete process.env.GEMINI_API_KEY;
delete process.env.GOOGLE_API_KEY;
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const { resetStore } = require('../api/_lib/store');
const gemini = require('../api/_lib/gemini');
const { createServer } = require('../scripts/dev-server');

const calls = [];
let mode = 'ok';
const RUN = {
  is_activity_screenshot: true, activity_type: 'Run', source_app: 'Strava', title: 'Lunch Run', date: '2026-08-29', start_time: '12:33',
  distance_km: 0.31, moving_time_sec: 250, elapsed_time_sec: null, avg_pace_sec_per_km: 806, avg_heart_rate: 143, max_heart_rate: null,
  calories: 68, elevation_gain_m: 0, avg_cadence_spm: null, location: 'Bangka-Belitung Islands', splits: [],
  summary: 'Lari pendek 0,31 km.', notes: null,
};
function fakeClient() {
  return {
    async generate(body) {
      calls.push({ kind: 'generate', body });
      if (mode === 'refusal') return { text: '', finishReason: 'SAFETY', blocked: true };
      if (mode === 'throw') throw Object.assign(new Error('boom'), { status: 503 });
      if (body.generationConfig.responseJsonSchema.properties.recommended) {
        const advice = mode === 'routes-odd'
          ? { recommended: 'Z', summary: 'Pilih rute — yang sepi.', notes: [{ id: 'Z', note: 'x' }, { id: 'B', note: 'Jalan kecil.' }] }
          : { recommended: 'B', summary: 'Ambil Rute B, lebih sedikit belokan. Jaga zona 2.', notes: [{ id: 'A', note: 'Lewat jalan raya.' }, { id: 'B', note: 'Jalan perumahan.' }] };
        return { text: JSON.stringify(advice), finishReason: 'STOP', blocked: false };
      }
      return { text: JSON.stringify(RUN), finishReason: 'STOP', blocked: false };
    },
    async* stream(body) {
      calls.push({ kind: 'stream', body });
      if (mode === 'throw') throw Object.assign(new Error('gagal sebelum mulai'), { status: 429 });
      if (mode === 'refusal-early') {
        yield { done: true, finishReason: 'SAFETY', blocked: true };
        return;
      }
      yield { text: 'Halo ' };
      if (mode === 'midfail') throw new Error('putus di tengah');
      yield { text: 'pelari!' };
      yield { done: true, finishReason: mode === 'refusal' ? 'SAFETY' : 'STOP', blocked: mode === 'refusal' };
    },
  };
}

let server;
let base;
test.before(async () => {
  resetStore();
  gemini.setClientFactory(fakeClient);
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

let seq = 0;
async function newToken() {
  const res = await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.0.${(seq += 1)}` },
    body: JSON.stringify({ email: `coach${seq}.${Date.now()}@contoh.id`, password: 'rahasia123' }),
  });
  return (await res.json()).token;
}
const post = (token, body) => fetch(`${base}/api/coach`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const IMG = { mediaType: 'image/jpeg', data: Buffer.from('bukan gambar sungguhan').toString('base64') };

test('perlu masuk akun', async () => {
  const r = await post(null, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(r.status, 401);
});

test('GET melaporkan coach aktif & model', async () => {
  const token = await newToken();
  const r = await fetch(`${base}/api/coach`, { headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual(await r.json(), { available: true, model: 'gemini-flash-latest', dailyLimit: 6 });
  const h = await (await fetch(`${base}/api/health`)).json();
  assert.equal(h.coach, true);
});

test('ekstrak tangkapan layar: parameter & hasil', async () => {
  const token = await newToken();
  mode = 'ok';
  calls.length = 0;
  const r = await post(token, { action: 'extract', image: IMG, context: { profile: { age: 28 } }, today: '2026-09-27' });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.run.distance_km, 0.31);
  assert.equal(data.run.avg_heart_rate, 143);
  assert.equal(data.remaining, 5);
  const b = calls[0].body;
  assert.match(b.systemInstruction.parts[0].text, /tangkapan layar/);
  assert.equal(b.generationConfig.responseMimeType, 'application/json');
  assert.equal(b.generationConfig.responseJsonSchema.additionalProperties, false);
  assert.equal(b.contents[0].role, 'user');
  assert.equal(b.contents[0].parts[0].inlineData.mimeType, 'image/jpeg');
  assert.match(b.contents[0].parts[1].text, /2026-09-27/);
  assert.match(b.contents[0].parts[1].text, /"age":28/);
});

test('ekstrak: gambar tidak valid & penolakan', async () => {
  const token = await newToken();
  let r = await post(token, { action: 'extract', image: { mediaType: 'image/bmp', data: 'AAAA' } });
  assert.equal(r.status, 400);
  r = await post(token, { action: 'extract', image: { mediaType: 'image/png', data: 'bukan base64!!' } });
  assert.equal(r.status, 400);
  mode = 'refusal';
  r = await post(token, { action: 'extract', image: IMG });
  assert.equal(r.status, 422);
  mode = 'throw';
  r = await post(token, { action: 'extract', image: IMG });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /Gemini/);
  mode = 'ok';
});

test('chat mengalir sebagai NDJSON', async () => {
  const token = await newToken();
  mode = 'ok';
  calls.length = 0;
  const r = await post(token, {
    action: 'chat',
    today: '2026-09-27',
    now: '06:15',
    context: { runs: { last7: { km: 12 } } },
    messages: [
      { role: 'assistant', content: 'sapaan lama' },
      { role: 'user', content: 'Lari kemarin 5 km' },
      { role: 'assistant', content: 'Mantap' },
      { role: 'user', content: 'Kapan aku lari besok?' },
      { role: 'user', content: 'Pagi atau sore?' },
    ],
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/x-ndjson/);
  const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.t), ['start', 'text', 'text', 'done']);
  assert.equal(lines.filter((l) => l.t === 'text').map((l) => l.v).join(''), 'Halo pelari!');
  const b = calls[0].body;
  assert.deepEqual(b.contents, [
    { role: 'user', parts: [{ text: 'Lari kemarin 5 km' }] },
    { role: 'model', parts: [{ text: 'Mantap' }] },
    { role: 'user', parts: [{ text: 'Kapan aku lari besok?' }, { text: 'Pagi atau sore?' }] },
  ], 'awal model dibuang, peran "model", giliran sama digabung');
  assert.match(b.systemInstruction.parts[0].text, /coach lari/);
  assert.match(b.systemInstruction.parts[1].text, /2026-09-27, pukul 06:15/);
  assert.match(b.systemInstruction.parts[1].text, /"km":12/);
});

test('chat: galat sebelum & di tengah aliran, penolakan, pesan tidak valid', async () => {
  const token = await newToken();
  mode = 'ok';
  let r = await post(token, { action: 'chat', messages: [{ role: 'user', content: '' }] });
  assert.equal(r.status, 400);
  mode = 'throw';
  r = await post(token, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(r.status, 429, 'kuota gratis Gemini habis → 429');
  mode = 'refusal-early';
  r = await post(token, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(r.status, 422, 'diblokir sebelum ada teks → JSON 422');
  mode = 'midfail';
  r = await post(token, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  let lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[lines.length - 1].t, 'error');
  mode = 'refusal';
  r = await post(token, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines[lines.length - 1].t, 'error');
  mode = 'ok';
});

test('saran rute: data rute & konteks sampai ke Gemini, pilihan dijaga dari daftar', async () => {
  mode = 'ok';
  const token = await newToken();
  const routes = [
    { id: 'A', km: 5.12, diff_m: 120, direction: 'timur laut', turns: 14, overlap_pct: 3, est_min: 36, streets: ['Jalan Raya Sudirman', 'Jalan Merdeka'] },
    { id: 'B', km: 4.95, diff_m: -50, direction: 'barat', turns: 6, overlap_pct: 0, est_min: 35, streets: ['Gang Mawar'] },
  ];
  calls.length = 0;
  const r = await post(token, { action: 'routes', routes, target: 5, context: { profile: { age: 28 } }, today: '2026-09-27', now: '05:10' });
  assert.equal(r.status, 200);
  const data = await r.json();
  assert.equal(data.advice.recommended, 'B');
  assert.match(data.advice.summary, /Rute B/);
  assert.deepEqual(data.advice.notes.map((n) => n.id), ['A', 'B']);
  assert.ok(Number.isFinite(data.remaining));
  const body = calls[0].body;
  assert.deepEqual(body.generationConfig.responseJsonSchema.properties.recommended.enum, ['A', 'B']);
  const text = body.contents[0].parts[0].text;
  assert.match(text, /Target lari: 5 km/);
  assert.match(text, /pukul 05:10/);
  assert.match(text, /Jalan Raya Sudirman/);
  assert.match(text, /"age":28/);
  assert.match(body.systemInstruction.parts[0].text, /rute lari putar/);

  mode = 'routes-odd';
  const odd = await (await post(token, { action: 'routes', routes, target: 5 })).json();
  assert.equal(odd.advice.recommended, 'A', 'pilihan di luar daftar → rute pertama');
  assert.deepEqual(odd.advice.notes.map((n) => n.id), ['B']);
  mode = 'ok';

  for (const bad of [[], [{ id: 'X' }], [{ id: 'K' }], Array.from({ length: 11 }, (_, i) => ({ id: 'ABCDEFGHIJ'[i % 10] }))]) {
    const res = await post(token, { action: 'routes', routes: bad });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'bad_routes');
  }
});

test('batas harian per akun', async () => {
  mode = 'ok';
  const token = await newToken();
  mode = 'ok';
  for (let i = 0; i < 6; i += 1) {
    const r = await post(token, { action: 'extract', image: IMG });
    assert.equal(r.status, 200, `permintaan ke-${i + 1}`);
  }
  const over = await post(token, { action: 'extract', image: IMG });
  assert.equal(over.status, 429);
  assert.equal((await over.json()).code, 'coach_quota');
});

test('tanpa kunci API: coach nonaktif', async () => {
  const token = await newToken();
  gemini.setClientFactory(null);
  const r = await post(token, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'coach_off');
  gemini.setClientFactory(fakeClient);
});
