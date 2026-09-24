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
    isSample: false,
  };

  const DEFAULT_TIMER = { mode: 'fokus', status: 'idle', endsAt: null, remaining: null, taskId: null, cycle: 0 };

  function emptyState() {
    return {
      version: 1,
      settings: { ...DEFAULT_SETTINGS },
      tasks: [],
      habits: [],
      habitLog: {},
      water: {},
      journal: {},
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
      habits: Array.isArray(raw.habits) ? raw.habits : [],
      habitLog: isObj(raw.habitLog) ? raw.habitLog : {},
      water: isObj(raw.water) ? raw.water : {},
      journal: isObj(raw.journal) ? raw.journal : {},
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
  function commit(mutator, { silent = false } = {}) {
    const result = mutator(state);
    write();
    if (!silent) listeners.forEach((fn) => fn(state));
    return result;
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

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
      const t = findTask(id);
      if (!t) return null;
      Object.assign(t, patch);
      if (t.starred && starredCount(t.date, t.id) >= MAX_STARRED) t.starred = false;
      return t;
    });
  }

  function toggleTask(id) {
    return commit(() => {
      const t = findTask(id);
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
    commit(() => { t.starred = !t.starred; });
    return true;
  }

  function toggleSubtask(taskId, subId) {
    commit(() => {
      const t = findTask(taskId);
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

  function deleteTask(id) {
    return commit((s) => {
      const idx = s.tasks.findIndex((t) => t.id === id);
      return idx === -1 ? null : s.tasks.splice(idx, 1)[0];
    });
  }

  function restoreTask(task) {
    commit((s) => s.tasks.push(task));
  }

  function moveTasks(ids, date) {
    commit((s) => {
      for (const t of s.tasks) {
        if (!ids.includes(t.id)) continue;
        t.date = date;
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

  function deleteTasks(ids) {
    commit((s) => {
      s.tasks = s.tasks.filter((t) => !ids.includes(t.id));
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
    };
  }

  function setJournal(date, patch, opts) {
    commit((s) => {
      s.journal[date] = { ...journalFor(date), ...patch };
    }, opts);
  }

  function logFocus({ date, taskId, minutes }) {
    commit((s) => {
      s.focusSessions.push({ id: uid('f'), date, taskId: taskId || null, minutes, endedAt: Date.now() });
      const t = taskId && s.tasks.find((x) => x.id === taskId);
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
    load, commit, subscribe, uid, normalize,
    findTask, addTask, updateTask, toggleTask, toggleStar, toggleSubtask, deleteTask, restoreTask,
    moveTasks, applyTemplate, deleteTasks, starredCount,
    addHabit, updateHabit, deleteHabit, toggleHabit,
    setWater, journalFor, setJournal, logFocus, setTimer, setSettings,
    exportData, importData, clearAll, loadSample,
  };
})(typeof self !== 'undefined' ? self : this);
