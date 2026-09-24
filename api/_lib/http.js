/**
 * Pembantu HTTP untuk fungsi serverless Vercel (dan server dev lokal).
 * Hanya memakai API bawaan Node supaya tidak butuh dependensi.
 */
'use strict';

const MAX_BODY = 1024 * 1024;

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'error';
  }
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(data === undefined ? '' : JSON.stringify(data));
}

async function readJson(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    try {
      return JSON.parse(String(req.body));
    } catch {
      throw new HttpError(400, 'Isi permintaan bukan JSON yang valid.', 'bad_json');
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Data terlalu besar.', 'too_large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Isi permintaan bukan JSON yang valid.', 'bad_json');
  }
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function bearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(h);
  return m ? m[1] : null;
}

/**
 * Membungkus handler: cek metode, tangani HttpError menjadi JSON,
 * dan sembunyikan detail galat lain dari klien.
 */
function route(methods, fn) {
  return async function handler(req, res) {
    try {
      const impl = methods[req.method];
      if (!impl) {
        res.setHeader('Allow', Object.keys(methods).join(', '));
        throw new HttpError(405, 'Metode tidak didukung.', 'method');
      }
      await (typeof impl === 'function' ? impl(req, res) : fn(req, res));
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, { error: err.message, code: err.code });
      } else {
        console.error(err);
        send(res, 500, { error: 'Terjadi kesalahan di server. Coba lagi sebentar lagi.', code: 'server' });
      }
    }
  };
}

module.exports = { HttpError, send, readJson, query, clientIp, bearer, route, MAX_BODY };
