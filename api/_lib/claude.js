/**
 * Klien Claude untuk fitur Coach Lari.
 * Kunci API hanya dibaca di server (ANTHROPIC_API_KEY di Vercel) dan tidak pernah dikirim ke browser.
 */
'use strict';

const MODEL = process.env.COACH_MODEL || 'claude-opus-5';
// Bila model menolak (pengaman keamanan), server Anthropic mengulang permintaan di model cadangan yang disarankan.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

let factory = null;

function sdk() {
  const mod = require('@anthropic-ai/sdk');
  return mod.default || mod;
}

/** Apakah coach bisa dipakai (kunci API terpasang, atau klien tiruan saat uji). */
function available() {
  return Boolean(factory || process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (factory) return factory();
  const Anthropic = sdk();
  return new Anthropic({ maxRetries: 2 });
}

/** Hanya untuk uji & server dev lokal: ganti klien dengan tiruan. */
function setClientFactory(fn) {
  factory = fn;
}

/**
 * Terjemahkan galat SDK menjadi pesan untuk pengguna (bahasa Indonesia) + status HTTP.
 * @returns {{status: number, message: string, code: string}}
 */
function describeError(err) {
  let Anthropic = null;
  try {
    Anthropic = sdk();
  } catch {
    /* SDK tidak terpasang (mis. uji dengan klien tiruan) */
  }
  if (Anthropic && err instanceof Anthropic.AuthenticationError) {
    return { status: 503, code: 'coach_key', message: 'Kunci API coach tidak valid. Periksa ANTHROPIC_API_KEY di Vercel.' };
  }
  if (Anthropic && err instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, code: 'coach_key', message: 'Kunci API coach tidak punya akses ke model ini.' };
  }
  if (Anthropic && err instanceof Anthropic.RateLimitError) {
    return { status: 429, code: 'coach_busy', message: 'Coach sedang sibuk (batas permintaan). Coba lagi sebentar lagi.' };
  }
  if (Anthropic && err instanceof Anthropic.BadRequestError) {
    return { status: 400, code: 'coach_bad_request', message: 'Permintaan ke coach ditolak. Coba gambar atau pertanyaan lain.' };
  }
  if (Anthropic && err instanceof Anthropic.APIError && err.status >= 500) {
    return { status: 502, code: 'coach_unavailable', message: 'Layanan coach sedang gangguan. Coba lagi beberapa menit lagi.' };
  }
  if (Anthropic && err instanceof Anthropic.APIConnectionError) {
    return { status: 502, code: 'coach_unavailable', message: 'Tidak bisa menghubungi layanan coach. Coba lagi sebentar lagi.' };
  }
  return { status: 502, code: 'coach_unavailable', message: 'Coach sedang tidak bisa dihubungi. Coba lagi sebentar lagi.' };
}

module.exports = { MODEL, FALLBACK_BETA, available, getClient, setClientFactory, describeError };
