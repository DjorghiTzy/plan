/**
 * Utilitas tanggal & waktu berbahasa Indonesia.
 * Semua tanggal disimpan sebagai "kunci" string YYYY-MM-DD (waktu lokal)
 * dan jam sebagai string "HH:MM", supaya aman disimpan di localStorage.
 *
 * Berkas ini bisa dipakai di browser (Planner.date) maupun Node (require).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Planner = root.Planner || {}).date = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const DAYS_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  // Hari pasaran Jawa berulang tiap 5 hari. Acuan: 17 Agustus 1945 = Jumat Legi.
  const PASARAN = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
  const PASARAN_ANCHOR_UTC = Date.UTC(1945, 7, 17);

  const DAY_MS = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  function toKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function isKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function fromKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey(now = new Date()) {
    return toKey(now);
  }

  // Dihitung lewat UTC agar tidak terganggu pergantian jam musim panas.
  function utcOf(key) {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function addDays(key, n) {
    const dt = new Date(utcOf(key) + n * DAY_MS);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }

  /** Selisih hari b - a. */
  function diffDays(a, b) {
    return Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
  }

  function dayIndex(key) {
    return new Date(utcOf(key)).getUTCDay();
  }

  function dayName(key) {
    return DAYS[dayIndex(key)];
  }

  function dayShort(key) {
    return DAYS_SHORT[dayIndex(key)];
  }

  function formatLong(key) {
    const [y, m, d] = key.split('-').map(Number);
    return `${dayName(key)}, ${d} ${MONTHS[m - 1]} ${y}`;
  }

  function formatMedium(key) {
    const [y, m, d] = key.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }

  function formatShort(key) {
    const [, m, d] = key.split('-').map(Number);
    return `${d} ${MONTHS_SHORT[m - 1]}`;
  }

  function pasaran(key) {
    const days = Math.round((utcOf(key) - PASARAN_ANCHOR_UTC) / DAY_MS);
    return PASARAN[((days % 5) + 5) % 5];
  }

  /** Tanggal Hijriah, mis. "13 Rabiulakhir 1448 H". Kosong bila Intl tidak mendukung. */
  function hijri(key) {
    try {
      const fmt = new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      return fmt.format(fromKey(key));
    } catch {
      return '';
    }
  }

  /** Label relatif: "Hari ini", "Besok", "Kemarin", atau null. */
  function relativeLabel(key, today) {
    const diff = diffDays(today, key);
    if (diff === 0) return 'Hari ini';
    if (diff === 1) return 'Besok';
    if (diff === 2) return 'Lusa';
    if (diff === -1) return 'Kemarin';
    return null;
  }

  /**
   * Mengubah teks jam menjadi menit sejak tengah malam.
   * Menerima "14:30", "14.30", "0930", "9". Mengembalikan null bila tidak valid.
   */
  function parseTime(text) {
    if (text == null) return null;
    const s = String(text).trim();
    let h;
    let m = 0;
    let match = s.match(/^(\d{1,2})[:.](\d{2})$/);
    if (match) {
      h = Number(match[1]);
      m = Number(match[2]);
    } else if ((match = s.match(/^(\d{2})(\d{2})$/))) {
      h = Number(match[1]);
      m = Number(match[2]);
    } else if ((match = s.match(/^(\d{1,2})$/))) {
      h = Number(match[1]);
    } else {
      return null;
    }
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  function formatTime(minutes) {
    if (minutes == null || Number.isNaN(minutes)) return '';
    const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
    return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`;
  }

  function minutesOfDay(date = new Date()) {
    return date.getHours() * 60 + date.getMinutes();
  }

  /** Format durasi dalam menit: "45 mnt", "1 j 30 mnt". */
  function formatDuration(minutes) {
    const total = Math.max(0, Math.round(minutes));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h && m) return `${h} j ${m} mnt`;
    if (h) return `${h} jam`;
    return `${m} mnt`;
  }

  /** Bagian hari menurut kebiasaan sapaan Indonesia. */
  function dayPart(minutes) {
    if (minutes == null) return 'kapan';
    if (minutes >= 4 * 60 && minutes < 11 * 60) return 'pagi';
    if (minutes >= 11 * 60 && minutes < 15 * 60) return 'siang';
    if (minutes >= 15 * 60 && minutes < 18 * 60) return 'sore';
    return 'malam';
  }

  function greeting(date = new Date()) {
    return `Selamat ${dayPart(minutesOfDay(date))}`;
  }

  /** Daftar n kunci tanggal berurutan yang berakhir di endKey. */
  function lastNDays(endKey, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i -= 1) out.push(addDays(endKey, -i));
    return out;
  }

  /**
   * Matriks kalender bulanan (6 minggu x 7 hari), minggu dimulai hari Minggu
   * seperti kalender dinding di Indonesia.
   */
  function monthMatrix(year, month) {
    const first = `${year}-${pad(month + 1)}-01`;
    const start = addDays(first, -dayIndex(first));
    const weeks = [];
    for (let w = 0; w < 6; w += 1) {
      const week = [];
      for (let d = 0; d < 7; d += 1) week.push(addDays(start, w * 7 + d));
      weeks.push(week);
    }
    return weeks;
  }

  /** Senin di pekan yang memuat `key` (pekan Senin–Minggu). */
  function weekStart(key) {
    return addDays(key, -((dayIndex(key) + 6) % 7));
  }

  function weekKeys(key) {
    const start = weekStart(key);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  /** Nomor pekan ISO-8601 (pekan pertama memuat hari Kamis pertama tahun itu). */
  function isoWeek(key) {
    const thursday = addDays(weekStart(key), 3);
    const jan1 = `${thursday.slice(0, 4)}-01-01`;
    return Math.floor(diffDays(jan1, thursday) / 7) + 1;
  }

  return {
    weekStart, weekKeys, isoWeek,
    DAYS, DAYS_SHORT, MONTHS, MONTHS_SHORT, PASARAN,
    toKey, isKey, fromKey, todayKey, addDays, diffDays, dayIndex, dayName, dayShort,
    formatLong, formatMedium, formatShort, pasaran, hijri, relativeLabel,
    parseTime, formatTime, minutesOfDay, formatDuration, dayPart, greeting,
    lastNDays, monthMatrix,
  };
});
