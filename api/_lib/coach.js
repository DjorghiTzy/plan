/**
 * Coach Lari: baca tangkapan layar aplikasi olahraga (Strava, dll.) menjadi data lari,
 * dan percakapan analisis latihan berdasarkan data kesehatan pengguna.
 */
'use strict';

const { HttpError } = require('./http');
const gemini = require('./gemini');

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CONTEXT_CHARS = 60000;
const MAX_TURNS = 30;
const MAX_MESSAGE_CHARS = 6000;

const COACH_SYSTEM = `Kamu adalah coach lari pribadi di aplikasi Rencana Harian. Penggunamu pelari rekreasional di Indonesia. Jawab dalam bahasa Indonesia yang santai tapi jelas, sapa dengan "kamu".

Bersama pesan ini ada data pengguna dalam JSON: profil kesehatan (usia, berat, tinggi, detak jantung istirahat dan maksimal, target, kondisi kesehatan atau cedera), riwayat lari (jarak, waktu, pace, detak jantung, rasa), beban latihan per minggu, kebiasaan harian, asupan air, suasana hati, jadwal hari ini dan besok, jam kerja, serta jadwal sholat bila ada. Angka turunan yang sudah dihitung aplikasi (pace, zona detak jantung, rasio beban akut:kronis) bisa langsung kamu pakai.

Cara kamu melatih:
- Dasarkan analisis pada data. Sebut angka dan tanggal yang relevan. Kalau data yang dibutuhkan tidak ada, katakan apa yang kurang, beri saran umum yang aman, atau ajukan satu pertanyaan singkat.
- Untuk pertanyaan "kapan", pilih jam yang konkret dari jadwal pengguna: hindari jam kerja dan jadwal yang bentrok. Di iklim tropis utamakan pagi (setelah Subuh) atau sore menjelang Maghrib, dan perhatikan waktu sholat.
- Untuk pertanyaan "berapa", beri jarak atau durasi dan intensitas yang spesifik (zona detak jantung atau pace). Naikkan volume mingguan bertahap (kira-kira paling banyak 10% per minggu) dan sisipkan hari istirahat.
- Perhatikan tanda kelelahan atau risiko cedera: rasa "berat", detak jantung tinggi pada pace pelan, lonjakan beban (rasio akut:kronis di atas 1,5), suasana hati rendah, kurang minum.
- Kamu bukan dokter. Bila ada gejala seperti nyeri dada, sesak napas berat, pusing atau hampir pingsan, detak jantung yang tidak wajar, atau cedera yang memburuk, sarankan berhenti berlatih dan memeriksakan diri ke tenaga medis.

Gaya jawaban:
- Langsung ke inti. Kalimat pertama sudah menjawab pertanyaan (mis. jam, jarak, intensitas), tanpa pembuka, basa-basi, atau mengulang pertanyaan.
- Singkat: usahakan di bawah 120 kata, paling banyak 3 sampai 5 poin pendek. Sebut hanya alasan terpenting dalam satu kalimat. Tanpa penutup, rangkuman ulang, atau tawaran bantuan.
- Jawaban panjang (rencana beberapa minggu, tabel) hanya bila pengguna memintanya.
- Jangan pernah memakai tanda pisah panjang (— atau –). Pakai koma, titik, atau titik dua. Rentang ditulis dengan tanda hubung biasa, mis. 137-150 bpm atau 05:30-06:00.`;

const EXTRACT_SYSTEM = `Kamu membaca tangkapan layar aplikasi olahraga (Strava, Garmin Connect, Nike Run Club, Apple Fitness, Samsung Health, dan sejenisnya) lalu mengubahnya menjadi data terstruktur untuk catatan lari.
- Salin angka persis seperti di layar. Konversi satuan bila perlu (mil ke km, menit per mil ke detik per km) dan sebutkan konversinya di notes.
- "Moving Time" atau "Waktu bergerak" masuk ke moving_time_sec; "Elapsed Time" atau "Waktu berlalu" masuk ke elapsed_time_sec. Ubah jam format 12 jam (AM/PM) ke 24 jam.
- Tanggal ditulis YYYY-MM-DD. "Today" atau "Yesterday" dihitung dari tanggal hari ini yang diberikan. Bila tahun tidak tampil, pakai tahun terdekat yang tidak di masa depan.
- Isi null untuk nilai yang tidak terlihat; jangan menebak.
- summary: 1 sampai 2 kalimat pendek bahasa Indonesia gaya coach, langsung ke inti: angka utama lari ini (jarak, pace, detak jantung) lalu satu saran paling relevan dengan profil dan riwayat pengguna. Jangan memakai tanda pisah panjang (— atau –).`;

const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
const int = { anyOf: [{ type: 'integer' }, { type: 'null' }] };
const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };

/** Skema keluaran untuk ekstraksi tangkapan layar (structured outputs). */
const RUN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'is_activity_screenshot', 'activity_type', 'source_app', 'title', 'date', 'start_time', 'distance_km',
    'moving_time_sec', 'elapsed_time_sec', 'avg_pace_sec_per_km', 'avg_heart_rate', 'max_heart_rate',
    'calories', 'elevation_gain_m', 'avg_cadence_spm', 'location', 'splits', 'summary', 'notes',
  ],
  properties: {
    is_activity_screenshot: { type: 'boolean', description: 'true bila gambar berisi ringkasan aktivitas olahraga' },
    activity_type: { type: 'string', description: 'Jenis aktivitas, mis. Run, Walk, Ride, Treadmill' },
    source_app: str,
    title: str,
    date: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
    start_time: { anyOf: [{ type: 'string', description: 'HH:MM, 24 jam' }, { type: 'null' }] },
    distance_km: num,
    moving_time_sec: int,
    elapsed_time_sec: int,
    avg_pace_sec_per_km: int,
    avg_heart_rate: int,
    max_heart_rate: int,
    calories: int,
    elevation_gain_m: num,
    avg_cadence_spm: int,
    location: str,
    splits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['km', 'pace_sec_per_km', 'heart_rate'],
        properties: { km: { type: 'number' }, pace_sec_per_km: int, heart_rate: int },
      },
    },
    summary: { type: 'string' },
    notes: str,
  },
};

