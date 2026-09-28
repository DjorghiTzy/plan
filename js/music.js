/**
 * Pemutar musik ala Dynamic Island: pil hitam di atas layar yang berubah bentuk dengan animasi pegas.
 * - Ringkas: sampul kecil (berputar saat diputar) + bar equalizer; di layar lebar juga judul lagu.
 * - Mengintip: saat lagu berganti sendiri, pil melebar sebentar menampilkan judul.
 * - Terbuka (ketuk pil): sampul, judul, artis, progres & geser, acak, sebelumnya, putar/jeda,
 *   berikutnya, ulangi, volume (layar lebar), daftar lagu.
 * - Daftar lagu: lagu bawaan (NCS) + lagu impor (tersimpan di database perangkat & akun), tambah & hapus.
 * Kontrol juga tersedia di layar kunci/notifikasi HP dan tombol media keyboard (Media Session).
 * Musik tetap jalan saat pindah halaman (elemen audio di luar tampilan yang dirender ulang).
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const PL = P.playlist;
  const lib = P.musicLib;
  const { esc, icon } = P.ui;
  const doc = root.document;

  const KEY = 'rencana-harian/music';
  const WIDE = 1100; // di bawah ini pil berada tepat di bawah bilah atas
  const audio = doc.createElement('audio');
  audio.preload = 'metadata';

  const S = {
    id: null,
    playing: false,
    loading: false,
    view: 'hidden', // 'hidden' | 'compact' | 'open'
    list: false,
    peek: false,
    shuffle: false,
    repeat: 'off',
    volume: 1,
    order: [],
    error: null,
    confirmDel: null,
    wasPlaying: false,
  };
  let el = null;
  let shell = null;
  let full = null;
  let peekTimer = null;
  let started = false;

  // ----- Simpan & pulihkan (per perangkat) -----

  function saved() {
    try {
      return JSON.parse(root.localStorage.getItem(KEY) || '{}') || {};
    } catch {
      return {};
    }
  }

  function save() {
    try {
      root.localStorage.setItem(KEY, JSON.stringify({
        id: S.id, time: Math.round(audio.currentTime || 0), volume: S.volume, shuffle: S.shuffle, repeat: S.repeat, playing: S.playing,
      }));
    } catch {
      // penyimpanan penuh/diblokir: pilihan hanya berlaku sampai halaman ditutup
    }
  }

  // ----- Urutan & kendali -----

  function refreshOrder() {
    const ids = lib.tracks().map((t) => t.id);
    const same = S.order.length === ids.length && ids.every((id) => S.order.includes(id));
    if (!same) S.order = PL.playOrder(ids, { shuffle: S.shuffle, current: S.id });
  }

  const current = () => (S.id ? lib.find(S.id) : null);

  async function load(id, { play = true, at = 0, peek = false } = {}) {
    const t = lib.find(id);
    if (!t) return;
    const changed = S.id !== id;
    S.id = id;
    S.error = null;
    S.loading = true;
    if (S.view === 'hidden') setView('compact');
    render();
    try {
      const src = await lib.srcFor(id);
      if (S.id !== id) return;
      if (changed || !audio.src) {
        audio.src = src;
        if (at > 0) {
          await new Promise((resolve) => {
            const done = () => {
              audio.removeEventListener('loadedmetadata', done);
              resolve();
            };
            audio.addEventListener('loadedmetadata', done);
            setTimeout(done, 4000);
          });
          try {
            audio.currentTime = Math.min(at, (audio.duration || at + 1) - 1);
          } catch {
            // lewati: mulai dari awal
          }
        }
      }
      mediaMeta(t);
      if (play) await start();
    } catch (err) {
      S.error = err && err.message ? err.message : 'Lagu tidak bisa diputar.';
      S.playing = false;
    } finally {
      S.loading = false;
      render();
      save();
    }
    if (peek && changed) flashPeek();
  }

  async function start() {
    ensureAnalyser();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    try {
      await audio.play();
    } catch (err) {
      S.playing = false;
      if (err && err.name === 'NotAllowedError') S.error = 'Ketuk tombol putar untuk mulai.';
      else if (err && err.name !== 'AbortError') S.error = 'Lagu tidak bisa diputar di perangkat ini.';
      render();
    }
  }

  function play() {
    if (!S.id) {
      refreshOrder();
      return load(S.order[0] || lib.tracks()[0].id);
    }
    if (!audio.src) return load(S.id, { play: true, at: saved().time || 0 });
    return start();
  }

  const pause = () => audio.pause();
  const toggle = () => (S.playing ? pause() : play());

  function next({ auto = false } = {}) {
    refreshOrder();
    const id = PL.nextId(S.order, S.id, { repeat: S.repeat, auto });
    if (!id) {
      pause();
      audio.currentTime = 0;
      return undefined;
    }
    if (id === S.id) {
      audio.currentTime = 0;
      return start();
    }
    return load(id, { peek: auto });
  }

  function prev() {
    // Seperti pemutar di HP: lebih dari 3 detik → ulang dari awal lagu.
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return undefined;
    }
    refreshOrder();
    return load(PL.prevId(S.order, S.id));
  }

  function seek(frac) {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = Math.max(0, Math.min(1, frac)) * audio.duration;
    progress();
    positionState();
  }

  function setVolume(v) {
    S.volume = Math.max(0, Math.min(1, v));
    audio.volume = S.volume;
    save();
  }

  function toggleShuffle() {
    S.shuffle = !S.shuffle;
    S.order = PL.playOrder(lib.tracks().map((t) => t.id), { shuffle: S.shuffle, current: S.id });
    save();
    render();
  }

  function cycleRepeat() {
    S.repeat = PL.nextRepeat(S.repeat);
    save();
    render();
  }

  /** Tutup pemutar: musik berhenti dan pil disembunyikan. */
  function close() {
    pause();
    setView('hidden');
  }

  // ----- Bar equalizer: analisis suara di layar lebar, animasi CSS di HP -----
  // (Di HP audio tidak dilewatkan Web Audio agar tetap jalan saat layar mati / aplikasi di latar.)

  let ctx = null;
  let analyser = null;
  let freq = null;
  let raf = 0;
  const liveBars = (() => {
    try {
      return root.matchMedia('(pointer: fine)').matches && !/iPhone|iPad|iPod|Android/i.test(root.navigator.userAgent) && Boolean(root.AudioContext || root.webkitAudioContext);
    } catch {
      return false;
    }
  })();

  function ensureAnalyser() {
    if (analyser || !liveBars) return;
    try {
      ctx = new (root.AudioContext || root.webkitAudioContext)();
      const src = ctx.createMediaElementSource(audio);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.75;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      freq = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      analyser = null;
    }
  }

  const BINS = [1, 3, 6, 10, 15];
  function drawBars() {
    raf = 0;
    if (!el || !analyser || !S.playing || S.view === 'hidden') return;
    analyser.getByteFrequencyData(freq);
    el.classList.add('live');
    el.querySelectorAll('.i-bars').forEach((box) => {
      box.querySelectorAll('i').forEach((bar, k) => {
        const v = freq[BINS[k]] / 255;
        bar.style.transform = `scaleY(${(0.2 + v * 0.85).toFixed(3)})`;
      });
    });
    raf = root.requestAnimationFrame(drawBars);
  }

  function kickBars() {
    if (analyser && !raf && S.playing) raf = root.requestAnimationFrame(drawBars);
  }

  // ----- Media Session (layar kunci, notifikasi, tombol media) -----

  function mediaMeta(t) {
    const ms = root.navigator.mediaSession;
    if (!ms || !root.MediaMetadata) return;
    const art = t.art ? [{ src: t.art, sizes: '256x256', type: 'image/jpeg' }] : [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }];
    ms.metadata = new root.MediaMetadata({ title: t.title, artist: t.artist || 'Tanpa artis', album: t.album || 'Rencana Harian', artwork: art });
  }

  function positionState() {
    const ms = root.navigator.mediaSession;
    if (!ms || !ms.setPositionState || !Number.isFinite(audio.duration) || !audio.duration) return;
    try {
      ms.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, audio.duration) });
    } catch {
      // posisi tidak valid sesaat saat berganti lagu
    }
  }

  function mediaHandlers() {
    const ms = root.navigator.mediaSession;
    if (!ms) return;
    const on = (action, fn) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // aksi tidak didukung browser ini
      }
    };
    on('play', () => play());
    on('pause', () => pause());
    on('previoustrack', () => prev());
    on('nexttrack', () => next());
    on('seekto', (d) => d && Number.isFinite(d.seekTime) && seek(d.seekTime / audio.duration));
    on('seekbackward', (d) => seek((audio.currentTime - ((d && d.seekOffset) || 10)) / audio.duration));
    on('seekforward', (d) => seek((audio.currentTime + ((d && d.seekOffset) || 10)) / audio.duration));
    on('stop', () => close());
  }

  // ----- Tampilan -----

  const hueOf = (id) => {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return id === 'ncs-safe-and-sound' ? 262 : h;
  };
  const art = (t, cls) => (t && t.art
    ? `<span class="i-art ${cls}" style="background-image:url('${esc(t.art)}')"></span>`
    : `<span class="i-art ${cls}" style="--hue:${hueOf(t ? t.id : 'x')}">${icon('music')}</span>`);
  const bars = (cls = '') => `<span class="i-bars ${cls}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>`;
  const repeatLabel = { off: 'Ulangi: mati', all: 'Ulangi semua lagu', one: 'Ulangi lagu ini' };

  function skeleton() {
    return `
      <div class="island-shell" data-i-shell>
        <button type="button" class="island-compact" data-i-expand aria-label="Buka pemutar musik">
          <span data-i-cart></span>
          <span class="i-ctext"><b data-i-ctitle></b><small data-i-cartist></small></span>
          ${bars()}
        </button>
        <div class="island-full" data-i-full role="region" aria-label="Pemutar musik">
          <div class="i-head">
            <span data-i-bigart></span>
            <div class="i-meta"><b data-i-title></b><small data-i-artist></small></div>
            ${bars('big')}
            <button type="button" class="i-icon" data-i-collapse aria-label="Kecilkan pemutar" title="Kecilkan">${icon('down')}</button>
          </div>
          <p class="i-error" data-i-error hidden></p>
          <div class="i-progress">
            <span data-i-cur>0:00</span>
            <input type="range" min="0" max="1000" step="1" value="0" data-i-seek aria-label="Posisi lagu">
            <span data-i-dur>0:00</span>
          </div>
          <div class="i-controls">
            <button type="button" class="i-icon" data-i-shuffle aria-label="Acak" title="Acak">${icon('shuffle')}</button>
            <button type="button" class="i-icon big" data-i-prev aria-label="Lagu sebelumnya" title="Sebelumnya">${icon('prev')}</button>
            <button type="button" class="i-play" data-i-toggle aria-label="Putar"></button>
            <button type="button" class="i-icon big" data-i-next aria-label="Lagu berikutnya" title="Berikutnya">${icon('skip')}</button>
            <button type="button" class="i-icon" data-i-repeat aria-label="Ulangi" title="Ulangi"></button>
          </div>
          <div class="i-foot">
            <button type="button" class="i-chip" data-i-list aria-expanded="false">${icon('queue')}<span data-i-count>Daftar lagu</span></button>
            <label class="i-volume" title="Volume">${icon('volume')}<input type="range" min="0" max="100" step="1" data-i-volume aria-label="Volume"></label>
            <button type="button" class="i-icon" data-i-close aria-label="Tutup pemutar & hentikan musik" title="Tutup">${icon('x')}</button>
          </div>
          <div class="i-list" data-i-listbox hidden></div>
        </div>
      </div>`;
  }

  function mount() {
    if (el) return;
    el = doc.createElement('div');
    el.className = 'island';
    el.dataset.island = '';
    el.dataset.view = 'hidden';
    el.innerHTML = skeleton();
    doc.body.appendChild(el);
    shell = el.querySelector('[data-i-shell]');
    full = el.querySelector('[data-i-full]');
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('change', onInput);
    // Ketuk di luar pil → kecilkan kembali.
    doc.addEventListener('pointerdown', (e) => {
      if (S.view !== 'open' || el.contains(e.target) || e.target.closest('[data-music]') || e.target.closest('dialog, .toast')) return;
      setView('compact');
    });
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.view === 'open' && !doc.querySelector('dialog[open]')) setView('compact');
    });
    root.addEventListener('resize', place);
    root.addEventListener('scroll', place, { passive: true });
  }

  /** Letak pil: di tengah bilah atas (layar lebar) atau tepat di bawahnya (HP/tablet). */
  function place() {
    if (!el) return;
    const bar = doc.querySelector('.topbar');
    // Di atas Menu aplikasi (bilah atas tertutup) pil selalu di tepi atas layar.
    const onMenu = doc.documentElement.classList.contains('ln-open');
    const top = root.innerWidth >= WIDE || !bar || onMenu ? 12 : Math.max(8, Math.round(bar.getBoundingClientRect().bottom) + 6);
    el.style.setProperty('--island-top', `${top}px`);
  }

  function setView(v) {
    S.view = v;
    if (v !== 'open') {
      S.list = false;
      S.confirmDel = null;
    }
    render();
    kickBars();
  }

  function flashPeek() {
    if (S.view !== 'compact') return;
    S.peek = true;
    render();
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
      S.peek = false;
      render();
    }, 2800);
  }

  function listHtml() {
    const all = lib.tracks();
    const u = lib.usage();
    const mb = (b) => `${(b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`;
    const row = (t) => {
      const on = t.id === S.id;
      const job = lib.job(t.id);
      let state = '';
      if (job) state = `<span class="i-state busy">${job.kind === 'upload' ? 'Menyimpan ke akun' : 'Mengunduh'} ${job.pct}%</span>`;
      else if (t.builtin) state = '<span class="i-state">Bawaan · NCS</span>';
      else if (t.inCloud && t.onDevice) state = `<span class="i-state ok">${icon('cloudCheck')}Di akun & perangkat</span>`;
      else if (t.inCloud) state = `<span class="i-state">${icon('cloud')}Di akun (diunduh saat diputar)</span>`;
      else state = '<span class="i-state">Di perangkat ini</span>';
      const confirm = S.confirmDel === t.id;
      return `
        <li class="i-track ${on ? 'on' : ''}" data-id="${esc(t.id)}">
          <button type="button" class="i-track-main" data-i-play="${esc(t.id)}" aria-label="Putar ${esc(t.title)}">
            ${art(t, 'mini')}
            <span class="i-track-text"><b>${esc(t.title)}</b><small>${esc(t.artist || 'Tanpa artis')}${t.duration ? ` · ${PL.formatTime(t.duration)}` : ''}</small>${state}</span>
            ${on && S.playing ? bars('tiny') : ''}
          </button>
          ${t.builtin ? '' : confirm
            ? `<span class="i-confirm"><button type="button" class="i-chip danger" data-i-del-yes="${esc(t.id)}">Hapus</button><button type="button" class="i-chip" data-i-del-no>Batal</button></span>`
            : `<button type="button" class="i-icon" data-i-del="${esc(t.id)}" aria-label="Hapus ${esc(t.title)}" title="Hapus dari akun & perangkat">${icon('trash')}</button>`}
        </li>`;
    };
    const store = u.loggedIn
      ? `Lagu impor tersimpan di database akunmu${u.checked && u.limit ? ` (${mb(u.used)} dari ${mb(u.limit)})` : ''} dan di perangkat ini, jadi muncul di semua perangkatmu.`
      : 'Lagu impor tersimpan di database perangkat ini (bisa diputar offline). Masuk akun supaya juga tersimpan di akunmu dan muncul di semua perangkat.';
    return `
      <ul class="i-tracks">${all.map(row).join('')}</ul>
      <div class="i-list-foot">
        <button type="button" class="i-add" data-i-add>${icon('plus')}Tambah lagu</button>
        <p>${esc(store)} MP3, M4A, AAC, OGG, WAV, atau FLAC, maks. ${PL.MAX_TRACK_BYTES / 1048576} MB per lagu.</p>
        <p>${esc(lib.BUILTIN[0].title)} oleh ${esc(lib.BUILTIN[0].artist)}: ${esc(lib.BUILTIN[0].credit)}</p>
      </div>`;
  }

  function render() {
    if (!el) return;
    const t = current();
    el.dataset.view = S.view;
    el.style.setProperty('--i-hue', String(hueOf(t ? t.id : 'ncs-safe-and-sound')));
    el.classList.toggle('playing', S.playing);
    el.classList.toggle('peek', S.peek && S.view === 'compact');
    el.classList.toggle('list', S.list && S.view === 'open');
    el.classList.toggle('loading', S.loading);
    if (!S.playing) el.classList.remove('live');
    const title = t ? t.title : 'Pilih lagu';
    const artist = t ? t.artist || 'Tanpa artis' : 'Musik';
    el.querySelector('[data-i-cart]').innerHTML = art(t, 'small');
    el.querySelector('[data-i-bigart]').innerHTML = art(t, 'big');
    el.querySelector('[data-i-ctitle]').textContent = title;
    el.querySelector('[data-i-cartist]').textContent = artist;
    el.querySelector('[data-i-title]').textContent = title;
    el.querySelector('[data-i-artist]').textContent = artist;
    el.querySelector('[data-i-expand]').setAttribute('aria-label', t ? `${title}, ${S.playing ? 'sedang diputar' : 'dijeda'}. Buka pemutar musik` : 'Buka pemutar musik');
    const err = el.querySelector('[data-i-error]');
    err.hidden = !S.error;
    err.textContent = S.error || '';
    const tg = el.querySelector('[data-i-toggle]');
    tg.innerHTML = S.loading ? '<span class="spinner" aria-hidden="true"></span>' : icon(S.playing ? 'pause' : 'play');
    tg.setAttribute('aria-label', S.playing ? 'Jeda' : 'Putar');
    const sh = el.querySelector('[data-i-shuffle]');
    sh.classList.toggle('on', S.shuffle);
    sh.setAttribute('aria-pressed', String(S.shuffle));
    const rp = el.querySelector('[data-i-repeat]');
    rp.innerHTML = icon(S.repeat === 'one' ? 'repeatOne' : 'repeat');
    rp.classList.toggle('on', S.repeat !== 'off');
    rp.setAttribute('aria-label', repeatLabel[S.repeat]);
    rp.title = repeatLabel[S.repeat];
    el.querySelector('[data-i-volume]').value = String(Math.round(S.volume * 100));
    const lb = el.querySelector('[data-i-list]');
    lb.setAttribute('aria-expanded', String(S.list));
    el.querySelector('[data-i-count]').textContent = `Daftar lagu (${lib.tracks().length})`;
    const box = el.querySelector('[data-i-listbox]');
    box.hidden = !S.list;
    if (S.list) box.innerHTML = listHtml();
    progress();
    size();
    doc.documentElement.classList.toggle('island-on', S.view !== 'hidden');
    const btn = doc.querySelector('[data-music]');
    if (btn) {
      btn.classList.toggle('on', S.view !== 'hidden');
      btn.setAttribute('aria-pressed', String(S.view !== 'hidden'));
    }
  }

  /** Ukuran pil per tampilan; lebar/tinggi dianimasikan CSS (pegas). */
  function size() {
    if (!shell) return;
    const wide = root.innerWidth >= 720;
    const openW = Math.min(380, root.innerWidth - 16);
    el.style.setProperty('--island-open-w', `${openW}px`);
    let w;
    let h;
    if (S.view === 'open') {
      w = openW;
      h = full.offsetHeight;
    } else if (S.peek) {
      w = Math.min(300, root.innerWidth - 24);
      h = 44;
    } else {
      w = wide ? 250 : 132;
      h = 36;
    }
    shell.style.width = `${w}px`;
    shell.style.height = `${h}px`;
  }

  let paint = 0;
  function progress() {
    if (!el) return;
    const d = Number.isFinite(audio.duration) ? audio.duration : (current() && current().duration) || 0;
    const c = audio.currentTime || 0;
    el.querySelector('[data-i-cur]').textContent = PL.formatTime(c);
    el.querySelector('[data-i-dur]').textContent = PL.formatTime(d);
    const seekEl = el.querySelector('[data-i-seek]');
    if (!seeking) seekEl.value = d ? String(Math.round((c / d) * 1000)) : '0';
    el.style.setProperty('--i-progress', d ? (c / d).toFixed(4) : '0');
  }

  let seeking = false;
  function onInput(e) {
    const t = e.target;
    if (t.matches('[data-i-seek]')) {
      seeking = e.type === 'input';
      seek(Number(t.value) / 1000);
      if (e.type === 'change') seeking = false;
    } else if (t.matches('[data-i-volume]')) setVolume(Number(t.value) / 100);
  }

  function pickFiles() {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac';
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files || !input.files.length) return;
      P.ui.toast('Menyimpan lagu…');
      try {
        const { added, skipped } = await lib.importFiles(input.files);
        if (added.length) {
          P.ui.toast(`${added.length} lagu ditambahkan${P.sync.info().loggedIn ? ' dan sedang disimpan ke akunmu' : ' ke perangkat ini'}.`);
          if (!S.playing) load(added[0].id);
        }
        if (skipped.length) P.ui.toast(`Dilewati: ${skipped.join('; ')}`, { tone: 'warn', duration: 8000 });
      } catch (err) {
        P.ui.toast(err.message || 'Lagu gagal disimpan.', { tone: 'warn' });
      }
      render();
    };
    input.click();
  }

  async function onClick(e) {
    const t = e.target;
    if (t.closest('[data-i-expand]')) {
      S.peek = false;
      return setView('open');
    }
    if (t.closest('[data-i-collapse]')) return setView('compact');
    if (t.closest('[data-i-toggle]')) return toggle();
    if (t.closest('[data-i-next]')) return next();
    if (t.closest('[data-i-prev]')) return prev();
    if (t.closest('[data-i-shuffle]')) return toggleShuffle();
    if (t.closest('[data-i-repeat]')) return cycleRepeat();
    if (t.closest('[data-i-close]')) return close();
    if (t.closest('[data-i-list]')) {
      S.list = !S.list;
      if (S.list) lib.syncCloud();
      return render();
    }
    if (t.closest('[data-i-add]')) return pickFiles();
    const pick = t.closest('[data-i-play]');
    if (pick) {
      const id = pick.dataset.iPlay;
      if (id === S.id) return toggle();
      return load(id);
    }
    const del = t.closest('[data-i-del]');
    if (del) {
      S.confirmDel = del.dataset.iDel;
      return render();
    }
    if (t.closest('[data-i-del-no]')) {
      S.confirmDel = null;
      return render();
    }
    const yes = t.closest('[data-i-del-yes]');
    if (yes) {
      const id = yes.dataset.iDelYes;
      S.confirmDel = null;
      try {
        if (id === S.id) {
          pause();
          audio.removeAttribute('src');
          audio.load();
          S.id = null;
        }
        await lib.remove(id);
        P.ui.toast('Lagu dihapus dari perangkat & akun.');
      } catch (err) {
        P.ui.toast(err.message || 'Lagu gagal dihapus.', { tone: 'warn' });
      }
      refreshOrder();
      return render();
    }
    return undefined;
  }

  /** Tombol musik di bilah atas: buka pemutar (dengan daftar lagu bila belum ada lagu). */
  function open() {
    if (S.view === 'open') return setView(S.id ? 'compact' : 'hidden');
    S.list = !S.id;
    if (S.list) lib.syncCloud();
    return setView('open');
  }

  // ----- Mulai -----

  function init() {
    if (started) return;
    started = true;
    const prev0 = saved();
    S.volume = Number.isFinite(prev0.volume) ? prev0.volume : 1;
    S.shuffle = Boolean(prev0.shuffle);
    S.repeat = PL.REPEATS.includes(prev0.repeat) ? prev0.repeat : 'off';
    audio.volume = S.volume;
    mount();
    place();
    const btn = doc.querySelector('[data-music]');
    if (btn) {
      btn.innerHTML = icon('music');
      btn.addEventListener('click', open);
    }
    audio.addEventListener('play', () => {
      S.playing = true;
      S.error = null;
      if (root.navigator.mediaSession) root.navigator.mediaSession.playbackState = 'playing';
      render();
      kickBars();
      save();
    });
    audio.addEventListener('pause', () => {
      S.playing = false;
      if (root.navigator.mediaSession) root.navigator.mediaSession.playbackState = 'paused';
      render();
      save();
    });
    audio.addEventListener('ended', () => next({ auto: true }));
    audio.addEventListener('loadedmetadata', () => {
      progress();
      positionState();
    });
    let lastSave = 0;
    audio.addEventListener('timeupdate', () => {
      if (paint) return;
      paint = root.requestAnimationFrame(() => {
        paint = 0;
        progress();
      });
      if (Date.now() - lastSave > 5000) {
        lastSave = Date.now();
        save();
        positionState();
      }
    });
    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return;
      S.playing = false;
      S.loading = false;
      S.error = 'Lagu tidak bisa diputar (berkas rusak atau format tidak didukung browser ini).';
      render();
    });
    root.addEventListener('pagehide', save);
    mediaHandlers();
    lib.onChange(() => {
      refreshOrder();
      render();
    });
    // Lagu yang sedang diputar sebelum halaman dimuat ulang: siap dilanjutkan dari posisinya.
    lib.init().then(() => {
      if (prev0.id && prev0.playing && !S.id && lib.find(prev0.id)) restore(prev0);
    });
    render();
  }

  /** Tampilkan lagu terakhir (dijeda) di posisi terakhirnya; tinggal ketuk putar. */
  function restore(prev0) {
    S.id = prev0.id;
    setView('compact');
    mediaMeta(lib.find(prev0.id));
    lib.srcFor(prev0.id).then((src) => {
      if (S.id !== prev0.id || audio.getAttribute('src')) return;
      audio.src = src;
      audio.addEventListener('loadedmetadata', () => {
        try {
          audio.currentTime = Math.min(prev0.time || 0, (audio.duration || 1) - 1);
        } catch {
          // mulai dari awal
        }
      }, { once: true });
    }).catch(() => {});
    render();
  }

  P.music = { init, open, play, pause, toggle, next, prev, seek, load, close, relayout: () => place(), state: () => ({ ...S, time: audio.currentTime, duration: audio.duration }), _audio: audio };
})(typeof self !== 'undefined' ? self : this);
