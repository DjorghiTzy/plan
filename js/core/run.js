/**
 * Pencatat lari (logika murni, tanpa DOM): jarak, pace, rekap bulanan ala spreadsheet,
 * akumulasi terhadap target, dan rekor pribadi. Dapat diuji dengan `node --test`.
 *
 * Satu catatan lari: { id, date 'YYYY-MM-DD', time 'HH:MM'|'', km, sec, type, feel 0–5, note }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./date.js'));
  } else {
    (root.Planner = root.Planner || {}).run = factory(root.Planner.date);
  }
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  const TYPES = [
    { id: 'santai', label: 'Santai' },
    { id: 'tempo', label: 'Tempo' },
    { id: 'interval', label: 'Interval' },
    { id: 'jauh', label: 'Jarak jauh' },
    { id: 'lomba', label: 'Lomba' },
    { id: 'treadmill', label: 'Treadmill' },
  ];
  const FEELS = [
    { id: 1, face: '😫', label: 'Berat sekali' },
    { id: 2, face: '😣', label: 'Berat' },
    { id: 3, face: '😐', label: 'Biasa' },
    { id: 4, face: '🙂', label: 'Enak' },
    { id: 5, face: '😄', label: 'Enak sekali' },
  ];

  const round2 = (n) => Math.round(n * 100) / 100;

  /** "5,2" / "5.2" / "5 km" → 5.2; kosong atau tidak valid → null. */
  function parseKm(text) {
    const m = String(text == null ? '' : text).trim().replace(/\s*km$/i, '').replace(',', '.').match(/^\d+(\.\d+)?$/);
    if (!m) return null;
    const n = Number(m[0]);
    return n > 0 ? round2(n) : null;
  }

  /** 5 → "5", 5.25 → "5,25", 32.4 → "32,4" (maksimal `digits` desimal, nol di belakang dibuang). */
  function formatKm(km, digits = 2) {
    const n = Number(km) || 0;
    return n.toFixed(digits).replace(/\.?0+$/, '').replace('.', ',');
  }

  /** Detik per km, atau null bila jarak/waktu kosong. */
  function pace(km, sec) {
    return km > 0 && sec > 0 ? sec / km : null;
  }

  /** 372 → "6:12" */
  function formatPace(secPerKm) {
    if (!secPerKm) return '–';
    const s = Math.round(secPerKm);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  /** 1930 → "32:10", 3725 → "1:02:05" */
  function formatClock(sec) {
    const s = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  }

  /** km/jam, 1 desimal */
  function speed(km, sec) {
    return km > 0 && sec > 0 ? Math.round((km / (sec / 3600)) * 10) / 10 : null;
  }

  /** Batas atas skala yang rapi: 7,3 → 10; 12 → 20; 0 → 5. */
  function niceMax(v) {
    if (!(v > 0)) return 5;
    const mag = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= v - 1e-9) return m * mag;
    return 10 * mag;
  }

  /** Pace gabungan: total waktu ÷ total jarak, hanya dari lari yang mencatat waktu. */
  function paceOf(runs) {
    let km = 0;
    let sec = 0;
    for (const r of runs) {
      if (r.sec > 0 && r.km > 0) {
        km += r.km;
        sec += r.sec;
      }
    }
    return pace(km, sec);
  }

  /** Hari berturut-turut ada lari, berakhir hari ini (atau kemarin bila hari ini belum lari). */
  function streak(runs, today) {
    const days = new Set(runs.map((r) => r.date));
    let key = days.has(today) ? today : D.addDays(today, -1);
    let n = 0;
    while (days.has(key) && n < 3660) {
      n += 1;
      key = D.addDays(key, -1);
    }
    return n;
  }

  /**
   * Rekap satu bulan: per hari, per minggu (potongan 7 hari dari tanggal 1),
   * akumulasi vs garis target, total, dan lari terjauh.
   * @param {object[]} runs
   * @param {string} ym 'YYYY-MM'
   * @param {string} today 'YYYY-MM-DD'
   * @param {number} goal target km per bulan (0 = tanpa target)
   */
  function runMonth(runs, ym, today, goal = 0) {
    const [y, m] = ym.split('-').map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const days = Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
    const mine = runs.filter((r) => r.date.slice(0, 7) === ym);

    const daily = days.map((key) => {
      const list = mine.filter((r) => r.date === key).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      const km = round2(list.reduce((a, r) => a + r.km, 0));
      const sec = list.reduce((a, r) => a + (r.sec || 0), 0);
      const feels = list.filter((r) => r.feel);
      return {
        key,
        runs: list,
        km,
        sec,
        pace: paceOf(list),
        feel: feels.length ? Math.round(feels.reduce((a, r) => a + r.feel, 0) / feels.length) : 0,
        future: key > today,
      };
    });

    const weeks = [];
    for (let i = 0; i < n; i += 7) {
      const slice = daily.slice(i, i + 7);
      weeks.push({
        index: weeks.length + 1,
        from: days[i],
        to: slice[slice.length - 1].key,
        size: slice.length,
        km: round2(slice.reduce((a, d) => a + d.km, 0)),
        sec: slice.reduce((a, d) => a + d.sec, 0),
        count: slice.reduce((a, d) => a + d.runs.length, 0),
        future: slice[0].key > today,
      });
    }

    let cum = 0;
    const cumulative = daily.map((d, i) => {
      cum = round2(cum + d.km);
      return { key: d.key, km: d.future ? null : cum, target: goal > 0 ? round2((goal * (i + 1)) / n) : null };
    });

    const km = round2(mine.reduce((a, r) => a + r.km, 0));
    const elapsed = days.filter((k) => k <= today).length;
    const expected = goal > 0 ? round2((goal * elapsed) / n) : null;
    const longest = mine.reduce((best, r) => (!best || r.km > best.km ? r : best), null);
    return {
      ym, year: y, month: m, days, daily, weeks, cumulative, goal,
      total: {
        km,
        sec: mine.reduce((a, r) => a + (r.sec || 0), 0),
        count: mine.length,
        activeDays: daily.filter((d) => d.runs.length).length,
        pace: paceOf(mine),
      },
      pct: goal > 0 ? Math.round((km / goal) * 100) : null,
      expected,
      ahead: expected === null ? null : round2(km - expected),
      longest,
      maxDay: daily.reduce((a, d) => Math.max(a, d.km), 0),
    };
  }

  /** Rekor sepanjang waktu. Pace tercepat dari lari ≥ 1 km; 5K tercepat diperkirakan dari pace lari ≥ 5 km. */
  function records(runs) {
    const timed = runs.filter((r) => r.sec > 0 && r.km > 0);
    const fastestOf = (list) => list.reduce((best, r) => (!best || r.sec / r.km < best.sec / best.km ? r : best), null);
    const fastest = fastestOf(timed.filter((r) => r.km >= 1));
    const five = fastestOf(timed.filter((r) => r.km >= 5));
    return {
      count: runs.length,
      km: round2(runs.reduce((a, r) => a + r.km, 0)),
      longest: runs.reduce((best, r) => (!best || r.km > best.km ? r : best), null),
      fastest: fastest ? { run: fastest, pace: fastest.sec / fastest.km } : null,
      best5k: five ? { run: five, sec: Math.round((five.sec / five.km) * 5) } : null,
    };
  }

  return {
    TYPES, FEELS, parseKm, formatKm, pace, formatPace, formatClock, speed, niceMax, paceOf, streak, runMonth, records,
  };
});
