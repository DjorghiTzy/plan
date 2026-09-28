/**
 * Menu klik kanan milik aplikasi (menggantikan menu bawaan browser).
 * Isinya menyesuaikan yang diklik:
 * - teks yang diblok: salin, jadikan tugas, cari;
 * - baris tugas: selesai, ubah, prioritas, pindah ke besok, duplikat, fokus, hapus;
 * - di mana saja: tugas baru, cari, Menu aplikasi, ikon aplikasi favorit, musik, timer,
 *   tema, kembali / muat ulang / salin tautan.
 * Menu bawaan tetap ada: Shift + klik kanan, di kotak ketik, di dalam dialog, dan tekan lama
 * di layar sentuh.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const { esc, icon } = P.ui;
  const doc = root.document;

  // Warna ikon tiap aksi (selaras dengan ikon aplikasi di Menu).
  const C = {
    green: '#16a34a', blue: '#2f6fed', amber: '#f59e0b', teal: '#0d9488', violet: '#8b5cf6', tomato: '#ef4444',
    red: '#dc2626', cyan: '#0891b2', pink: '#db2777', fuchsia: '#c026d3', indigo: '#6366f1', slate: '#64748b', brand: '#1e7a57',
  };

  const reduced = () => Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const popover = typeof root.HTMLElement === 'function' && 'showPopover' in root.HTMLElement.prototype;

  let el = null;
  let items = []; // {run, keep}
  let lastPointer = 'mouse';
  let lastFocus = null;

  // ----- Isi menu -----

  const kbd = (k) => (k ? `<kbd>${esc(k)}</kbd>` : '');
  function item(i, { ic, color, label, hint = '', keys = '', danger = false }) {
    return `<button type="button" class="ctx-item${danger ? ' danger' : ''}" role="menuitem" data-ctx="${i}" style="--ic:${color};--i:${i}">
      <span class="ctx-ic">${icon(ic)}</span>
      <span class="ctx-label">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
      ${kbd(keys)}
    </button>`;
  }

  function section(title, rows) {
    return rows.length ? `<div class="ctx-sec" role="group" aria-label="${esc(title)}"><p class="ctx-title">${esc(title)}</p>${rows.join('')}</div>` : '';
  }

  const clip = (text, n = 28) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

  /** Susun menu untuk titik yang diklik; kembalikan HTML dan daftar aksinya. */
  function build(target, selection) {
    items = [];
    const add = (spec, run, keep = false) => {
      items.push({ run, keep });
      return item(items.length - 1, spec);
    };
    const parts = [];
    const selected = P.app.selected();
    const today = D.todayKey();

    // Kepala: aplikasi yang sedang dibuka + jam.
    const cur = P.app.current();
    const nav = P.app.NAV.find((n) => n.id === cur) || P.app.NAV[0];
    const glyph = P.launcher && P.launcher.glyph ? P.launcher.glyph(nav.id) : '';
    const now = new Date();
    parts.push(`<div class="ctx-head" style="${P.launcher ? P.launcher.colorsOf(nav.id) : ''}">
      ${glyph}<span class="ctx-app"><b>${esc(nav.label)}</b><small>${esc(D.dayName(today))}, ${esc(D.formatShort(today))}</small></span>
      <span class="ctx-time">${esc(D.formatTime(D.minutesOfDay(now)))}</span>
    </div>`);

    // Teks yang diblok.
    if (selection) {
      parts.push(section(`“${clip(selection)}”`, [
        add({ ic: 'copy', color: C.slate, label: 'Salin', keys: 'Ctrl+C' }, async () => {
          if (await P.ui.copyText(selection)) P.ui.toast('Teks disalin.', { tone: 'success' });
        }),
        add({ ic: 'plus', color: C.green, label: 'Jadikan tugas' }, () => P.components.openTaskEditor({ defaults: { date: selected, title: selection.slice(0, 140) } })),
        add({ ic: 'search', color: C.cyan, label: 'Cari di semua tugas' }, () => P.components.openSearch(selection)),
      ]));
    }

    // Baris tugas.
    const row = target && target.closest ? target.closest('.task[data-id]') : null;
    const task = row ? P.store.findTask(row.dataset.id) : null;
    if (task) {
      const press = (sel) => () => {
        const b = row.isConnected ? row.querySelector(sel) : null;
        if (b) b.click();
        return b;
      };
      const tomorrow = D.addDays(task.date, 1);
      parts.push(section(`Tugas · ${clip(task.title, 26)}`, [
        add({ ic: 'check', color: C.green, label: task.done ? 'Batal selesai' : 'Tandai selesai' }, press('[data-action="toggle-task"]')),
        add({ ic: 'edit', color: C.blue, label: 'Ubah tugas' }, () => P.components.openTaskEditor({ task: P.store.findTask(task.id) })),
        add({ ic: 'star', color: C.amber, label: task.starred ? 'Lepas dari Tiga Prioritas' : 'Jadikan prioritas utama' }, () => {
          if (!P.store.toggleStar(task.id)) P.ui.toast('Tiga Prioritas sudah penuh. Lepas salah satunya dulu.', { tone: 'warn' });
        }),
        add({ ic: 'arrow', color: C.teal, label: 'Pindah ke besok', hint: D.formatShort(tomorrow) }, () => {
          const from = task.date;
          P.store.moveTasks([task.id], tomorrow);
          P.ui.toast(`Dipindah ke ${D.formatShort(tomorrow)}.`, { action: 'Urungkan', onAction: () => P.store.moveTasks([task.id], from) });
        }),
        add({ ic: 'copy', color: C.violet, label: 'Duplikat' }, () => {
          const t = P.store.findTask(task.id);
          const copy = P.store.addTask({
            date: t.date, title: t.title, notes: t.notes, category: t.category, priority: t.priority,
            start: t.start, end: t.end, area: t.area, projectId: t.projectId,
            subtasks: t.subtasks.map((s) => ({ title: s.title })),
          });
          P.ui.toast('Tugas diduplikat.', { action: 'Urungkan', onAction: () => P.store.deleteTask(copy.id) });
        }),
        add({ ic: 'timer', color: C.tomato, label: 'Fokus pada tugas ini' }, () => {
          P.timer.setTask(task.id);
          if (P.store.state.timer.status !== 'running') P.timer.start();
          P.app.go('fokus');
        }),
        add({ ic: 'trash', color: C.red, label: 'Hapus', danger: true }, () => P.components.removeWithUndo(task.id)),
      ]));
    }

    // Aksi cepat.
    parts.push(section('Aksi cepat', [
      add({ ic: 'plus', color: C.green, label: 'Tugas baru', keys: 'N' }, () => P.components.openTaskEditor({ defaults: { date: selected } })),
      add({ ic: 'search', color: C.cyan, label: 'Cari tugas & perintah', keys: 'Ctrl+K' }, () => P.components.openSearch()),
      add({ ic: 'grid', color: C.brand, label: 'Menu aplikasi', keys: 'A' }, () => P.launcher && P.launcher.open(doc.querySelector('.app-home'))),
      ...(selected !== today ? [add({ ic: 'calendar', color: C.pink, label: 'Kembali ke hari ini', keys: 'T' }, () => P.app.setDate(today))] : []),
    ]));

    // Ikon aplikasi favorit (dok Menu).
    if (P.launcher && P.launcher.dock) {
      const dock = P.launcher.dock().slice(0, 6);
      const apps = dock.map((id) => {
        const a = P.launcher.APPS.find((x) => x.id === id);
        if (!a) return '';
        items.push({ run: (btn) => P.launcher.runApp(id, btn) });
        return `<button type="button" class="ctx-app-btn${a.page === cur ? ' on' : ''}" role="menuitem" data-ctx="${items.length - 1}" title="${esc(a.label)}" aria-label="Buka ${esc(a.label)}" style="--i:${items.length - 1}">${P.launcher.glyph(id)}</button>`;
      }).join('');
      if (apps) parts.push(`<div class="ctx-sec" role="group" aria-label="Aplikasi favorit"><p class="ctx-title">Buka aplikasi</p><div class="ctx-apps">${apps}</div></div>`);
    }

    // Musik & timer & tema.
    const live = [];
    const ms = P.music ? P.music.state() : null;
    if (ms && ms.id) {
      const t = P.musicLib.find(ms.id);
      live.push(add({ ic: ms.playing ? 'pause' : 'play', color: C.fuchsia, label: ms.playing ? 'Jeda musik' : 'Putar musik', hint: t ? t.title : '' }, () => P.music.toggle()));
      live.push(add({ ic: 'skip', color: C.fuchsia, label: 'Lagu berikutnya' }, () => P.music.next()));
    } else if (P.music) {
      live.push(add({ ic: 'music', color: C.fuchsia, label: 'Putar musik' }, () => P.music.play()));
    }
    const tm = P.store.state.timer;
    const timeText = P.timer.format(P.timer.remainingMs());
    live.push(add({
      ic: tm.status === 'running' ? 'pause' : 'timer',
      color: C.tomato,
      label: tm.status === 'running' ? 'Jeda timer fokus' : tm.status === 'paused' ? 'Lanjutkan timer fokus' : 'Mulai fokus',
      hint: timeText,
    }, () => P.timer.toggle()));
    const dark = doc.documentElement.getAttribute('data-theme') === 'dark'
      || (!doc.documentElement.getAttribute('data-theme') && root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
    live.push(add({ ic: dark ? 'sun' : 'moon', color: dark ? C.amber : C.indigo, label: dark ? 'Mode terang' : 'Mode gelap' }, (btn) => P.app.toggleTheme(btn)));
    parts.push(section('Sekarang', live));

    // Navigasi browser (pengganti menu bawaan).
    const tools = [
      { ic: 'left', label: 'Kembali', run: () => root.history.back() },
      { ic: 'refresh', label: 'Muat ulang', run: () => root.location.reload() },
      { ic: 'share', label: 'Salin tautan', run: async () => { if (await P.ui.copyText(root.location.href)) P.ui.toast('Tautan disalin.', { tone: 'success' }); } },
      { ic: 'command', label: 'Pintasan keyboard', run: () => P.app.openShortcuts() },
    ].map((t) => {
      items.push({ run: t.run });
      return `<button type="button" class="ctx-tool" role="menuitem" data-ctx="${items.length - 1}" title="${esc(t.label)}" aria-label="${esc(t.label)}">${icon(t.ic)}</button>`;
    }).join('');
    parts.push(`<div class="ctx-tools">${tools}</div>`);
    parts.push('<p class="ctx-foot">Shift + klik kanan: menu browser</p>');
    return parts.join('');
  }

  // ----- Tampil & tutup -----

  function ensure() {
    if (el) return;
    el = doc.createElement('div');
    el.className = 'ctx';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'Menu klik kanan');
    el.tabIndex = -1;
    // Popover manual: tampil di lapisan teratas (di atas Menu aplikasi & pemutar musik).
    if (popover) el.setAttribute('popover', 'manual');
    doc.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ctx]');
      if (!b) return;
      const it = items[Number(b.dataset.ctx)];
      if (!it) return;
      if (!it.keep) close({ refocus: false });
      try {
        it.run(b);
      } catch (err) {
        P.ui.toast((err && err.message) || 'Aksi gagal.', { tone: 'warn' });
      }
    });
    el.addEventListener('keydown', onKey);
  }

  function ripple(x, y) {
    if (reduced()) return;
    const r = doc.createElement('span');
    r.className = 'ctx-ripple';
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
    doc.body.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  function open(x, y, target, { keyboard = false } = {}) {
    ensure();
    const sel = root.getSelection ? String(root.getSelection()).trim().replace(/\s+/g, ' ').slice(0, 200) : '';
    lastFocus = doc.activeElement;
    el.innerHTML = build(target, sel);
    el.classList.remove('on', 'off');
    el.style.left = '0px';
    el.style.top = '0px';
    el.hidden = false;
    if (popover) {
      try {
        if (!el.matches(':popover-open')) el.showPopover();
      } catch {
        /* sudah terbuka */
      }
    }
    // Posisi: di titik klik, dibalik bila menabrak tepi layar.
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = root.innerWidth;
    const vh = root.innerHeight;
    let left = x;
    let top = y;
    let ox = 0;
    let oy = 0;
    if (left + w > vw - 8) {
      left = Math.max(8, x - w);
      ox = 1;
    }
    if (top + h > vh - 8) {
      top = Math.max(8, Math.min(y - h, vh - h - 8));
      oy = 1;
    }
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.transformOrigin = `${ox ? '100%' : '0'} ${oy ? '100%' : '0'}`;
    root.requestAnimationFrame(() => el.classList.add('on'));
    if (!keyboard) ripple(x, y);
    const first = el.querySelector('[data-ctx]');
    if (first) first.focus({ preventScroll: true });
  }

  function close({ refocus = true } = {}) {
    if (!el || el.hidden) return;
    el.classList.remove('on');
    el.classList.add('off');
    const node = el;
    setTimeout(() => {
      if (!node.classList.contains('off')) return;
      node.hidden = true;
      if (popover) {
        try {
          node.hidePopover();
        } catch {
          /* sudah tertutup */
        }
      }
    }, reduced() ? 0 : 140);
    if (refocus && lastFocus && lastFocus.isConnected && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
  }

  const isOpen = () => Boolean(el && !el.hidden && !el.classList.contains('off'));

  function onKey(e) {
    const list = [...el.querySelectorAll('[data-ctx]')];
    const i = list.indexOf(doc.activeElement);
    const go = (n) => {
      e.preventDefault();
      list[(n + list.length) % list.length].focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'ArrowRight' && doc.activeElement && doc.activeElement.closest('.ctx-apps, .ctx-tools')) go(i + 1);
    else if (e.key === 'ArrowLeft' && doc.activeElement && doc.activeElement.closest('.ctx-apps, .ctx-tools')) go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  /** Klik kanan yang sebaiknya tetap memakai menu browser. */
  function nativeWanted(e) {
    if (e.shiftKey || e.defaultPrevented) return true;
    const t = e.target;
    if (!t || !t.closest) return true;
    if (t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
    if (lastPointer === 'touch') return true; // tekan lama di HP: biarkan perilaku bawaan
    // Dialog modal terbuka: di luar dialog tidak bisa difokus, jadi pakai menu browser.
    if (doc.querySelector('dialog[open]')) return true;
    return false;
  }

  function init() {
    doc.addEventListener('pointerdown', (e) => {
      lastPointer = e.pointerType || 'mouse';
      if (isOpen() && !el.contains(e.target)) close({ refocus: false });
    }, true);
    doc.addEventListener('contextmenu', (e) => {
      if (el && el.contains(e.target)) {
        e.preventDefault();
        return;
      }
      if (nativeWanted(e)) return;
      e.preventDefault();
      let x = e.clientX;
      let y = e.clientY;
      const keyboard = !x && !y;
      if (keyboard) {
        // Tombol menu di keyboard: buka di dekat elemen yang sedang fokus.
        const f = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement.getBoundingClientRect() : { left: 24, bottom: 80 };
        x = f.left + 12;
        y = f.bottom + 4;
      }
      open(x, y, e.target, { keyboard });
    });
    root.addEventListener('blur', () => close({ refocus: false }));
    root.addEventListener('resize', () => close({ refocus: false }));
    // Tutup saat pengguna menggulir (roda/sentuh), bukan karena halaman digambar ulang.
    const onScrollIntent = (e) => {
      if (!isOpen() || (e.target && el.contains(e.target))) return;
      close({ refocus: false });
    };
    root.addEventListener('wheel', onScrollIntent, { passive: true, capture: true });
    root.addEventListener('touchmove', onScrollIntent, { passive: true, capture: true });
  }

  P.ctxmenu = { init, open, close, isOpen };
})(typeof self !== 'undefined' ? self : this);
