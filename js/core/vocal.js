/**
 * Pemisah vokal (gratis, di perangkat): memisahkan suara yang berada di tengah stereo
 * (biasanya vokal utama) dari musiknya, per pita frekuensi (STFT), seperti efek
 * "Vocal Reduction and Isolation" di Audacity.
 *
 * - Tiap potongan pendek lagu diubah ke frekuensi (FFT). Untuk tiap frekuensi dihitung
 *   seberapa mirip kanal kiri & kanan (sama persis = di tengah = kemungkinan vokal).
 * - "musik": bagian tengah di rentang suara manusia dibuang dari kiri & kanan (stereo,
 *   bass & nada tinggi tetap utuh). "vokal": hanya bagian tengah itu yang disisakan.
 * - Hasil diubah jadi WAV sehingga bisa diputar pemutar biasa (tetap jalan saat layar mati).
 *
 * Tanpa DOM; dipakai di Web Worker dan bisa diuji dengan `node --test`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (root.Planner = root.Planner || {}).vocal = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MODES = ['asli', 'musik', 'vokal'];
  const FFT_SIZE = 4096;

  /** FFT kompleks radix-2 di tempat (n pangkat 2). Kembalikan fungsi transform(re, im, inverse). */
  function makeFft(n) {
    const bits = Math.round(Math.log2(n));
    if (1 << bits !== n) throw new Error('Ukuran FFT harus pangkat 2.');
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i += 1) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) {
      let r = 0;
      for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    return function transform(re, im, inverse = false) {
      for (let i = 0; i < n; i += 1) {
        const j = rev[i];
        if (j > i) {
          let t = re[i]; re[i] = re[j]; re[j] = t;
          t = im[i]; im[i] = im[j]; im[j] = t;
        }
      }
      for (let size = 2; size <= n; size *= 2) {
        const half = size / 2;
        const step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = i, k = 0; j < i + half; j += 1, k += step) {
            const l = j + half;
            const c = cos[k];
            const s = inverse ? sin[k] : -sin[k];
            const tr = re[l] * c - im[l] * s;
            const ti = re[l] * s + im[l] * c;
            re[l] = re[j] - tr;
            im[l] = im[j] - ti;
            re[j] += tr;
            im[j] += ti;
          }
        }
      }
      if (inverse) {
        for (let i = 0; i < n; i += 1) {
          re[i] /= n;
          im[i] /= n;
        }
      }
    };
  }

  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  /** Bobot rentang suara manusia (Hz): 0 di bawah ±90 Hz dan di atas ±11 kHz, 1 di ±160 Hz–7,5 kHz. */
  function bandWeight(f) {
    return clamp01((f - 90) / 70) * clamp01((11000 - f) / 3500);
  }

  /**
   * Kemiripan kiri-kanan satu frekuensi: 1 = identik (di tengah), 0 = hanya satu sisi,
   * negatif = berlawanan fase. ψ = 2·Re(L·R̄) / (|L|² + |R|²).
   */
  function similarity(lr, li, rr, ri) {
    const den = lr * lr + li * li + rr * rr + ri * ri;
    return den > 1e-20 ? (2 * (lr * rr + li * ri)) / den : 0;
  }

  /** Kemiripan → porsi "tengah" (0–1), dengan transisi halus agar tidak berdesis. */
  function centerMask(psi, lo = 0.5, hi = 0.92) {
    const t = clamp01((psi - lo) / (hi - lo));
    return t * t * (3 - 2 * t);
  }

  /**
   * Pisahkan vokal. `left`/`right` Float32Array (diubah di tempat & dipakai sebagai hasil).
   * mode 'musik' → [kiri, kanan] tanpa vokal; 'vokal' → [mono] vokal saja; 'asli' → tanpa perubahan.
   * opsi.onProgress(0..1) dipanggil berkala.
   */
  function separate(left, right, { sampleRate = 44100, mode = 'musik', fftSize = FFT_SIZE, onProgress = null, mask = centerMask } = {}) {
    if (!MODES.includes(mode)) throw new Error(`Mode tidak dikenal: ${mode}`);
    const len = Math.min(left.length, right.length);
    if (mode === 'asli') return [left, right];
    const n = fftSize;
    const hop = n / 2;
    const fft = makeFft(n);
    // Jendela sqrt-Hann (periodik) untuk analisis & sintesis: tumpang 50% → rekonstruksi sempurna.
    const win = new Float64Array(n);
    for (let i = 0; i < n; i += 1) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
    const weight = new Float64Array(n / 2 + 1);
    for (let k = 0; k <= n / 2; k += 1) weight[k] = bandWeight((k * sampleRate) / n);
    const prev = new Float64Array(n / 2 + 1); // kemiripan frame sebelumnya (dihaluskan)
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    const accL = new Float64Array(n); // penumpuk overlap-add (posisi relatif awal frame)
    const accR = new Float64Array(n);
    const vocalOnly = mode === 'vokal';
    const alpha = 0.25;

    const frames = Math.ceil((len + hop) / hop);
    let lastReport = -1;
    for (let f = 0; f < frames; f += 1) {
      const start = f * hop - hop; // frame pertama mulai setengah jendela sebelum sampel 0
      // Kemas kiri (real) & kanan (imajiner) jadi satu FFT kompleks.
      for (let i = 0; i < n; i += 1) {
        const p = start + i;
        const inside = p >= 0 && p < len;
        re[i] = inside ? left[p] * win[i] : 0;
        im[i] = inside ? right[p] * win[i] : 0;
      }
      fft(re, im, false);
      for (let k = 0; k <= n / 2; k += 1) {
        const kk = (n - k) % n;
        const zr = re[k];
        const zi = im[k];
        const cr = re[kk];
        const ci = -im[kk];
        // Spektrum kiri & kanan dari FFT gabungan (simetri konjugat sinyal real).
        const lr = (zr + cr) / 2;
        const li = (zi + ci) / 2;
        const rr = (zi - ci) / 2;
        const ri = -(zr - cr) / 2;
        let m = 0;
        if (weight[k] > 0) {
          const psi = prev[k] * alpha + similarity(lr, li, rr, ri) * (1 - alpha);
          prev[k] = psi;
          m = mask(psi) * weight[k];
        }
        const cr0 = (m * (lr + rr)) / 2;
        const ci0 = (m * (li + ri)) / 2;
        let olr;
        let oli;
        let orr;
        let ori;
        if (vocalOnly) {
          olr = cr0; oli = ci0; orr = cr0; ori = ci0;
        } else {
          olr = lr - cr0; oli = li - ci0; orr = rr - cr0; ori = ri - ci0;
        }
        // Kemas lagi: Y = L' + i·R' (keduanya spektrum sinyal real).
        re[k] = olr - ori;
        im[k] = oli + orr;
        if (k !== 0 && k !== n / 2) {
          re[kk] = olr + ori;
          im[kk] = -oli + orr;
        }
      }
      fft(re, im, true);
      for (let i = 0; i < n; i += 1) {
        accL[i] += re[i] * win[i];
        accR[i] += im[i] * win[i];
      }
      // Setengah pertama sudah final (tidak disentuh frame berikutnya) → tulis di tempat;
      // sampel input di posisi itu tidak dibaca lagi.
      for (let i = 0; i < hop; i += 1) {
        const p = start + i;
        if (p >= 0 && p < len) {
          left[p] = accL[i];
          if (!vocalOnly) right[p] = accR[i];
        }
      }
      accL.copyWithin(0, hop);
      accR.copyWithin(0, hop);
      accL.fill(0, n - hop);
      accR.fill(0, n - hop);
      if (onProgress) {
        const pct = Math.floor((f / frames) * 50);
        if (pct !== lastReport) {
          lastReport = pct;
          onProgress(pct / 50);
        }
      }
    }
    if (onProgress) onProgress(1);
    const out = vocalOnly ? [left.subarray(0, len)] : [left.subarray(0, len), right.subarray(0, len)];
    return out;
  }

  /** Seberapa "stereo" sebuah lagu: energi sisi / energi tengah (≈0 → mono, vokal tak bisa dipisah). */
  function stereoWidth(left, right, step = 7) {
    let mid = 0;
    let side = 0;
    const len = Math.min(left.length, right.length);
    for (let i = 0; i < len; i += step) {
      const m = left[i] + right[i];
      const s = left[i] - right[i];
      mid += m * m;
      side += s * s;
    }
    return mid > 0 ? side / mid : 0;
  }

  /** Penguat akhir: cegah pecah (clipping); vokal yang pelan boleh dinaikkan sampai 3×. */
  function gainFor(channels, mode) {
    let peak = 0;
    for (const ch of channels) {
      for (let i = 0; i < ch.length; i += 1) {
        const v = Math.abs(ch[i]);
        if (v > peak) peak = v;
      }
    }
    if (!peak) return 1;
    if (peak > 0.97) return 0.97 / peak;
    return mode === 'vokal' ? Math.min(3, 0.9 / peak) : 1;
  }

  /** WAV PCM 16-bit (1 atau 2 kanal) dari Float32Array per kanal. */
  function encodeWav(channels, sampleRate, gain = 1) {
    const nch = channels.length;
    const len = channels[0].length;
    const bytes = len * nch * 2;
    const buf = new ArrayBuffer(44 + bytes);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF');
    v.setUint32(4, 36 + bytes, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); // PCM
    v.setUint16(22, nch, true);
    v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * nch * 2, true);
    v.setUint16(32, nch * 2, true);
    v.setUint16(34, 16, true);
    str(36, 'data');
    v.setUint32(40, bytes, true);
    const out = new Int16Array(buf, 44);
    let o = 0;
    for (let i = 0; i < len; i += 1) {
      for (let c = 0; c < nch; c += 1) {
        let s = channels[c][i] * gain;
        if (s > 1) s = 1;
        else if (s < -1) s = -1;
        out[o] = s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
        o += 1;
      }
    }
    return buf;
  }

  return { MODES, FFT_SIZE, makeFft, bandWeight, similarity, centerMask, separate, stereoWidth, gainFor, encodeWav };
});
