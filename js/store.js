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
    // Pengingat per jam untuk mengisi rencana (juga dikirim sebagai notifikasi push).
    hourly: false,
    hourlyFrom: 7,
    hourlyTo: 21,
    hiddenTemplates: [],
    // Jam kerja untuk Rencana Kerja (beban kerja, atur otomatis, laporan).
    workStart: '08:00',
    workEnd: '17:00',
    breakStart: '12:00',
    breakEnd: '13:00',
    workDays: [1, 2, 3, 4, 5],
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
      templates: [],
      projects: [],
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
      templates: Array.isArray(raw.templates) ? raw.templates : [],
      projects: Array.isArray(raw.projects) ? raw.projects : [],
      timer: { ...base.timer, ...(isObj(raw.timer) ? raw.timer : {}) },
    };
    if (!Array.isArray(s.settings.hiddenTemplates)) s.settings.hiddenTemplates = [];
    cleanWorkSettings(s.settings);
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
    s.templates = s.templates
      .filter((x) => isObj(x) && typeof x.name === 'string' && Array.isArray(x.tasks))
      .map((x) => ({ emoji: '', description: '', from: null, ...x, id: String(x.id || uid('tp')), tasks: cleanTemplateTasks(x.tasks) }));
    s.projects = s.projects
      .filter((x) => isObj(x) && typeof x.name === 'string' && x.name.trim())
      .map((x) => ({
        emoji: '📁', notes: '', createdAt: Date.now(), doneAt: null,
        ...x,
        id: String(x.id || uid('pj')),
        area: x.area === 'pribadi' ? 'pribadi' : 'kerja',
        status: x.status === 'selesai' ? 'selesai' : 'aktif',
        deadline: D.isKey(x.deadline) ? x.deadline : null,
      }));
    return s;
  }

  /** Jam kerja yang rusak (mis. dari impor) dikembalikan ke bawaan; istirahat boleh kosong. */
  function cleanWorkSettings(st) {
    const valid = (v) => TIME_RE.test(v || '');
    if (!valid(st.workStart) || !valid(st.workEnd) || st.workEnd <= st.workStart) {
      st.workStart = DEFAULT_SETTINGS.workStart;
      st.workEnd = DEFAULT_SETTINGS.workEnd;
    }
    if (!(valid(st.breakStart) && valid(st.breakEnd) && st.breakStart < st.breakEnd)) {
      st.breakStart = '';
      st.breakEnd = '';
    }
    const days = Array.isArray(st.workDays) ? st.workDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : null;
    st.workDays = days ? [...new Set(days)].sort((a, b) => a - b) : [...DEFAULT_SETTINGS.workDays];
  }

  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  /** Kegiatan template: judul wajib, jam boleh kosong, diurutkan menurut jam mulai. */
  function cleanTemplateTasks(list) {
    const L = P.logic;
    const cats = L ? L.CATEGORIES.map((c) => c.id) : null;
    const prios = L ? L.PRIORITIES.map((c) => c.id) : null;
    return (Array.isArray(list) ? list : [])
      .filter((x) => isObj(x) && typeof x.title === 'string' && x.title.trim())
      .slice(0, 40)
      .map((x) => {
        const start = TIME_RE.test(x.start || '') ? x.start : null;
        let end = TIME_RE.test(x.end || '') ? x.end : null;
        if (start && end && end <= start) end = null;
        const item = {
          title: x.title.trim().slice(0, 140),
          start,
          end: start ? end : null,
          category: !cats || cats.includes(x.category) ? x.category || 'pribadi' : 'pribadi',
          priority: !prios || prios.includes(x.priority) ? x.priority || 'sedang' : 'sedang',
          starred: Boolean(x.starred),
        };
        if (x.area === 'kerja' || x.area === 'pribadi') item.area = x.area;
        return item;
      })
      .sort((a, b) => (a.start || '99:99').localeCompare(b.start || '99:99'));
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
    writeTimer = null;
    try {
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch {
      storageOk = false;
    }
  }

  // Di browser, penulisan ke localStorage digabung & ditunda sebentar sehingga klik
  // tidak menunggu serialisasi seluruh data. Disimpan paksa saat halaman disembunyikan/ditutup.
  let writeTimer = null;
  const deferWrites = Boolean(root.document && typeof root.addEventListener === 'function');
  function scheduleWrite() {
    if (!deferWrites) {
      write();
      return;
    }
    if (writeTimer == null) writeTimer = setTimeout(write, 250);
  }
  function flush() {
    if (writeTimer != null) {
      clearTimeout(writeTimer);
      write();
    }
  }
  if (deferWrites) {
    root.addEventListener('pagehide', flush);
    root.document.addEventListener('visibilitychange', () => {
      if (root.document.hidden) flush();
    });
  }

  function sampleState() {
    const now = new Date();
    const s = emptyState();
    Object.assign(s, P.sample.build(D.todayKey(now), D.minutesOfDay(now)));
    s.settings.isSample = true;
    return s;
  }

  /**
   * Buang contoh data lama (dulu dimuat otomatis saat kunjungan pertama).
   * - Bila perangkat masih dalam mode contoh: kosongkan semua kecuali pengaturan & template.
   * - Bila contoh data pernah "disimpan": buang item berid "-contoh-" beserta catatan
   *   jurnal/air minum buatan contoh. Data buatan pengguna tidak tersentuh.
   * @returns {boolean} true bila ada yang dibuang
   */
  function purgeSample(s) {
    if (s.settings.isSample) {
      const keep = { ...s.settings, isSample: false };
      const templates = s.templates;
      Object.assign(s, emptyState(), { settings: keep, templates });
      return true;
    }
    const isSampleId = (x) => x && String(x.id).includes('-contoh-');
    const had = s.tasks.some(isSampleId) || s.series.some(isSampleId) || s.habits.some(isSampleId) || s.focusSessions.some(isSampleId);
    if (!had) return false;
    const sampleHabits = new Set(s.habits.filter(isSampleId).map((h) => h.id));
    s.tasks = s.tasks.filter((x) => !isSampleId(x) && !(x.seriesId && String(x.seriesId).includes('-contoh-')));
    s.series = s.series.filter((x) => !isSampleId(x));
    s.habits = s.habits.filter((x) => !isSampleId(x));
    s.focusSessions = s.focusSessions.filter((x) => !isSampleId(x));
    for (const key of Object.keys(s.habitLog)) {
      const list = (s.habitLog[key] || []).filter((id) => !sampleHabits.has(id));
      if (list.length) s.habitLog[key] = list;
      else delete s.habitLog[key];
    }
    const sm = P.sample || {};
    const grat = new Set([...(sm.GRATITUDE || []), 'Cuaca cerah untuk jogging pagi']);
    const notes = new Set(['', ...(sm.NOTES || [])]);
    for (const [date, j] of Object.entries(s.journal)) {
      const g = Array.isArray(j && j.gratitude) ? j.gratitude : [];
      const fromSample = j && grat.has(g[0]) && !g[1] && !g[2] && notes.has(j.notes || '') && !j.better
        && !j.intention && !j.planned && !j.closed;
      if (fromSample) {
        delete s.journal[date];
        delete s.water[date];
      }
    }
    return true;
  }

  function load() {
    const saved = read();
    // Kunjungan pertama dimulai kosong (tanpa contoh data).
    state = saved ? normalize(saved) : emptyState();
    const purged = purgeSample(state);
    if (!saved || purged) write();
    return { state, purged };
  }

  /**
   * Mengubah status. `mutator` menerima state dan boleh mengubahnya langsung.
   * opsi.silent: simpan tanpa memicu render ulang (dipakai saat mengetik).
   */
  function commit(mutator, opts = {}) {
    const result = mutator(state);
    scheduleWrite();
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
    if (writeTimer != null) return; // perubahan lokal belum tersimpan lebih baru
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
    if (data.area === 'kerja' || data.area === 'pribadi') task.area = data.area;
    if (data.projectId) task.projectId = data.projectId;
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
        const task = {
          id, date, title: item.title, notes: '', category: item.category,
          priority: item.priority, start: item.start, end: item.end, starred: wantStar,
          done: false, doneAt: null, subtasks: [], pomodoros: 0, createdAt: Date.now(),
        };
        if (item.area) task.area = item.area;
        s.tasks.push(task);
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

  const TEMPLATE_FIELDS = ['title', 'notes', 'category', 'priority', 'start', 'end', 'area', 'projectId'];

  function pickTemplate(data) {
    const out = {};
    for (const k of TEMPLATE_FIELDS) out[k] = data[k] == null ? (k === 'notes' ? '' : null) : data[k];
    out.subtasks = (data.subtasks || []).map((x) => x.title).filter(Boolean);
    return out;
  }

  function instanceFor(se, date) {
    const t = {
      // Id tetap per seri+tanggal agar dua perangkat tidak membuat kejadian ganda.
      id: `${se.id}.${date}`, date, origin: date, seriesId: se.id, auto: true,
      title: se.title, notes: se.notes, category: se.category, priority: se.priority,
      start: se.start, end: se.end, starred: false, done: false, doneAt: null,
      subtasks: se.subtasks.map((title) => ({ id: uid('s'), title, done: false })),
      pomodoros: 0, createdAt: Date.now(),
    };
    if (se.area) t.area = se.area;
    if (se.projectId) t.projectId = se.projectId;
    return t;
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

  /** Kosongkan semua rencana, proyek, kebiasaan, jurnal, dan sesi fokus. Pengaturan & template tetap. */
  function clearAll() {
    const keep = { ...state.settings, isSample: false };
    const templates = state.templates;
    commit(() => {
      state = emptyState();
      state.settings = keep;
      state.templates = templates;
    });
  }

  // ----- Template -----

  function findTemplate(id) {
    return state.templates.find((x) => x.id === id) || null;
  }

  /**
   * Simpan template (baru atau ubah). `from` = id saran asal bila template ini salinan saran.
   * @throws {Error} bila nama kosong atau tidak ada kegiatan
   */
  function saveTemplate(data) {
    const name = String(data.name || '').trim().slice(0, 60);
    const tasks = cleanTemplateTasks(data.tasks);
    if (!name) throw new Error('Beri nama template terlebih dahulu.');
    if (!tasks.length) throw new Error('Tambahkan minimal satu kegiatan yang berjudul.');
    return commit((s) => {
      const old = data.id ? s.templates.find((x) => x.id === data.id) : null;
      const tpl = {
        id: old ? old.id : uid('tp'),
        name,
        emoji: String(data.emoji || '').trim().slice(0, 8),
        description: String(data.description || '').trim().slice(0, 200),
        from: old ? old.from || null : data.from || null,
        tasks,
        createdAt: old ? old.createdAt || Date.now() : Date.now(),
        updatedAt: Date.now(),
      };
      if (old) s.templates[s.templates.indexOf(old)] = tpl;
      else s.templates.push(tpl);
      return tpl;
    });
  }

  function deleteTemplate(id) {
    return commit((s) => {
      const i = s.templates.findIndex((x) => x.id === id);
      return i >= 0 ? s.templates.splice(i, 1)[0] : null;
    });
  }

  function restoreTemplate(tpl) {
    commit((s) => {
      if (!s.templates.some((x) => x.id === tpl.id)) s.templates.push(tpl);
    });
  }

  function hideSuggestion(id, hidden = true) {
    commit((s) => {
      const set = new Set(s.settings.hiddenTemplates || []);
      if (hidden) set.add(id);
      else set.delete(id);
      s.settings = { ...s.settings, hiddenTemplates: [...set] };
    });
  }

  function showAllSuggestions() {
    setSettings({ hiddenTemplates: [] });
  }

  /** Susun data template dari tugas-tugas pada satu tanggal (untuk "Simpan hari ini sebagai template"). */
  function templateFromDate(date, area = null) {
    const L = P.logic;
    const tasks = state.tasks.filter((x) => x.date === date && (!area || L.areaOf(x) === area));
    return {
      name: '',
      emoji: area === 'kerja' ? '💼' : '⭐',
      description: '',
      tasks: cleanTemplateTasks(tasks.map((x) => ({
        title: x.title, start: x.start, end: x.end, category: x.category, priority: x.priority, starred: x.starred, area: x.area,
      }))),
    };
  }

  // ----- Proyek -----

  function findProject(id) {
    return (id && state.projects.find((x) => x.id === id)) || null;
  }

  /**
   * Simpan proyek (baru atau ubah).
   * @throws {Error} bila nama kosong atau tenggat tidak valid
   */
  function saveProject(data) {
    const name = String(data.name || '').trim().slice(0, 80);
    if (!name) throw new Error('Beri nama proyek terlebih dahulu.');
    const deadline = data.deadline ? String(data.deadline) : null;
    if (deadline && !D.isKey(deadline)) throw new Error('Tanggal tenggat tidak valid.');
    return commit((s) => {
      const old = data.id ? s.projects.find((x) => x.id === data.id) : null;
      const area = data.area === 'pribadi' ? 'pribadi' : 'kerja';
      const pj = {
        id: old ? old.id : uid('pj'),
        name,
        emoji: String(data.emoji || '').trim().slice(0, 8) || '📁',
        area,
        deadline,
        status: old ? old.status : 'aktif',
        notes: String(data.notes || '').trim().slice(0, 2000),
        createdAt: old ? old.createdAt : Date.now(),
        doneAt: old ? old.doneAt || null : null,
      };
      if (old) {
        s.projects[s.projects.indexOf(old)] = pj;
        // Proyek pindah ruang: tugas-tugasnya ikut pindah.
        if (old.area !== area) {
          for (const t of s.tasks) if (t.projectId === pj.id) touch(t).area = area;
          for (const se of s.series) if (se.projectId === pj.id) se.area = area;
        }
      } else {
        s.projects.push(pj);
      }
      return pj;
    });
  }

  function setProjectStatus(id, status) {
    commit((s) => {
      const pj = s.projects.find((x) => x.id === id);
      if (!pj) return;
      pj.status = status === 'selesai' ? 'selesai' : 'aktif';
      pj.doneAt = pj.status === 'selesai' ? Date.now() : null;
    });
  }

  /**
   * Hapus proyek. Tugas-tugasnya tetap ada, hanya dilepas dari proyek.
   * @returns {{project: object, taskIds: string[], seriesIds: string[]}|null} untuk Urungkan
   */
  function deleteProject(id) {
    return commit((s) => {
      const i = s.projects.findIndex((x) => x.id === id);
      if (i < 0) return null;
      const project = s.projects.splice(i, 1)[0];
      const taskIds = [];
      const seriesIds = [];
      for (const t of s.tasks) {
        if (t.projectId !== id) continue;
        touch(t).projectId = null;
        taskIds.push(t.id);
      }
      for (const se of s.series) {
        if (se.projectId !== id) continue;
        se.projectId = null;
        seriesIds.push(se.id);
      }
      return { project, taskIds, seriesIds };
    });
  }

  function restoreProject({ project, taskIds = [], seriesIds = [] }) {
    commit((s) => {
      if (!s.projects.some((x) => x.id === project.id)) s.projects.push(project);
      for (const t of s.tasks) if (taskIds.includes(t.id)) t.projectId = project.id;
      for (const se of s.series) if (seriesIds.includes(se.id)) se.projectId = project.id;
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
    load, commit, subscribe, onCommit, reload, resetLocal, uid, normalize, flush,
    findTask, addTask, updateTask, toggleTask, toggleStar, toggleSubtask, deleteTask, restoreTask,
    moveTasks, applyTemplate, deleteTasks, starredCount,
    findSeries, materialize, saveTask, stopSeries, applySchedule,
    addHabit, updateHabit, deleteHabit, toggleHabit,
    setWater, journalFor, setJournal, setWeekNote, logFocus, setTimer, setSettings,
    exportData, importData, clearAll, loadSample,
    findTemplate, saveTemplate, deleteTemplate, restoreTemplate, hideSuggestion, showAllSuggestions,
    templateFromDate, cleanTemplateTasks, purgeSample,
    findProject, saveProject, setProjectStatus, deleteProject, restoreProject,
  };
})(typeof self !== 'undefined' ? self : this);
