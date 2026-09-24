/**
 * Pengendali aplikasi: navigasi, tanggal terpilih, kalender, tema, pintasan,
 * pengingat, dan detak timer.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const { icon, esc } = P.ui;
  const doc = root.document;

  const NAV = [
    { id: 'beranda', label: 'Beranda', icon: 'home' },
    { id: 'rencana', label: 'Rencana', icon: 'list' },
    { id: 'pekan', label: 'Pekan', icon: 'calendar' },
    { id: 'kebiasaan', label: 'Kebiasaan', icon: 'repeat' },
    { id: 'fokus', label: 'Fokus', icon: 'timer' },
    { id: 'jurnal', label: 'Jurnal', icon: 'book' },
    { id: 'statistik', label: 'Statistik', icon: 'chart' },
    { id: 'pengaturan', label: 'Pengaturan', icon: 'sliders' },
  ];
  const TABBAR = ['beranda', 'rencana', 'kebiasaan', 'fokus'];
  const PREFS_KEY = 'rencana-harian/prefs';

  let current = 'beranda';
  let today = D.todayKey();
  let selected = today;
  let calMonth = null; // { y, m } bulan yang ditampilkan kalender mini
  let flip = null;
  let highlight = null;
  let teardown = null;
  let lastMinute = -1;
  const reminded = new Set();

  // ----- Preferensi tampilan (per perangkat) -----

  const prefs = {
    planMode: 'daftar', planFilter: 'semua', hideDone: false, statsRange: 7, rolloverDismissed: null,
  };
  try {
    Object.assign(prefs, JSON.parse(root.localStorage.getItem(PREFS_KEY) || '{}'));
  } catch {
    /* preferensi bersifat opsional */
  }
  function setPref(key, value) {
    prefs[key] = value;
    try {
      root.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* abaikan */
    }
    render('pref');
  }

  // ----- Tema -----

  function effectiveDark() {
    const t = P.store.state.settings.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function applyTheme() {
    const t = P.store.state.settings.theme;
    if (t === 'light' || t === 'dark') doc.documentElement.setAttribute('data-theme', t);
    else doc.documentElement.removeAttribute('data-theme');
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectiveDark() ? '#0F1613' : '#F3F6F2');
    const btn = doc.querySelector('[data-theme-toggle]');
    if (btn) btn.innerHTML = icon(effectiveDark() ? 'sun' : 'moon');
  }

  // ----- Navigasi -----

  function go(id, { push = true } = {}) {
    if (!P.views[id]) id = 'beranda';
    const changed = id !== current;
    current = id;
    if (push) {
      try {
        if (root.location.hash !== `#${id}`) root.history.pushState(null, '', `#${id}`);
      } catch {
        /* bingkai tertentu menolak pushState */
      }
    }
    render('nav');
    if (changed) root.scrollTo(0, 0);
  }

  function setDate(key) {
    if (!D.isKey(key) || key === selected) return;
    flip = D.diffDays(selected, key) > 0 ? 'next' : 'prev';
    selected = key;
    const [y, m] = key.split('-').map(Number);
    calMonth = { y, m: m - 1 };
    render('date');
  }

  function fromHash() {
    const id = (root.location.hash || '').replace('#', '');
    return P.views[id] ? id : 'beranda';
  }

  // ----- Kalender -----

  function calendarHTML() {
    const { y, m } = calMonth;
    const weeks = D.monthMatrix(y, m);
    const byDate = {};
    for (const t of P.store.state.tasks) {
      const b = (byDate[t.date] = byDate[t.date] || { total: 0, done: 0 });
      b.total += 1;
      if (t.done) b.done += 1;
    }
    const monthPrefix = `${y}-${String(m + 1).padStart(2, '0')}`;
    return `
      <div class="cal-head">
        <button type="button" class="icon-btn" data-cal="-1" aria-label="Bulan sebelumnya">${icon('left')}</button>
        <span class="cal-title">${esc(D.MONTHS[m])} ${y}</span>
        <button type="button" class="icon-btn" data-cal="1" aria-label="Bulan berikutnya">${icon('right')}</button>
      </div>
      <div class="cal-grid" role="grid">
        ${D.DAYS_SHORT.map((d, i) => `<span class="cal-dow${i === 0 ? ' is-sunday' : ''}" role="columnheader">${esc(d.slice(0, 2))}</span>`).join('')}
        ${weeks.flat().map((k) => {
          const info = byDate[k];
          const cls = ['cal-day'];
          if (!k.startsWith(monthPrefix)) cls.push('out');
          if (D.dayIndex(k) === 0) cls.push('is-sunday');
          if (k === today) cls.push('is-today');
          if (k === selected) cls.push('is-selected');
          const dot = info ? `<span class="cal-dot${info.done === info.total ? ' all' : ''}" aria-hidden="true"></span>` : '';
          const label = `${D.formatLong(k)}${info ? `, ${info.total} tugas, ${info.done} selesai` : ''}`;
          return `<button type="button" class="${cls.join(' ')}" data-date="${k}" aria-label="${esc(label)}" ${k === today ? 'aria-current="date"' : ''} aria-pressed="${k === selected}">${Number(k.slice(8))}${dot}</button>`;
        }).join('')}
      </div>`;
  }

  function bindCalendar(el, onPick) {
    el.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-cal]');
      if (nav) {
        let { y, m } = calMonth;
        m += Number(nav.dataset.cal);
        if (m < 0) { m = 11; y -= 1; }
        if (m > 11) { m = 0; y += 1; }
        calMonth = { y, m };
        el.innerHTML = calendarHTML();
        return;
      }
      const day = e.target.closest('[data-date]');
      if (day) {
        setDate(day.dataset.date);
        if (onPick) onPick();
      }
    });
  }

  function openCalendarDialog() {
    P.ui.openDialog({
      title: 'Pilih tanggal',
      size: 'small',
      body: `<div class="mini-cal in-dialog">${calendarHTML()}</div>
        <div class="dialog-actions"><span class="spacer"></span><button type="button" class="btn ghost" data-pick-today>Ke hari ini</button></div>`,
      onMount(el, close) {
        bindCalendar(el.querySelector('.mini-cal'), close);
        el.querySelector('[data-pick-today]').addEventListener('click', () => {
          setDate(today);
          close();
        });
      },
    });
  }

  function openMoreDialog() {
    const items = NAV.filter((n) => !TABBAR.includes(n.id));
    P.ui.openDialog({
      title: 'Lainnya',
      size: 'small sheet',
      body: `<ul class="more-list">${items.map((n) => `
        <li><button type="button" class="more-item${n.id === current ? ' on' : ''}" data-more="${n.id}">${icon(n.icon)}<span>${esc(n.label)}</span>${icon('right')}</button></li>`).join('')}</ul>`,
      onMount(el, close) {
        el.addEventListener('click', (e) => {
          const b = e.target.closest('[data-more]');
          if (!b) return;
          close();
          go(b.dataset.more);
        });
      },
    });
  }

  function openShortcuts() {
    P.ui.openDialog({
      title: 'Pintasan keyboard',
      size: 'small',
      body: `<dl class="shortcuts">${P.views.pengaturan.SHORTCUTS.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`,
    });
  }

  // ----- Render -----

  function buildNav() {
    doc.getElementById('nav').innerHTML = NAV.map((n, i) => `
      <button type="button" class="nav-item" data-go="${n.id}" title="${esc(n.label)} (${i + 1})">${icon(n.icon)}<span>${esc(n.label)}</span></button>`).join('');
    doc.getElementById('tabbar').innerHTML = `${TABBAR.map((id) => {
      const n = NAV.find((x) => x.id === id);
      return `<button type="button" class="tab" data-go="${n.id}">${icon(n.icon)}<span>${esc(n.label)}</span></button>`;
    }).join('')}<button type="button" class="tab" data-more-open>${icon('more')}<span>Lainnya</span></button>`;
    doc.querySelector('[data-shift="-1"]').innerHTML = icon('left');
    doc.querySelector('[data-shift="1"]').innerHTML = icon('right');
    doc.querySelector('[data-search]').innerHTML = icon('search');
  }

  function updateChrome() {
    doc.querySelectorAll('[data-go].nav-item, .tab[data-go]').forEach((b) => {
      const on = b.dataset.go === current;
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const more = doc.querySelector('[data-more-open]');
    if (more) more.classList.toggle('on', !TABBAR.includes(current));

    const [, m, d] = selected.split('-').map(Number);
    doc.getElementById('date-main').textContent = `${D.dayName(selected)}, ${d} ${D.MONTHS_SHORT[m - 1]}`;
    const rel = D.relativeLabel(selected, today);
    doc.getElementById('date-rel').textContent = rel || String(selected.slice(0, 4));
    doc.querySelector('.date-btn').setAttribute('aria-label', `Tanggal terpilih: ${D.formatLong(selected)}. Pilih tanggal lain`);
    doc.querySelector('[data-today]').hidden = selected === today;

    const cal = doc.getElementById('mini-cal');
    cal.innerHTML = calendarHTML();
  }

  function focusKey(el) {
    if (!el || el === doc.body) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.dataset && el.dataset.fk) return `[data-fk="${CSS.escape(el.dataset.fk)}"]`;
    return null;
  }

  function context(reason) {
    const now = new Date();
    return {
      state: P.store.state,
      date: selected,
      today,
      now,
      nowMin: D.minutesOfDay(now),
      prefs,
      reason,
      keepScroll: reason !== 'nav',
      setPref,
      go,
      setDate,
      refresh: () => render('data'),
    };
  }

  function render(reason = 'data') {
    const host = doc.getElementById('view');
    const view = P.views[current];

    // Simpan fokus & ketikan yang sedang berlangsung agar tidak hilang saat render ulang.
    const active = doc.activeElement;
    const inView = active && host.contains(active);
    const key = inView ? focusKey(active) : null;
    const typing = inView && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|number)$/.test(active.type)));
    const snapshot = typing ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;

    if (teardown) {
      teardown();
      teardown = null;
    }

    // Buat kejadian tugas berulang untuk tanggal yang akan ditampilkan.
    P.store.materialize(current === 'pekan' ? [today, ...D.weekKeys(selected)] : [selected, today]);

    const ctx = context(reason);
    const el = doc.createElement('div');
    el.className = `page page-${current}`;
    el.innerHTML = view.render(ctx);
    host.replaceChildren(el);
    const cleanup = view.mount ? view.mount(el, ctx) : null;
    if (typeof cleanup === 'function') teardown = cleanup;

    if (flip) {
      const sheet = el.querySelector('[data-sheet]');
      if (sheet) sheet.classList.add(`flip-${flip}`);
      flip = null;
    }

    if (key) {
      const next = el.querySelector(key);
      if (next) {
        next.focus({ preventScroll: true });
        if (snapshot && next.value !== snapshot.value) next.value = snapshot.value;
        if (snapshot && typeof next.setSelectionRange === 'function' && snapshot.start != null) {
          try {
            next.setSelectionRange(snapshot.start, snapshot.end);
          } catch {
            /* input number tidak mendukung seleksi */
          }
        }
      }
    }

    updateChrome();
    P.timer.paint();

    if (highlight) {
      const id = highlight;
      highlight = null;
      root.requestAnimationFrame(() => {
        const row = el.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (!row) return;
        row.classList.add('flash');
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
  }

  /** Buka tanggal sebuah tugas di halaman Rencana dan sorot tugasnya. */
  function reveal(id, date) {
    highlight = id;
    if (date !== selected) {
      flip = null;
      selected = date;
      const [y, m] = date.split('-').map(Number);
      calMonth = { y, m: m - 1 };
    }
    go('rencana');
  }

  // ----- Pengingat & detak -----

  function notify(title, body) {
    try {
      if ('Notification' in root && root.Notification.permission === 'granted' && doc.hidden) {
        new root.Notification(title, { body, icon: 'icons/icon.svg', tag: 'rencana-harian' });
      }
    } catch {
      /* notifikasi bersifat opsional */
    }
  }

  function checkReminders(nowMin) {
    const s = P.store.state;
    if (!s.settings.reminders) return;
    if (s.settings.prayerEnabled) {
      const city = P.prayer.findCity(s.settings.prayerCity);
      for (const p of P.prayer.times(today, city)) {
        if (p.minutes !== nowMin || p.id === 'terbit') continue;
        const k = `sholat-${p.id}@${today}`;
        if (reminded.has(k)) continue;
        reminded.add(k);
        const msg = p.id === 'imsak' ? `Imsak ${p.time} (${city.name})` : `Waktu ${p.label} ${p.time} untuk ${city.name} dan sekitarnya`;
        P.ui.toast(msg, { tone: 'info', duration: 12000 });
        notify(p.id === 'imsak' ? 'Imsak' : `Waktu ${p.label}`, `${p.time} ${city.zone} · ${city.name}`);
      }
    }
    const hhmm = D.formatTime(nowMin);
    for (const t of s.tasks) {
      if (t.date !== today || t.done || t.start !== hhmm) continue;
      const k = `${t.id}@${t.date}@${t.start}`;
      if (reminded.has(k)) continue;
      reminded.add(k);
      P.ui.toast(`Waktunya: ${t.title} (${P.ui.timeRange(t)})`, { tone: 'info', duration: 10000 });
      notify(`Waktunya: ${t.title}`, P.ui.timeRange(t));
    }
  }

  function tick() {
    P.timer.tick();
    const now = new Date();
    const minute = D.minutesOfDay(now);
    if (minute === lastMinute) return;
    lastMinute = minute;

    const newToday = D.todayKey(now);
    if (newToday !== today) {
      if (selected === today) selected = newToday;
      today = newToday;
      render('data');
      return;
    }
    checkReminders(minute);
    // Beranda & linimasa bergantung pada jam sekarang; perbarui tiap menit bila pengguna tidak sedang mengetik.
    const a = doc.activeElement;
    const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    if (!typing && (current === 'beranda' || current === 'rencana')) render('clock');
  }

  // ----- Pintasan keyboard -----

  function onKey(e) {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      P.components.openSearch();
      return;
    }
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (doc.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k === 'n' || k === 'N') {
      e.preventDefault();
      P.components.openTaskEditor({ defaults: { date: selected } });
    } else if (k === '/') {
      e.preventDefault();
      if (current !== 'beranda') go('beranda');
      const q = doc.getElementById('quick-add');
      if (q) q.focus();
    } else if (k === 't' || k === 'T') {
      setDate(today);
    } else if (k === 'ArrowLeft') {
      setDate(D.addDays(selected, -1));
    } else if (k === 'ArrowRight') {
      setDate(D.addDays(selected, 1));
    } else if (/^[1-8]$/.test(k)) {
      go(NAV[Number(k) - 1].id);
    } else if (k === '?') {
      openShortcuts();
    } else if (k === ' ' && current === 'fokus' && (t === doc.body || t === doc.getElementById('view'))) {
      e.preventDefault();
      P.timer.toggle();
    }
  }

  // ----- Mulai -----

  function start() {
    P.store.load();
    // Isi riwayat tugas berulang 30 hari terakhir supaya statistik konsisten.
    P.store.materialize(D.lastNDays(D.addDays(today, 1), 32));
    const [y, m] = selected.split('-').map(Number);
    calMonth = { y, m: m - 1 };
    current = fromHash();
    buildNav();
    applyTheme();

    doc.addEventListener('click', (e) => {
      const goBtn = e.target.closest('[data-go]');
      if (goBtn && !doc.getElementById('view').contains(goBtn)) {
        e.preventDefault();
        go(goBtn.dataset.go);
        return;
      }
      if (e.target.closest('[data-more-open]')) return openMoreDialog();
      const shift = e.target.closest('[data-shift]');
      if (shift) return setDate(D.addDays(selected, Number(shift.dataset.shift)));
      if (e.target.closest('[data-today]')) return setDate(today);
      if (e.target.closest('[data-open-cal]')) return openCalendarDialog();
      if (e.target.closest('[data-search]')) return P.components.openSearch();
      if (e.target.closest('[data-theme-toggle]')) {
        P.store.setSettings({ theme: effectiveDark() ? 'light' : 'dark' });
        applyTheme();
      }
    });
    bindCalendar(doc.getElementById('mini-cal'));
    doc.addEventListener('keydown', onKey);
    root.addEventListener('popstate', () => go(fromHash(), { push: false }));
    root.addEventListener('hashchange', () => {
      const id = fromHash();
      if (id !== current) go(id, { push: false });
    });
    if (root.matchMedia) {
      root.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }
    doc.addEventListener('visibilitychange', () => {
      if (!doc.hidden) tick();
    });

    P.store.subscribe(() => render('data'));
    render('nav');
    lastMinute = D.minutesOfDay(new Date());
    setInterval(tick, 1000);

    if (!P.store.storageOk) {
      P.ui.toast('Penyimpanan browser tidak tersedia. Perubahan akan hilang saat halaman ditutup.', { tone: 'warn', duration: 9000 });
    }

    if ('serviceWorker' in root.navigator && /^https?:$/.test(root.location.protocol)) {
      root.navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  P.app = { start, go, setDate, reveal, selected: () => selected, applyTheme, notify, refresh: () => render('data') };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof self !== 'undefined' ? self : this);
