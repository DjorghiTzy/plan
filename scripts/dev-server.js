#!/usr/bin/env node
/**
 * Server pengembangan lokal: menyajikan berkas statis dan menjalankan fungsi /api
 * seperti di Vercel. Tanpa variabel Upstash, data akun disimpan di memori.
 *
 *   npm run dev            → http://localhost:5173
 *   PORT=8080 npm run dev
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const API = path.join(ROOT, 'api');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT) || /[\\/](api|scripts|tests|node_modules|\.git)([\\/]|$)/.test(file.slice(ROOT.length))) {
    res.statusCode = 404;
    res.end('Tidak ditemukan');
    return;
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('Tidak ditemukan');
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(data);
  });
}

/** Terapkan header dari vercel.json (CSP dll.) agar perilaku lokal sama dengan produksi. */
const HEADER_RULES = (() => {
  try {
    const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    return (conf.headers || []).map((r) => ({
      re: new RegExp(`^${r.source.replace(/\(\.\*\)/g, '.*').replace(/\//g, '\\/')}$`),
      headers: r.headers,
    }));
  } catch {
    return [];
  }
})();

/**
 * Jalankan middleware.js seperti di Vercel. Berkasnya modul ES, jadi dimuat lewat
 * data: URL; sesi diperiksa ke penyimpanan server dev (memori atau Upstash).
 */
let middlewarePromise = null;
function loadMiddleware() {
  if (!middlewarePromise) {
    const src = fs.readFileSync(path.join(ROOT, 'middleware.js'), 'utf8');
    middlewarePromise = import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
    globalThis.__rhVerifySession = async (token) => {
      const { getStore } = require('../api/_lib/store');
      const store = getStore();
      if (!store) return false;
      const hash = require('node:crypto').createHash('sha256').update(token).digest('hex');
      return Boolean(await store.get(`sess:${hash}`));
    };
  }
  return middlewarePromise;
}

async function runMiddleware(req, res) {
  const mod = await loadMiddleware();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const out = await mod.default(new Request(`http://localhost${req.url}`, { method: req.method, headers }));
  if (out.headers.get('x-middleware-next') === '1') return true;
  res.statusCode = out.status;
  out.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await out.arrayBuffer()));
  return false;
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    for (const rule of HEADER_RULES) {
      if (rule.re.test(url.pathname)) rule.headers.forEach((h) => res.setHeader(h.key, h.value));
    }
    const m = /^\/api\/([a-z-]+)\/?$/.exec(url.pathname);
    if (!m) {
      try {
        if (await runMiddleware(req, res)) serveStatic(req, res);
      } catch (err) {
        console.error(err);
        res.statusCode = 500;
        res.end('Middleware gagal');
      }
      return;
    }
    const file = path.join(API, `${m[1]}.js`);
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Endpoint tidak ditemukan.', code: 'not_found' }));
      return;
    }
    Promise.resolve(require(file)(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5173);
  createServer().listen(port, () => {
    const { getStore } = require('../api/_lib/store');
    const store = getStore();
    console.log(`Rencana Harian berjalan di http://localhost:${port}`);
    console.log(`Penyimpanan akun: ${store ? store.kind : 'nonaktif'}`);
    if (process.env.ALLOWED_EMAILS) console.log(`Mode pribadi: hanya ${process.env.ALLOWED_EMAILS}`);
  });
}

module.exports = { createServer };
