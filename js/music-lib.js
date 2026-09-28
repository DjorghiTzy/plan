/**
 * Pustaka musik: lagu bawaan (bebas hak cipta, NCS) + lagu yang kamu impor.
 * Lagu impor disimpan di database perangkat (IndexedDB, bisa diputar offline) dan, bila masuk akun,
 * juga di database akunmu di server (/api/sync?music=…, dipecah per potongan) sehingga muncul di
 * semua perangkat; perangkat lain mengunduhnya saat pertama diputar lalu menyimpannya sendiri.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const PL = P.playlist;

  const BUILTIN = [
    {
      id: 'ncs-safe-and-sound',
      title: 'Safe And Sound',
      artist: 'Different Heaven',
      album: 'NCS Release · House',
      src: 'audio/different-heaven-safe-and-sound.mp3',
      duration: 192,
      builtin: true,
      credit: 'Musik dari NoCopyrightSounds (NCS), bebas dipakai dengan menyebut sumber.',
    },
  ];
  const DB_NAME = 'rencana-harian-music';
  const STORE = 'tracks';
  const ART_PX = 256;

  let db = null;
  let local = []; // {id, title, artist, album, type, size, duration, art, addedAt, blob, cloud}
  let cloud = { tracks: [], used: 0, limit: 0, checked: false, error: null };
  const jobs = new Map(); // id → {kind: 'upload'|'download', pct}
  const urls = new Map(); // id → object URL
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // tampilan gagal diperbarui; pustaka tetap jalan
    }
  });

  // ----- Database perangkat (IndexedDB) -----

  function openDb() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      if (!root.indexedDB) {
        reject(new Error('Browser ini tidak punya penyimpanan lagu (IndexedDB).'));
        return;
      }
      const req = root.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => {
        db = req.result;
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('Penyimpanan lagu tidak bisa dibuka.'));
    });
  }

  function tx(mode, fn) {
    return openDb().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error || new Error('Penyimpanan lagu gagal.'));
      t.onabort = () => reject(t.error || new Error('Penyimpanan lagu penuh atau diblokir browser.'));
    }));
  }

  const putLocal = (track) => tx('readwrite', (s) => s.put(track));
  const delLocal = (id) => tx('readwrite', (s) => s.delete(id));
  const allLocal = () => tx('readonly', (s) => s.getAll());

  async function init() {
    try {
      local = (await allLocal()) || [];
    } catch {
      local = [];
    }
    emit();
    syncCloud();
    if (P.sync && P.sync.onStatus) {
      let was = P.sync.info().loggedIn;
      P.sync.onStatus(() => {
        const now = P.sync.info().loggedIn;
        if (now !== was) {
          was = now;
          if (now) syncCloud();
          else {
            cloud = { tracks: [], used: 0, limit: 0, checked: false, error: null };
            emit();
          }
        }
      });
    }
  }

  // ----- Daftar lagu -----

  const loggedIn = () => Boolean(P.sync && P.sync.info().loggedIn);

  /** Semua lagu: bawaan dulu, lalu lagu impor (perangkat + akun) urut waktu ditambahkan. */
  function tracks() {
    const byId = new Map();
    for (const t of local) byId.set(t.id, { ...t, blob: undefined, onDevice: Boolean(t.blob), inCloud: cloud.tracks.some((c) => c.id === t.id) });
    for (const c of cloud.tracks) if (!byId.has(c.id)) byId.set(c.id, { ...c, onDevice: false, inCloud: true, cloud: true });
    const mine = [...byId.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    return [...BUILTIN, ...mine];
  }

  const find = (id) => tracks().find((t) => t.id === id) || null;
  const job = (id) => jobs.get(id) || null;
  const usage = () => ({ loggedIn: loggedIn(), used: cloud.used, limit: cloud.limit, checked: cloud.checked, error: cloud.error });

  /** Alamat audio untuk diputar; lagu yang hanya ada di akun diunduh dulu (lalu disimpan di perangkat). */
  async function srcFor(id) {
    const t = find(id);
    if (!t) throw new Error('Lagu tidak ditemukan.');
    if (t.builtin) return t.src;
    if (urls.has(id)) return urls.get(id);
    let rec = local.find((x) => x.id === id && x.blob);
    if (!rec) rec = await download(t);
    const url = URL.createObjectURL(rec.blob);
    urls.set(id, url);
    return url;
  }

  // ----- Impor -----

  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
  const TYPE_OF = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm' };

  async function hashId(buf) {
    if (root.crypto && root.crypto.subtle) {
      const h = new Uint8Array(await root.crypto.subtle.digest('SHA-256', buf));
      return `tr-${[...h.slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    }
    return `tr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Durasi lagu dari metadata audio (null bila tidak terbaca dalam 6 detik). */
  function probeDuration(blob) {
    return new Promise((resolve) => {
      const a = root.document.createElement('audio');
      const url = URL.createObjectURL(blob);
      const done = (v) => {
        URL.revokeObjectURL(url);
        resolve(v);
      };
      const timer = setTimeout(() => done(null), 6000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => {
        clearTimeout(timer);
        done(Number.isFinite(a.duration) ? Math.round(a.duration) : null);
      };
      a.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      a.src = url;
    });
  }

  /** Sampul dari tag ID3 → JPEG kecil (data URL) supaya ringan disimpan & disinkron. */
  function artDataUrl(pic) {
    return new Promise((resolve) => {
      if (!pic || !pic.data || !pic.data.length) {
        resolve(null);
        return;
      }
      const url = URL.createObjectURL(new Blob([pic.data], { type: pic.mime }));
      const img = new root.Image();
      img.onload = () => {
        try {
          const k = Math.min(1, ART_PX / Math.max(img.width, img.height));
          const c = root.document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k));
          c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const out = c.toDataURL('image/jpeg', 0.82);
          resolve(out.length <= 90000 ? out : c.toDataURL('image/jpeg', 0.5));
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  /**
   * Impor berkas audio: baca judul/artis/sampul (tag ID3 atau nama berkas), simpan di perangkat,
   * lalu unggah ke akun bila masuk. @returns {Promise<{added: object[], skipped: string[]}>}
   */
  async function importFiles(files) {
    const added = [];
    const skipped = [];
    for (const file of Array.from(files || [])) {
      const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      const type = (file.type || TYPE_OF[ext.toLowerCase()] || '').toLowerCase();
      if (!/^audio\//.test(type) && !AUDIO_EXT.test(file.name)) {
        skipped.push(`${file.name}: bukan berkas audio`);
        continue;
      }
      if (file.size > PL.MAX_TRACK_BYTES) {
        skipped.push(`${file.name}: lebih dari ${PL.MAX_TRACK_BYTES / 1048576} MB`);
        continue;
      }
      const buf = await file.arrayBuffer();
      const id = await hashId(buf);
      if (find(id)) {
        skipped.push(`${file.name}: sudah ada di daftar`);
        continue;
      }
      const tag = PL.readId3(new Uint8Array(buf, 0, Math.min(buf.byteLength, 2 * 1024 * 1024)));
      const byName = PL.parseName(file.name);
      const blob = new Blob([buf], { type: type || 'audio/mpeg' });
      const track = {
        id,
        title: tag.title || byName.title,
        artist: tag.artist || byName.artist,
        album: tag.album || '',
        type: type || 'audio/mpeg',
        size: file.size,
        duration: await probeDuration(blob),
        art: await artDataUrl(tag.picture),
        addedAt: Date.now() + added.length,
        blob,
        cloud: false,
      };
      await putLocal(track);
      local.push(track);
      added.push(track);
      emit();
    }
    if (added.length && loggedIn()) uploadPending();
    return { added, skipped };
  }

  // ----- Database akun (server) -----

  const b64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return root.btoa(s);
  };

  async function upload(t) {
    if (jobs.has(t.id)) return;
    jobs.set(t.id, { kind: 'upload', pct: 0 });
    emit();
    try {
      const meta = { id: t.id, title: t.title, artist: t.artist, album: t.album, type: t.type, size: t.size, duration: t.duration, art: t.art };
      const begin = await P.sync.api('sync?music=1', { method: 'POST', body: { action: 'begin', track: meta } });
      if (!begin.exists) {
        const bytes = new Uint8Array(await t.blob.arrayBuffer());
        const n = PL.chunkCount(bytes.length);
        for (let i = 0; i < n; i += 1) {
          await P.sync.api('sync?music=1', { method: 'POST', timeout: 60000, body: { action: 'chunk', id: t.id, index: i, data: b64(bytes.subarray(i * PL.CHUNK_BYTES, (i + 1) * PL.CHUNK_BYTES)) } });
          jobs.set(t.id, { kind: 'upload', pct: Math.round(((i + 1) / n) * 100) });
          emit();
        }
        await P.sync.api('sync?music=1', { method: 'POST', body: { action: 'finish', id: t.id } });
      }
      t.cloud = true;
      await putLocal(t);
    } catch (err) {
      cloud.error = err.message || 'Lagu belum bisa disimpan ke akun.';
      if (P.ui) P.ui.toast(`"${t.title}" belum tersimpan ke akun: ${cloud.error}`, { tone: 'warn', duration: 7000 });
    } finally {
      jobs.delete(t.id);
    }
    await refreshCloud();
  }

  let uploading = null;
  /** Unggah lagu impor yang belum ada di akun (satu per satu). */
  function uploadPending() {
    if (uploading) return uploading;
    uploading = (async () => {
      for (const t of local.filter((x) => x.blob && !x.cloud && !cloud.tracks.some((c) => c.id === x.id))) {
        if (!loggedIn()) break;
        await upload(t);
      }
    })().finally(() => {
      uploading = null;
      emit();
    });
    return uploading;
  }

  async function download(t) {
    if (!loggedIn()) throw new Error('Masuk akun untuk memutar lagu yang tersimpan di akunmu.');
    jobs.set(t.id, { kind: 'download', pct: 0 });
    emit();
    try {
      const n = t.chunks || PL.chunkCount(t.size);
      const parts = [];
      for (let i = 0; i < n; i += 1) {
        parts.push(await P.sync.apiBinary(`sync?music=chunk&id=${encodeURIComponent(t.id)}&i=${i}`));
        jobs.set(t.id, { kind: 'download', pct: Math.round(((i + 1) / n) * 100) });
        emit();
      }
      const rec = { id: t.id, title: t.title, artist: t.artist, album: t.album, type: t.type, size: t.size, duration: t.duration, art: t.art, addedAt: t.addedAt, blob: new Blob(parts, { type: t.type }), cloud: true };
      try {
        await putLocal(rec);
      } catch {
        // perangkat penuh: tetap diputar dari memori
      }
      local = [...local.filter((x) => x.id !== t.id), rec];
      return rec;
    } finally {
      jobs.delete(t.id);
      emit();
    }
  }

  async function refreshCloud() {
    if (!loggedIn()) return;
    try {
      const out = await P.sync.api('sync?music=list');
      cloud = { tracks: out.tracks || [], used: out.used || 0, limit: out.limit || 0, checked: true, error: null };
    } catch (err) {
      cloud = { ...cloud, checked: true, error: err.message };
    }
    emit();
  }

  /**
   * Samakan dengan akun: lagu yang dihapus di perangkat lain ikut dihapus di sini, lagu impor yang
   * belum ada di akun diunggah.
   */
  async function syncCloud() {
    if (!loggedIn()) return;
    await refreshCloud();
    if (cloud.error) return;
    const gone = local.filter((x) => x.cloud && !cloud.tracks.some((c) => c.id === x.id) && !jobs.has(x.id));
    for (const t of gone) {
      await delLocal(t.id).catch(() => {});
      revoke(t.id);
    }
    if (gone.length) {
      local = local.filter((x) => !gone.includes(x));
      emit();
    }
    uploadPending();
  }

  function revoke(id) {
    if (urls.has(id)) {
      URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
    }
  }

  /** Hapus lagu impor dari perangkat ini dan dari akun. */
  async function remove(id) {
    const t = find(id);
    if (!t || t.builtin) return;
    if (t.inCloud || t.cloud) {
      if (!loggedIn()) throw new Error('Masuk akun dulu untuk menghapus lagu yang tersimpan di akun.');
      await P.sync.api('sync?music=1', { method: 'POST', body: { action: 'delete', id } });
    }
    await delLocal(id).catch(() => {});
    revoke(id);
    local = local.filter((x) => x.id !== id);
    await refreshCloud();
    emit();
  }

  P.musicLib = {
    BUILTIN,
    init,
    tracks,
    find,
    job,
    usage,
    srcFor,
    importFiles,
    remove,
    syncCloud,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})(typeof self !== 'undefined' ? self : this);
