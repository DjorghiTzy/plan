// Uji API coach lari lewat server dev, dengan klien Claude tiruan (tanpa panggilan sungguhan).
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SYNC_STORE = 'memory';
process.env.COACH_DAILY_LIMIT = '6';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.KV_REST_API_URL;
delete process.env.UPSTASH_REDIS_REST_URL;
const { resetStore } = require('../api/_lib/store');
const claude = require('../api/_lib/claude');
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
    beta: {
      messages: {
        async create(params) {
          calls.push({ kind: 'create', params });
          if (mode === 'refusal') return { stop_reason: 'refusal', content: [] };
          if (mode === 'throw') throw new Error('boom');
          return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(RUN) }] };
        },
        stream(params) {
          calls.push({ kind: 'stream', params });
          const events = [
            { type: 'message_start', message: {} },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Halo ' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'pelari!' } },
          ];
          return {
            async* [Symbol.asyncIterator]() {
              if (mode === 'throw') throw new Error('gagal sebelum mulai');
              for (const e of events) {
                yield e;
                if (mode === 'midfail' && e.type === 'content_block_delta') throw new Error('putus di tengah');
              }
            },
            async finalMessage() {
              return { stop_reason: mode === 'refusal' ? 'refusal' : 'end_turn' };
            },
          };
        },
      },
    },
  };
}

let server;
let base;
test.before(async () => {
  resetStore();
  claude.setClientFactory(fakeClient);
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
  assert.deepEqual(await r.json(), { available: true, model: 'claude-opus-5', dailyLimit: 6 });
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
  const p = calls[0].params;
  assert.equal(p.model, 'claude-opus-5');
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.deepEqual(p.thinking, { type: 'adaptive' });
  assert.equal(p.output_config.format.type, 'json_schema');
  assert.equal(p.output_config.format.schema.additionalProperties, false);
  assert.equal(p.messages[0].content[0].source.media_type, 'image/jpeg');
  assert.match(p.messages[0].content[1].text, /2026-09-27/);
  assert.match(p.messages[0].content[1].text, /"age":28/);
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
  assert.match((await r.json()).error, /Coach/);
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
    messages: [{ role: 'assistant', content: 'sapaan lama' }, { role: 'user', content: 'Kapan aku lari besok?' }],
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /application\/x-ndjson/);
  const lines = (await r.text()).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.t), ['start', 'text', 'text', 'done']);
  assert.equal(lines.filter((l) => l.t === 'text').map((l) => l.v).join(''), 'Halo pelari!');
  const p = calls[0].params;
  assert.equal(p.model, 'claude-opus-5');
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.output_config, { effort: 'medium' });
  assert.deepEqual(p.messages, [{ role: 'user', content: 'Kapan aku lari besok?' }], 'awal assistant dibuang');
  assert.match(p.system[1].text, /2026-09-27, pukul 06:15/);
  assert.match(p.system[1].text, /"km":12/);
});

test('chat: galat sebelum & di tengah aliran, penolakan, pesan tidak valid', async () => {
  const token = await newToken();
  mode = 'ok';
  let r = await post(token, { action: 'chat', messages: [{ role: 'user', content: '' }] });
  assert.equal(r.status, 400);
  mode = 'throw';
  r = await post(token, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(r.status, 502);
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

test('batas harian per akun', async () => {
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
  claude.setClientFactory(null);
  const r = await post(token, { action: 'chat', messages: [{ role: 'user', content: 'hai' }] });
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'coach_off');
  claude.setClientFactory(fakeClient);
});
