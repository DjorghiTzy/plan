/**
 * Komponen antarmuka bersama: ikon, escape HTML, toast, dialog, konfirmasi.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const doc = root.document;

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    list: '<path d="M10 6h10M10 12h10M10 18h10"/><path d="m3.5 6 1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M9.5 2h5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7.5 16v1M11.5 11v6M15.5 7v10M19.5 12v5"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    star: '<path d="m12 3.2 2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.4 2.8 1-6-4.3-4.2 6-.9z"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<path d="M9 5.5v13M15 5.5v13"/>',
    reset: '<path d="M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.5"/><path d="M3.5 3.5v5h5"/>',
    skip: '<path d="M5 5.5v13l9.5-6.5z"/><path d="M19 5.5v13"/>',
    flame: '<path d="M12 21.5c3.9 0 6.8-2.6 6.8-6.5 0-3.6-2.5-6.1-4.2-8.4-.5 1.9-1.5 3.2-2.9 3.8-.3-3-1.5-6-3.6-8C8.2 6.3 5.2 8.8 5.2 13.8c0 4.7 2.9 7.7 6.8 7.7z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 21h14"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    note: '<path d="M8 4h11v16H5V7z"/><path d="M5 7h3V4"/><path d="M9 11h6M9 15h4"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.8 8a4.3 4.3 0 0 1-.3 10.5z"/>',
    cloudCheck: '<path d="M7 18.5a4.5 4.5 0 0 1-.7-8.95A6 6 0 0 1 17.8 8a4.3 4.3 0 0 1-.3 10.5z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>',
    cloudOff: '<path d="M7 18.5a4.5 4.5 0 0 1-.7-8.95 6 6 0 0 1 1.9-2.9M10.6 5.3A6 6 0 0 1 17.8 8a4.3 4.3 0 0 1 2.4 7.4"/><path d="m3 3 18 18"/>',
    refresh: '<path d="M20.5 12a8.5 8.5 0 0 1-14.9 5.6M3.5 12a8.5 8.5 0 0 1 14.9-5.6"/><path d="M18.5 3v3.5H15M5.5 21v-3.5H9"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
    sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    command: '<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
    rows: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>',
    eyeoff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c5 0 8.8 4.3 10 7a13.3 13.3 0 0 1-3.2 4.3M6.6 6.6C4.4 8 2.8 10.2 2 12c1.2 2.7 5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2"/><path d="M3 12.5h18"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
    panelclose: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m15.5 10-2 2 2 2"/>',
    panelopen: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m13.5 10 2 2-2 2"/>',
    report: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8h6V4"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  };

  const FILLED = new Set(['play', 'more']);

  function icon(name, cls = '') {
    const body = ICONS[name] || '';
    const fill = FILLED.has(name) ? 'currentColor' : 'none';
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  }

  const MOUTHS = {
    1: '<path d="M8 17c1.1-1.7 2.5-2.5 4-2.5s2.9.8 4 2.5"/><path d="M7.5 8.5 10 9.5M16.5 8.5 14 9.5"/>',
    2: '<path d="M8.5 16.2c1-1 2.2-1.5 3.5-1.5s2.5.5 3.5 1.5"/>',
    3: '<path d="M8.5 15.5h7"/>',
    4: '<path d="M8.3 14.3c1 1.3 2.3 2 3.7 2s2.7-.7 3.7-2"/>',
    5: '<path d="M7.8 13.6h8.4c-.5 2.4-2.1 3.8-4.2 3.8s-3.7-1.4-4.2-3.8z" fill="currentColor"/>',
  };

  function moodFace(value, cls = '') {
    return `<svg class="mood-face ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.2"/><circle cx="9" cy="10.6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10.6" r="1" fill="currentColor" stroke="none"/>${MOUTHS[value] || MOUTHS[3]}</svg>`;
  }

  function categoryLabel(id) {
    const c = P.logic.CATEGORIES.find((x) => x.id === id);
    return c ? c.label : 'Pribadi';
  }

  function priorityLabel(id) {
    const p = P.logic.PRIORITIES.find((x) => x.id === id);
    return p ? p.label : 'Sedang';
  }

  function catChip(id) {
    return `<span class="chip cat" data-cat="${esc(id)}">${esc(categoryLabel(id))}</span>`;
  }

  function timeRange(task) {
    if (!task.start) return '';
    return `${task.start}${task.end ? `–${task.end}` : ''}`;
  }

  // ----- Toast -----

  let toastHost;
  function toast(message, { action, onAction, tone = 'info', duration = 4500 } = {}) {
    if (!toastHost) {
      toastHost = doc.createElement('div');
      toastHost.className = 'toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      doc.body.appendChild(toastHost);
    }
    const el = doc.createElement('div');
    el.className = `toast toast-${tone}`;
    el.style.setProperty('--dur', `${duration}ms`);
    el.innerHTML = `<span>${esc(message)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
    const remove = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    };
    if (action) {
      el.querySelector('.toast-action').addEventListener('click', () => {
        if (onAction) onAction();
        remove();
      });
    }
    toastHost.appendChild(el);
    while (toastHost.children.length > 3) toastHost.firstElementChild.remove();
    setTimeout(remove, duration);
    return remove;
  }

  // ----- Dialog -----

  let dialog;
  let onDialogClose = null;

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = doc.createElement('dialog');
    dialog.className = 'dialog';
    // Catatan: pembersihan dilakukan sinkron di finishClose(), bukan lewat event
    // 'close' (yang datang terlambat dan bisa mengosongkan dialog berikutnya).
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) animatedClose();
    });
    // Esc: tutup dengan animasi, bukan langsung hilang.
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      animatedClose();
    });
    doc.body.appendChild(dialog);
    return dialog;
  }

  /**
   * Membuka dialog. `body` berupa HTML; `onMount(el, close)` untuk memasang event.
   */
  function openDialog({ title, body, size = '', onMount, onClose }) {
    const d = ensureDialog();
    // Dialog sebelumnya (mungkin sedang beranimasi tutup) diselesaikan dulu.
    if (d.open || closeTimer) finishClose();
    d.className = `dialog ${size}`;
    // Isi dibungkus satu elemen baru setiap kali dibuka: event yang dipasang onMount
    // ikut hilang bersama isinya, tidak menumpuk di elemen <dialog> yang dipakai ulang.
    d.innerHTML = `
      <div class="dialog-frame">
        <div class="dialog-head">
          <h2 class="dialog-title">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button>
        </div>
        <div class="dialog-body">${body}</div>
      </div>`;
    const frame = d.firstElementChild;
    onDialogClose = onClose || null;
    const close = animatedClose;
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    if (onMount) onMount(frame, close);
    const first = d.querySelector('[autofocus]') || d.querySelector('input, textarea, select, button:not([data-close])');
    if (first) first.focus();
    return close;
  }

  const reducedMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let closeTimer = null;

  /** Tutup dialog sekarang juga: sembunyikan, kosongkan, lalu jalankan onClose. */
  function finishClose() {
    const d = dialog;
    if (!d) return;
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    d.classList.remove('closing');
    if (d.open) d.close();
    const cb = onDialogClose;
    onDialogClose = null;
    d.innerHTML = '';
    if (cb) cb();
  }

  function animatedClose() {
    const d = dialog;
    if (!d || !d.open || d.classList.contains('closing')) return;
    if (reducedMotion()) {
      finishClose();
      return;
    }
    d.classList.add('closing');
    closeTimer = setTimeout(finishClose, 170);
  }

  function closeDialog() {
    animatedClose();
  }

  // ----- Efek kecil -----

  /** Getar singkat di ponsel yang mendukung (Android). */
  function haptic(ms = 8) {
    try {
      if (root.navigator.vibrate) root.navigator.vibrate(ms);
    } catch {
      /* opsional */
    }
  }

  /** Hujan konfeti kecil dari titik tertentu (atau tengah atas layar). */
  function confetti(origin, { count = 90 } = {}) {
    if (reducedMotion()) return;
    const canvas = doc.createElement('canvas');
    canvas.className = 'confetti';
    canvas.setAttribute('aria-hidden', 'true');
    const dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = root.innerWidth * dpr;
    canvas.height = root.innerHeight * dpr;
    doc.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const r = origin && origin.getBoundingClientRect ? origin.getBoundingClientRect() : null;
    const ox = r ? r.left + r.width / 2 : root.innerWidth / 2;
    const oy = r ? r.top + r.height / 2 : root.innerHeight / 3;
    const colors = ['#1e7a57', '#4cbf8e', '#e0a526', '#2a78d6', '#e87ba4', '#eb6834'];
    const parts = Array.from({ length: count }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const v = 5 + Math.random() * 8;
      return {
        x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: 5 + Math.random() * 5, h: 7 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    });
    const start = root.performance.now();
    const step = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of parts) {
        p.vy += 0.28;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 1600);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)));
        ctx.restore();
      }
      if (t < 1600) root.requestAnimationFrame(step);
      else canvas.remove();
    };
    root.requestAnimationFrame(step);
  }

  /** Hitung naik angka-angka ber-atribut data-count di dalam elemen. */
  function countUp(scope) {
    if (reducedMotion()) return;
    scope.querySelectorAll('[data-count]').forEach((el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target) || target === 0) return;
      const decimals = Number(el.dataset.decimals || 0);
      const suffix = el.dataset.suffix || '';
      const start = root.performance.now();
      const dur = 750;
      const fmt = (v) => v.toLocaleString('id-ID', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        const eased = 1 - (1 - p) ** 3;
        el.textContent = `${fmt(target * eased)}${suffix}`;
        if (p < 1) root.requestAnimationFrame(step);
      };
      root.requestAnimationFrame(step);
    });
  }

  /** Konfirmasi di dalam halaman (confirm() bawaan browser tidak dipakai). */
  function confirmDialog({ title, message, confirmText = 'Ya, lanjutkan', danger = false }) {
    return new Promise((resolve) => {
      let answer = false;
      openDialog({
        title,
        size: 'small',
        body: `<p class="dialog-text">${esc(message)}</p>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-confirm>${esc(confirmText)}</button>
          </div>`,
        onMount(el, close) {
          el.querySelector('[data-confirm]').addEventListener('click', () => {
            answer = true;
            close();
          });
        },
        onClose: () => resolve(answer),
      });
    });
  }

  /** Unduh teks sebagai berkas (tidak berfungsi di bingkai yang memblokir unduhan). */
  function download(filename, text, type = 'application/json') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    try {
      await root.navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Jalankan fungsi setelah browser sempat menggambar frame berikutnya, supaya
   * umpan balik (tombol ditekan, bilah pemuatan) tampil sebelum pekerjaan berat.
   * Ada cadangan timer karena requestAnimationFrame berhenti di tab tersembunyi.
   */
  function afterPaint(fn) {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      fn();
    };
    if (typeof root.requestAnimationFrame === 'function') {
      root.requestAnimationFrame(() => setTimeout(run, 0));
    }
    setTimeout(run, 120);
  }

  /**
   * Bilah pemuatan di tepi atas layar. Animasinya murni transform/opacity sehingga
   * berjalan di compositor dan tetap bergerak walau JavaScript sedang sibuk.
   * Muncul setelah jeda singkat agar proses cepat tidak berkedip.
   */
  const busy = (() => {
    let count = 0;
    let bar = null;
    function el() {
      if (!bar) {
        bar = doc.createElement('div');
        bar.className = 'busy-bar';
        bar.setAttribute('aria-hidden', 'true');
        bar.innerHTML = '<span></span>';
        doc.body.appendChild(bar);
      }
      return bar;
    }
    return {
      start() {
        count += 1;
        el().classList.add('on');
        doc.documentElement.setAttribute('aria-busy', 'true');
      },
      stop() {
        count = Math.max(0, count - 1);
        if (count) return;
        el().classList.remove('on');
        doc.documentElement.removeAttribute('aria-busy');
      },
      get active() {
        return count > 0;
      },
    };
  })();

  /**
   * Tampilkan spinner di tombol selama `task` (Promise/fungsi async) berjalan.
   * Tombol dinonaktifkan agar tidak terklik dua kali.
   */
  async function withBusy(button, task) {
    const b = button && button.nodeType === 1 ? button : null;
    if (b) {
      b.disabled = true;
      b.classList.add('is-loading');
      b.setAttribute('aria-busy', 'true');
    }
    busy.start();
    try {
      return await (typeof task === 'function' ? task() : task);
    } finally {
      busy.stop();
      if (b) {
        b.disabled = false;
        b.classList.remove('is-loading');
        b.removeAttribute('aria-busy');
      }
    }
  }

  /** Kerangka baris (skeleton) untuk daftar yang datanya sedang dimuat. */
  function skeleton(rows = 3) {
    return `<ul class="skeleton-list" aria-label="Memuat">${Array.from({ length: rows }, (_, i) => `
      <li class="skeleton-row" style="--i:${i}"><span class="sk-dot"></span><span class="sk-line"></span></li>`).join('')}</ul>`;
  }

  // ----- Pilih jam: daftar 00–23 dan 00–59 (tanpa roda jam yang berputar) -----

  const pad2 = (n) => String(n).padStart(2, '0');

  /**
   * Pemilih jam berupa dua daftar (jam 00–23, menit 00–59). Nilainya tersimpan di
   * <input type="hidden" id name> sehingga formulir tetap membaca "HH:MM" (atau "" bila kosong).
   * @param {{id?: string, name: string, value?: string, optional?: boolean, label?: string}} o
   */
  function timeSelect({ id = '', name, value = '', optional = true, label = 'Jam', attrs = '' }) {
    const [h, m] = /^\d\d:\d\d$/.test(value || '') ? value.split(':') : ['', ''];
    const opts = (count, sel) => Array.from({ length: count }, (_, i) => {
      const v = pad2(i);
      return `<option value="${v}" ${v === sel ? 'selected' : ''}>${v}</option>`;
    }).join('');
    const empty = optional ? '<option value="">--</option>' : '';
    const hv = h || (optional ? '' : '08');
    const mv = m || (optional ? '' : '00');
    return `
      <span class="time-select" data-time-select>
        <select class="ts-h" ${id ? `id="${esc(id)}-h"` : ''} aria-label="${esc(label)}: jam">${empty}${opts(24, hv)}</select>
        <span class="ts-sep" aria-hidden="true">:</span>
        <select class="ts-m" ${id ? `id="${esc(id)}-m"` : ''} aria-label="${esc(label)}: menit">${empty}${opts(60, mv)}</select>
        <input type="hidden" ${id ? `id="${esc(id)}"` : ''} name="${esc(name)}" value="${hv ? `${hv}:${mv || '00'}` : ''}" ${attrs}>
      </span>`;
  }

  /** Ubah nilai pemilih jam dari kode (mis. tombol saran jam). */
  function setTime(input, value) {
    if (!input) return;
    const v = /^\d\d:\d\d$/.test(value || '') ? value : '';
    input.value = v;
    const box = input.closest('[data-time-select]');
    if (!box) return;
    const [h, m] = v ? v.split(':') : ['', ''];
    box.querySelector('.ts-h').value = h;
    box.querySelector('.ts-m').value = m;
  }

  // Satu pendengar untuk semua pemilih jam (termasuk baris yang ditambahkan belakangan).
  if (doc && doc.addEventListener) {
    doc.addEventListener('change', (e) => {
      const sel = e.target;
      const box = sel && sel.closest && sel.closest('[data-time-select]');
      if (!box || sel.tagName !== 'SELECT') return;
      const hSel = box.querySelector('.ts-h');
      const mSel = box.querySelector('.ts-m');
      const input = box.querySelector('input[type="hidden"]');
      if (hSel.value === '' && sel === hSel) mSel.value = '';
      if (hSel.value !== '' && mSel.value === '') mSel.value = '00';
      input.value = hSel.value === '' ? '' : `${hSel.value}:${mSel.value}`;
      input.dispatchEvent(new root.Event('change', { bubbles: true }));
    });
  }

  P.ui = {
    esc, icon, moodFace, categoryLabel, priorityLabel, catChip, timeRange,
    toast, openDialog, closeDialog, confirmDialog, copyText, download, haptic, confetti, countUp,
    afterPaint, busy, withBusy, skeleton, timeSelect, setTime,
  };
})(typeof self !== 'undefined' ? self : this);
