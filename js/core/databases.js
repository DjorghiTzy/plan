/**
 * Database terpisah per fungsi aplikasi.
 *
 * Data tidak disimpan sebagai satu dokumen besar: tiap fungsi punya database sendiri,
 * di perangkat (localStorage "rencana-harian/db/<id>") dan di server akun (hash Redis
 * "d:<akun>:<id>"). Modul ini dipakai klien & server untuk menentukan database setiap
 * entri sinkron (mis. "run:r-1" → olahraga) dan setiap field status aplikasi.
 *
 * Tugas, tugas berulang, dan proyek masuk Kerja atau Pribadi menurut isinya
 * (area, atau kategori "kerja"), sama seperti pembagian Rencana Kerja/Pribadi.
 * Dapat diuji dengan `node --test`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Planner = root.Planner || {}).databases = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DBS = [
    {
      id: 'kerja', name: 'Database Kerja', icon: 'briefcase', colors: ['#2f6fed', '#8cc8ff', '#1b3a8f'],
      desc: 'Tugas & proyek kerja, Retur / Delivery Order, catatan kerja harian.',
      fields: [['tasks', 'tugas'], ['series', 'tugas berulang'], ['projects', 'proyek'], ['cases', 'Retur/DO'], ['workNotes', 'hari catatan kerja']],
    },
    {
      id: 'pribadi', name: 'Database Pribadi', icon: 'heart', colors: ['#f0386b', '#ffb44d', '#8a1538'],
      desc: 'Tugas & proyek pribadi, checklist sholat.',
      fields: [['tasks', 'tugas'], ['series', 'tugas berulang'], ['projects', 'proyek'], ['ibadah', 'hari sholat']],
    },
    {
      id: 'olahraga', name: 'Database Olahraga', icon: 'activity', colors: ['#fb7a24', '#ffd2a8', '#6f2a0c'],
      desc: 'Catatan lari, detail dari screenshot, chat coach, rute tersimpan.',
      fields: [['runs', 'lari'], ['runExtras', 'detail lari'], ['coachChats', 'chat coach'], ['coachTrash', 'chat di sampah'], ['savedRoutes', 'rute tersimpan']],
    },
    {
      id: 'kebiasaan', name: 'Database Kebiasaan & Kesehatan', icon: 'repeat', colors: ['#8b5cf6', '#e4dcff', '#4c1d95'],
      desc: 'Daftar kebiasaan, centang harian, air minum.',
      fields: [['habits', 'kebiasaan'], ['habitLog', 'hari tercentang'], ['water', 'hari air minum']],
    },
    {
      id: 'jurnal', name: 'Database Jurnal', icon: 'book', colors: ['#f59e0b', '#fff3cf', '#9a4a07'],
      desc: 'Catatan harian, suasana hati, rasa syukur, niat, target pekan.',
      fields: [['journal', 'catatan harian'], ['weekNotes', 'target pekan']],
    },
    {
      id: 'fokus', name: 'Database Fokus', icon: 'timer', colors: ['#f2493f', '#2fbf71', '#ffffff'],
      desc: 'Sesi Pomodoro yang selesai dan timer yang sedang berjalan.',
      fields: [['focusSessions', 'sesi fokus']],
    },
    {
      id: 'umum', name: 'Pengaturan & Template', icon: 'sliders', colors: ['#64748b', '#dfe6ee', '#f97316'],
      desc: 'Pengaturan aplikasi dan template rutinitas.',
      fields: [['settings', 'pengaturan'], ['templates', 'template']],
    },
  ];
  const IDS = DBS.map((d) => d.id);
  const byId = Object.fromEntries(DBS.map((d) => [d.id, d]));

  // Prefiks kunci sinkron → database tetap.
  const FIXED = {
    case: 'kerja', workNote: 'kerja',
    ibadah: 'pribadi',
    run: 'olahraga', runx: 'olahraga', coach: 'olahraga', coachbin: 'olahraga', savedroute: 'olahraga',
    habit: 'kebiasaan', habitLog: 'kebiasaan', water: 'kebiasaan',
    journal: 'jurnal', weekNote: 'jurnal',
    focus: 'fokus', timer: 'fokus',
    settings: 'umum', template: 'umum',
  };
  // Prefiks yang databasenya Kerja/Pribadi menurut isinya → bawaan bila tidak jelas.
  const BY_AREA = { task: 'pribadi', series: 'pribadi', project: 'kerja' };
  const AREA_DBS = ['kerja', 'pribadi'];
  const FALLBACK = 'umum';
  /** Aturan yang sama untuk skrip migrasi di server (Lua). */
  const ROUTING = { fixed: FIXED, area: BY_AREA, fallback: FALLBACK };

  // Field status aplikasi → database (field larik yang dibagi Kerja/Pribadi ada di SPLIT).
  const SPLIT = { tasks: 'task', series: 'series', projects: 'project' };
  const OWN = {
    cases: 'kerja', workNotes: 'kerja',
    ibadah: 'pribadi',
    runs: 'olahraga', runExtras: 'olahraga', coachChats: 'olahraga', coachTrash: 'olahraga', savedRoutes: 'olahraga',
    habits: 'kebiasaan', habitLog: 'kebiasaan', water: 'kebiasaan',
    journal: 'jurnal', weekNotes: 'jurnal',
    focusSessions: 'fokus', timer: 'fokus',
    settings: 'umum', templates: 'umum', version: 'umum',
  };

  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const prefixOf = (key) => {
    const s = String(key);
    const i = s.indexOf(':');
    return i < 0 ? s : s.slice(0, i);
  };

  /** Kerja/Pribadi untuk tugas, tugas berulang, atau proyek (`prefix` = task|series|project). */
  function areaDb(prefix, value) {
    if (isObj(value)) {
      if (value.area === 'kerja' || value.area === 'pribadi') return value.area;
      if (value.category === 'kerja') return 'kerja';
    }
    return BY_AREA[prefix] || FALLBACK;
  }

  /** Database untuk satu entri sinkron (`value` = isinya; null/undefined untuk yang dihapus). */
  function dbOf(key, value) {
    const p = prefixOf(key);
    if (FIXED[p]) return FIXED[p];
    if (BY_AREA[p]) return areaDb(p, value);
    return FALLBACK;
  }

  /** Semua database yang mungkin berisi kunci ini (Kerja & Pribadi untuk tugas/proyek). */
  function family(key) {
    const p = prefixOf(key);
    if (FIXED[p]) return [FIXED[p]];
    if (BY_AREA[p]) return AREA_DBS.slice();
    return [FALLBACK];
  }

  /** Database untuk satu field status aplikasi (field yang dibagi → null). */
  const fieldDb = (field) => (SPLIT[field] ? null : OWN[field] || FALLBACK);

  /** Bagi status aplikasi menjadi bagian per database: {kerja: {...}, pribadi: {...}, …}. */
  function split(state) {
    const parts = Object.fromEntries(IDS.map((id) => [id, {}]));
    for (const [field, value] of Object.entries(state || {})) {
      if (SPLIT[field] && Array.isArray(value)) {
        for (const id of AREA_DBS) parts[id][field] = [];
        for (const item of value) parts[areaDb(SPLIT[field], item)][field].push(item);
      } else {
        parts[fieldDb(field)][field] = value;
      }
    }
    return parts;
  }

  /** Gabungkan bagian-bagian database kembali menjadi satu status aplikasi. */
  function join(parts) {
    const state = {};
    for (const id of IDS) {
      const part = parts && parts[id];
      if (!isObj(part)) continue;
      for (const [field, value] of Object.entries(part)) {
        if (SPLIT[field] && Array.isArray(value)) state[field] = (state[field] || []).concat(value);
        else state[field] = value;
      }
    }
    return state;
  }

  /** Jumlah isi satu nilai (larik → panjang, objek → jumlah kunci). */
  function sizeOf(value) {
    if (Array.isArray(value)) return value.length;
    if (isObj(value)) return Object.keys(value).length;
    return value == null ? 0 : 1;
  }

  /** Ringkasan isi per database dari bagian hasil split: [{field, label, count}]. */
  function counts(id, part) {
    const db = byId[id];
    if (!db) return [];
    return db.fields.map(([field, label]) => ({ field, label, count: sizeOf(part && part[field]) }));
  }

  return {
    DBS, IDS, byId, FIXED, BY_AREA, AREA_DBS, FALLBACK, ROUTING, SPLIT, OWN,
    prefixOf, areaDb, dbOf, family, fieldDb, split, join, sizeOf, counts,
  };
});
