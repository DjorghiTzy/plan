/**
 * Halaman masuk untuk mode pribadi (masuk.html).
 * Setelah berhasil, server memasang cookie sesi HttpOnly (untuk membuka halaman)
 * dan halaman ini menyimpan token sinkronisasi, lalu membuka aplikasi.
 */
(function () {
  'use strict';

  const SESSION_KEY = 'rencana-harian/session';
  const FRESH_KEY = 'rencana-harian/sync-fresh';
  const META_KEY = 'rencana-harian/sync';
  const LABELS = { masuk: 'Masuk', kode: 'Hubungkan perangkat ini', daftar: 'Buat akun' };

  const $ = (sel) => document.querySelector(sel);
  const form = $('#gate-form');
  const error = form.querySelector('.form-error');
  const submit = $('#gate-submit');
  let tab = 'masuk';
  let mode = 'email'; // 'username' bila server memakai akun pemilik (LOGIN_USERNAME)

  // Ikuti tema yang dipilih di aplikasi (bila ada).
  try {
    const saved = JSON.parse(localStorage.getItem('rencana-harian/v1') || 'null');
    const theme = saved && saved.settings && saved.settings.theme;
    if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
    if (localStorage.getItem(SESSION_KEY)) $('#gate-back').hidden = false;
  } catch {
    /* penyimpanan tidak tersedia */
  }

  function setTab(next) {
    tab = next;
    document.querySelectorAll('[data-tab]').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on));
      b.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-for]').forEach((el) => {
      const inTab = el.dataset.for.split(' ').includes(tab);
      const inMode = !el.dataset.mode || el.dataset.mode === mode;
      el.hidden = !(inTab && inMode);
    });
    $('#gate-password').setAttribute('autocomplete', tab === 'daftar' ? 'new-password' : 'current-password');
    submit.textContent = LABELS[tab];
    error.hidden = true;
    const first = form.querySelector('[data-for]:not([hidden]) input');
    if (first) first.focus();
  }

  document.querySelector('.auth-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) setTab(b.dataset.tab);
  });

  const codeInput = $('#gate-code');
  codeInput.addEventListener('input', () => {
    const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    codeInput.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
  });

  function device() {
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad/i.test(ua)) return 'iPhone/iPad';
    if (/Mac/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    return 'Browser';
  }

  async function post(path, body) {
    let res;
    try {
      res = await fetch(`api/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, device: device() }),
        credentials: 'same-origin',
      });
    } catch {
      throw new Error('Tidak ada koneksi ke server. Periksa internet lalu coba lagi.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server menjawab ${res.status}.`);
    return data;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const fd = new FormData(form);
    submit.disabled = true;
    submit.classList.add('is-loading');
    try {
      let data;
      if (tab === 'kode') data = await post('pair', { code: fd.get('code') });
      else if (tab === 'daftar') data = await post('register', { email: fd.get('email'), password: fd.get('password'), name: fd.get('name') });
      else if (mode === 'username') data = await post('login', { username: fd.get('username'), password: fd.get('password') });
      else data = await post('login', { email: fd.get('email'), password: fd.get('password') });
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ token: data.token, user: data.user }));
        localStorage.setItem(FRESH_KEY, tab === 'daftar' && fd.get('name') ? `name:${fd.get('name')}` : '1');
        localStorage.removeItem(META_KEY);
      } catch {
        /* tanpa localStorage aplikasi tetap terbuka, hanya tanpa sinkron */
      }
      location.replace('./#beranda');
    } catch (ex) {
      error.textContent = ex.message;
      error.hidden = false;
      submit.disabled = false;
      submit.classList.remove('is-loading');
    }
  });

  function ready(health) {
    $('#gate-loading').hidden = true;
    form.hidden = false;
    if (health && health.auth === 'username') {
      mode = 'username';
      document.querySelector('[data-tab="daftar"]').hidden = true;
    }
    if (health && !health.sync) {
      const note = $('#gate-note');
      note.textContent = 'Server belum siap: penyimpanan akun (Upstash Redis) belum dihubungkan di Vercel.';
      note.hidden = false;
    }
    setTab('masuk');

    // Tautan dari QR: masuk.html#pair-KODE → isi kode dan langsung hubungkan.
    const m = /^#pair-([A-Z0-9]{8})$/i.exec(location.hash || '');
    if (m) {
      history.replaceState(null, '', location.pathname);
      setTab('kode');
      const code = m[1].toUpperCase();
      codeInput.value = `${code.slice(0, 4)}-${code.slice(4)}`;
      form.requestSubmit();
    }
  }

  // Cara masuk ditentukan server (email atau nama pengguna pemilik).
  fetch('api/health', { cache: 'no-store' })
    .then((r) => r.json())
    .then(ready)
    .catch(() => ready(null));
})();
