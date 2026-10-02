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

// Penggabungan ke database per fungsi (hash d:<akun>:<db>), "yang terbaru menang" per kunci.
// KEYS: ts (stempel waktu semua kunci), rev (revisi akun).
// ARGV: maxEntries, awalan hash database, awalan revisi database, lalu kelompok 5:
//   kunci, waktu, hapus(0/1), payload JSON, daftar database "target,lain" (dipisah koma).
// Entri ditulis ke database target dan dibuang dari database lain sekeluarga (mis. tugas yang
// pindah dari Kerja ke Pribadi). Untuk penghapusan, target = database yang masih memuat kunci.
const MERGE_DB_SCRIPT = `
local rev = redis.call('INCR', KEYS[2])
local max = tonumber(ARGV[1])
local written = {}
local touched = {}
local n = (#ARGV - 3) / 5
for i = 0, n - 1 do
  local b = 4 + i * 5
  local k = ARGV[b]
  local tstr = ARGV[b + 1]
  local t = tonumber(tstr)
  local del = ARGV[b + 2] == '1'
  local dbs = {}
  for id in string.gmatch(ARGV[b + 4], '[^,]+') do dbs[#dbs + 1] = id end
  local target = dbs[1]
  if del then
    for _, id in ipairs(dbs) do
      if redis.call('HEXISTS', ARGV[2] .. id, k) == 1 then
        target = id
        break
      end
    end
  end
  local doc = ARGV[2] .. target
  local cur = tonumber(redis.call('HGET', KEYS[1], k) or '-1')
  local exists = redis.call('HEXISTS', doc, k) == 1
  if t >= cur and (exists or redis.call('HLEN', doc) < max) then
    local d = 'false'
    if del then d = 'true' end
    redis.call('HSET', KEYS[1], k, tstr)
    redis.call('HSET', doc, k, '{"t":' .. tstr .. ',"d":' .. d .. ',"r":' .. rev .. ',"v":' .. ARGV[b + 3] .. '}')
    for _, id in ipairs(dbs) do
      if id ~= target then redis.call('HDEL', ARGV[2] .. id, k) end
    end
    touched[target] = true
    written[#written + 1] = k
  end
end
for id in pairs(touched) do redis.call('SET', ARGV[3] .. id, rev) end
return {rev, written}
`;

// Pindahkan dokumen tunggal lama ke database per fungsi, sekali per akun, atomik.
// KEYS: dokumen lama, penanda sudah dipindah, revisi akun, cadangan.
// ARGV: aturan pembagian (JSON, lihat databases.ROUTING), daftar id database (JSON),
//   awalan hash database, awalan revisi database, umur cadangan (detik).
// Nilai entri disalin apa adanya (tanpa decode/encode ulang). Dokumen lama tidak dihapus:
// diganti nama menjadi cadangan yang kedaluwarsa setelah ARGV[5] detik.
// Bila setelah pindah masih ada tulisan "nyasar" ke dokumen lama (permintaan ke server versi
// lama saat pergantian deploy), entrinya ikut dipindah bila lebih baru, lalu dokumen itu dihapus.
const MIGRATE_SCRIPT = `
local first = redis.call('EXISTS', KEYS[2]) == 0
if not first and redis.call('EXISTS', KEYS[1]) == 0 then return -1 end
local route = cjson.decode(ARGV[1])
local ids = cjson.decode(ARGV[2])
if first then
  redis.call('SET', KEYS[2], '1')
  local rev = redis.call('GET', KEYS[3]) or '0'
  for _, id in ipairs(ids) do redis.call('SET', ARGV[4] .. id, rev) end
  if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
end
local function dbOf(key, e)
  local i = string.find(key, ':', 1, true)
  local p = key
  if i then p = string.sub(key, 1, i - 1) end
  local fixed = route.fixed[p]
  if fixed then return fixed end
  local def = route.area[p]
  if not def then return route.fallback end
  if type(e) == 'table' and type(e.v) == 'table' then
    local v = e.v
    if v.area == 'kerja' or v.area == 'pribadi' then return v.area end
    if v.category == 'kerja' then return 'kerja' end
  end
  return def
end
local all = redis.call('HGETALL', KEYS[1])
local n = 0
for i = 1, #all, 2 do
  local k, raw = all[i], all[i + 1]
  local ok, e = pcall(cjson.decode, raw)
  if not ok then e = nil end
  local db = dbOf(k, e)
  local doc = ARGV[3] .. db
  if first then
    if redis.call('HSETNX', doc, k, raw) == 1 then n = n + 1 end
  else
    local keep = true
    local cur = redis.call('HGET', doc, k)
    if cur and type(e) == 'table' then
      local ok2, c = pcall(cjson.decode, cur)
      if ok2 and type(c) == 'table' and tonumber(c.t) and tonumber(e.t) and tonumber(c.t) > tonumber(e.t) then keep = false end
    end
    if keep and type(e) == 'table' then
      redis.call('HSET', doc, k, raw)
      local r = tonumber(e.r) or 0
      if r > tonumber(redis.call('GET', ARGV[4] .. db) or '0') then redis.call('SET', ARGV[4] .. db, tostring(r)) end
      n = n + 1
    end
  end
end
if first then
  redis.call('RENAME', KEYS[1], KEYS[4])
  redis.call('EXPIRE', KEYS[4], tonumber(ARGV[5]))
else
  redis.call('DEL', KEYS[1])
end
return n
`;

