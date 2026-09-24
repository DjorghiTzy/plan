/**
 * Timer Pomodoro. Status disimpan di store (endsAt berupa timestamp) sehingga
 * timer tetap akurat walau pindah tampilan atau halaman dimuat ulang.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;

  const MODES = {
    fokus: { label: 'Fokus', short: 'Fokus', setting: 'focusMin' },
    pendek: { label: 'Istirahat pendek', short: 'Rehat pendek', setting: 'shortMin' },
    panjang: { label: 'Istirahat panjang', short: 'Rehat panjang', setting: 'longMin' },
  };

  let audioCtx = null;
  let wakeLock = null;

  const st = () => P.store.state;

  function durationMs(mode) {
    return Math.max(1, Number(st().settings[MODES[mode].setting]) || 1) * 60000;
  }

  function remainingMs(now = Date.now()) {
    const t = st().timer;
    if (t.status === 'running') return Math.max(0, t.endsAt - now);
    if (t.status === 'paused' && t.remaining != null) return t.remaining;
    return durationMs(t.mode);
  }

  function format(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /** Jumlah sesi fokus yang sudah selesai pada putaran ini (untuk titik-titik). */
  function roundDone() {
    const t = st().timer;
    const every = st().settings.longEvery;
    if (t.mode === 'panjang' && t.cycle > 0 && t.cycle % every === 0) return every;
    return t.cycle % every;
  }

  function unlockAudio() {
    try {
      const Ctx = root.AudioContext || root.webkitAudioContext;
      if (!audioCtx && Ctx) audioCtx = new Ctx();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    } catch {
      audioCtx = null;
    }
  }

  function chime() {
    if (!st().settings.sound || !audioCtx) return;
    try {
      const notes = [659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const t0 = audioCtx.currentTime + i * 0.18;
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 0.55);
      });
    } catch {
      /* suara bersifat opsional */
    }
  }

  async function holdWakeLock(on) {
    try {
      if (on && !wakeLock && root.navigator.wakeLock) {
        wakeLock = await root.navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {
      wakeLock = null;
    }
  }

  function start() {
    unlockAudio();
    const rem = remainingMs();
    P.store.setTimer({ status: 'running', endsAt: Date.now() + rem, remaining: null });
    holdWakeLock(true);
  }

  function pause() {
    P.store.setTimer({ status: 'paused', remaining: remainingMs(), endsAt: null });
    holdWakeLock(false);
  }

  function toggle() {
    if (st().timer.status === 'running') pause();
    else start();
  }

  function reset() {
    P.store.setTimer({ status: 'idle', endsAt: null, remaining: null });
    holdWakeLock(false);
  }

  function setMode(mode) {
    if (!MODES[mode]) return;
    P.store.setTimer({ mode, status: 'idle', endsAt: null, remaining: null });
    holdWakeLock(false);
  }

  function setTask(taskId) {
    P.store.setTimer({ taskId: taskId || null });
  }

  /** Pindah ke mode berikutnya; `finished` = timer habis dengan sendirinya. */
  function advance(finished) {
    const t = st().timer;
    const s = st().settings;
    holdWakeLock(false);
    if (t.mode === 'fokus') {
      const cycle = finished ? t.cycle + 1 : t.cycle;
      if (finished) {
        P.store.logFocus({ date: D.todayKey(), taskId: t.taskId, minutes: s.focusMin });
      }
      const next = finished && cycle % s.longEvery === 0 ? 'panjang' : 'pendek';
      P.store.setTimer({ mode: next, status: 'idle', endsAt: null, remaining: null, cycle });
      if (finished) {
        announce('Sesi fokus selesai', next === 'panjang'
          ? `${s.longEvery} sesi tuntas. Ambil istirahat panjang ${s.longMin} menit.`
          : `Istirahat dulu ${s.shortMin} menit. Regangkan badan dan minum air.`);
      }
    } else {
      P.store.setTimer({ mode: 'fokus', status: 'idle', endsAt: null, remaining: null });
      if (finished) announce('Istirahat selesai', 'Siap untuk sesi fokus berikutnya?');
    }
  }

  function announce(title, body) {
    chime();
    if (title.startsWith('Sesi fokus')) P.ui.confetti(root.document.querySelector('.dial'), { count: 50 });
    P.ui.toast(`${title}. ${body}`, { tone: 'success', duration: 8000 });
    P.app.notify(title, body);
  }

  const skip = () => advance(false);

  /** Dipanggil berkala oleh app; menyelesaikan sesi bila waktunya habis. */
  function tick() {
    const t = st().timer;
    if (t.status === 'running' && remainingMs() <= 0) {
      advance(true);
      return;
    }
    paint();
  }

  /** Memperbarui angka & cincin timer tanpa merender ulang seluruh tampilan. */
  function paint() {
    const doc = root.document;
    const t = st().timer;
    const rem = remainingMs();
    const text = format(rem);
    const frac = 1 - rem / durationMs(t.mode);
    doc.querySelectorAll('[data-timer-text]').forEach((el) => { el.textContent = text; });
    doc.querySelectorAll('[data-timer-ring]').forEach((el) => {
      const len = Number(el.dataset.len);
      el.style.strokeDashoffset = String(len * (1 - Math.min(1, Math.max(0, frac))));
    });
    doc.querySelectorAll('[data-timer-pill]').forEach((el) => {
      el.hidden = t.status === 'idle';
      el.dataset.status = t.status;
    });
    const base = 'Rencana Harian';
    doc.title = t.status === 'running' ? `${text} · ${MODES[t.mode].label} · ${base}` : base;
  }

  P.timer = {
    MODES, durationMs, remainingMs, format, roundDone,
    start, pause, toggle, reset, setMode, setTask, skip, tick, paint, unlockAudio,
  };
})(typeof self !== 'undefined' ? self : this);
