/**
 * Penyimpanan status aplikasi di localStorage + aksi-aksi yang mengubahnya.
 * Setiap perubahan lewat `commit()` akan disimpan lalu memberi tahu pendengar.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;

  const STORAGE_KEY = 'rencana-harian/v1';
  const MAX_STARRED = 3;

  const DEFAULT_SETTINGS = {
    name: '',
    theme: 'system',
    waterGoal: 8,
    focusMin: 25,
    shortMin: 5,
    longMin: 15,
    longEvery: 4,
    dayStart: 5,
    dayEnd: 23,
    reminders: true,
    sound: true,
    prayerEnabled: false,
    prayerCity: 'jakarta',
    isSample: false,
  };

  const DEFAULT_TIMER = { mode: 'fokus', status: 'idle', endsAt: null, remaining: null, taskId: null, cycle: 0 };

  function emptyState() {
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      tasks: [],
      series: [],
      habits: [],
      habitLog: {},
      water: {},
      journal: {},
      weekNotes: {},
      focusSessions: [],
      timer: { ...DEFAULT_TIMER },
    };
  }

  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  /** Melengkapi data lama/impor dengan nilai bawaan dan membuang yang rusak. */
  function normalize(raw) {
    const base = emptyState();
    if (!isObj(raw)) return base;
    const s = {
      ...base,
      settings: { ...base.settings, ...(isObj(raw.settings) ? raw.settings : {}) },
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      series: Array.isArray(raw.series) ? raw.series : [],
      habits: Array.isArray(raw.habits) ? raw.habits : [],
      habitLog: isObj(raw.habitLog) ? raw.habitLog : {},
      water: isObj(raw.water) ? raw.water : {},
      journal: isObj(raw.journal) ? raw.journal : {},
      weekNotes: isObj(raw.weekNotes) ? raw.weekNotes : {},
      focusSessions: Array.isArray(raw.focusSessions) ? raw.focusSessions : [],
      timer: { ...base.timer, ...(isObj(raw.timer) ? raw.timer : {}) },
    };
    s.tasks = s.tasks
      .filter((t) => isObj(t) && typeof t.title === 'string' && D.isKey(t.date))
      .map((t) => ({
        notes: '', category: 'pribadi', priority: 'sedang', start: null, end: null,
        starred: false, done: false, doneAt: null, pomodoros: 0, createdAt: Date.now(),
        ...t,
        id: String(t.id || uid('t')),
        subtasks: Array.isArray(t.subtasks) ? t.subtasks.filter(isObj) : [],
      }));
    s.series = s.series
      .filter((x) => isObj(x) && typeof x.title === 'string' && D.isKey(x.from) && x.rule)
      .map((x) => ({
        notes: '', category: 'pribadi', priority: 'sedang', start: null, end: null, subtasks: [],
        days: [], until: null, skips: [], ...x, id: String(x.id || uid('r')),
      }));
    s.habits = s.habits
      .filter((h) => isObj(h) && typeof h.name === 'string')
      .map((h) => ({ color: 'kesehatan', archived: false, createdOn: null, ...h, id: String(h.id || uid('h')) }));
    return s;
  }

  function uid(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  let state = emptyState();
  let storageOk = true;
  const listeners = new Set();
  const commitHooks = new Set();

  function read() {
    try {
      const text = root.localStorage.getItem(STORAGE_KEY);
      return text ? JSON.parse(text) : null;
    } catch {
      storageOk = false;
      return null;
    }
  }

  function write() {
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch {
      storageOk = false;
    }
  }

  function sampleState() {
    const now = new Date();
    const s = emptyState();
    Object.assign(s, P.sample.build(D.todayKey(now), D.minutesOfDay(now)));
    s.settings.isSample = true;
    return s;
  }

  function load() {
    const saved = read();
    state = saved ? normalize(saved) : sampleState();
    if (!saved) write();
    return state;
  }

  /**
   * Mengubah status. `mutator` menerima state dan boleh mengubahnya langsung.
   * opsi.silent: simpan tanpa memicu render ulang (dipakai saat mengetik).
   */
  function commit(mutator, opts = {}) {
    const result = mutator(state);
    write();
    commitHooks.forEach((fn) => fn(state, opts));
    if (!opts.silent) listeners.forEach((fn) => fn(state));
    return result;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /** Dipanggil pada setiap perubahan, termasuk yang diam (dipakai sinkronisasi). */
  function onCommit(fn) {
    commitHooks.add(fn);
    return () => commitHooks.delete(fn);
  }

  /** Muat ulang dari localStorage (mis. setelah tab lain mengubah data). */
  function reload() {
    const saved = read();
    if (!saved) return;
    state = normalize(saved);
    listeners.forEach((fn) => fn(state));
  }

  /** Kosongkan data perangkat ini (dipakai saat memakai data akun). */
  function resetLocal(opts) {
    commit(() => {
      state = emptyState();
    }, opts);
  }

  /** Tugas yang diubah pengguna tidak lagi dianggap hasil pengulangan otomatis. */
  const touch = (t) => {
    if (t) delete t.auto;
    return t;
  };

  // ----- Tugas -----

  function findTask(id) {
    return state.tasks.find((t) => t.id === id) || null;
  }

  function starredCount(date, exceptId) {
    return state.tasks.filter((t) => t.date === date && t.starred && t.id !== exceptId).length;
  }

  function addTask(data) {
    const task = {
      id: uid('t'),
      date: data.date,
      title: data.title.trim(),
      notes: data.notes || '',
      category: data.category || 'pribadi',
      priority: data.priority || 'sedang',
      start: data.start || null,
      end: data.end || null,
      starred: Boolean(data.starred) && starredCount(data.date) < MAX_STARRED,
      done: false,
      doneAt: null,
      subtasks: (data.subtasks || []).map((s) => ({ id: uid('s'), title: s.title, done: Boolean(s.done) })),
      pomodoros: 0,
      createdAt: Date.now(),
    };
    commit((s) => s.tasks.push(task));
    return task;
  }

  function updateTask(id, patch) {
    return commit(() => {
      const t = touch(findTask(id));
      if (!t) return null;
      Object.assign(t, patch);
      if (t.starred && starredCount(t.date, t.id) >= MAX_STARRED) t.starred = false;
      return t;
    });
  }

  function toggleTask(id) {
    return commit(() => {
      const t = touch(findTask(id));
      if (!t) return null;
      t.done = !t.done;
      t.doneAt = t.done ? Date.now() : null;
      if (t.done) t.subtasks.forEach((sub) => { sub.done = true; });
      return t;
    });
  }

  /** @returns {boolean} false bila sudah ada tiga prioritas pada tanggal itu. */
  function toggleStar(id) {
    const t = findTask(id);
    if (!t) return false;
    if (!t.starred && starredCount(t.date, t.id) >= MAX_STARRED) return false;
    commit(() => {
      touch(t);
      t.starred = !t.starred;
    });
    return true;
  }

  function toggleSubtask(taskId, subId) {
    commit(() => {
      const t = touch(findTask(taskId));
      const sub = t && t.subtasks.find((x) => x.id === subId);
      if (!sub) return;
      sub.done = !sub.done;
      if (t.subtasks.length && t.subtasks.every((x) => x.done) && !t.done) {
        t.done = true;
        t.doneAt = Date.now();
      } else if (!sub.done && t.done) {
        t.done = false;
        t.doneAt = null;
      }
    });
  }

  function findSeries(id) {
    return (id && state.series.find((x) => x.id === id)) || null;
  }

  /** Tanggal asli sebuah kejadian berulang (sebelum dipindah). */
  const originOf = (task) => task.origin || task.date;

  /** Catat tanggal asal yang dilewati agar kejadian berulang tidak dibuat ulang. */
  function skipOccurrence(task) {
    const se = findSeries(task.seriesId);
    const origin = originOf(task);
    if (se && !se.skips.includes(origin)) se.skips.push(origin);
  }

  function unskipOccurrence(task) {
    const se = findSeries(task.seriesId);
    if (se) se.skips = se.skips.filter((k) => k !== originOf(task));
  }

  /** Pindahkan satu tugas; kejadian berulang yang meninggalkan tanggal asalnya dicatat sebagai lewati. */
  function relocate(t, date) {
    touch(t);
    if (t.seriesId) {
      if (date === originOf(t)) unskipOccurrence(t);
      else skipOccurrence(t);
    }
    t.date = date;
  }

  function deleteTask(id) {
    return commit((s) => {
      const idx = s.tasks.findIndex((t) => t.id === id);
      if (idx === -1) return null;
      skipOccurrence(s.tasks[idx]);
      return s.tasks.splice(idx, 1)[0];
    });
  }

  function restoreTask(task) {
    commit((s) => {
      if (task.date === originOf(task)) unskipOccurrence(task);
      s.tasks.push(task);
    });
  }

  function moveTasks(ids, date) {
    commit((s) => {
      for (const t of s.tasks) {
        if (!ids.includes(t.id) || t.date === date) continue;
        relocate(t, date);
        if (t.starred && starredCount(date, t.id) >= MAX_STARRED) t.starred = false;
      }
    });
  }

  /** @returns {string[]} id tugas yang dibuat (untuk tombol Urungkan). */
  function applyTemplate(template, date) {
    return commit((s) => {
      let starred = starredCount(date);
      const ids = [];
      for (const item of template.tasks) {
        const wantStar = Boolean(item.starred) && starred < MAX_STARRED;
        if (wantStar) starred += 1;
        const id = uid('t');
        ids.push(id);
        s.tasks.push({
          id, date, title: item.title, notes: '', category: item.category,
          priority: item.priority, start: item.start, end: item.end, starred: wantStar,
          done: false, doneAt: null, subtasks: [], pomodoros: 0, createdAt: Date.now(),
        });
      }
      return ids;
    });
  }

  /**
   * Terapkan jadwal otomatis sekaligus.
   * @returns {{id, start, end}[]} nilai sebelumnya (untuk Urungkan)
   */
  function applySchedule(plan) {
    return commit(() => {
      const before = [];
      for (const p of plan) {
        const t = touch(findTask(p.id));
        if (!t) continue;
        before.push({ id: t.id, start: t.start, end: t.end });
        t.start = p.start;
        t.end = p.end;
      }
      return before;
    });
  }

  function deleteTasks(ids) {
    commit((s) => {
      s.tasks = s.tasks.filter((t) => !ids.includes(t.id));
    });
  }

  // ----- Tugas berulang -----

  const TEMPLATE_FIELDS = ['title', 'notes', 'category', 'priority', 'start', 'end'];

  function pickTemplate(data) {
    const out = {};
    for (const k of TEMPLATE_FIELDS) out[k] = data[k] == null ? (k === 'notes' ? '' : null) : data[k];
    out.subtasks = (data.subtasks || []).map((x) => x.title).filter(Boolean);
    return out;
  }

  function instanceFor(se, date) {
    return {
      // Id tetap per seri+tanggal agar dua perangkat tidak membuat kejadian ganda.
      id: `${se.id}.${date}`, date, origin: date, seriesId: se.id, auto: true,
      title: se.title, notes: se.notes, category: se.category, priority: se.priority,
      start: se.start, end: se.end, starred: false, done: false, doneAt: null,
      subtasks: se.subtasks.map((title) => ({ id: uid('s'), title, done: false })),
      pomodoros: 0, createdAt: Date.now(),
    };
  }

  /**
   * Pastikan kejadian tugas berulang ada untuk tanggal-tanggal ini.
   * Disimpan diam-diam (tanpa render ulang) karena dipanggil saat merender.
   */
  function materialize(dates) {
    const L = P.logic;
    const add = [];
    for (const date of dates) {
      for (const se of state.series) {
        if (!L.occursOn(se, date)) continue;
        if (state.tasks.some((t) => t.seriesId === se.id && originOf(t) === date)) continue;
        if (add.some((t) => t.seriesId === se.id && originOf(t) === date)) continue;
        add.push(instanceFor(se, date));
      }
    }
    if (add.length) commit((s) => s.tasks.push(...add), { silent: true });
    return add.length;
  }

  /** Hapus kejadian mendatang yang belum selesai dan tidak cocok lagi dengan seri. */
  function pruneFuture(s, se, afterDate) {
    const L = P.logic;
    s.tasks = s.tasks.filter((t) => !(t.seriesId === se.id && t.date > afterDate && !t.done && !L.occursOn(se, t.date)));
  }

  /**
   * Simpan tugas dari editor, termasuk pengaturan pengulangan.
   * @param {object|null} task tugas yang diedit (null = baru)
   * @param {object} data field tugas dari formulir
   * @param {{rule: string, days: number[]}} repeat rule '' = tidak berulang
   */
  function saveTask(task, data, repeat) {
    const rule = repeat && repeat.rule ? repeat.rule : '';
    const days = rule === 'mingguan' ? [...new Set(repeat.days || [])] : [];
    if (rule === 'mingguan' && !days.length) throw new Error('Pilih minimal satu hari untuk pengulangan mingguan.');

    if (!task && !rule) return addTask(data);

    return commit((s) => {
      let t = task ? findTask(task.id) : null;
      const current = t && findSeries(t.seriesId);

      if (!t) {
        const se = { id: uid('r'), rule, days, from: data.date, until: null, skips: [], ...pickTemplate(data) };
        s.series.push(se);
        t = { ...instanceFor(se, data.date), starred: Boolean(data.starred) && starredCount(data.date) < MAX_STARRED };
        delete t.auto;
        t.subtasks = (data.subtasks || []).map((x) => ({ id: uid('s'), title: x.title, done: Boolean(x.done) }));
        s.tasks.push(t);
        return t;
      }

      const oldDate = t.date;
      touch(t);
      if (current && data.date !== oldDate) relocate(t, data.date);
      Object.assign(t, data);
      if (t.starred && starredCount(t.date, t.id) >= MAX_STARRED) t.starred = false;

      if (!rule) {
        if (current) {
          // Hentikan seri mulai tanggal ini; tugas ini tetap ada sebagai tugas biasa.
          current.until = D.addDays(oldDate, -1);
          s.tasks = s.tasks.filter((x) => !(x.seriesId === current.id && x.date > oldDate && !x.done));
          t.seriesId = null;
          if (current.until < current.from) {
            s.series = s.series.filter((x) => x.id !== current.id);
            s.tasks.forEach((x) => { if (x.seriesId === current.id) x.seriesId = null; });
          }
        }
        return t;
      }

      if (!current) {
        const se = { id: uid('r'), rule, days, from: t.date, until: null, skips: [], ...pickTemplate(data) };
        s.series.push(se);
        t.seriesId = se.id;
        return t;
      }

      // Perubahan berlaku untuk tugas ini dan kejadian berikutnya yang belum selesai.
      Object.assign(current, { rule, days }, pickTemplate(data));
      pruneFuture(s, current, t.date);
      for (const x of s.tasks) {
        if (x.seriesId !== current.id || x.date <= t.date || x.done) continue;
        touch(x);
        for (const k of TEMPLATE_FIELDS) x[k] = current[k];
      }
      return t;
    });
  }

  /** Hentikan seri berulang: hapus kejadian ini dan berikutnya yang belum selesai. */
  function stopSeries(taskId) {
    const t = findTask(taskId);
    const se = t && findSeries(t.seriesId);
    if (!se) return 0;
    return commit((s) => {
      const before = s.tasks.length;
      se.until = D.addDays(t.date, -1);
      s.tasks = s.tasks.filter((x) => !(x.seriesId === se.id && x.date >= t.date && !x.done));
      if (se.until < se.from) {
        s.series = s.series.filter((x) => x.id !== se.id);
        s.tasks.forEach((x) => { if (x.seriesId === se.id) x.seriesId = null; });
      }
      return before - s.tasks.length;
    });
  }

  // ----- Kebiasaan -----

  function addHabit({ name, color }) {
    const habit = { id: uid('h'), name: name.trim(), color, createdOn: D.todayKey(), archived: false };
    commit((s) => s.habits.push(habit));
    return habit;
  }

  function updateHabit(id, patch) {
    commit((s) => {
      const h = s.habits.find((x) => x.id === id);
      if (h) Object.assign(h, patch);
    });
  }

  function deleteHabit(id) {
    commit((s) => {
      s.habits = s.habits.filter((h) => h.id !== id);
      for (const key of Object.keys(s.habitLog)) {
        s.habitLog[key] = s.habitLog[key].filter((x) => x !== id);
        if (!s.habitLog[key].length) delete s.habitLog[key];
      }
    });
  }

  function toggleHabit(id, date) {
    commit((s) => {
      const list = s.habitLog[date] || [];
      s.habitLog[date] = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      if (!s.habitLog[date].length) delete s.habitLog[date];
    });
  }

  // ----- Air, jurnal, fokus -----

  function setWater(date, glasses) {
    commit((s) => {
      s.water[date] = Math.max(0, Math.min(20, glasses));
    });
  }

  function journalFor(date) {
    const j = state.journal[date] || {};
    return {
      mood: j.mood || null,
      gratitude: Array.isArray(j.gratitude) ? [...j.gratitude, '', '', ''].slice(0, 3) : ['', '', ''],
      notes: j.notes || '',
      better: j.better || '',
      intention: j.intention || '',
      planned: Boolean(j.planned),
      closed: Boolean(j.closed),
    };
  }

  function setJournal(date, patch, opts) {
    commit((s) => {
      s.journal[date] = { ...journalFor(date), ...patch };
    }, opts);
  }

  /** Target/catatan pekanan, dikunci dengan tanggal Senin pekan itu. */
  function setWeekNote(week, text, opts) {
    commit((s) => {
      if (text.trim()) s.weekNotes[week] = text;
      else delete s.weekNotes[week];
    }, opts);
  }

  function logFocus({ date, taskId, minutes }) {
    commit((s) => {
      s.focusSessions.push({ id: uid('f'), date, taskId: taskId || null, minutes, endedAt: Date.now() });
      const t = taskId && touch(s.tasks.find((x) => x.id === taskId));
      if (t) t.pomodoros = (t.pomodoros || 0) + 1;
    });
  }

  function setTimer(patch) {
    commit((s) => {
      s.timer = { ...s.timer, ...patch };
    });
  }

  function setSettings(patch) {
    commit((s) => {
      s.settings = { ...s.settings, ...patch };
    });
  }

  // ----- Data -----

  function exportData() {
    return JSON.stringify({ app: 'rencana-harian', exportedAt: new Date().toISOString(), ...state }, null, 2);
  }

  /** @throws {Error} bila berkas bukan cadangan Rencana Harian. */
  function importData(text) {
    let raw;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('Berkas bukan JSON yang valid.');
    }
    if (!isObj(raw) || !Array.isArray(raw.tasks)) {
      throw new Error('Berkas ini bukan cadangan Rencana Harian.');
    }
    delete raw.app;
    delete raw.exportedAt;
    const next = normalize(raw);
    next.timer = { ...DEFAULT_TIMER };
    commit(() => { state = next; });
    return state;
  }

  function clearAll() {
    const keep = { ...state.settings, isSample: false };
    commit(() => {
      state = emptyState();
      state.settings = keep;
    });
  }

  function loadSample() {
    const keep = state.settings;
    commit(() => {
      state = sampleState();
      state.settings = { ...keep, isSample: true };
    });
  }

  P.store = {
    MAX_STARRED,
    get state() { return state; },
    get storageOk() { return storageOk; },
    load, commit, subscribe, onCommit, reload, resetLocal, uid, normalize,
    findTask, addTask, updateTask, toggleTask, toggleStar, toggleSubtask, deleteTask, restoreTask,
    moveTasks, applyTemplate, deleteTasks, starredCount,
    findSeries, materialize, saveTask, stopSeries, applySchedule,
    addHabit, updateHabit, deleteHabit, toggleHabit,
    setWater, journalFor, setJournal, setWeekNote, logFocus, setTimer, setSettings,
    exportData, importData, clearAll, loadSample,
  };
})(typeof self !== 'undefined' ? self : this);
