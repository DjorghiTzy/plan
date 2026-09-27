// Integrasi SDK Anthropic sungguhan terhadap server Claude tiruan lokal:
// memastikan header beta, badan permintaan, dan aliran SSE diurai dengan benar.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const claude = require('../api/_lib/claude');
const coach = require('../api/_lib/coach');

const seen = [];
let mock;
let mockUrl;

function sse(res, events) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
}

const message = (content, stop) => ({
  id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5', content,
  stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 },
});

test.before(async () => {
  mock = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    seen.push({ url: req.url, headers: req.headers, body });
    if (body.stream) {
      sse(res, [
        { type: 'message_start', message: message([], null) },
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Lari santai ' } },
        { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '30 menit besok 05:30.' } },
        { type: 'content_block_stop', index: 0 },
        { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 9 } },
        { type: 'message_stop' },
      ]);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(message([{ type: 'text', text: JSON.stringify({ distance_km: 5.2, summary: 'ok' }) }], 'end_turn')));
  });
  await new Promise((r) => mock.listen(0, r));
  mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const Anthropic = require('@anthropic-ai/sdk').default;
  claude.setClientFactory(() => new Anthropic({ apiKey: 'sk-test', baseURL: mockUrl, maxRetries: 0 }));
});
test.after(() => mock.close());

test('ekstrak lewat SDK: header beta & badan permintaan', async () => {
  const run = await coach.extract({ image: { mediaType: 'image/png', data: 'iVBORw0KGgo=' }, context: {}, today: '2026-09-27' });
  assert.equal(run.distance_km, 5.2);
  const { url, headers, body } = seen[seen.length - 1];
  assert.match(url, /^\/v1\/messages/);
  assert.match(headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(headers['x-api-key'], 'sk-test');
  assert.equal(body.model, 'claude-opus-5');
  assert.equal(body.fallbacks, 'default');
  assert.equal(body.betas, undefined, 'betas dikirim sebagai header, bukan di badan');
  assert.deepEqual(body.thinking, { type: 'adaptive' });
  assert.equal(body.output_config.effort, 'low');
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.equal(body.messages[0].content[0].type, 'image');
});

test('chat lewat SDK: aliran SSE menjadi potongan teks', async () => {
  const parts = [];
  let started = false;
  const out = await coach.chat(
    { messages: [{ role: 'user', content: 'Kapan lari besok?' }], context: { a: 1 }, today: '2026-09-27', now: '20:00' },
    { onStart: () => { started = true; }, onText: (t) => parts.push(t) },
  );
  assert.ok(started);
  assert.equal(parts.join(''), 'Lari santai 30 menit besok 05:30.');
  assert.equal(out.stopReason, 'end_turn');
  const { body } = seen[seen.length - 1];
  assert.equal(body.stream, true);
  assert.deepEqual(body.cache_control, { type: 'ephemeral' });
  assert.equal(body.system.length, 2);
  assert.deepEqual(body.output_config, { effort: 'medium' });
});
