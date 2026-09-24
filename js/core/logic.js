/**
 * Logika murni aplikasi (tanpa DOM): pengurai tambah-cepat, streak kebiasaan,
 * tata letak linimasa, dan agregasi statistik. Dapat diuji dengan `node --test`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./date.js'));
  } else {
    (root.Planner = root.Planner || {}).logic = factory(root.Planner.date);
  }
})(typeof self !== 'undefined' ? self : this, function (D) {
  'use strict';

  // Urutan ini juga urutan warna kategori (lihat css/styles.css) yang sudah
  // divalidasi aman untuk buta warna; jangan diacak.
  const CATEGORIES = [
    { id: 'kerja', label: 'Kerja' },
    { id: 'kesehatan', label: 'Kesehatan' },
    { id: 'ibadah', label: 'Ibadah' },
    { id: 'rumah', label: 'Rumah' },
    { id: 'pribadi', label: 'Pribadi' },
    { id: 'belajar', label: 'Belajar' },
  ];

  const PRIORITIES = [
    { id: 'tinggi', label: 'Tinggi', rank: 0 },
    { id: 'sedang', label: 'Sedang', rank: 1 },
    { id: 'rendah', label: 'Rendah', rank: 2 },
  ];

  const MOODS = [
    { value: 1, label: 'Berat' },
    { value: 2, label: 'Kurang' },
    { value: 3, label: 'Biasa' },
    { value: 4, label: 'Baik' },
    { value: 5, label: 'Luar biasa' },
  ];

  const DAY_PARTS = [
    { id: 'pagi', label: 'Pagi', range: '04.00–11.00' },
    { id: 'siang', label: 'Siang', range: '11.00–15.00' },
    { id: 'sore', label: 'Sore', range: '15.00–18.00' },
    { id: 'malam', label: 'Malam', range: '18.00–04.00' },
    { id: 'kapan', label: 'Kapan saja', range: 'tanpa jam' },
  ];

  const LAST_MINUTE = 24 * 60 - 1;

  function findCategory(word) {
    const w = word.toLowerCase();
    return CATEGORIES.find((c) => c.id === w || c.label.toLowerCase().startsWith(w)) || null;
  }

  const PRIORITY_WORDS = {
    tinggi: 'tinggi', penting: 'tinggi', urgent: 'tinggi',
    sedang: 'sedang', biasa: 'sedang',
    rendah: 'rendah', santai: 'rendah',
  };

  const TIME = '(\\d{1,2}[:.]\\d{2})';
  const RANGE_SEP = '\\s*(?:-|–|—|s\\/d|sampai|hingga)\\s*';
  const RE_RANGE = new RegExp(`(?:\\b(?:jam|pukul)\\s+)?(?<![\\d.:,])${TIME}${RANGE_SEP}${TIME}(?![\\d.:,])`, 'i');
  const RE_SINGLE = new RegExp(`(?:\\b(?:jam|pukul)\\s+)?(?<![\\d.:,])${TIME}(?![\\d.:,])`, 'i');
  const RE_WORD_RANGE = /\b(?:jam|pukul)\s+(\d{1,2})(?:\s*(?:-|–|sampai|hingga)\s*(\d{1,2}))?\b(?![.:]\d)/i;

  /**
   * Mengurai kalimat tambah-cepat, contoh:
   *   "Rapat tim 14.00-15.30 #kerja !tinggi besok"
   *   "Olahraga jam 6 #kesehatan"
   *   "Bayar listrik * #rumah"   (bintang = masuk tiga prioritas)
   */
  function parseQuickAdd(input) {
    let text = ` ${String(input || '')} `;
    const out = { title: '', start: null, end: null, category: null, priority: null, dayOffset: 0, starred: false, repeat: null };

    // Pengulangan: "tiap hari", "setiap hari kerja", "tiap akhir pekan", "setiap senin & kamis"
    const DAY_WORDS = { minggu: 0, senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6 };
    const dayAlt = "senin|selasa|rabu|kamis|jum'?at|sabtu|minggu";
    const reDays = new RegExp(`(^|\\s)(?:setiap|tiap)\\s+((?:${dayAlt})(?:\\s*(?:,|&|dan)\\s*(?:${dayAlt}))*)(?=\\s|$)`, 'i');
    let rm;
    if ((rm = text.match(/(^|\s)(?:setiap|tiap)\s+hari\s+kerja(?=\s|$)/i))) {
      out.repeat = { rule: 'kerja', days: [] };
    } else if ((rm = text.match(/(^|\s)(?:setiap|tiap)\s+akhir\s+pekan(?=\s|$)/i))) {
      out.repeat = { rule: 'akhir-pekan', days: [] };
    } else if ((rm = text.match(/(^|\s)(?:setiap|tiap)\s+hari(?=\s|$)/i))) {
      out.repeat = { rule: 'harian', days: [] };
    } else if ((rm = text.match(reDays))) {
      const days = rm[2].toLowerCase().split(/\s*(?:,|&|dan)\s*/).map((w) => DAY_WORDS[w.replace("'", '')]);
      out.repeat = { rule: 'mingguan', days: [...new Set(days)].sort((a, b) => a - b) };
    }
    if (rm) text = text.replace(rm[0], rm[1] || ' ');

    let startMin = null;
    let endMin = null;
    let m = text.match(RE_RANGE);
    if (m) {
      startMin = D.parseTime(m[1]);
      endMin = D.parseTime(m[2]);
      text = text.replace(m[0], ' ');
    } else if ((m = text.match(RE_WORD_RANGE))) {
      startMin = D.parseTime(m[1]);
      endMin = m[2] ? D.parseTime(m[2]) : null;
      text = text.replace(m[0], ' ');
    } else if ((m = text.match(RE_SINGLE))) {
      startMin = D.parseTime(m[1]);
      text = text.replace(m[0], ' ');
    }
    if (startMin != null) {
      if (endMin == null || endMin <= startMin) endMin = Math.min(startMin + 60, LAST_MINUTE);
      out.start = D.formatTime(startMin);
      out.end = D.formatTime(endMin);
    }

    text = text.replace(/(^|\s)#([\p{L}\d_-]+)/giu, (all, lead, word) => {
      const cat = findCategory(word);
      if (!cat) return all;
      out.category = cat.id;
      return lead;
    });

    text = text.replace(/(^|\s)!([\p{L}]*)(?=\s|$)/giu, (all, lead, word) => {
      if (!word) {
        out.priority = 'tinggi';
        return lead;
      }
      const p = PRIORITY_WORDS[word.toLowerCase()];
      if (!p) return all;
      out.priority = p;
      return lead;
    });

    text = text.replace(/(^|\s)\*(?=\s|$)/g, (all, lead) => {
      out.starred = true;
      return lead;
    });

    text = text.replace(/(^|\s)(besok|lusa)(?=\s|$)/gi, (all, lead, word) => {
      out.dayOffset = word.toLowerCase() === 'besok' ? 1 : 2;
      return lead;
    });

    out.title = text.replace(/\s+/g, ' ').replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, '').trim();
    return out;
  }

  function priorityRank(id) {
    const p = PRIORITIES.find((x) => x.id === id);
    return p ? p.rank : 1;
  }

  /** Urutkan: yang berjam lebih dulu (menurut jam mulai), lalu prioritas, lalu waktu dibuat. */
  function sortTasks(tasks) {
    return [...tasks].sort((a, b) => {
      const sa = a.start ? D.parseTime(a.start) : Infinity;
      const sb = b.start ? D.parseTime(b.start) : Infinity;
      if (sa !== sb) return sa - sb;
      const pr = priorityRank(a.priority) - priorityRank(b.priority);
      if (pr) return pr;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function groupByDayPart(tasks) {
    const groups = Object.fromEntries(DAY_PARTS.map((p) => [p.id, []]));
    for (const t of sortTasks(tasks)) {
      groups[D.dayPart(t.start ? D.parseTime(t.start) : null)].push(t);
    }
    return groups;
  }

  function progress(tasks) {
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  /**
   * Tugas yang sedang berjalan atau berikutnya pada hari ini.
   * @returns {{task, status: 'berjalan'|'berikutnya', minutes: number} | null}
   */
  function nextTask(tasks, nowMin) {
    const timed = sortTasks(tasks.filter((t) => !t.done && t.start));
    for (const t of timed) {
      const s = D.parseTime(t.start);
      const e = t.end ? D.parseTime(t.end) : s + 30;
      if (s <= nowMin && nowMin < e) return { task: t, status: 'berjalan', minutes: e - nowMin };
      if (s > nowMin) return { task: t, status: 'berikutnya', minutes: s - nowMin };
    }
    return null;
  }

  /** Tugas belum selesai dalam `lookback` hari terakhir sebelum `today`. */
  function rolloverCandidates(tasks, today, lookback = 7) {
    return tasks.filter((t) => {
      // Tugas berulang muncul lagi dengan sendirinya, jadi tidak perlu dipindahkan.
      if (t.done || t.seriesId) return false;
      const diff = D.diffDays(t.date, today);
      return diff > 0 && diff <= lookback;
    });
  }

  /**
   * Menyusun kolom untuk blok jadwal yang bertumpuk.
   * @param {{id: string, start: number, end: number}[]} items menit sejak 00:00
   * @returns {Object<string, {col: number, cols: number}>}
   */
  function layoutTimeline(items) {
    const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
    const result = {};
    let cluster = [];
    let columns = [];
    let clusterEnd = -Infinity;
    const flush = () => {
      for (const it of cluster) result[it.id].cols = columns.length;
      cluster = [];
      columns = [];
      clusterEnd = -Infinity;
    };
    for (const it of sorted) {
      if (cluster.length && it.start >= clusterEnd) flush();
      let col = columns.findIndex((end) => end <= it.start);
      if (col === -1) {
        col = columns.length;
        columns.push(it.end);
      } else {
        columns[col] = it.end;
      }
      result[it.id] = { col, cols: 1 };
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
    }
    flush();
    return result;
  }

  function habitDoneOn(log, habitId, key) {
    const list = log[key];
    return Array.isArray(list) && list.includes(habitId);
  }

  /**
   * Streak berjalan sampai `endKey`. Bila `endKey` adalah hari ini dan belum
   * dicentang, streak dihitung sampai kemarin (belum dianggap putus).
   */
  function currentStreak(log, habitId, endKey, today) {
    let key = endKey;
    if (key === today && !habitDoneOn(log, habitId, key)) key = D.addDays(key, -1);
    let n = 0;
    while (habitDoneOn(log, habitId, key) && n < 3660) {
      n += 1;
      key = D.addDays(key, -1);
    }
    return n;
  }

  function bestStreak(log, habitId) {
    const keys = Object.keys(log).filter((k) => habitDoneOn(log, habitId, k)).sort();
    let best = 0;
    let run = 0;
    let prev = null;
    for (const k of keys) {
      run = prev && D.diffDays(prev, k) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    }
    return best;
  }

  /** Persentase hari tercentang dalam `days` hari terakhir (sejak kebiasaan dibuat). */
  function habitRate(log, habit, endKey, days) {
    let window = days;
    if (habit.createdOn) {
      const age = D.diffDays(habit.createdOn, endKey) + 1;
      if (age <= 0) return 0;
      window = Math.min(days, age);
    }
    let done = 0;
    for (const k of D.lastNDays(endKey, window)) if (habitDoneOn(log, habit.id, k)) done += 1;
    return Math.round((done / window) * 100);
  }

  function focusMinutesOn(sessions, key) {
    return sessions.filter((s) => s.date === key).reduce((sum, s) => sum + (s.minutes || 0), 0);
  }

  /** Ringkasan per hari untuk grafik. */
  function summarizeDays(state, keys) {
    const activeHabits = state.habits.filter((h) => !h.archived);
    return keys.map((key) => {
      const tasks = state.tasks.filter((t) => t.date === key);
      const p = progress(tasks);
      const journal = state.journal[key];
      const habitsDone = (state.habitLog[key] || []).filter((id) => activeHabits.some((h) => h.id === id)).length;
      return {
        key,
        total: p.total,
        done: p.done,
        focus: focusMinutesOn(state.focusSessions, key),
        water: state.water[key] || 0,
        mood: journal && journal.mood ? journal.mood : null,
        habitsDone,
      };
    });
  }

  function categoryCounts(tasks) {
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, { total: 0, done: 0 }]));
    for (const t of tasks) {
      const c = counts[t.category] || counts.pribadi;
      c.total += 1;
      if (t.done) c.done += 1;
    }
    return counts;
  }

  /** Peribahasa berganti tiap hari, sama untuk tanggal yang sama. */
  function pickForDate(key, list) {
    if (!list.length) return null;
    const idx = ((D.diffDays('2000-01-01', key) % list.length) + list.length) % list.length;
    return list[idx];
  }

  // ----- Kapasitas & penjadwalan otomatis -----

  /** Rentang [start, end] menit dari tugas berjam. */
  function span(t) {
    const s = D.parseTime(t.start);
    const e = t.end ? D.parseTime(t.end) : s + 30;
    return [s, Math.max(e, s + 5)];
  }

  /** Gabungkan interval yang bertumpuk. */
  function mergeIntervals(list) {
    const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const [a, b] of sorted) {
      const last = out[out.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else out.push([a, b]);
    }
    return out;
  }

  /**
   * Beban hari: total menit terjadwal (tanpa tumpang tindih) dibanding jendela hari.
   * @returns {{scheduled: number, window: number, free: number, pct: number, untimed: number}}
   */
  function capacity(tasks, dayStart, dayEnd) {
    const win = [dayStart * 60, Math.min(24 * 60, dayEnd * 60)];
    const busy = mergeIntervals(tasks.filter((t) => t.start).map(span)
      .map(([a, b]) => [Math.max(a, win[0]), Math.min(b, win[1])]));
    const scheduled = busy.reduce((sum, [a, b]) => sum + (b - a), 0);
    const window = win[1] - win[0];
    return {
      scheduled,
      window,
      free: Math.max(0, window - scheduled),
      pct: window ? Math.round((scheduled / window) * 100) : 0,
      untimed: tasks.filter((t) => !t.start && !t.done).length,
    };
  }

  /**
   * Tempatkan tugas tanpa jam (belum selesai) ke celah kosong.
   * Urutan: Tiga Prioritas, lalu prioritas tinggi → rendah. Durasi 30 menit
   * (60 untuk prioritas tinggi), jeda 5 menit, mulai dari `fromMin`.
   * @param {Array<[number, number]>} blocked interval tambahan (mis. waktu sholat)
   * @returns {{id: string, start: string, end: string}[]}
   */
  function autoSchedule(tasks, { dayStart = 5, dayEnd = 23, fromMin = 0, blocked = [], gap = 5 } = {}) {
    const endWin = Math.min(24 * 60, dayEnd * 60);
    let cursor = Math.max(dayStart * 60, Math.ceil(fromMin / 5) * 5);
    const busy = mergeIntervals([...tasks.filter((t) => t.start).map(span), ...blocked]);
    const queue = tasks
      .filter((t) => !t.start && !t.done)
      .sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred))
        || priorityRank(a.priority) - priorityRank(b.priority)
        || (a.createdAt || 0) - (b.createdAt || 0));
    const out = [];
    for (const t of queue) {
      const len = t.priority === 'tinggi' ? 60 : 30;
      let placed = false;
      while (cursor + len <= endWin) {
        const clash = busy.find(([a, b]) => cursor < b + gap && cursor + len > a - gap);
        if (!clash) {
          out.push({ id: t.id, start: D.formatTime(cursor), end: D.formatTime(cursor + len) });
          busy.push([cursor, cursor + len]);
          busy.sort((x, y) => x[0] - y[0]);
          cursor += len + gap;
          placed = true;
          break;
        }
        cursor = Math.ceil((clash[1] + gap) / 5) * 5;
      }
      if (!placed) break;
    }
    return out;
  }

  // ----- Analitik untuk halaman Statistik -----

  /** Kelompokkan ringkasan harian menjadi per pekan (Senin–Minggu). */
  function aggregateWeeks(days) {
    const out = [];
    for (const d of days) {
      const week = D.weekStart(d.key);
      let w = out[out.length - 1];
      if (!w || w.key !== week) {
        w = { key: week, total: 0, done: 0, focus: 0, water: 0, moods: [], habitsDone: 0, days: 0 };
        out.push(w);
      }
      w.total += d.total;
      w.done += d.done;
      w.focus += d.focus;
      w.water += d.water;
      w.habitsDone += d.habitsDone;
      w.days += 1;
      if (d.mood) w.moods.push(d.mood);
    }
    return out.map((w) => ({
      ...w,
      mood: w.moods.length ? w.moods.reduce((a, b) => a + b, 0) / w.moods.length : null,
    }));
  }

  /** Jumlah tugas selesai per jam (0–23) berdasarkan waktu dicentang. */
  function hourHistogram(tasks, keys) {
    const inRange = new Set(keys);
    const hours = Array(24).fill(0);
    for (const t of tasks) {
      if (!t.done || !t.doneAt || !inRange.has(t.date)) continue;
      hours[new Date(t.doneAt).getHours()] += 1;
    }
    return hours;
  }

  /** Persentase selesai per hari dalam pekan, urut Senin → Minggu. */
  function weekdayRates(tasks, keys) {
    const inRange = new Set(keys);
    const rows = [1, 2, 3, 4, 5, 6, 0].map((day) => ({ day, total: 0, done: 0, pct: 0 }));
    for (const t of tasks) {
      if (!inRange.has(t.date)) continue;
      const r = rows.find((x) => x.day === D.dayIndex(t.date));
      r.total += 1;
      if (t.done) r.done += 1;
    }
    for (const r of rows) r.pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
    return rows;
  }

  /** Tingkat 0–4 untuk peta aktivitas berdasarkan jumlah tugas selesai. */
  function activityLevel(done) {
    if (done <= 0) return 0;
    if (done <= 2) return 1;
    if (done <= 4) return 2;
    if (done <= 6) return 3;
    return 4;
  }

  /**
   * Kolom-kolom pekan untuk peta aktivitas (Senin di atas), berakhir di pekan `endKey`.
   * @returns {{week: string, cells: {key: string, done: number, total: number, level: number, future: boolean}[]}[]}
   */
  function heatmap(tasks, endKey, weeks, today) {
    const counts = {};
    for (const t of tasks) {
      const c = counts[t.date] || (counts[t.date] = { done: 0, total: 0 });
      c.total += 1;
      if (t.done) c.done += 1;
    }
    const first = D.addDays(D.weekStart(endKey), -7 * (weeks - 1));
    const cols = [];
    for (let w = 0; w < weeks; w += 1) {
      const week = D.addDays(first, w * 7);
      const cells = [];
      for (let i = 0; i < 7; i += 1) {
        const key = D.addDays(week, i);
        const c = counts[key] || { done: 0, total: 0 };
        cells.push({ key, done: c.done, total: c.total, level: activityLevel(c.done), future: key > today });
      }
      cols.push({ week, cells });
    }
    return cols;
  }

  /** Perubahan persen dibanding periode sebelumnya; null bila tidak bisa dibandingkan. */
  function delta(current, previous) {
    if (!previous) return current ? null : 0;
    return Math.round(((current - previous) / previous) * 100);
  }

  /** Kalimat-kalimat sorotan singkat dari data periode. */
  function insights(state, keys) {
    const out = [];
    const tasks = state.tasks.filter((t) => keys.includes(t.date));
    const rates = weekdayRates(state.tasks, keys).filter((r) => r.total >= 2);
    if (rates.length >= 2) {
      const best = rates.reduce((a, b) => (b.pct > a.pct ? b : a));
      out.push({ kind: 'day', text: `Hari paling tuntas: ${D.DAYS[best.day]} (${best.pct}% rencana selesai).` });
    }
    const hours = hourHistogram(state.tasks, keys);
    const peak = hours.indexOf(Math.max(...hours));
    if (hours[peak] >= 3) {
      out.push({ kind: 'hour', text: `Kamu paling sering menuntaskan tugas pukul ${String(peak).padStart(2, '0')}.00–${String((peak + 1) % 24).padStart(2, '0')}.00.` });
    }
    const counts = categoryCounts(tasks);
    const top = CATEGORIES.filter((c) => counts[c.id].total).sort((a, b) => counts[b.id].total - counts[a.id].total)[0];
    if (top) {
      const share = Math.round((counts[top.id].total / tasks.length) * 100);
      out.push({ kind: 'category', text: `${share}% rencanamu berkategori ${top.label}.` });
    }
    const habits = state.habits.filter((h) => !h.archived);
    if (habits.length) {
      const end = keys[keys.length - 1];
      const streaks = habits.map((h) => ({ h, n: currentStreak(state.habitLog, h.id, end, end) })).sort((a, b) => b.n - a.n);
      if (streaks[0].n >= 3) out.push({ kind: 'streak', text: `Streak terpanjang saat ini: "${streaks[0].h.name}", ${streaks[0].n} hari berturut-turut.` });
    }
    const late = tasks.filter((t) => !t.done && t.priority === 'tinggi').length;
    if (late >= 2) out.push({ kind: 'warn', text: `${late} tugas prioritas tinggi belum selesai pada periode ini.` });
    return out;
  }

  // ----- Tugas berulang -----

  const REPEATS = [
    { id: '', label: 'Tidak berulang' },
    { id: 'harian', label: 'Setiap hari' },
    { id: 'kerja', label: 'Hari kerja (Sen–Jum)' },
    { id: 'akhir-pekan', label: 'Akhir pekan (Sab–Min)' },
    { id: 'mingguan', label: 'Hari tertentu tiap minggu' },
  ];

  /** Apakah seri berulang punya jadwal pada tanggal `key`. */
  function occursOn(series, key) {
    if (!series || key < series.from) return false;
    if (series.until && key > series.until) return false;
    if (Array.isArray(series.skips) && series.skips.includes(key)) return false;
    const day = D.dayIndex(key);
    switch (series.rule) {
      case 'harian': return true;
      case 'kerja': return day >= 1 && day <= 5;
      case 'akhir-pekan': return day === 0 || day === 6;
      case 'mingguan': return Array.isArray(series.days) && series.days.includes(day);
      default: return false;
    }
  }

  function joinId(list) {
    if (list.length <= 1) return list.join('');
    return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
  }

  function describeRule(series) {
    if (!series) return '';
    if (series.rule === 'mingguan') {
      const order = [1, 2, 3, 4, 5, 6, 0];
      const days = order.filter((d) => (series.days || []).includes(d)).map((d) => D.DAYS[d]);
      return days.length === 7 ? 'Setiap hari' : `Setiap ${joinId(days)}`;
    }
    const r = REPEATS.find((x) => x.id === series.rule);
    return r ? r.label : '';
  }

  // ----- Pencarian -----

  const fold = (text) => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /**
   * Cari tugas berdasarkan judul, catatan, dan subtugas. Semua kata harus cocok.
   * Hasil diurutkan dari tanggal yang paling dekat dengan `today`.
   */
  function searchTasks(tasks, query, today, limit = 30) {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return tasks
      .filter((t) => {
        const hay = fold([t.title, t.notes, ...(t.subtasks || []).map((x) => x.title)].join(' '));
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => Math.abs(D.diffDays(today, a.date)) - Math.abs(D.diffDays(today, b.date))
        || (a.start || '99').localeCompare(b.start || '99'))
      .slice(0, limit);
  }

  // ----- Berbagi -----

  /** Teks rencana satu hari yang siap ditempel ke WhatsApp (tebal = *…*, miring = _…_). */
  function shareText(tasks, date) {
    const sorted = sortTasks(tasks);
    const p = progress(sorted);
    const lines = [`*Rencana ${D.formatLong(date)}*`, ''];
    if (!sorted.length) lines.push('Belum ada rencana.');
    for (const t of sorted) {
      const time = t.start ? `${t.start}${t.end ? `–${t.end}` : ''} ` : '';
      lines.push(`${t.done ? '✅' : '⬜'} ${time}${t.title}${t.starred ? ' ⭐' : ''}`);
    }
    if (sorted.length) lines.push('', `_${p.done} dari ${p.total} selesai_`);
    return lines.join('\n');
  }

  function icsEscape(text) {
    return String(text || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  /** Lipat baris iCalendar tiap 75 karakter (RFC 5545). */
  function icsFold(line) {
    const out = [];
    let rest = line;
    while (rest.length > 75) {
      out.push(rest.slice(0, 75));
      rest = ` ${rest.slice(75)}`;
    }
    out.push(rest);
    return out.join('\r\n');
  }

  /** Berkas .ics berisi tugas-tugas (waktu lokal, tanpa zona waktu). */
  function toICS(tasks, now = new Date()) {
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const compact = (key) => key.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rencana Harian//ID', 'CALSCALE:GREGORIAN'];
    for (const t of sortTasks(tasks)) {
      lines.push('BEGIN:VEVENT', `UID:${t.id}@rencana-harian`, `DTSTAMP:${stamp}`);
      if (t.start) {
        const end = t.end || D.formatTime(Math.min(D.parseTime(t.start) + 60, 24 * 60 - 1));
        lines.push(`DTSTART:${compact(t.date)}T${t.start.replace(':', '')}00`);
        lines.push(`DTEND:${compact(t.date)}T${end.replace(':', '')}00`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${compact(t.date)}`);
        lines.push(`DTEND;VALUE=DATE:${compact(D.addDays(t.date, 1))}`);
      }
      lines.push(`SUMMARY:${icsEscape(t.title)}`);
      if (t.notes) lines.push(`DESCRIPTION:${icsEscape(t.notes)}`);
      const cat = CATEGORIES.find((c) => c.id === t.category);
      if (cat) lines.push(`CATEGORIES:${icsEscape(cat.label)}`);
      if (t.done) lines.push('STATUS:CONFIRMED');
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.map(icsFold).join('\r\n')}\r\n`;
  }

  return {
    CATEGORIES, PRIORITIES, MOODS, DAY_PARTS, REPEATS,
    occursOn, describeRule, searchTasks, shareText, toICS,
    capacity, autoSchedule, mergeIntervals,
    aggregateWeeks, hourHistogram, weekdayRates, activityLevel, heatmap, delta, insights,
    findCategory, parseQuickAdd, priorityRank, sortTasks, groupByDayPart, progress, nextTask,
    rolloverCandidates, layoutTimeline, habitDoneOn, currentStreak, bestStreak, habitRate,
    focusMinutesOn, summarizeDays, categoryCounts, pickForDate,
  };
});
