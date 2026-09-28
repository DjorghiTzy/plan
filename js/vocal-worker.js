/**
 * Worker pemisah vokal: menerima PCM kiri/kanan, mengembalikan WAV (Musik saja / Vokal saja)
 * tanpa membuat halaman macet. Lihat js/core/vocal.js.
 */
/* global importScripts */
importScripts(`core/vocal.js${self.location.search}`);

self.onmessage = (e) => {
  const { job, left, right, sampleRate, mode } = e.data || {};
  const V = self.Planner.vocal;
  try {
    const out = V.separate(left, right, {
      sampleRate,
      mode,
      onProgress: (p) => self.postMessage({ job, progress: p }),
    });
    const wav = V.encodeWav(out, sampleRate, V.gainFor(out, mode));
    self.postMessage({ job, wav }, [wav]);
  } catch (err) {
    self.postMessage({ job, error: (err && err.message) || 'Gagal memisahkan vokal.' });
  }
};
