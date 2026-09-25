/**
 * Pengenalan kegiatan yang luwes + rekomendasi waktu.
 *
 * - detect("main padel")  → Olahraga · Padel (kategori Kesehatan)
 * - detect("solad isya")  → Ibadah · Sholat, waktu Isya
 * - detect("ngaji habis maghrib") → Mengaji, dijangkarkan setelah Maghrib
 * Ejaan tak baku & salah ketik ditoleransi: huruf ganda, sh/sy→s, dh/dz, d/t di akhir kata,
 * serta selisih 1–2 huruf untuk kata yang cukup panjang.
 *
 * recommend() menyarankan beberapa jam yang cocok: waktu sholat, kebiasaan pengguna,
 * dan jendela yang wajar untuk jenis kegiatan itu, dengan melewati jadwal yang sudah terisi
 * (kegiatan pribadi di luar jam kerja, pekerjaan di dalam jam kerja).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./date.js'), require('./logic.js'), require('../data/activities.js'));
  } else {
    const P = (root.Planner = root.Planner || {});
    P.smart = factory(P.date, P.logic, P.activities);
  }
})(typeof self !== 'undefined' ? self : this, function (D, L, A) {
  'use strict';

  const PRAYER_ORDER = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];
  const PRAYER_LABEL = { subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya' };
  const AFTER = new Set(['setelah', 'habis', 'abis', 'sesudah', 'bada', 'bakda', 'badah', 'selesai', 'pasca', 'ba']);
  const BEFORE = new Set(['sebelum', 'jelang', 'menjelang']);
  const PARTS = {
    pagi: [300, 660], siang: [660, 900], sore: [900, 1080], malam: [1110, 1350], dini: [180, 300], subuhan: [240, 390],
  };

  // ----- Normalisasi -----

  function fold(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  /** Kunci bunyi: menyamakan ejaan tak baku yang umum di bahasa Indonesia. */
  function phon(word) {
    let w = word;
    w = w.replace(/dz/g, 'z').replace(/dh/g, 'd').replace(/sy|sh/g, 's').replace(/kh/g, 'k').replace(/gh/g, 'g')
      .replace(/th/g, 't').replace(/ph/g, 'f').replace(/ch/g, 'c').replace(/ck/g, 'k').replace(/q/g, 'k')
      .replace(/oe/g, 'u').replace(/dj/g, 'j').replace(/tj/g, 'c').replace(/x/g, 'ks').replace(/v/g, 'f');
    w = w.replace(/(.)\1+/g, '$1');
    w = w.replace(/d$/, 't').replace(/b$/, 'p');
    return w;
  }

  /** Kata-kata teks; "jalan2" dibaca "jalan jalan". */
  function tokenize(text) {
    const out = [];
    for (const raw of fold(text).split(' ')) {
      if (!raw) continue;
      const m = raw.match(/^([a-z]{3,})2$/);
      const words = m ? [m[1], m[1]] : [raw];
      for (const w of words) out.push({ raw: w, key: phon(w) });
    }
    return out;
  }

  /** Jarak Damerau-Levenshtein (OSA) dengan batas; > max dikembalikan max+1. */
  function distance(a, b, max = 2) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const prev2 = [];
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i += 1) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur[j] = v;
        best = Math.min(best, v);
      }
      if (best > max) return max + 1;
      prev2.length = 0;
      prev2.push(...prev);
      prev = cur;
    }
    return prev[b.length];
  }

  const allowed = (len) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

  /**
   * Tingkat kecocokan satu kata: 3 = persis, 2 = ejaan lain (bunyi sama), 1 = salah ketik, 0 = tidak.
   */
  function tokenLevel(t, k) {
    if (t.raw === k.raw) return 3;
    if (t.key === k.key) return 2;
    if (/\d/.test(t.raw) || t.key[0] !== k.key[0]) return 0;
    const max = Math.min(allowed(t.key.length), allowed(k.key.length));
    return max && distance(t.key, k.key, max) <= max ? 1 : 0;
  }

  // ----- Indeks kata kunci -----

  const ENTRIES = [];
  A.KINDS.forEach((kind, order) => {
    for (const word of kind.words) ENTRIES.push({ kind, order, word, toks: tokenize(word) });
  });
  const PRAYER_ENTRIES = [];
  for (const [id, words] of Object.entries(A.PRAYERS)) {
    for (const word of words) PRAYER_ENTRIES.push({ id, toks: tokenize(word) });
  }

  function prayerAt(tok) {
    let best = null;
    for (const e of PRAYER_ENTRIES) {
      const k = e.toks[0];
      // Nama pendek ("isa", "asr") hanya cocok persis dan dianggap lemah:
      // baru dipakai bila ada kata sholat/setelah di dekatnya (bukan nama orang).
      const short = k.raw.length <= 3 || tok.raw.length <= 3;
      const level = short ? (tok.raw === k.raw ? 3 : 0) : tokenLevel(tok, k);
      if (level && (!best || level > best.level || (best.weak && !short))) best = { id: e.id, level, weak: short };
    }
    return best;
  }

  // ----- Deteksi -----

  const cache = new Map();

  /**
   * @returns {null | {kind, level, keyword, prayer: string|null, part: string|null,
   *   anchor: {prayer: string, offset: number}|null}}
   */
  function detect(text) {
    const src = String(text || '');
    if (cache.has(src)) return cache.get(src);
    const toks = tokenize(src);
    let result = null;
    if (toks.length) {
      let anchor = null;
      let part = null;
      let prayer = null;
      const used = new Set();
      toks.forEach((t, i) => {
        if (PARTS[t.raw] && !part) part = t.raw;
        const next = toks[i + 1];
        if (next && (AFTER.has(t.raw) || BEFORE.has(t.raw))) {
          const p = prayerAt(next);
          if (p && !anchor) {
            anchor = { prayer: p.id, offset: AFTER.has(t.raw) ? 15 : -10 };
            used.add(i + 1);
          }
        }
      });
      let prayerWeak = false;
      toks.forEach((t, i) => {
        if (used.has(i) || (prayer && !prayerWeak)) return;
        const p = prayerAt(t);
        if (p && (!prayer || !p.weak)) {
          prayer = p.id;
          prayerWeak = p.weak;
        }
      });

      let best = null;
      for (const e of ENTRIES) {
        const n = e.toks.length;
        for (let i = 0; i + n <= toks.length; i += 1) {
          let level = 3;
          for (let j = 0; j < n && level; j += 1) level = Math.min(level, tokenLevel(toks[i + j], e.toks[j]));
          if (!level) continue;
          // Kata lebih banyak = lebih spesifik; jenis umum (Sholat, Olahraga, Makan) kalah dari yang khusus.
          const score = level * 10 + (n - 1) * 6 - (e.kind.generic ? 1 : 0);
          if (!best || score > best.score || (score === best.score && (i < best.pos || (i === best.pos && e.order < best.order)))) {
            best = { score, pos: i, order: e.order, kind: e.kind, level, keyword: e.word };
          }
        }
      }
      // Nama sholat saja ("isya", "zuhur") berarti sholat.
      if (!best && prayer && !prayerWeak) {
        const kind = A.KINDS.find((x) => x.id === 'sholat');
        best = { kind, level: 2, keyword: prayer };
      }
      if (best) {
        const isSholat = best.kind.id === 'sholat';
        // Nama sholat di kegiatan lain ("lari subuh", "ngaji maghrib") = sesudah sholat itu.
        if (!isSholat && prayer && !prayerWeak && !anchor) anchor = { prayer, offset: 15 };
        result = {
          kind: best.kind,
          level: best.level,
          keyword: best.keyword,
          prayer: isSholat ? prayer : null,
          part,
          anchor,
        };
      }
    }
    if (cache.size > 2000) cache.clear();
    cache.set(src, result);
    return result;
  }

  /** "🎾 Olahraga · Padel" */
  function describe(det) {
    if (!det) return '';
    const k = det.kind;
    const name = det.prayer ? `${k.label} ${PRAYER_LABEL[det.prayer]}` : k.label;
    return `${k.emoji} ${k.group === name ? name : `${k.group} · ${name}`}`;
  }

  /** Jenis kegiatan sebuah tugas (tersimpan, atau dikenali dari judulnya). */
  function kindOf(task) {
    if (task.kind && A.KINDS.some((k) => k.id === task.kind)) return task.kind;
    const d = detect(task.title);
    return d ? d.kind.id : null;
  }

  const kindById = (id) => A.KINDS.find((k) => k.id === id) || null;

  // ----- Rekomendasi waktu -----

  const ceil15 = (m) => Math.ceil(m / 15) * 15;

  function span(t) {
    const s = D.parseTime(t.start);
    const e = t.end ? D.parseTime(t.end) : s + 30;
    return [s, Math.max(e, s + 5)];
  }

  function partLabel(min) {
    if (min < 240) return 'Dini hari';
    if (min < 660) return 'Pagi';
    if (min < 900) return 'Siang';
    if (min < 1080) return 'Sore';
    return 'Malam';
  }

  /** Jendela waktu jenis kegiatan untuk tanggal itu, dalam menit [awal, akhir]. */
  function windowsFor(kind, date, work, prayers) {
    const day = D.dayIndex(date);
    const weekend = day === 0 || day === 6;
    const out = [];
    for (const spec of kind.windows || []) {
      const [range, flag] = spec.split(' ');
      if (flag === 'we' && !weekend) continue;
      if (flag === 'wd' && weekend) continue;
      if (flag && flag[0] === 'd' && Number(flag.slice(1)) !== day) continue;
      if (range === 'work') {
        if (work.rest) out.push([work.start, work.rest[0]], [work.rest[1], work.end]);
        else out.push([work.start, work.end]);
      } else if (range === 'work-start') {
        out.push([work.start, work.start + 60]);
      } else if (range === 'work-end') {
        out.push([Math.max(work.start, work.end - 90), work.end]);
      } else if (range === 'rest') {
        if (work.rest && work.isWorkday) out.push([work.rest[0], work.rest[1]]);
      } else if (range[0] === '@') {
        const m = range.match(/^@([a-z]+)([+-]\d+)?$/);
        const at = m && prayers && prayers[m[1]];
        if (at != null) out.push([at + Number(m[2] || 0), at + Number(m[2] || 0) + 45, m[1]]);
      } else {
        const [a, b] = range.split('-').map((x) => D.parseTime(x));
        if (a != null && b != null) out.push([a, b]);
      }
    }
    return out;
  }

  /**
   * Saran jam untuk sebuah kegiatan.
   * @param {object} o
   * @param {object} o.detection hasil detect()
   * @param {string} o.date tanggal rencana
   * @param {object[]} [o.tasks] semua tugas (untuk jadwal terisi & kebiasaan)
   * @param {object} [o.settings] pengaturan (jam kerja)
   * @param {Object<string, number>} [o.prayers] menit waktu sholat pada tanggal itu
   * @param {number|null} [o.nowMin] menit sekarang bila tanggalnya hari ini
   * @param {string} [o.excludeId] tugas yang sedang diubah
   * @param {number} [o.minutes] durasi yang diinginkan
   * @returns {{start: string, end: string, label: string, reason: string, clash: boolean}[]}
   */
  function recommend({ detection, date, tasks = [], settings = {}, prayers = null, nowMin = null, excludeId = null, minutes = null, limit = 3 }) {
    if (!detection) return [];
    const kind = detection.kind;
    const dur = minutes || kind.minutes;
    if (!dur) return [];
    const work = L.workWindow(settings, date);
    const busy = L.mergeIntervals(tasks.filter((t) => t.date === date && t.id !== excludeId && t.start).map(span));
    const blocked = [...busy];
    // Kegiatan pribadi di hari kerja tidak disarankan di jam kerja (kecuali jam istirahat),
    // kecuali yang memang dilakukan di sela kerja: sholat, minum obat, makan siang.
    if (kind.category !== 'kerja' && work.isWorkday && !kind.anytime && dur > 15) {
      if (work.rest) blocked.push([work.start, work.rest[0]], [work.rest[1], work.end]);
      else blocked.push([work.start, work.end]);
    }
    const earliest = nowMin != null ? ceil15(nowMin + 5) : 0;
    const free = (s) => !blocked.some(([a, b]) => s < b && s + dur > a);
    // strict: kegiatan harus selesai di dalam jendela; tanpa strict, jendela yang lebih
    // pendek dari durasi tetap boleh dipakai sebagai jam mulai.
    const firstFree = (from, to, strict = false) => {
      const last = strict ? to - dur : Math.max(from, to - dur);
      for (let s = Math.max(from, earliest); s <= last; s = s % 15 ? ceil15(s) : s + 15) {
        if (s + dur <= 24 * 60 && free(s)) return s;
      }
      return null;
    };
    const out = [];
    const push = (start, label, reason, fixed = false) => {
      if (start == null || start < earliest || start + Math.min(dur, 5) > 24 * 60) return;
      if (out.some((o) => Math.abs(o.min - start) < 15)) return;
      const clash = !free(start);
      if (clash && !fixed) return;
      const end = Math.min(start + dur, 24 * 60 - 1);
      out.push({ min: start, start: D.formatTime(start), end: D.formatTime(end), label, reason, clash });
    };

    // 1. Jangkar dari teks: "habis maghrib", "sebelum subuh".
    if (detection.anchor && prayers && prayers[detection.anchor.prayer] != null) {
      const at = prayers[detection.anchor.prayer];
      const name = PRAYER_LABEL[detection.anchor.prayer];
      if (detection.anchor.offset >= 0) {
        const s = firstFree(at + detection.anchor.offset, at + detection.anchor.offset + 90);
        push(s, `Setelah ${name}`, `Sesuai tulisanmu: setelah ${name} (${D.formatTime(at)})`);
      } else {
        push(at + detection.anchor.offset - dur, `Sebelum ${name}`, `Selesai sebelum ${name} (${D.formatTime(at)})`, true);
      }
    }

    // 2. Waktu sholat.
    if (kind.prayer && prayers) {
      const list = detection.prayer ? [detection.prayer] : PRAYER_ORDER;
      for (const p of list) {
        if (prayers[p] == null) continue;
        push(prayers[p], `${PRAYER_LABEL[p]}`, `Waktu ${PRAYER_LABEL[p]} ${D.formatTime(prayers[p])}`, true);
      }
    }

    // 3. Kebiasaan: jam yang biasa dipakai untuk kegiatan jenis ini (60 hari terakhir).
    const from = D.addDays(date, -60);
    const past = tasks.filter((t) => t.start && t.id !== excludeId && t.date !== date && t.date >= from && kindOf(t) === kind.id)
      .map((t) => D.parseTime(t.start)).sort((a, b) => a - b);
    if (past.length >= 2 && !(kind.prayer && detection.prayer)) {
      const usual = past[Math.floor(past.length / 2)];
      const s = firstFree(usual, usual + 60);
      if (s != null) push(s, 'Biasanya', `Kamu biasa ${kind.label.toLowerCase()} sekitar pukul ${D.formatTime(usual)}`);
    }

    // 4. Jendela yang wajar untuk jenis kegiatan ini (disaring "pagi/sore/malam" bila ditulis).
    let wins = windowsFor(kind, date, work, prayers);
    if (detection.part) {
      const [pa, pb] = PARTS[detection.part];
      const fit = wins.filter(([a, b]) => a < pb && b > pa).map(([a, b, tag]) => [Math.max(a, pa), Math.min(b, pb), tag]);
      wins = fit.length ? fit : [[pa, pb]];
    }
    const labelFor = (s, tag) => (tag ? `Setelah ${PRAYER_LABEL[tag]}` : kind.category === 'kerja' ? 'Jam kerja' : partLabel(s));
    const firsts = [];
    for (const [a, b, tag] of wins) {
      const s = firstFree(a, b);
      if (s == null) continue;
      firsts.push([s, b, tag]);
      push(s, labelFor(s, tag), `Waktu yang cocok untuk ${kind.label.toLowerCase()}`);
    }
    // Jendela panjang: tawarkan juga pilihan yang lebih larut agar lebih luwes.
    for (const [s, b, tag] of firsts) {
      if (out.length >= limit) break;
      const later = firstFree(s + Math.max(dur, 90), b, true);
      if (later != null) push(later, labelFor(later, tag), `Pilihan lain untuk ${kind.label.toLowerCase()}`);
    }

    return out.slice(0, limit).map((o) => ({ start: o.start, end: o.end, label: o.label, reason: o.reason, clash: o.clash }));
  }

  // ----- Pencarian yang luwes -----

  /** Pencarian sedikit lebih longgar dari deteksi: kata 4 huruf pun boleh salah satu huruf. */
  function queryMatch(q, toks) {
    const max = q.key.length >= 8 ? 2 : q.key.length >= 4 ? 1 : 0;
    return toks.some((h) => h.raw.includes(q.raw) || h.key === q.key
      || (max && !/\d/.test(q.raw) && h.key[0] === q.key[0] && distance(q.key, h.key, max) <= max));
  }

  /** Cocokkan tugas dengan kata pencarian: salah ketik & nama jenis kegiatan ("olahraga") ikut dihitung. */
  function matches(task, query) {
    const qs = tokenize(query);
    if (!qs.length) return false;
    const hay = tokenize([task.title, task.notes, ...(task.subtasks || []).map((s) => s.title)].join(' '));
    const id = kindOf(task);
    const kind = id ? kindById(id) : null;
    const cat = L.CATEGORIES.find((c) => c.id === task.category);
    const extra = tokenize(`${kind ? `${kind.label} ${kind.group}` : ''} ${cat ? cat.label : ''}`);
    return qs.every((q) => queryMatch(q, hay) || queryMatch(q, extra));
  }

  function searchTasks(tasks, query, today, limit = 30) {
    if (!tokenize(query).length) return [];
    return tasks
      .filter((t) => matches(t, query))
      .sort((a, b) => Math.abs(D.diffDays(today, a.date)) - Math.abs(D.diffDays(today, b.date))
        || (a.start || '99').localeCompare(b.start || '99'))
      .slice(0, limit);
  }

  /** Jumlah per jenis kegiatan (untuk Statistik). */
  function kindCounts(tasks) {
    const map = new Map();
    for (const t of tasks) {
      const id = kindOf(t);
      if (!id) continue;
      const row = map.get(id) || { kind: kindById(id), total: 0, done: 0 };
      row.total += 1;
      if (t.done) row.done += 1;
      map.set(id, row);
    }
    return [...map.values()].sort((a, b) => b.total - a.total || b.done - a.done);
  }

  return {
    PRAYER_ORDER, PRAYER_LABEL,
    fold, phon, tokenize, distance, detect, describe, kindOf, kindById, recommend, matches, searchTasks, kindCounts,
  };
});
