/**
 * Suara latar untuk sesi fokus, disintesis dengan Web Audio (tanpa berkas audio):
 *  - Hujan: derau merah muda yang disaring, seperti gerimis di atap.
 *  - Derau cokelat: dengung rendah yang menutupi suara sekitar.
 *  - Ombak: derau rendah yang mengembang dan surut perlahan.
 */
(function (root) {
  'use strict';
  const P = root.Planner;

  const KINDS = [
    { id: 'hujan', label: 'Hujan' },
    { id: 'derau', label: 'Derau cokelat' },
    { id: 'ombak', label: 'Ombak' },
  ];

  let ctx = null;
  let master = null;
  let graph = [];
  let current = null;
  let volume = 0.6;

  function noiseBuffer(type) {
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        // Derau merah muda (filter Paul Kellet)
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buf;
  }

  function source(type) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(type);
    src.loop = true;
    return src;
  }

  function build(kind) {
    const out = ctx.createGain();
    out.gain.value = 1;
    const nodes = [out];
    if (kind === 'hujan') {
      const src = source('pink');
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 500;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.value = 0.55;
      src.connect(hp).connect(lp).connect(g).connect(out);
      src.start();
      nodes.push(src, hp, lp, g);
    } else if (kind === 'derau') {
      const src = source('brown');
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(g).connect(out);
      src.start();
      nodes.push(src, g);
    } else {
      const src = source('brown');
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 800;
      const swell = ctx.createGain();
      swell.gain.value = 0.35;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.09;
      const depth = ctx.createGain();
      depth.gain.value = 0.3;
      lfo.connect(depth).connect(swell.gain);
      src.connect(lp).connect(swell).connect(out);
      src.start();
      lfo.start();
      nodes.push(src, lp, swell, lfo, depth);
    }
    out.connect(master);
    return nodes;
  }

  function stop() {
    if (!ctx || !graph.length) {
      current = null;
      return;
    }
    const old = graph;
    graph = [];
    current = null;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0.0001, now + 0.6);
    setTimeout(() => old.forEach((n) => {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch {
        /* sudah berhenti */
      }
    }), 700);
  }

  /** Mulai suara latar; harus dipanggil dari klik pengguna. */
  function play(kind) {
    const Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) return false;
    if (!ctx) {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.0001;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (graph.length) {
      graph.forEach((n) => {
        try {
          if (n.stop) n.stop();
          n.disconnect();
        } catch {
          /* abaikan */
        }
      });
    }
    graph = build(kind);
    current = kind;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(volume * 0.5, now + 1.2);
    return true;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (ctx && master && current) master.gain.setTargetAtTime(volume * 0.5, ctx.currentTime, 0.1);
  }

  P.ambient = {
    KINDS,
    play,
    stop,
    toggle: (kind) => (current === kind ? (stop(), false) : play(kind)),
    setVolume,
    get current() { return current; },
    get volume() { return volume; },
  };
})(typeof self !== 'undefined' ? self : this);
