/**
 * Penyimpanan data server.
 *  - Upstash Redis (REST) di produksi: aktif otomatis bila variabel lingkungan
 *    KV_REST_API_URL/KV_REST_API_TOKEN atau UPSTASH_REDIS_REST_URL/TOKEN ada
 *    (terpasang sendiri saat menambahkan integrasi Upstash di Vercel).
 *  - Memori: untuk pengembangan lokal dan pengujian (data hilang saat server mati).
 *
 * Penggabungan dokumen dilakukan per kunci dengan aturan "yang terbaru menang"
 * (last-write-wins) secara atomik: skrip Lua di Redis, satu thread di memori.
 */
'use strict';

const MAX_DOC_ENTRIES = 20000;

// KEYS: doc, ts, rev. ARGV: maxEntries, lalu kelompok 4: kunci, waktu, hapus(0/1), payload JSON.
const MERGE_SCRIPT = `
local rev = redis.call('INCR', KEYS[3])
local size = redis.call('HLEN', KEYS[1])
local max = tonumber(ARGV[1])
local written = {}
local n = (#ARGV - 1) / 4
for i = 0, n - 1 do
  local b = 2 + i * 4
  local k = ARGV[b]
  local tstr = ARGV[b + 1]
  local t = tonumber(tstr)
  local cur = tonumber(redis.call('HGET', KEYS[2], k) or '-1')
  local exists = cur >= 0
  if t >= cur and (exists or size < max) then
    if not exists then size = size + 1 end
    local d = 'false'
    if ARGV[b + 2] == '1' then d = 'true' end
    redis.call('HSET', KEYS[2], k, tstr)
    redis.call('HSET', KEYS[1], k, '{"t":' .. tstr .. ',"d":' .. d .. ',"r":' .. rev .. ',"v":' .. ARGV[b + 3] .. '}')
    written[#written + 1] = k
  end
end
return {rev, written}
`;

// Cek sesi + revisi dokumen dalam satu perintah (hemat kuota saat polling).
// KEYS[1] = kunci sesi. Mengembalikan {userId, rev} atau {false, 0}.
const POLL_SCRIPT = `
local s = redis.call('GET', KEYS[1])
if not s then return {false, 0} end
local u = cjson.decode(s).u
local r = redis.call('GET', 'dr:' .. u)
return {u, tonumber(r or '0')}
`;

function pairsToObject(arr) {
  const out = {};
  for (let i = 0; i + 1 < arr.length; i += 2) out[arr[i]] = arr[i + 1];
  return out;
}

