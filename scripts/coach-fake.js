/**
 * Klien Gemini tiruan untuk server dev lokal (COACH_FAKE=1) — tanpa panggilan API sungguhan.
 * Dipakai untuk mencoba/menguji tampilan Coach Lari. Tidak ikut ter-deploy (scripts/ di .vercelignore).
 */
'use strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STRAVA = {
  is_activity_screenshot: true,
  activity_type: 'Run',
  source_app: 'Strava',
  title: 'Lunch Run',
  date: '2026-08-29',
  start_time: '12:33',
  distance_km: 0.31,
  moving_time_sec: 250,
  elapsed_time_sec: null,
  avg_pace_sec_per_km: 806,
  avg_heart_rate: 143,
  max_heart_rate: null,
  calories: 68,
  elevation_gain_m: 0,
  avg_cadence_spm: null,
  location: 'Bangka-Belitung Islands',
  splits: [],
  summary: 'Lari singkat 0,31 km dalam 4:10 (pace 13:26/km) dengan HR rata-rata 143 bpm dan 68 kkal. Pace-nya setara jalan cepat, tapi HR sudah di zona 2–3, jadi tubuhmu bekerja cukup keras. Coba mulai dengan lari-jalan 20 menit di pagi hari supaya tidak kepanasan.',
  notes: null,
};

function contextOf(body) {
  const block = ((body.systemInstruction && body.systemInstruction.parts) || []).map((p) => p.text || '').join('\n');
  const i = block.indexOf('{');
  try {
    return JSON.parse(block.slice(i));
  } catch {
    return {};
  }
}

function answer(body) {
  const ctx = contextOf(body);
  const last = body.contents[body.contents.length - 1];
  const q = last.parts.map((p) => p.text || '').join('\n');
  const system = ((body.systemInstruction && body.systemInstruction.parts) || []).map((p) => p.text || '').join('\n');
  const userTurns = body.contents.filter((c) => c.role === 'user').length;
  const w = ctx.weather;
  // Jawaban tiruan untuk saran rute, cuaca, dan ingatan sesi (menguji tampilan tanpa Gemini).
  if (/rute|berapa (km|jauh)|cuaca|ingat/i.test(q)) {
    const out = [`Kamu sudah mengirim ${userTurns} pesan di sesi ini.\n\n`];
    if (/Ringkasan bagian awal sesi/.test(system)) out.push('Aku ingat ringkasan sesi sebelumnya.\n\n');
    const first = body.contents[0].parts.map((p) => p.text || '').join(' ');
    if (/ingat/i.test(q)) out.push(`Pertanyaan pertamamu: _${first.slice(0, 60)}_\n\n`);
    const place = ctx.location && typeof ctx.location === 'object' ? ctx.location : {};
    if (w) out.push(`Cuaca di ${place.desa}, ${place.kecamatan}: ${w.now.desc} ${w.now.t}°C, peluang hujan sekitar ${w.rainChance24h}% menurut prakiraan BMKG.\n\n`);
    else if (/cuaca/i.test(q)) out.push('Lokasi belum dihidupkan, jadi aku belum tahu cuaca di tempatmu.\n\n');
    if (/rute|berapa (km|jauh)/i.test(q)) {
      const km = (/(\d+(?:[.,]\d+)?)\s*km/i.exec(q) || [])[1] || '5';
      out.push(`Lari santai **${km} km** besok pagi.\n\n[[RUTE ${km.replace(',', '.')} km putar]]`);
    }
    return out;
  }
  const p = ctx.profile || {};
  const runs = (ctx.running && ctx.running.recent_runs) || [];
  const r = runs[0];
  const tomorrow = (ctx.schedule && ctx.schedule.tomorrow) || {};
  return [
    `### Analisis coach\n\nPertanyaanmu: _${q.slice(0, 80)}_\n\n`,
    `- Usia ${p.age || '–'}, HR maks dipakai **${p.max_hr_used ? p.max_hr_used.value : '–'} bpm**.\n`,
    `- Lari terakhir: ${r ? `${r.date}, ${r.km} km${r.avg_hr ? `, HR ${r.avg_hr}` : ''}` : 'belum ada'}.\n`,
    `- Besok (${tomorrow.day || '–'}): ${tomorrow.work && tomorrow.work.workday ? `kerja ${tomorrow.work.start}–${tomorrow.work.end}` : 'libur'}, ${(tomorrow.tasks || []).length} agenda.\n\n`,
    '| Hari | Latihan | Intensitas |\n|---|---|---|\n| Besok 05:30 | Lari santai 30 menit | Z2 |\n| Lusa | Istirahat | – |\n\n',
    'Tetap minum cukup dan hentikan latihan bila ada nyeri dada atau pusing.',
  ];
}

function createFakeClient() {
  return {
    async generate(body) {
      await sleep(400);
      const sys = ((body.systemInstruction && body.systemInstruction.parts) || []).map((p) => p.text || '').join('\n');
      if (/^Kamu merangkum/.test(sys)) {
        const text = body.contents[0].parts[0].text;
        const n = (text.match(/\n(Pengguna|Coach): /g) || []).length + (/^Pesan yang harus/.test(text) ? 1 : 0);
        return { text: `- Ringkasan tiruan dari ${n} pesan lama.\n- Pertanyaan awal: ${(/Pengguna: ([^\n]{0,60})/.exec(text) || [])[1] || '-'}`, finishReason: 'STOP', blocked: false };
      }
      const schema = body && body.generationConfig && body.generationConfig.responseJsonSchema;
      if (schema && schema.properties && schema.properties.recommended) {
        // Saran rute: pilih rute dengan belokan paling sedikit.
        const text = body.contents[0].parts[0].text;
        const routes = JSON.parse(text.slice(text.indexOf('['), text.indexOf(']\n') + 1));
        const best = routes.reduce((a, r) => (r.turns < a.turns ? r : a), routes[0]);
        return {
          text: JSON.stringify({
            recommended: best.id,
            summary: `Ambil Rute ${best.id}: ${best.km} km dengan ${best.turns} belokan, ritmenya paling stabil. Jaga pace santai di zona 2.`,
            notes: routes.map((r) => ({ id: r.id, note: `${r.turns} belokan, lewat ${r.streets[0] || 'jalan sekitar'}.` })),
          }),
          finishReason: 'STOP',
          blocked: false,
        };
      }
      return { text: JSON.stringify(STRAVA), finishReason: 'STOP', blocked: false };
    },
    async* stream(body) {
      for (const text of answer(body)) {
        await sleep(120);
        yield { text };
      }
      yield { done: true, finishReason: 'STOP', blocked: false };
    },
  };
}

module.exports = { createFakeClient, STRAVA };
