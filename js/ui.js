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
    rows: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/>',
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
    dialog.addEventListener('close', () => {
      const cb = onDialogClose;
      onDialogClose = null;
      dialog.innerHTML = '';
      if (cb) cb();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
    doc.body.appendChild(dialog);
    return dialog;
  }

  /**
   * Membuka dialog. `body` berupa HTML; `onMount(el, close)` untuk memasang event.
   */
  function openDialog({ title, body, size = '', onMount, onClose }) {
    const d = ensureDialog();
    if (d.open) d.close();
    d.className = `dialog ${size}`;
    d.innerHTML = `
      <div class="dialog-head">
        <h2 class="dialog-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Tutup">${icon('x')}</button>
      </div>
      <div class="dialog-body">${body}</div>`;
    onDialogClose = onClose || null;
    const close = () => d.close();
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
    if (onMount) onMount(d, close);
    const first = d.querySelector('[autofocus]') || d.querySelector('input, textarea, select, button:not([data-close])');
    if (first) first.focus();
    return close;
  }

  function closeDialog() {
    if (dialog && dialog.open) dialog.close();
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

  async function copyText(text) {
    try {
      await root.navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  P.ui = {
    esc, icon, moodFace, categoryLabel, priorityLabel, catChip, timeRange,
    toast, openDialog, closeDialog, confirmDialog, copyText,
  };
})(typeof self !== 'undefined' ? self : this);