// Cek sesi + revisi dokumen dalam satu perintah (hemat kuota saat polling).
// KEYS[1] = kunci sesi. Mengembalikan {userId, rev, nama, sidik} atau {false, 0}.
const POLL_SCRIPT = `
local s = redis.call('GET', KEYS[1])
if not s then return {false, 0} end
local d = cjson.decode(s)
local r = redis.call('GET', 'dr:' .. d.u)
local n = type(d.n) == 'string' and d.n or false
local k = type(d.k) == 'string' and d.k or false
return {d.u, tonumber(r or '0'), n, k}
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
    exists: async (...keys) => Number(await call(['EXISTS', ...keys])),
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
      const [userId, rev, username, key] = await call(['EVAL', POLL_SCRIPT, '1', sessionKey]);
      return { userId: userId || null, rev: Number(rev) || 0, username: username || null, key: key || null };
    },
    async merge(keys, entries) {
      const args = ['EVAL', MERGE_SCRIPT, '3', keys.doc, keys.ts, keys.rev, String(MAX_DOC_ENTRIES)];
      for (const e of entries) args.push(e.k, String(e.t), e.d ? '1' : '0', e.payload);
      const [rev, written] = await call(args);
      return { rev: Number(rev), written: written || [] };
    },
    /** entries: {k, t, d, payload, dbs: [target, ...lain]} */
    async mergeDb(keys, entries) {
      const args = ['EVAL', MERGE_DB_SCRIPT, '2', keys.ts, keys.rev, String(MAX_DOC_ENTRIES), keys.dbPrefix, keys.dbRevPrefix];
      for (const e of entries) args.push(e.k, String(e.t), e.d ? '1' : '0', e.payload, e.dbs.join(','));
      const [rev, written] = await call(args);
      return { rev: Number(rev), written: written || [] };
    },
    /** @returns {number} -1 = sudah dipindah sebelumnya, selain itu jumlah entri yang dipindah */
    async migrate(keys, { routing, ids, backupTtl }) {
      return Number(await call(['EVAL', MIGRATE_SCRIPT, '4', keys.doc, keys.migrated, keys.rev, keys.backup,
        JSON.stringify(routing), JSON.stringify(ids), keys.dbPrefix, keys.dbRevPrefix, String(backupTtl)]));
    },
    async mget(list) {
      if (!list.length) return [];
      return (await call(['MGET', ...list])) || [];
    },
    /** HGETALL beberapa hash dalam satu permintaan. */
    async hgetallMany(list) {
      if (!list.length) return [];
      const res = await pipeline(list.map((k) => ['HGETALL', k]));
      return res.map((r) => pairsToObject(r || []));
    },
    async ttl(k) {
      return Number(await call(['TTL', k]));
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
    async exists(...keys) {
      return keys.filter((k) => alive(k)).length;
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
      if (!alive(sessionKey)) return { userId: null, rev: 0, username: null, key: null };
      const { u, n, k } = JSON.parse(data.get(sessionKey));
      return { userId: u, rev: Number(alive(`dr:${u}`) ? data.get(`dr:${u}`) : 0), username: n || null, key: k || null };
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
    async mergeDb(keys, entries) {
      const rev = Number(alive(keys.rev) ? data.get(keys.rev) : 0) + 1;
      data.set(keys.rev, String(rev));
      const ts = hash(keys.ts);
      const written = [];
      const touched = new Set();
      for (const e of entries) {
        let target = e.dbs[0];
        if (e.d) {
          const found = e.dbs.find((id) => alive(keys.dbPrefix + id) && data.get(keys.dbPrefix + id).has(e.k));
          if (found) target = found;
        }
        const doc = hash(keys.dbPrefix + target);
        const cur = ts.has(e.k) ? Number(ts.get(e.k)) : -1;
        if (e.t >= cur && (doc.has(e.k) || doc.size < MAX_DOC_ENTRIES)) {
          ts.set(e.k, String(e.t));
          doc.set(e.k, `{"t":${e.t},"d":${e.d},"r":${rev},"v":${e.payload}}`);
          for (const id of e.dbs) if (id !== target && alive(keys.dbPrefix + id)) data.get(keys.dbPrefix + id).delete(e.k);
          touched.add(target);
          written.push(e.k);
        }
      }
      for (const id of touched) data.set(keys.dbRevPrefix + id, String(rev));
      return { rev, written };
    },
    async migrate(keys, { routing, ids, backupTtl }) {
      const first = !alive(keys.migrated);
      if (!first && !alive(keys.doc)) return -1;
      if (first) {
        data.set(keys.migrated, '1');
        const rev = alive(keys.rev) ? data.get(keys.rev) : '0';
        for (const id of ids) data.set(keys.dbRevPrefix + id, String(rev));
        if (!alive(keys.doc)) return 0;
      }
      const route = (k, e) => {
        const p = k.includes(':') ? k.slice(0, k.indexOf(':')) : k;
        if (routing.fixed[p]) return routing.fixed[p];
        if (!routing.area[p]) return routing.fallback;
        const v = e && e.v;
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if (v.area === 'kerja' || v.area === 'pribadi') return v.area;
          if (v.category === 'kerja') return 'kerja';
        }
        return routing.area[p];
      };
      let n = 0;
      for (const [k, raw] of data.get(keys.doc)) {
        let e = null;
        try {
          e = JSON.parse(raw);
        } catch {
          /* rusak: pakai bawaan */
        }
        const db = route(k, e);
        const doc = hash(keys.dbPrefix + db);
        if (first) {
          if (!doc.has(k)) {
            doc.set(k, raw);
            n += 1;
          }
        } else if (e) {
          const cur = doc.has(k) ? JSON.parse(doc.get(k)) : null;
          if (!cur || !(Number(cur.t) > Number(e.t))) {
            doc.set(k, raw);
            const revKey = keys.dbRevPrefix + db;
            if (Number(e.r) > Number(alive(revKey) ? data.get(revKey) : 0)) data.set(revKey, String(e.r));
            n += 1;
          }
        }
      }
      if (first) {
        data.set(keys.backup, data.get(keys.doc));
        expiry.set(keys.backup, Date.now() + backupTtl * 1000);
      }
      data.delete(keys.doc);
      return n;
    },
    async mget(list) {
      return list.map((k) => (alive(k) ? data.get(k) : null));
    },
    async hgetallMany(list) {
      return list.map((k) => (alive(k) ? Object.fromEntries(data.get(k)) : {}));
    },
    async ttl(k) {
      if (!alive(k)) return -2;
      const at = expiry.get(k);
      return at ? Math.ceil((at - Date.now()) / 1000) : -1;
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

module.exports = { getStore, resetStore, upstash, memory, MERGE_SCRIPT, MERGE_DB_SCRIPT, MIGRATE_SCRIPT, POLL_SCRIPT, MAX_DOC_ENTRIES };
