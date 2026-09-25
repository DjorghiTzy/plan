/**
 * Antarmuka akun & sinkronisasi: dialog masuk/daftar/kode, panel akun,
 * pasangkan perangkat (kode + QR), dan status sinkron di topbar.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const { esc, icon } = P.ui;
  const doc = root.document;

  function timeAgo(ts) {
    if (!ts) return 'belum pernah';
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 10) return 'baru saja';
    if (s < 60) return `${s} detik lalu`;
    if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
    const d = new Date(ts);
    return `pukul ${P.date.formatTime(d.getHours() * 60 + d.getMinutes())}`;
  }

  const STATUS = {
    local: { icon: 'cloudOff', label: 'Tersimpan di perangkat ini' },
    idle: { icon: 'cloudCheck', label: 'Tersinkron' },
    syncing: { icon: 'refresh', label: 'Menyinkronkan…' },
    offline: { icon: 'cloudOff', label: 'Offline, dikirim nanti' },
    error: { icon: 'cloudOff', label: 'Gagal sinkron' },
  };

  function statusText(info) {
    if (!info.loggedIn) return info.available ? 'Belum masuk. Data hanya di perangkat ini.' : 'Data tersimpan di perangkat ini.';
    if (info.status === 'error') return info.error || 'Gagal sinkron.';
    if (info.status === 'offline') return `Offline. ${info.pending} perubahan menunggu dikirim.`;
    if (info.status === 'syncing') return 'Menyinkronkan…';
    return `Tersinkron ${timeAgo(info.lastSyncAt)}${info.pending ? ` · ${info.pending} menunggu` : ''}.`;
  }

  // ----- Pill status di topbar -----

  function paintPill(info = P.sync.info()) {
    const pill = doc.querySelector('[data-sync-pill]');
    if (!pill) return;
    pill.hidden = !info.available && !info.loggedIn;
    const st = STATUS[info.loggedIn ? info.status : 'local'];
    pill.dataset.status = info.loggedIn ? info.status : 'local';
    pill.innerHTML = `${icon(st.icon)}<span>${esc(info.loggedIn ? st.label : 'Masuk')}</span>`;
    pill.title = statusText(info);
    pill.setAttribute('aria-label', `Akun & sinkronisasi: ${statusText(info)}`);
  }

  // ----- Formulir masuk/daftar/kode -----

  function modeField() {
    if (!P.sync.hasLocalData()) return '';
    return `
      <fieldset class="field merge-choice">
        <legend>Data yang sudah ada di perangkat ini</legend>
        <label class="radio-row"><input type="radio" name="mode" value="merge" checked><span><strong>Gabungkan ke akun.</strong> Data akun tidak ditimpa; tugas dari perangkat ini ditambahkan.</span></label>
        <label class="radio-row"><input type="radio" name="mode" value="replace"><span><strong>Pakai data akun saja.</strong> Data di perangkat ini diganti.</span></label>
      </fieldset>`;
  }

  function authForms(tab, presetCode = '') {
    const tabs = [['masuk', 'Masuk'], ['daftar', 'Daftar'], ['kode', 'Pakai kode']];
    return `
      <div class="segmented auth-tabs" role="tablist">
        ${tabs.map(([id, label]) => `<button type="button" role="tab" data-auth-tab="${id}" aria-selected="${tab === id}" aria-pressed="${tab === id}">${label}</button>`).join('')}
      </div>
      <form class="form auth-form" data-auth-form="${tab}" novalidate>
        ${tab === 'daftar' ? `
          <div class="field">
            <label for="auth-name">Nama panggilan <span class="muted">(opsional)</span></label>
            <input id="auth-name" name="name" type="text" maxlength="40" autocomplete="nickname">
          </div>` : ''}
        ${tab === 'kode' ? `
          <p class="dialog-text">Buka <strong>Pengaturan → Hubungkan perangkat lain</strong> di perangkat yang sudah masuk, lalu ketik kode 8 karakternya di sini atau pindai QR-nya.</p>
          <div class="field">
            <label for="auth-code">Kode perangkat</label>
            <input id="auth-code" name="code" type="text" inputmode="text" autocomplete="one-time-code" maxlength="9" placeholder="ABCD-EFGH" class="code-input" value="${esc(presetCode)}" autofocus>
          </div>` : `
          <div class="field">
            <label for="auth-email">Email</label>
            <input id="auth-email" name="email" type="email" autocomplete="email" required maxlength="254" autofocus>
          </div>
          <div class="field">
            <label for="auth-password">Kata sandi</label>
            <input id="auth-password" name="password" type="password" required minlength="8" maxlength="200" autocomplete="${tab === 'daftar' ? 'new-password' : 'current-password'}">
            ${tab === 'daftar' ? '<p class="hint">Minimal 8 karakter.</p>' : ''}
          </div>`}
        ${modeField()}
        <p class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          <span class="spacer"></span>
          <button type="submit" class="btn primary" data-submit>${{ masuk: 'Masuk', daftar: 'Buat akun', kode: 'Hubungkan' }[tab]}</button>
        </div>
      </form>
      <p class="hint auth-note">${icon('key', 'inline')} Kata sandi disimpan dalam bentuk hash (scrypt) di server. Data dikirim lewat HTTPS.</p>`;
  }

  function loggedInView(info) {
    const u = info.user || {};
    const initial = (u.name || u.username || u.email || '?').trim().charAt(0).toUpperCase();
    return `
      <div class="account-card">
        <span class="avatar" aria-hidden="true">${esc(initial)}</span>
        <div>
          <p class="account-name">${esc(u.name || u.username || 'Akun Rencana Harian')}</p>
          <p class="muted">${esc(u.username ? `@${u.username}` : u.email || '')}</p>
        </div>
      </div>
      <p class="sync-line" data-status="${esc(info.status)}">${icon(STATUS[info.status] ? STATUS[info.status].icon : 'cloud', 'inline')} <span data-sync-text>${esc(statusText(info))}</span></p>
      <div class="button-row">
        <button type="button" class="btn primary" data-acc="pair">${icon('phone')}Hubungkan perangkat lain</button>
        <button type="button" class="btn ghost" data-acc="sync">${icon('refresh')}Sinkronkan sekarang</button>
      </div>
      <div class="button-row">
        <button type="button" class="btn ghost" data-acc="logout">${icon('logout')}Keluar</button>
        <button type="button" class="btn ghost danger-text" data-acc="delete">${icon('trash')}Hapus akun</button>
      </div>`;
  }

  function unavailableView() {
    return `
      <p class="dialog-text">Sinkronisasi antarperangkat belum aktif di alamat ini, jadi data tersimpan di browser perangkat ini saja.</p>
      <p class="hint">Pemilik aplikasi dapat mengaktifkannya dengan memasang aplikasi di Vercel lalu menambahkan penyimpanan Upstash Redis (lihat README).</p>`;
  }

  // ----- Dialog akun -----

  function openAccount({ tab = 'masuk', code = '', autoSubmit = false } = {}) {
    const info = P.sync.info();
    // Mode pribadi: masuk hanya lewat halaman masuk (yang tahu cara masuk: email atau nama pengguna).
    if (info.private && !info.loggedIn) {
      root.location.replace(code ? `masuk.html#pair-${code.replace('-', '')}` : 'masuk.html');
      return;
    }
    let current = tab;
    P.ui.openDialog({
      title: info.loggedIn ? 'Akun & sinkronisasi' : 'Simpan data ke akun',
      size: 'small',
      body: `<div data-account-body>${!info.available && !info.loggedIn ? unavailableView() : info.loggedIn ? loggedInView(info) : `
        <p class="dialog-text">Masuk supaya rencanamu tersimpan di server dan langsung sama di HP, laptop, dan tablet.</p>
        <div data-auth>${authForms(current, code)}</div>`}</div>`,
      onMount(el, close) {
        const body = el.querySelector('[data-account-body]');

        const bindForm = () => {
          const form = body.querySelector('[data-auth-form]');
          if (!form) return;
          const codeInput = form.querySelector('#auth-code');
          if (codeInput) {
            codeInput.addEventListener('input', () => {
              const raw = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
              codeInput.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
            });
          }
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            const err = form.querySelector('.form-error');
            const btn = form.querySelector('[data-submit]');
            const mode = String(fd.get('mode') || 'merge');
            err.hidden = true;
            btn.disabled = true;
            btn.classList.add('is-loading');
            try {
              if (current === 'kode') await P.sync.claimCode(String(fd.get('code') || ''), mode);
              else if (current === 'daftar') {
                await P.sync.register({ email: fd.get('email'), password: fd.get('password'), name: fd.get('name') }, mode);
                const name = String(fd.get('name') || '').trim();
                if (name && !P.store.state.settings.name) P.store.setSettings({ name });
              } else await P.sync.login({ email: fd.get('email'), password: fd.get('password') }, mode);
              close();
              P.ui.toast('Masuk berhasil. Data kini tersinkron di semua perangkatmu.', { tone: 'success' });
            } catch (ex) {
              err.textContent = ex.message || 'Gagal. Coba lagi.';
              err.hidden = false;
              btn.disabled = false;
              btn.classList.remove('is-loading');
            }
          });
          if (autoSubmit && current === 'kode' && codeInput && codeInput.value) {
            autoSubmit = false;
            form.requestSubmit();
          }
        };

        body.addEventListener('click', async (e) => {
          const t = e.target.closest('[data-auth-tab]');
          if (t) {
            current = t.dataset.authTab;
            body.querySelector('[data-auth]').innerHTML = authForms(current);
            bindForm();
            const first = body.querySelector('input:not([type="radio"])');
            if (first) first.focus();
            return;
          }
          const act = e.target.closest('[data-acc]');
          if (!act) return;
          if (act.dataset.acc !== 'sync') close();
          runAction(act.dataset.acc, act);
        });
        bindForm();
      },
    });
  }

  async function runAction(name, button) {
    switch (name) {
      case 'sync':
        await P.ui.withBusy(button, () => P.sync.syncNow());
        P.ui.toast(P.sync.info().status === 'idle' ? 'Semua data sudah tersinkron.' : statusText(P.sync.info()));
        break;
      case 'pair':
        openPair();
        break;
      case 'logout': {
        const ok = await P.ui.confirmDialog({
          title: 'Keluar dari akun?',
          message: 'Data tetap ada di perangkat ini, tetapi perubahan berikutnya tidak lagi tersinkron sampai kamu masuk lagi.',
          confirmText: 'Keluar',
        });
        if (ok) {
          await P.ui.withBusy(null, () => P.sync.logout());
          P.ui.toast('Kamu sudah keluar.');
        }
        break;
      }
      case 'delete':
        openDelete();
        break;
      default:
    }
  }

  function openDelete() {
    P.ui.openDialog({
      title: 'Hapus akun?',
      size: 'small',
      body: `
        <form class="form" novalidate>
          <p class="dialog-text">Akun dan <strong>semua data di server</strong> akan dihapus permanen dan semua perangkat akan keluar. Data di perangkat ini tetap ada.</p>
          <div class="field">
            <label for="delete-password">Ketik kata sandi untuk konfirmasi</label>
            <input id="delete-password" type="password" autocomplete="current-password" required autofocus>
          </div>
          <p class="form-error" role="alert" hidden></p>
          <div class="dialog-actions">
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn danger">Hapus akun</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const err = form.querySelector('.form-error');
          err.hidden = true;
          try {
            await P.ui.withBusy(form.querySelector('[type="submit"]'), () => P.sync.deleteAccount(form.querySelector('#delete-password').value));
            close();
            P.ui.toast('Akun beserta datanya di server sudah dihapus.');
          } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
          }
        });
      },
    });
  }

  // ----- Pasangkan perangkat -----

  let qrLoading = null;
  function loadQR() {
    if (root.qrcode) return Promise.resolve(root.qrcode);
    if (!qrLoading) {
      qrLoading = new Promise((resolve, reject) => {
        const sc = doc.createElement('script');
        sc.src = 'js/vendor/qrcode.js';
        sc.onload = () => resolve(root.qrcode);
        sc.onerror = reject;
        doc.head.appendChild(sc);
      });
    }
    return qrLoading;
  }

  /** QR sebagai SVG dengan warna dari token tema. */
  function qrSVG(qrcode, text) {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    }
    return `<svg class="qr" viewBox="0 0 ${n + 4} ${n + 4}" role="img" aria-label="Kode QR untuk menghubungkan perangkat" shape-rendering="crispEdges"><rect width="${n + 4}" height="${n + 4}" fill="#ffffff"/><path d="${d}" fill="#14201a"/></svg>`;
  }

  async function openPair() {
    let res;
    try {
      res = await P.ui.withBusy(null, () => P.sync.createPairCode());
    } catch (ex) {
      P.ui.toast(ex.message, { tone: 'warn' });
      return;
    }
    const pretty = `${res.code.slice(0, 4)}-${res.code.slice(4)}`;
    // Mode pribadi: tautan langsung ke halaman masuk (hanya halaman itu yang terbuka tanpa sesi).
    const base = `${root.location.origin}${root.location.pathname.replace(/[^/]*$/, '')}`;
    const link = P.sync.info().private ? `${base}masuk.html#pair-${res.code}` : `${base}#pair-${res.code}`;
    let tick = null;
    P.ui.openDialog({
      title: 'Hubungkan perangkat lain',
      size: 'small',
      body: `
        <p class="dialog-text">Pindai QR ini dengan kamera HP, atau buka aplikasi di perangkat lain lalu pilih <strong>Masuk → Pakai kode</strong>.</p>
        <div class="pair-box">
          <div class="qr-wrap" data-qr><span class="spinner" aria-hidden="true"></span></div>
          <div class="pair-code" aria-label="Kode ${esc(res.code.split('').join(' '))}">${esc(pretty)}</div>
          <p class="hint" data-countdown aria-live="polite">Berlaku 10 menit, sekali pakai.</p>
        </div>
        <div class="button-row">
          <button type="button" class="btn ghost" data-copy-link>${icon('copy')}Salin tautan</button>
        </div>`,
      onMount(el) {
        loadQR().then((qrcode) => {
          const box = el.querySelector('[data-qr]');
          if (box) box.innerHTML = qrSVG(qrcode, link);
        }).catch(() => {
          const box = el.querySelector('[data-qr]');
          if (box) box.innerHTML = '<p class="hint">QR tidak dapat dimuat. Pakai kode di bawah.</p>';
        });
        const cd = el.querySelector('[data-countdown]');
        tick = setInterval(() => {
          const left = Math.max(0, Math.round((res.expiresAt - Date.now()) / 1000));
          cd.textContent = left ? `Berlaku ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} lagi, sekali pakai.` : 'Kode kedaluwarsa. Tutup lalu buat kode baru.';
          if (!left) clearInterval(tick);
        }, 1000);
        el.querySelector('[data-copy-link]').addEventListener('click', async () => {
          if (await P.ui.copyText(link)) P.ui.toast('Tautan disalin. Buka di perangkat lain.', { tone: 'success' });
          else P.ui.toast(`Salin manual: ${link}`, { duration: 12000 });
        });
      },
      onClose: () => clearInterval(tick),
    });
  }

  // ----- Panel di Pengaturan & banner Beranda -----

  function settingsPanel() {
    const info = P.sync.info();
    const body = !info.checked
      ? '<p class="muted">Memeriksa server…</p>'
      : !info.available && !info.loggedIn
        ? `<p class="muted">Sinkronisasi antarperangkat belum aktif di alamat ini, jadi data tersimpan di browser ini saja.</p>
           <p class="hint">Aktif otomatis setelah aplikasi dipasang di Vercel dengan penyimpanan Upstash Redis (panduan ada di README).</p>`
        : info.loggedIn
          ? loggedInView(info)
          : `<p class="muted">Masuk atau buat akun agar data tersimpan di server dan sama persis di HP maupun laptop, hampir seketika.</p>
             <div class="button-row">
               <button type="button" class="btn primary" data-open-account="daftar">${icon('user')}Buat akun</button>
               <button type="button" class="btn ghost" data-open-account="masuk">Masuk</button>
               <button type="button" class="btn ghost" data-open-account="kode">${icon('phone')}Pakai kode</button>
             </div>`;
    return `
      <section class="panel wide account-panel">
        <h2>Akun & sinkronisasi</h2>
        ${body}
      </section>`;
  }

  function banner(ctx) {
    const info = P.sync.info();
    if (!info.available || info.loggedIn || ctx.prefs.syncBannerDismissed) return '';
    return `
      <div class="banner" data-tone="info">
        <p><strong>Buka rencana ini di HP juga?</strong> Buat akun gratis supaya data tersimpan di server dan tersinkron otomatis di semua perangkat.</p>
        <div class="banner-actions">
          <button type="button" class="btn small primary" data-open-account="daftar">Buat akun</button>
          <button type="button" class="btn small ghost" data-open-account="masuk">Masuk</button>
          <button type="button" class="btn small ghost" data-dismiss-sync>Nanti</button>
        </div>
      </div>`;
  }

  function init() {
    P.sync.onStatus((info) => {
      paintPill(info);
      doc.querySelectorAll('[data-sync-text]').forEach((el) => { el.textContent = statusText(info); });
      if (P.app && info.checked) P.app.refreshIfIdle();
    });
    paintPill();
    doc.addEventListener('click', (e) => {
      const open = e.target.closest('[data-open-account]');
      if (open) {
        openAccount({ tab: open.dataset.openAccount || 'masuk' });
        return;
      }
      if (e.target.closest('[data-sync-pill]')) {
        openAccount();
        return;
      }
      const inPanel = e.target.closest('.account-panel [data-acc]');
      if (inPanel) {
        runAction(inPanel.dataset.acc, inPanel);
        return;
      }
      if (e.target.closest('[data-dismiss-sync]') && P.app) P.app.setPref('syncBannerDismissed', true);
    });
  }

  /** Tautan "#pair-KODE" dari QR: masuk otomatis dengan kode itu. */
  function handlePairHash() {
    const m = /^#pair-([A-Z0-9]{8})$/i.exec(root.location.hash || '');
    if (!m) return false;
    try {
      root.history.replaceState(null, '', `${root.location.pathname}#beranda`);
    } catch {
      /* abaikan */
    }
    const code = m[1].toUpperCase();
    const go = () => {
      if (P.sync.info().loggedIn) {
        P.ui.toast('Perangkat ini sudah masuk ke akun.');
        return;
      }
      openAccount({ tab: 'kode', code: `${code.slice(0, 4)}-${code.slice(4)}`, autoSubmit: !P.sync.hasLocalData() });
    };
    const wait = setInterval(() => {
      if (P.sync.info().checked) {
        clearInterval(wait);
        go();
      }
    }, 100);
    return true;
  }

  P.account = { init, openAccount, openPair, settingsPanel, banner, handlePairHash, statusText, paintPill };
})(typeof self !== 'undefined' ? self : this);