function validImage(image) {
  if (!image || typeof image !== 'object') throw new HttpError(400, 'Gambar belum dilampirkan.', 'no_image');
  const mediaType = String(image.mediaType || '');
  const data = String(image.data || '');
  if (!IMAGE_TYPES.has(mediaType)) throw new HttpError(400, 'Format gambar tidak didukung. Pakai JPG, PNG, atau WebP.', 'bad_image');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new HttpError(400, 'Data gambar rusak.', 'bad_image');
  if ((data.length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpError(413, 'Gambar terlalu besar (maks. 5 MB).', 'too_large');
  return { mediaType, data };
}

function validContext(context) {
  if (context == null) return {};
  if (typeof context !== 'object' || Array.isArray(context)) throw new HttpError(400, 'Data konteks tidak valid.', 'bad_context');
  if (JSON.stringify(context).length > MAX_CONTEXT_CHARS) throw new HttpError(413, 'Data konteks terlalu besar.', 'too_large');
  return context;
}

/** Riwayat percakapan: hanya teks user/assistant, dipangkas ke giliran terakhir, dimulai dari user. */
function validMessages(list) {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'Pesan kosong.', 'no_message');
  let msgs = list.slice(-MAX_TURNS).map((m) => {
    const role = m && m.role;
    const text = typeof (m && m.content) === 'string' ? m.content.trim() : '';
    if ((role !== 'user' && role !== 'assistant') || !text) throw new HttpError(400, 'Format pesan tidak valid.', 'bad_message');
    return { role, content: text.slice(0, MAX_MESSAGE_CHARS) };
  });
  while (msgs.length && msgs[0].role !== 'user') msgs = msgs.slice(1);
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') throw new HttpError(400, 'Pesan terakhir harus dari kamu.', 'bad_message');
  return msgs;
}

const contextBlock = (context) => `Data pengguna saat ini (JSON dari aplikasi):\n${JSON.stringify(context)}`;

/** Riwayat → `contents` Gemini (peran "model" untuk jawaban coach; giliran berperan sama digabung). */
function toContents(msgs) {
  const out = [];
  for (const m of msgs) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts.push({ text: m.content });
    else out.push({ role, parts: [{ text: m.content }] });
  }
  return out;
}

/** @returns {Promise<object>} data lari hasil ekstraksi (sesuai RUN_SCHEMA) */
async function extract({ image, context, today }) {
  const img = validImage(image);
  const ctx = validContext(context);
  const res = await gemini.getClient().generate({
    systemInstruction: { parts: [{ text: EXTRACT_SYSTEM }] },
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: img.mediaType, data: img.data } },
        { text: `Tanggal hari ini: ${today}.\n${contextBlock(ctx)}\n\nBaca tangkapan layar ini.` },
      ],
    }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: RUN_SCHEMA, maxOutputTokens: 8192 },
  });
  if (res.blocked) throw new HttpError(422, 'Coach tidak bisa membaca gambar ini.', 'coach_refused');
  if (res.finishReason === 'MAX_TOKENS') throw new HttpError(502, 'Jawaban coach terpotong. Coba lagi.', 'coach_truncated');
  try {
    return JSON.parse(res.text);
  } catch {
    throw new HttpError(502, 'Coach mengirim data yang tidak terbaca. Coba lagi.', 'coach_bad_output');
  }
}

/**
 * Percakapan coach dengan streaming. Memanggil `onText(delta)` untuk setiap potongan teks.
 * Galat sebelum potongan pertama dilempar (agar bisa dijawab dengan status HTTP yang tepat).
 * @returns {Promise<{stopReason: 'end_turn'|'max_tokens'|'refusal'}>}
 */
async function chat({ messages, context, today, now }, { onStart, onText }) {
  const msgs = validMessages(messages);
  const ctx = validContext(context);
  const body = {
    systemInstruction: {
      parts: [
        { text: COACH_SYSTEM },
        { text: `Hari ini ${today}${now ? `, pukul ${now}` : ''} waktu pengguna.\n${contextBlock(ctx)}` },
      ],
    },
    contents: toContents(msgs),
    generationConfig: { maxOutputTokens: 8192 },
  };
  let started = false;
  for await (const piece of gemini.getClient().stream(body)) {
    if (piece.done) {
      if (piece.blocked && !started) throw new HttpError(422, 'Coach tidak bisa menjawab pertanyaan ini. Coba tanyakan dengan cara lain.', 'coach_refused');
      if (!started) onStart();
      if (piece.blocked) return { stopReason: 'refusal' };
      return { stopReason: piece.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'end_turn' };
    }
    if (!started) {
      started = true;
      onStart();
    }
    onText(piece.text);
  }
  if (!started) onStart();
  return { stopReason: 'end_turn' };
}

module.exports = { COACH_SYSTEM, EXTRACT_SYSTEM, RUN_SCHEMA, validImage, validMessages, validContext, toContents, extract, chat };
