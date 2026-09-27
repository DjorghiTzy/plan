/**
 * Coach Lari (logika murni): profil kesehatan, zona detak jantung, beban latihan,
 * ringkasan data kesehatan untuk dikirim ke coach AI, dan konversi hasil baca
 * tangkapan layar (Strava, dll.) menjadi draf catatan lari. Dapat diuji dengan `node --test`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./date.js'), require('./run.js'), require('./logic.js'));
  } else {
    const P = root.Planner;
    P.coach = factory(P.date, P.run, P.logic);
  }
})(typeof self !== 'undefined' ? self : this, function (D, R, L) {
  'use strict';

  const round1 = (n) => Math.round(n * 10) / 10;
  const round2 = (n) => Math.round(n * 100) / 100;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  const EMPTY_PROFILE = {
    age: null, sex: '', heightCm: null, weightKg: null, restingHr: null, maxHr: null, goal: '', health: '', availability: '',
  };

  /** Rapikan profil dari formulir / data sinkron. */
  function cleanProfile(p) {
    const src = p && typeof p === 'object' ? p : {};
    const n = (v, min, max) => {
      const x = Number(v);
      return v !== '' && v !== null && v !== undefined && Number.isFinite(x) && x >= min && x <= max ? Math.round(x * 10) / 10 : null;
    };
    const s = (v, max) => String(v || '').trim().slice(0, max);
    return {
      age: n(src.age, 10, 100),
      sex: ['pria', 'wanita'].includes(src.sex) ? src.sex : '',
      heightCm: n(src.heightCm, 100, 230),
      weightKg: n(src.weightKg, 25, 250),
      restingHr: n(src.restingHr, 30, 120),
      maxHr: n(src.maxHr, 120, 230),
      goal: s(src.goal, 200),
      health: s(src.health, 500),
      availability: s(src.availability, 200),
    };
  }

  /** Detak jantung maksimal: isian pengguna, atau perkiraan Tanaka (208 − 0,7 × usia). */
  function maxHrOf(profile) {
    if (profile.maxHr) return { value: profile.maxHr, method: 'diisi pengguna' };
    if (profile.age) return { value: Math.round(208 - 0.7 * profile.age), method: 'perkiraan 208 − 0,7 × usia' };
    return null;
  }

  /** Lima zona detak jantung (Karvonen bila HR istirahat diketahui, selain itu % HR maks). */
  function hrZones(profile) {
    const max = maxHrOf(profile);
    if (!max) return null;
    const rest = profile.restingHr;
    const at = (pct) => Math.round(rest ? rest + (max.value - rest) * pct : max.value * pct);
    const names = ['Z1 pemulihan', 'Z2 aerobik ringan', 'Z3 tempo', 'Z4 ambang', 'Z5 maksimal'];
    return {
      method: rest ? 'Karvonen (cadangan detak jantung)' : '% HR maksimal',
      zones: [0.5, 0.6, 0.7, 0.8, 0.9].map((pct, i) => ({ zone: names[i], from: at(pct), to: at(pct + 0.1) })),
    };
  }

  function zoneOf(hr, zones) {
    if (!hr || !zones) return null;
    const z = zones.zones.find((x) => hr >= x.from && hr < x.to);
    if (z) return z.zone;
    return hr < zones.zones[0].from ? 'di bawah Z1' : 'Z5 maksimal';
  }

  /** Beban latihan: km 7 hari terakhir vs rata-rata mingguan 28 hari (rasio akut:kronis). */
  function trainingLoad(runs, today) {
    const sumSince = (days) => round2(runs.filter((r) => r.date <= today && D.diffDays(r.date, today) < days).reduce((a, r) => a + r.km, 0));
    const acute = sumSince(7);
    const chronic = round2(sumSince(28) / 4);
    return { last7Km: acute, weeklyAvg28Km: chronic, acuteChronicRatio: chronic > 0 ? round2(acute / chronic) : null };
  }

  /** km per pekan (Senin–Minggu), `weeks` pekan terakhir, yang terlama dulu. */
  function weeklyKm(runs, today, weeks = 12) {
    const start = D.weekStart(today);
    return Array.from({ length: weeks }, (_, i) => {
      const from = D.addDays(start, -7 * (weeks - 1 - i));
      const to = D.addDays(from, 6);
      const list = runs.filter((r) => r.date >= from && r.date <= to);
      return { week: from, km: round2(list.reduce((a, r) => a + r.km, 0)), runs: list.length };
    });
  }

  const fmtTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  /**
   * Ringkasan data untuk coach AI. Hanya data yang relevan untuk latihan & kesehatan.
   * @param {object} state status aplikasi
   * @param {{today: string, prayers?: {today: object[], tomorrow: object[]}|null}} opts
   */
  function buildContext(state, { today, prayers = null }) {
    const s = state.settings || {};
    const profile = cleanProfile(s.coachProfile);
    const zones = hrZones(profile);
    const extras = state.runExtras || {};
    const runs = (state.runs || []).filter((r) => r.date <= today);
    const byDate = [...runs].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    const tomorrow = D.addDays(today, 1);
    const ym = today.slice(0, 7);
    const month = R.runMonth(runs, ym, today, Number(s.runGoal) || 0);
    const rec = R.records(runs);
    const bmi = profile.heightCm && profile.weightKg ? round1(profile.weightKg / (profile.heightCm / 100) ** 2) : null;

    const recent = byDate.slice(0, 25).map((r) => {
      const x = extras[r.id] || {};
      const pace = R.pace(r.km, r.sec);
      return {
        date: r.date,
        day: D.dayName(r.date),
        time: r.time || null,
        km: r.km,
        duration: r.sec ? R.formatClock(r.sec) : null,
        pace_per_km: pace ? R.formatPace(pace) : null,
        type: r.type,
        feel: r.feel ? (R.FEELS.find((f) => f.id === r.feel) || {}).label : null,
        avg_hr: x.hr || null,
        avg_hr_zone: zoneOf(x.hr, zones),
        max_hr: x.hrMax || null,
        calories: x.cal || null,
        elevation_m: isNum(x.elev) ? x.elev : null,
        cadence_spm: x.cadence || null,
        title: x.title || null,
        place: x.place || null,
        note: r.note || null,
      };
    });

    const habits = L.habitMonth(state.habitLog || {}, state.habits || [], ym, today).rows.map((row) => ({
      name: row.habit.name,
      done_this_month: row.done,
      days_counted: row.target,
      pct: row.pct,
      current_streak: L.currentStreak(state.habitLog || {}, row.habit.id, today, today),
    }));

    const last = (n) => D.lastNDays(today, n);
    const water = last(7).map((k) => ({ date: k, glasses: (state.water || {})[k] || 0 }));
    const moods = last(14).map((k) => ({ date: k, mood: ((state.journal || {})[k] || {}).mood || null })).filter((m) => m.mood);
    const moodLabel = (v) => (L.MOODS.find((m) => m.value === Math.round(v)) || {}).label || null;
    const sholat = s.sholatChecklist !== false
      ? last(7).map((k) => ({ date: k, done: ((state.ibadah || {})[k] || []).length, of: 5 }))
      : null;

    const dayTasks = (date) => (state.tasks || [])
      .filter((t) => t.date === date)
      .sort((a, b) => (a.start || '99').localeCompare(b.start || '99'))
      .slice(0, 20)
      .map((t) => ({ title: t.title, start: t.start || null, end: t.end || null, done: Boolean(t.done), area: L.areaOf(t) }));
    const work = (date) => {
      const w = L.workWindow(s, date);
      return w.isWorkday ? { workday: true, start: fmtTime(w.start), end: fmtTime(w.end), rest: w.rest ? `${fmtTime(w.rest[0])}-${fmtTime(w.rest[1])}` : null } : { workday: false };
    };
    const lastRun = byDate[0] || null;

    return {
      today: { date: today, day: D.dayName(today) },
      profile: {
        ...profile,
        bmi,
        max_hr_used: maxHrOf(profile),
        hr_zones: zones,
      },
      running: {
        month_goal_km: Number(s.runGoal) || null,
        this_month: {
          km: month.total.km,
          runs: month.total.count,
          active_days: month.total.activeDays,
          pct_of_goal: month.pct,
          km_ahead_of_goal_pace: month.ahead,
          avg_pace_per_km: month.total.pace ? R.formatPace(month.total.pace) : null,
        },
        load: trainingLoad(runs, today),
        weekly_km_last_12_weeks: weeklyKm(runs, today, 12),
        days_since_last_run: lastRun ? D.diffDays(lastRun.date, today) : null,
        run_streak_days: R.streak(runs, today),
        records: {
          longest_km: rec.longest ? rec.longest.km : null,
          fastest_pace_per_km: rec.fastest ? R.formatPace(rec.fastest.pace) : null,
          best_5k_estimate: rec.best5k ? R.formatClock(rec.best5k.sec) : null,
          total_km: rec.km,
          total_runs: rec.count,
        },
        recent_runs: recent,
      },
      habits_this_month: habits,
      water_glasses_last_7_days: { goal_per_day: Number(s.waterGoal) || 8, days: water },
      mood_last_14_days: moods.length ? {
        average: round1(moods.reduce((a, m) => a + m.mood, 0) / moods.length),
        average_label: moodLabel(moods.reduce((a, m) => a + m.mood, 0) / moods.length),
        scale: '1 berat sampai 5 luar biasa',
        days: moods,
      } : null,
      sholat_last_7_days: sholat,
      schedule: {
        today: { work: work(today), tasks: dayTasks(today) },
        tomorrow: { date: tomorrow, day: D.dayName(tomorrow), work: work(tomorrow), tasks: dayTasks(tomorrow) },
      },
      prayer_times: prayers,
    };
  }

  function guessType(x) {
    const t = `${x.activity_type || ''} ${x.title || ''}`.toLowerCase();
    if (/treadmill/.test(t)) return 'treadmill';
    if (/race|lomba|marathon|maraton|\b5k\b|\b10k\b|half/.test(t)) return 'lomba';
    if (/interval|repeat|fartlek/.test(t)) return 'interval';
    if (/tempo|threshold/.test(t)) return 'tempo';
    if (/long/.test(t) || (x.distance_km || 0) >= 15) return 'jauh';
    return 'santai';
  }

  /**
   * Hasil baca tangkapan layar → draf untuk dialog Catat lari.
   * @returns {{date, time, km, sec, type, note, extra}}
   */
  function draftFromExtract(x, today) {
    const int = (v, min, max) => (isNum(v) && v >= min && v <= max ? Math.round(v) : null);
    const date = D.isKey(x.date) && x.date <= today ? x.date : today;
    const km = isNum(x.distance_km) && x.distance_km > 0 ? round2(x.distance_km) : 0;
    let sec = int(x.moving_time_sec, 1, 86400) || int(x.elapsed_time_sec, 1, 86400);
    if (!sec && km && int(x.avg_pace_sec_per_km, 60, 3600)) sec = Math.round(x.avg_pace_sec_per_km * km);
    const extra = {
      hr: int(x.avg_heart_rate, 30, 250),
      hrMax: int(x.max_heart_rate, 30, 250),
      cal: int(x.calories, 0, 20000),
      elev: isNum(x.elevation_gain_m) ? Math.round(x.elevation_gain_m) : null,
      cadence: int(x.avg_cadence_spm, 60, 260),
      title: x.title ? String(x.title).slice(0, 80) : null,
      place: x.location ? String(x.location).slice(0, 80) : null,
      source: x.source_app ? String(x.source_app).slice(0, 30) : null,
      summary: x.summary ? tidyText(x.summary).slice(0, 1500) : null,
    };
    return {
      date,
      time: TIME_RE.test(x.start_time || '') ? x.start_time : '',
      km,
      sec: sec || 0,
      type: guessType(x),
      note: x.title && x.location ? `${x.title} · ${x.location}`.slice(0, 200) : String(x.title || x.location || '').slice(0, 200),
      extra,
    };
  }

  /**
   * Buang tanda pisah panjang (— dan –) dari jawaban AI: rentang jadi tanda hubung (137-150),
   * di awal baris jadi butir, sisipan kalimat jadi koma, setelah teks tebal jadi titik dua.
   */
  function tidyText(src) {
    const s = String(src == null ? '' : src);
    return s
      .replace(/[ \t]*[—–]+[ \t]*/g, (m, at) => {
        const before = s[at - 1] || '';
        const after = s[at + m.length] || '';
        const lead = m.match(/^[ \t]*/)[0];
        if (!before || before === '\n') return `${lead}- `;
        if (!after || after === '\n') return '';
        if (before === '|' || after === '|') return ' - ';
        if (/\d/.test(before) && /\d/.test(after)) return '-';
        if (m.length === 1 && /[\p{L}\p{N}]/u.test(before) && /[\p{L}\p{N}]/u.test(after)) return '-';
        if (before === '*' || before === '_') return ': ';
        return ', ';
      })
      .replace(/,[ \t]*([,.;:!?)])/g, '$1');
  }

  /** Judul sesi chat dari pertanyaan pertama. */
  function chatTitle(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > 48 ? `${t.slice(0, 47)}…` : t || 'Sesi coach';
  }

  return {
    EMPTY_PROFILE, cleanProfile, maxHrOf, hrZones, zoneOf, trainingLoad, weeklyKm, buildContext, draftFromExtract, guessType, chatTitle, tidyText,
  };
});