function upstash(url, token) {
  const base = url.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function call(args) {
    const res = await fetch(base, { method: 'POST', headers, body: JSON.stringify(args) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(`Upstash: ${body.error || res.status}`);
    return body.result;
  }

  async function pipeline(commands) {
    const res = await fetch(`${base}/pipeline`, { method: 'POST', headers, body: JSON.stringify(commands) });
    const body = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(body)) throw new Error(`Upstash pipeline: ${res.status}`);
    return body.map((r) => {
      if (r.error) throw new Error(`Upstash: ${r.error}`);
      return r.result;
    });
  }

  return {
    kind: 'redis',
    get: (k) => call(['GET', k]),
    async set(k, v, { ex, nx } = {}) {
      const args = ['SET', k, v];
      if (ex) args.push('EX', String(ex));
      if (nx) args.push('NX');
      return (await call(args)) === 'OK';
    },
    del: (...keys) => call(['DEL', ...keys]),
    getdel: (k) => call(['GETDEL', k]),
    async hit(k, seconds) {
      const [count, ttl] = await pipeline([['INCR', k], ['TTL', k]]);
      if (Number(ttl) < 0) await call(['EXPIRE', k, String(seconds)]);
      return Number(count);
    },
    sadd: (k, m) => call(['SADD', k, m]),
    srem: (k, m) => call(['SREM', k, m]),
    async smembers(k) {
      return (await call(['SMEMBERS', k])) || [];
    },
    async rev(k) {
      return Number((await call(['GET', k])) || 0);
    },
    async hgetall(k) {
      return pairsToObject((await call(['HGETALL', k])) || []);
    },
    async poll(sessionKey) {
      const [userId, rev] = await call(['EVAL', POLL_SCRIPT, '1', sessionKey]);
      return { userId: userId || null, rev: Number(rev) || 0 };
    },
    async merge(keys, entries) {
      const args = ['EVAL', MERGE_SCRIPT, '3', keys.doc, keys.ts, keys.rev, String(MAX_DOC_ENTRIES)];
      for (const e of entries) args.push(e.k, String(e.t), e.d ? '1' : '0', e.payload);
      const [rev, written] = await call(args);
      return { rev: Number(rev), written: written || [] };
    },
  };
}

function memory() {
  const data = new Map();
  const expiry = new Map();
  const alive = (k) => {
    const at = expiry.get(k);
    if (at && at <= Date.now()) {
      data.delete(k);
      expiry.delete(k);
    }
    return data.has(k);
  };
  const hash = (k) => {
    if (!alive(k)) data.set(k, new Map());
    return data.get(k);
  };
  const setOf = (k) => {
    if (!alive(k)) data.set(k, new Set());
    return data.get(k);
  };

  return {
    kind: 'memory',
    async get(k) {
      return alive(k) ? data.get(k) : null;
    },
    async set(k, v, { ex, nx } = {}) {
      if (nx && alive(k)) return false;
      data.set(k, String(v));
      if (ex) expiry.set(k, Date.now() + ex * 1000);
      else expiry.delete(k);
      return true;
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) {
        if (alive(k)) n += 1;
        data.delete(k);
        expiry.delete(k);
      }
      return n;
    },
    async getdel(k) {
      const v = alive(k) ? data.get(k) : null;
      data.delete(k);
      expiry.delete(k);
      return v;
    },
    async hit(k, seconds) {
      const n = Number(alive(k) ? data.get(k) : 0) + 1;
      data.set(k, String(n));
      if (!expiry.has(k)) expiry.set(k, Date.now() + seconds * 1000);
      return n;
    },
    async sadd(k, m) {
      setOf(k).add(m);
    },
    async srem(k, m) {
      if (alive(k)) data.get(k).delete(m);
    },
    async smembers(k) {
      return alive(k) ? [...data.get(k)] : [];
    },
    async rev(k) {
      return Number(alive(k) ? data.get(k) : 0);
    },
    async hgetall(k) {
      return alive(k) ? Object.fromEntries(data.get(k)) : {};
    },
    async poll(sessionKey) {
      if (!alive(sessionKey)) return { userId: null, rev: 0 };
      const { u } = JSON.parse(data.get(sessionKey));
      return { userId: u, rev: Number(alive(`dr:${u}`) ? data.get(`dr:${u}`) : 0) };
    },
    async merge(keys, entries) {
      const rev = Number(alive(keys.rev) ? data.get(keys.rev) : 0) + 1;
      data.set(keys.rev, String(rev));
      const doc = hash(keys.doc);
      const ts = hash(keys.ts);
      const written = [];
      for (const e of entries) {
        const cur = ts.has(e.k) ? Number(ts.get(e.k)) : -1;
        const exists = cur >= 0;
        if (e.t >= cur && (exists || doc.size < MAX_DOC_ENTRIES)) {
          ts.set(e.k, String(e.t));
          doc.set(e.k, `{"t":${e.t},"d":${e.d},"r":${rev},"v":${e.payload}}`);
          written.push(e.k);
        }
      }
      return { rev, written };
    },
  };
}

let cached;

/** @returns {object|null} null bila sinkronisasi belum dikonfigurasi. */
function getStore() {
  if (cached !== undefined) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) cached = upstash(url, token);
  else if (process.env.SYNC_STORE === 'memory' || !process.env.VERCEL) cached = memory();
  else cached = null;
  return cached;
}

function resetStore() {
  cached = undefined;
}

module.exports = { getStore, resetStore, upstash, memory, MERGE_SCRIPT, POLL_SCRIPT, MAX_DOC_ENTRIES };
