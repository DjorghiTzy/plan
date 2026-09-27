// Klien REST Gemini sungguhan terhadap server Gemini tiruan lokal:
// memastikan URL, header kunci, badan permintaan, aliran SSE, dan pemetaan galat.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const seen = [];
let reply = 'ok';
let queue = []; // status HTTP berurutan untuk permintaan berikutnya (lonjakan/kuota), lalu normal
let mock;

function sse(res, events) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const e of events) res.write(`data: ${JSON.stringify(e)}\r\n\r\n`);
  res.end();
}
const chunk = (text, finishReason) => ({ candidates: [{ content: { role: 'model', parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] });

test.before(async () => {
  mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    seen.push({ url: req.url, headers: req.headers, body });
    const forced = queue.shift();
    if (forced) {
      res.writeHead(forced, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: forced, message: 'This model is currently experiencing high demand.', status: forced === 429 ? 'RESOURCE_EXHAUSTED' : 'UNAVAILABLE' } }));
      return;
    }
    if (reply === 'quota') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } }));
      return;
    }
    if (reply === 'badkey') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } }));
      return;
    }
    if (req.url.includes(':streamGenerateContent')) {
      sse(res, [
        { candidates: [{ content: { role: 'model', parts: [{ text: 'rahasia pikiran', thought: true }] } }] },
        chunk('Lari santai '),
        chunk('30 menit besok 05:30.', 'STOP'),
      ]);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(reply === 'blocked'
      ? { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] }
      : chunk(JSON.stringify({ distance_km: 5.2, summary: 'ok' }), 'STOP')));
  });
  await new Promise((r) => mock.listen(0, r));
  process.env.GEMINI_API_KEY = 'kunci-uji';
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${mock.address().port}/v1beta`;
  process.env.GEMINI_RETRY_MS = '1';
});
test.after(() => mock.close());

const load = () => ({ gemini: require('../api/_lib/gemini'), coach: require('../api/_lib/coach') });

test('ekstrak: URL, header, dan badan permintaan Gemini', async () => {
  const { coach } = load();
  reply = 'ok';
  const run = await coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' }, context: {}, today: '2026-09-27' });
  assert.equal(run.distance_km, 5.2);
  const { url, headers, body } = seen[seen.length - 1];
  assert.equal(url, '/v1beta/models/gemini-flash-latest:generateContent');
  assert.equal(headers['x-goog-api-key'], 'kunci-uji');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseJsonSchema.type, 'object');
  assert.deepEqual(body.contents[0].parts[0], { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } });
  assert.ok(body.systemInstruction.parts[0].text.length > 50);
});

test('chat: aliran SSE jadi potongan teks, bagian "pikiran" dibuang', async () => {
  const { coach } = load();
  reply = 'ok';
  const parts = [];
  let started = false;
  const out = await coach.chat(
    { messages: [{ role: 'user', content: 'Kapan lari besok?' }], context: { a: 1 }, today: '2026-09-27', now: '20:00' },
    { onStart: () => { started = true; }, onText: (t) => parts.push(t) },
  );
  assert.ok(started);
  assert.equal(parts.join(''), 'Lari santai 30 menit besok 05:30.');
  assert.equal(out.stopReason, 'end_turn');
  const { url, body } = seen[seen.length - 1];
  assert.equal(url, '/v1beta/models/gemini-flash-latest:streamGenerateContent?alt=sse');
  assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'Kapan lari besok?' }] }]);
  assert.equal(body.systemInstruction.parts.length, 2);
});

test('galat & blokir dipetakan ke pesan Indonesia', async () => {
  const { gemini, coach } = load();
  reply = 'quota';
  await assert.rejects(coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' } }), (err) => {
    const d = gemini.describeError(err);
    return d.status === 429 && d.code === 'coach_busy';
  });
  reply = 'badkey';
  await assert.rejects(coach.chat({ messages: [{ role: 'user', content: 'hai' }] }, { onStart() {}, onText() {} }), (err) => {
    const d = gemini.describeError(err);
    return d.status === 503 && d.code === 'coach_key' && /GEMINI_API_KEY/.test(d.message);
  });
  reply = 'blocked';
  await assert.rejects(coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' } }), (err) => err.status === 422);
});

const models = (from) => seen.slice(from).map((r) => r.url.replace(/^\/v1beta\/models\/|:.*$/g, ''));

test('lonjakan 503: diulang sekali pada model yang sama, lalu berhasil', async () => {
  const { coach } = load();
  reply = 'ok';
  queue = [503];
  const from = seen.length;
  const run = await coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' }, today: '2026-09-27' });
  assert.equal(run.distance_km, 5.2);
  assert.deepEqual(models(from), ['gemini-flash-latest', 'gemini-flash-latest']);
});

test('model utama tetap penuh: pindah ke model cadangan (chat mengalir)', async () => {
  const { gemini, coach } = load();
  assert.deepEqual(gemini.MODELS, ['gemini-flash-latest', 'gemini-flash-lite-latest']);
  reply = 'ok';
  queue = [503, 503];
  const from = seen.length;
  const parts = [];
  const out = await coach.chat({ messages: [{ role: 'user', content: 'hai' }] }, { onStart() {}, onText: (t) => parts.push(t) });
  assert.equal(out.stopReason, 'end_turn');
  assert.equal(parts.join(''), 'Lari santai 30 menit besok 05:30.');
  assert.deepEqual(models(from), ['gemini-flash-latest', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
  assert.match(seen[seen.length - 1].url, /gemini-flash-lite-latest:streamGenerateContent\?alt=sse$/);
});

test('kuota habis (429): langsung ke model cadangan tanpa mengulang', async () => {
  const { coach } = load();
  reply = 'ok';
  queue = [429];
  const from = seen.length;
  await coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' }, today: '2026-09-27' });
  assert.deepEqual(models(from), ['gemini-flash-latest', 'gemini-flash-lite-latest']);
});

test('galat permanen (kunci salah) tidak diulang; semua model gagal → galat terakhir', async () => {
  const { gemini, coach } = load();
  reply = 'badkey';
  let from = seen.length;
  await assert.rejects(coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' } }), (err) => err.status === 400);
  assert.equal(seen.length - from, 1);
  reply = 'ok';
  queue = [503, 503, 503, 503];
  from = seen.length;
  await assert.rejects(coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' } }), (err) => gemini.describeError(err).code === 'coach_unavailable');
  assert.equal(seen.length - from, 4);
  queue = [];
});
