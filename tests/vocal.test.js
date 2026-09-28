// Menguji pemisah vokal: FFT, rekonstruksi sempurna, pemisahan tengah vs sisi, WAV.
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/core/vocal.js');

const SR = 44100;

/** Energi satu frekuensi (Goertzel), dinormalkan per sampel. */
function tone(x, freq, from = 0, to = x.length) {
  const w = (2 * Math.PI * freq) / SR;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < to; i += 1) {
    const s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / (to - from);
}

const db = (a, b) => 20 * Math.log10(a / b);

function mix(seconds, parts) {
  const n = Math.round(seconds * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    for (const p of parts) {
      const v = p.amp * Math.sin((2 * Math.PI * p.f * i) / SR);
      L[i] += v * p.l;
      R[i] += v * p.r;
    }
  }
  return { L, R };
}

test('FFT sama dengan DFT langsung, dan balikannya mengembalikan sinyal', () => {
  const n = 16;
  const fft = V.makeFft(n);
  const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + (i % 3) * 0.2);
  const re = Float64Array.from(x);
  const im = new Float64Array(n);
  fft(re, im);
  for (let k = 0; k < n; k += 1) {
    let dr = 0;
    let di = 0;
    for (let t = 0; t < n; t += 1) {
      dr += x[t] * Math.cos((2 * Math.PI * k * t) / n);
      di -= x[t] * Math.sin((2 * Math.PI * k * t) / n);
    }
    assert.ok(Math.abs(re[k] - dr) < 1e-9 && Math.abs(im[k] - di) < 1e-9);
  }
  fft(re, im, true);
  for (let t = 0; t < n; t += 1) assert.ok(Math.abs(re[t] - x[t]) < 1e-9 && Math.abs(im[t]) < 1e-9);
  assert.throws(() => V.makeFft(12));
});

test('tanpa pemisahan (topeng 0) sinyal kembali utuh: rekonstruksi sempurna', () => {
  const { L, R } = mix(0.5, [{ f: 440, amp: 0.4, l: 1, r: 0.3 }, { f: 3000, amp: 0.2, l: 0.2, r: 1 }]);
  const L0 = Float32Array.from(L);
  const R0 = Float32Array.from(R);
  const [l, r] = V.separate(L, R, { sampleRate: SR, mode: 'musik', mask: () => 0, fftSize: 1024 });
  let err = 0;
  for (let i = 0; i < L0.length; i += 1) err = Math.max(err, Math.abs(l[i] - L0[i]), Math.abs(r[i] - R0[i]));
  assert.ok(err < 1e-5, `galat ${err}`);
});

test('kemiripan & topeng: tengah → 1, satu sisi → 0', () => {
  assert.equal(V.similarity(1, 0, 1, 0), 1);
  assert.equal(V.similarity(1, 0, 0, 0), 0);
  assert.equal(V.similarity(1, 0, -1, 0), -1);
  assert.equal(V.centerMask(1), 1);
  assert.equal(V.centerMask(0.2), 0);
  assert.ok(V.bandWeight(1000) === 1 && V.bandWeight(40) === 0 && V.bandWeight(15000) === 0);
});

// Lagu tiruan: "vokal" 440 & 880 Hz di tengah, gitar 660 Hz di kiri, synth 1320 Hz di kanan,
// bass 55 Hz di tengah (di luar rentang vokal).
const SONG = [
  { f: 440, amp: 0.3, l: 1, r: 1 },
  { f: 880, amp: 0.15, l: 1, r: 1 },
  { f: 660, amp: 0.25, l: 1, r: 0.05 },
  { f: 1320, amp: 0.2, l: 0.05, r: 1 },
  { f: 55, amp: 0.3, l: 1, r: 1 },
];

test('musik saja: vokal tengah hilang, instrumen kiri/kanan & bass tetap', () => {
  const { L, R } = mix(1, SONG);
  const before = { v: tone(L, 440), g: tone(L, 660), s: tone(R, 1320), b: tone(L, 55) };
  const [l, r] = V.separate(L, R, { sampleRate: SR, mode: 'musik' });
  const a = SR * 0.2;
  const z = SR * 0.8;
  assert.ok(db(before.v, tone(l, 440, a, z)) > 25, 'vokal turun > 25 dB');
  assert.ok(Math.abs(db(before.g, tone(l, 660, a, z))) < 1.5, 'gitar kiri utuh');
  assert.ok(Math.abs(db(before.s, tone(r, 1320, a, z))) < 1.5, 'synth kanan utuh');
  assert.ok(Math.abs(db(before.b, tone(l, 55, a, z))) < 1, 'bass tetap');
});

test('vokal saja: hanya bagian tengah di rentang suara (mono)', () => {
  const { L, R } = mix(1, SONG);
  const v0 = tone(L, 440);
  const out = V.separate(L, R, { sampleRate: SR, mode: 'vokal' });
  assert.equal(out.length, 1);
  const [m] = out;
  const a = SR * 0.2;
  const z = SR * 0.8;
  assert.ok(Math.abs(db(v0, tone(m, 440, a, z))) < 1.5, 'vokal utuh');
  assert.ok(db(tone(m, 440, a, z), tone(m, 660, a, z)) > 25, 'gitar kiri tersaring');
  assert.ok(db(tone(m, 440, a, z), tone(m, 1320, a, z)) > 25, 'synth kanan tersaring');
  assert.ok(db(tone(m, 440, a, z), tone(m, 55, a, z)) > 25, 'bass tersaring');
});

test('stereoWidth mengenali lagu mono', () => {
  const { L, R } = mix(0.2, [{ f: 440, amp: 0.5, l: 1, r: 1 }]);
  assert.ok(V.stereoWidth(L, R) < 1e-6);
  const s = mix(0.2, SONG);
  assert.ok(V.stereoWidth(s.L, s.R) > 0.05);
});

test('gainFor & encodeWav: kepala RIFF benar, sampel dibatasi', () => {
  assert.equal(V.gainFor([Float32Array.from([0.5, -2])], 'musik'), 0.97 / 2);
  assert.equal(V.gainFor([Float32Array.from([0.1])], 'vokal'), 3);
  assert.equal(V.gainFor([Float32Array.from([0.5])], 'musik'), 1);
  const buf = V.encodeWav([Float32Array.from([0, 1, -1, 2]), Float32Array.from([0.5, -0.5, 0, 0])], 44100);
  const v = new DataView(buf);
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n));
  assert.equal(str(0, 4), 'RIFF');
  assert.equal(str(8, 4), 'WAVE');
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 44100);
  assert.equal(v.getUint32(40, true), 16);
  assert.equal(buf.byteLength, 44 + 16);
  const s = new Int16Array(buf, 44);
  assert.deepEqual([...s], [0, 16384, 32767, -16384, -32768, 0, 32767, 0]);
});
