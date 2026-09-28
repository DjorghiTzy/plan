/**
 * Musik (logika murni): urutan putar (acak, ulangi), lagu berikut/sebelumnya, format waktu,
 * judul dari nama berkas, pembaca tag ID3 (judul, artis, album, sampul) untuk lagu yang
 * diimpor, dan pembagian berkas menjadi potongan untuk disimpan di server.
 * Dapat diuji dengan `node --test`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Planner = root.Planner || {}).playlist = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REPEATS = ['off', 'all', 'one'];
  const CHUNK_BYTES = 384 * 1024; // potongan unggah ke server (±512 KB setelah base64)
  const MAX_TRACK_BYTES = 15 * 1024 * 1024;

  /** Acak (Fisher-Yates) dengan angka acak yang bisa ditentukan untuk uji. */
  function shuffled(ids, rand = Math.random) {
    const out = ids.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /**
   * Urutan putar: daftar asli, atau diacak dengan lagu yang sedang diputar di depan
   * (lagu yang sedang jalan tidak terulang saat acak dinyalakan).
   */
  function playOrder(ids, { shuffle = false, current = null, rand = Math.random } = {}) {
    if (!shuffle) return ids.slice();
    const rest = shuffled(ids.filter((id) => id !== current), rand);
    return current && ids.includes(current) ? [current, ...rest] : rest;
  }

  /**
   * Lagu berikutnya. `auto` = lagu habis sendiri (ulangi satu → lagu yang sama;
   * tanpa ulangi di akhir daftar → berhenti/null). Tombol "berikutnya" selalu pindah lagu.
   */
  function nextId(order, current, { repeat = 'off', auto = false } = {}) {
    if (!order.length) return null;
    if (auto && repeat === 'one') return current;
    const i = order.indexOf(current);
    if (i < 0) return order[0];
    if (i + 1 < order.length) return order[i + 1];
    return repeat === 'off' && auto ? null : order[0];
  }

  /** Lagu sebelumnya (dari lagu pertama → lagu terakhir). */
  function prevId(order, current) {
    if (!order.length) return null;
    const i = order.indexOf(current);
    if (i <= 0) return order[order.length - 1];
    return order[i - 1];
  }

  const nextRepeat = (r) => REPEATS[(REPEATS.indexOf(r) + 1) % REPEATS.length];

  /** 0:00 / 3:12 / 1:02:03. */
  function formatTime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
  }

  /** Judul & artis dari nama berkas: "Artis - Judul (NCS Release).mp3". */
  function parseName(filename) {
    let base = String(filename || '').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    base = base.replace(/\s*[[(](official.*?|lyrics?|audio|ncs.*?|copyright free.*?|no copyright.*?|free download)[\])]\s*/gi, ' ').trim();
    const parts = base.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    return { artist: '', title: base || 'Lagu tanpa judul' };
  }

  // ----- ID3v2 (MP3) -----

  function decodeText(bytes, enc) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    if (enc === 1 || enc === 2) {
      // UTF-16 dengan BOM (1) atau UTF-16BE tanpa BOM (2).
      let i = 0;
      let le = enc === 1;
      if (enc === 1 && u8.length >= 2) {
        if (u8[0] === 0xff && u8[1] === 0xfe) {
          le = true;
          i = 2;
        } else if (u8[0] === 0xfe && u8[1] === 0xff) {
          le = false;
          i = 2;
        }
      }
      for (; i + 1 < u8.length; i += 2) {
        const c = le ? u8[i] | (u8[i + 1] << 8) : (u8[i] << 8) | u8[i + 1];
        if (!c) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }
    const Decoder = typeof globalThis === 'object' ? globalThis.TextDecoder : null;
    if (enc === 3 && typeof Decoder === 'function') {
      const end = u8.indexOf(0);
      return new Decoder('utf-8').decode(end >= 0 ? u8.subarray(0, end) : u8).trim();
    }
    for (const b of u8) {
      if (!b) break;
      s += String.fromCharCode(b);
    }
    return s.trim();
  }

  /** Posisi akhir teks ber-null (1 byte untuk latin1/UTF-8, 2 byte untuk UTF-16). */
  function nullEnd(u8, from, enc) {
    if (enc === 1 || enc === 2) {
      for (let i = from; i + 1 < u8.length; i += 2) if (!u8[i] && !u8[i + 1]) return i;
      return u8.length;
    }
    const i = u8.indexOf(0, from);
    return i < 0 ? u8.length : i;
  }

  /**
   * Tag ID3v2.3/2.4 di awal berkas MP3 → {title, artist, album, picture: {mime, data: Uint8Array}}.
   * Yang tidak ada bernilai null. Bukan MP3 ber-ID3 → objek kosong.
   */
  function readId3(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const out = { title: null, artist: null, album: null, picture: null };
    if (u8.length < 10 || u8[0] !== 0x49 || u8[1] !== 0x44 || u8[2] !== 0x33) return out;
    const ver = u8[3];
    if (ver !== 3 && ver !== 4) return out;
    const syn = (i) => ((u8[i] & 0x7f) << 21) | ((u8[i + 1] & 0x7f) << 14) | ((u8[i + 2] & 0x7f) << 7) | (u8[i + 3] & 0x7f);
    const size = syn(6);
    let p = 10;
    if (u8[5] & 0x40) p += ver === 4 ? syn(10) : ((u8[10] << 24) | (u8[11] << 16) | (u8[12] << 8) | u8[13]) + 4; // header tambahan
    const end = Math.min(u8.length, 10 + size);
    while (p + 10 <= end) {
      const id = String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const len = ver === 4 ? syn(p + 4) : ((u8[p + 4] << 24) >>> 0) + (u8[p + 5] << 16) + (u8[p + 6] << 8) + u8[p + 7];
      const body = u8.subarray(p + 10, Math.min(end, p + 10 + len));
      p += 10 + len;
      if (!body.length) continue;
      const enc = body[0];
      if (id === 'TIT2') out.title = decodeText(body.subarray(1), enc) || null;
      else if (id === 'TPE1') out.artist = decodeText(body.subarray(1), enc) || null;
      else if (id === 'TALB') out.album = decodeText(body.subarray(1), enc) || null;
      else if (id === 'APIC' && !out.picture) {
        const mimeEnd = nullEnd(body, 1, 0);
        const mime = decodeText(body.subarray(1, mimeEnd), 0).toLowerCase() || 'image/jpeg';
        const descEnd = nullEnd(body, mimeEnd + 2, enc);
        const start = descEnd + (enc === 1 || enc === 2 ? 2 : 1);
        if (start < body.length) out.picture = { mime: mime.includes('/') ? mime : `image/${mime}`, data: body.slice(start) };
      }
    }
    return out;
  }

  /** Jumlah potongan unggah untuk berkas sebesar `bytes`. */
  const chunkCount = (bytes) => Math.max(1, Math.ceil(bytes / CHUNK_BYTES));

  return { REPEATS, CHUNK_BYTES, MAX_TRACK_BYTES, shuffled, playOrder, nextId, prevId, nextRepeat, formatTime, parseName, readId3, chunkCount };
});
