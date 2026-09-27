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
    async generate() {
      await sleep(400);
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
