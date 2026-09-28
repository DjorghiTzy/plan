/**
 * Menu aplikasi (logika murni): urutan ikon & dok favorit yang disimpan, pencarian
 * aplikasi/aksi (tanpa beda huruf besar & aksen, dengan skor), navigasi panah di grid,
 * dan jeda animasi "gelombang" dari titik asal.
 * Dapat diuji dengan `node --test`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Planner = root.Planner || {}).apps = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DOCK_MAX = 5;
  const MAX_IDS = 60;

  /** Huruf kecil tanpa aksen & spasi berlebih ("Rencana  Kérja" → "rencana kerja"). */
  function fold(s) {
    return String(s == null ? '' : s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  const uniq = (list) => [...new Set(list)];

  /**
   * Urutan tersimpan dirapikan terhadap daftar aplikasi yang ada: id asing & ganda dibuang,
   * aplikasi baru (belum ada di urutan tersimpan) disisipkan di posisi bawaannya.
   */
  function normalizeOrder(saved, ids) {
    const known = new Set(ids);
    const out = uniq((Array.isArray(saved) ? saved : []).filter((id) => typeof id === 'string' && known.has(id)));
    ids.forEach((id, i) => {
      if (out.includes(id)) return;
      // Letakkan setelah tetangga bawaan terdekat yang sudah ada.
      let at = 0;
      for (let j = i - 1; j >= 0; j -= 1) {
        const k = out.indexOf(ids[j]);
        if (k >= 0) {
          at = k + 1;
          break;
        }
      }
      out.splice(at, 0, id);
    });
    return out;
  }

  /** {order, dock} yang aman dipakai dari data tersimpan/sinkron (bisa rusak atau kosong). */
  function cleanLayout(raw, ids, defaults = {}) {
    const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const known = new Set(ids);
    const order = normalizeOrder(Array.isArray(r.order) ? r.order.slice(0, MAX_IDS) : [], ids);
    const src = Array.isArray(r.dock) ? r.dock : Array.isArray(defaults.dock) ? defaults.dock : [];
    const dock = uniq(src.filter((id) => typeof id === 'string' && known.has(id))).slice(0, DOCK_MAX);
    return { order, dock };
  }

  /** Pindahkan satu item dari indeks `from` ke `to` (salinan baru). */
  function move(list, from, to) {
    const out = list.slice();
    if (from < 0 || from >= out.length) return out;
    const [item] = out.splice(from, 1);
    out.splice(Math.max(0, Math.min(out.length, to)), 0, item);
    return out;
  }

  /**
   * Sematkan/lepas aplikasi di dok. Dok penuh → tidak berubah dan `full` bernilai true.
   * `on` memaksa arah (true = sematkan, false = lepas).
   */
  function toggleDock(dock, id, on, max = DOCK_MAX) {
    const has = dock.includes(id);
    const want = on == null ? !has : Boolean(on);
    if (want === has) return { dock: dock.slice(), changed: false, full: false };
    if (!want) return { dock: dock.filter((x) => x !== id), changed: true, full: false };
    if (dock.length >= max) return { dock: dock.slice(), changed: false, full: true };
    return { dock: [...dock, id], changed: true, full: false };
  }

  /** Huruf-huruf `q` muncul berurutan di `s` (mis. "rkj" di "rencana kerja"). */
  function subsequence(s, q) {
    let i = 0;
    for (const ch of s) if (ch === q[i]) i += 1;
    return i === q.length;
  }

  /**
   * Skor kecocokan aplikasi dengan kata kunci (0 = tidak cocok).
   * Awal nama > awal kata di nama > bagian nama > kata kunci > huruf berurutan.
   */
  function score(app, query) {
    const q = fold(query);
    if (!q) return 1;
    const label = fold(app.label);
    const words = label.split(' ');
    const keys = (app.keywords || []).map(fold);
    if (label === q) return 100;
    if (label.startsWith(q)) return 90;
    if (words.some((w) => w.startsWith(q))) return 80;
    if (label.includes(q)) return 70;
    if (keys.some((k) => k === q)) return 65;
    if (keys.some((k) => k.startsWith(q))) return 60;
    if (keys.some((k) => k.includes(q))) return 45;
    // Beberapa kata: semua harus cocok di nama/kata kunci.
    const parts = q.split(' ').filter(Boolean);
    const hay = [label, ...keys].join(' ');
    if (parts.length > 1 && parts.every((p) => hay.includes(p))) return 40;
    if (q.length >= 2 && subsequence(label.replace(/ /g, ''), q.replace(/ /g, ''))) return 20;
    return 0;
  }

  /** Aplikasi yang cocok, diurutkan skor (seri → urutan asli). Kata kunci kosong → semua. */
  function search(apps, query) {
    if (!fold(query)) return apps.slice();
    return apps
      .map((app, i) => ({ app, i, s: score(app, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.app);
  }

  /** Rentang huruf di `label` yang cocok dengan `query` (untuk disorot), atau null. */
  function matchRange(label, query) {
    const q = fold(query);
    if (!q) return null;
    const i = fold(label).indexOf(q);
    return i >= 0 ? [i, i + q.length] : null;
  }

  /**
   * Indeks baru setelah tombol panah/Home/End di grid `cols` kolom berisi `count` item.
   * Tidak keluar dari grid; panah bawah di baris terakhir yang tidak penuh tetap di tempat.
   */
  function gridStep(index, key, cols, count) {
    if (!count) return -1;
    const c = Math.max(1, cols);
    const i = Math.max(0, Math.min(count - 1, index));
    switch (key) {
      case 'ArrowRight': return Math.min(count - 1, i + 1);
      case 'ArrowLeft': return Math.max(0, i - 1);
      case 'ArrowDown': return i + c < count ? i + c : i;
      case 'ArrowUp': return i - c >= 0 ? i - c : i;
      case 'Home': return 0;
      case 'End': return count - 1;
      default: return i;
    }
  }

  /** Jeda (ms) animasi masuk: makin jauh dari titik asal, makin lambat muncul (efek gelombang). */
  function waveDelay(dx, dy, { perPx = 0.45, max = 420 } = {}) {
    return Math.round(Math.min(max, Math.hypot(dx, dy) * perPx));
  }

  return { DOCK_MAX, fold, normalizeOrder, cleanLayout, move, toggleDock, score, search, matchRange, gridStep, waveDelay };
});
