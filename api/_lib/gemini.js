/**
 * Klien Gemini API (Google) untuk fitur Coach Lari, lewat REST dengan `fetch` bawaan Node (tanpa dependensi).
 * Kunci API hanya dibaca di server (GEMINI_API_KEY di Vercel) dan tidak pernah dikirim ke browser.
 */
'use strict';

const { TextDecoder } = require('node:util');

// Alias resmi yang selalu menunjuk model Flash terbaru, jadi tidak ikut pensiun saat model lama dihentikan.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const TIMEOUT_MS = 55000; // di bawah batas 60 detik fungsi Vercel

class GeminiError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    this.reason = reason || '';
  }
}

let factory = null;

const apiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

/** Apakah coach bisa dipakai (kunci API terpasang, atau klien tiruan saat uji). */
function available() {
  return Boolean(factory || apiKey());
}

/** Hanya untuk uji & server dev lokal: ganti klien dengan tiruan. */
function setClientFactory(fn) {
  factory = fn;
}

async function call(method, body, { stream = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(MODEL)}:${method}${stream ? '?alt=sse' : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify(body),
      signal: globalThis.AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new GeminiError(0, err && err.name === 'TimeoutError' ? 'timeout' : 'network', 'network');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const e = data.error || {};
    throw new GeminiError(res.status, e.message || `HTTP ${res.status}`, e.status || '');
  }
  return res;
}

const BLOCKED = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION', 'IMAGE_SAFETY']);

/** Teks jawaban (tanpa bagian "pikiran") + alasan selesai dari satu respons/potongan. */
function readResponse(data) {
  const cand = (data.candidates || [])[0] || {};
  const parts = (cand.content && cand.content.parts) || [];
  return {
    text: parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join(''),
    finishReason: cand.finishReason || null,
    blocked: Boolean((data.promptFeedback && data.promptFeedback.blockReason) || BLOCKED.has(cand.finishReason)),
  };
}

/** Pengurai Server-Sent Events: setiap event `data: {json}`. */
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let m;
    while ((m = /\r?\n\r?\n/.exec(buf))) {
      const block = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (data) yield JSON.parse(data);
    }
  }
  const rest = buf.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
  if (rest.trim()) yield JSON.parse(rest);
}

function restClient() {
  return {
    /** @returns {Promise<{text: string, finishReason: string|null, blocked: boolean}>} */
    async generate(body) {
      const res = await call('generateContent', body);
      return readResponse(await res.json());
    },
    /** Potongan teks satu per satu; objek terakhir berisi {done: true, finishReason, blocked}. */
    async* stream(body) {
      const res = await call('streamGenerateContent', body, { stream: true });
      let finishReason = null;
      let blocked = false;
      for await (const data of sseEvents(res.body)) {
        const r = readResponse(data);
        if (r.finishReason) finishReason = r.finishReason;
        if (r.blocked) blocked = true;
        if (r.text) yield { text: r.text };
      }
      yield { done: true, finishReason, blocked };
    },
  };
}

function getClient() {
  return factory ? factory() : restClient();
}

/**
 * Terjemahkan galat menjadi pesan untuk pengguna (bahasa Indonesia) + status HTTP.
 * @returns {{status: number, message: string, code: string}}
 */
function describeError(err) {
  const status = err && err.status;
  const msg = String((err && err.message) || '');
  if (status === 400 && /api key/i.test(msg)) {
    return { status: 503, code: 'coach_key', message: 'Kunci API Gemini tidak valid. Periksa GEMINI_API_KEY di Vercel.' };
  }
  if (status === 401 || status === 403) {
    return { status: 503, code: 'coach_key', message: 'Kunci API Gemini ditolak atau tidak punya akses ke model ini.' };
  }
  if (status === 429) {
    return { status: 429, code: 'coach_busy', message: 'Batas pemakaian Gemini tercapai (kuota gratis per menit/hari). Coba lagi sebentar lagi.' };
  }
  if (status === 404) {
    return { status: 502, code: 'coach_model', message: `Model ${MODEL} tidak ditemukan. Periksa GEMINI_MODEL.` };
  }
  if (status === 400) {
    return { status: 400, code: 'coach_bad_request', message: 'Permintaan ke coach ditolak. Coba gambar atau pertanyaan lain.' };
  }
  if (status >= 500) {
    return { status: 502, code: 'coach_unavailable', message: 'Layanan Gemini sedang sibuk atau gangguan. Coba lagi beberapa menit lagi.' };
  }
  return { status: 502, code: 'coach_unavailable', message: 'Coach sedang tidak bisa dihubungi. Coba lagi sebentar lagi.' };
}

module.exports = { MODEL, GeminiError, available, getClient, setClientFactory, describeError, readResponse, sseEvents };
