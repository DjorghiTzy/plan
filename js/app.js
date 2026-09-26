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
    { id: 'kerja', label: 'Rencana Kerja', short: 'Kerja', icon: 'briefcase' },
    { id: 'pribadi', label: 'Rencana Pribadi', short: 'Pribadi', icon: 'heart' },
    { id: 'pekan', label: 'Pekan', icon: 'calendar' },
    { id: 'kebiasaan', label: 'Kebiasaan', icon: 'repeat' },
    { id: 'fokus', label: 'Fokus', icon: 'timer' },
    { id: 'jurnal', label: 'Jurnal', icon: 'book' },
    { id: 'statistik', label: 'Statistik', icon: 'chart' },
    { id: 'pengaturan', label: 'Pengaturan', icon: 'sliders' },
  ];
  const TABBAR = ['beranda', 'kerja', 'pribadi', 'kebiasaan'];
  const PLAN_VIEWS = ['kerja', 'pribadi'];
  const PREFS_KEY = 'rencana-harian/prefs';

  let current = 'beranda';
  let today = D.todayKey();
  let selected = today;
  let calMonth = null; // { y, m } bulan yang ditampilkan kalender mini
  let flip = null;
  let mounted = null;
  let highlight = null;
  let teardown = null;
  let lastMinute = -1;
  let scrollTop = false;
  const reminded = new Set();

  // ----- Preferensi tampilan (per perangkat) -----

  const prefs = {
    planMode: 'daftar', filterKerja: 'semua', filterPribadi: 'semua', lastPlan: 'pribadi', weekArea: 'semua',
    hideDone: false, statsRange: 7, rolloverDismissed: null, menuHidden: false, habitMode: 'bulan',
  };
  try {
    Object.assign(prefs, JSON.parse(root.localStorage.getItem(PREFS_KEY) || '{}'));
  } catch {
    /* preferensi bersifat opsional */
  }
  function savePrefs() {
    try {
      root.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* abaikan */
    }
  }

  function setPref(key, value) {
    prefs[key] = value;
    savePrefs();
    render('pref');
  }

  // ----- Menu samping (desktop): bisa disembunyikan agar konten memenuhi layar -----

  const DESKTOP = '(min-width: 1024px)';
  const isDesktop = () => !root.matchMedia || root.matchMedia(DESKTOP).matches;

  function applyMenu() {
    const hidden = Boolean(prefs.menuHidden);
    doc.documentElement.classList.toggle('menu-hidden', hidden);
    const btn = doc.querySelector('[data-menu-toggle]');
    if (!btn) return;
    const label = hidden ? 'Tampilkan menu' : 'Sembunyikan menu';
    btn.innerHTML = icon(hidden ? 'panelopen' : 'panelclose');
    btn.setAttribute('aria-expanded', String(!hidden));
    btn.setAttribute('aria-label', label);
    btn.title = `${label} (M)`;
  }
  applyMenu();

  function toggleMenu() {
    if (!isDesktop()) return;
    prefs.menuHidden = !prefs.menuHidden;
    savePrefs();
    applyMenu();
    if (!prefs.menuHidden) {
      navOn = null;
      moveNavIndicator();
      paintMiniCal();
    }
  }

  /** Rencana Kerja/Pribadi yang terakhir dibuka (tujuan tautan lama #rencana). */
  const lastPlan = () => (PLAN_VIEWS.includes(prefs.lastPlan) ? prefs.lastPlan : 'pribadi');

  // ----- Tema -----

  function effectiveDark() {
    const t = P.store.state.settings.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** Ganti tema dengan lingkaran yang melebar dari tombol (View Transitions). */
  function toggleTheme(btn) {
    const change = () => {
      P.store.setSettings({ theme: effectiveDark() ? 'light' : 'dark' });
      applyTheme();
    };
    if (typeof doc.startViewTransition !== 'function' || reducedMotion()) {
      change();
      return;
    }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, root.innerWidth - x), Math.max(y, root.innerHeight - y));
    const html = doc.documentElement;
    html.style.setProperty('--vt-x', `${x}px`);
    html.style.setProperty('--vt-y', `${y}px`);
    html.style.setProperty('--vt-r', `${radius}px`);
    html.dataset.vt = 'theme';
    doc.startViewTransition(change).finished.finally(() => { delete html.dataset.vt; });
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
    if (id === 'rencana') id = lastPlan();
    if (!P.views[id]) id = 'beranda';
    const changed = id !== current;
    current = id;
    if (PLAN_VIEWS.includes(id) && prefs.lastPlan !== id) {
      prefs.lastPlan = id;
      savePrefs();
    }
    if (push) {
      try {
        if (root.location.hash !== `#${id}`) root.history.pushState(null, '', `#${id}`);
      } catch {
        /* bingkai tertentu menolak pushState */
      }
    }
    if (changed) scrollTop = true;
    render('nav');
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
    if (id === 'rencana') {
      // Tautan versi lama: buka Rencana Kerja/Pribadi terakhir dan rapikan alamatnya.
      try {
        root.history.replaceState(null, '', `#${lastPlan()}`);
      } catch {
        /* abaikan */
      }
      return lastPlan();
    }
    return P.views[id] ? id : 'beranda';
  }

  /** Tautan dari notifikasi pengingat (#isi): buka Beranda & fokus ke tambah cepat. */
  function handleFillHash() {
    if (root.location.hash !== '#isi') return false;
    try {
      root.history.replaceState(null, '', '#beranda');
    } catch {
      /* abaikan */
    }
    P.reminder.fill();
    return true;
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
        if (el.id === 'mini-cal') paintMiniCal();
        else el.innerHTML = calendarHTML();
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
    doc.getElementById('nav').innerHTML = '<span class="nav-indicator" aria-hidden="true"></span>' + NAV.map((n, i) => `
      <button type="button" class="nav-item" data-go="${n.id}" title="${esc(n.label)} (${i + 1})">${icon(n.icon)}<span>${esc(n.label)}</span>${PLAN_VIEWS.includes(n.id) ? `<span class="nav-count" data-nav-count="${n.id}" title="Belum selesai"></span>` : ''}</button>`).join('');
    doc.getElementById('tabbar').innerHTML = `${TABBAR.map((id) => {
      const n = NAV.find((x) => x.id === id);
      return `<button type="button" class="tab" data-go="${n.id}">${icon(n.icon)}<span>${esc(n.short || n.label)}</span></button>`;
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
    // Jumlah tugas belum selesai di Rencana Kerja/Pribadi pada tanggal terpilih.
    const open = { kerja: 0, pribadi: 0 };
    for (const t of P.store.state.tasks) if (t.date === selected && !t.done) open[P.logic.areaOf(t)] += 1;
    doc.querySelectorAll('[data-nav-count]').forEach((el) => {
      const n = open[el.dataset.navCount];
      const text = n ? String(n) : '';
      if (el.textContent !== text) el.textContent = text;
    });
    const more = doc.querySelector('[data-more-open]');
    if (more) more.classList.toggle('on', !TABBAR.includes(current));

    const [, m, d] = selected.split('-').map(Number);
    doc.getElementById('date-main').textContent = `${D.dayName(selected)}, ${d} ${D.MONTHS_SHORT[m - 1]}`;
    const rel = D.relativeLabel(selected, today);
    doc.getElementById('date-rel').textContent = rel || String(selected.slice(0, 4));
    doc.querySelector('.date-btn').setAttribute('aria-label', `Tanggal terpilih: ${D.formatLong(selected)}. Pilih tanggal lain`);
    doc.querySelector('[data-today]').hidden = selected === today;

    paintMiniCal();
  }

  let calCache = '';
  /** Kalender samping hanya diperbarui bila isinya berubah (dan lewat morph, bukan dibuat ulang). */
  function paintMiniCal() {
    const cal = doc.getElementById('mini-cal');
    if (!cal || cal.offsetParent === null) return; // tersembunyi di layar kecil
    const html = calendarHTML();
    if (html === calCache && cal.firstChild) return;
    calCache = html;
    const next = doc.createElement('div');
    next.innerHTML = html;
    P.morph.morph(cal, next);
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

  const reducedMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Ganti halaman/tanggal ditunda satu frame: tab & tanggal di atas langsung berubah,
  // bilah pemuatan tampil, baru halaman baru dirender. Klik tidak pernah "tertahan".
  let pendingPage = null;

  function schedulePage(reason) {
    const first = !pendingPage;
    pendingPage = { reason: pendingPage && pendingPage.reason === 'nav' ? 'nav' : reason };
    if (!first) return;
    updateChrome();
    moveNavIndicator();
    doc.getElementById('view').classList.add('is-switching');
    P.ui.busy.start();
    P.ui.afterPaint(() => {
      const r = pendingPage ? pendingPage.reason : reason;
      pendingPage = null;
      try {
        renderNow(r);
      } finally {
        doc.getElementById('view').classList.remove('is-switching');
        P.ui.busy.stop();
      }
    });
  }

  /**
   * Render tampilan aktif.
   * - Ganti halaman/tanggal: pasang ulang tampilan (dengan animasi masuk yang tidak memblokir).
   * - Perubahan data/preferensi/jam: morph DOM yang ada agar transisi CSS jalan
   *   dan elemen yang masuk/keluar dianimasikan.
   */
  function render(reason = 'data') {
    if (mounted && (reason === 'nav' || reason === 'date' || reason === 'reset')) {
      schedulePage(reason);
      return;
    }
    // Halaman baru sedang disiapkan; data terbaru ikut terender saat itu.
    if (pendingPage) return;
    renderNow(reason);
  }

  function renderNow(reason) {
    const host = doc.getElementById('view');
    const view = P.views[current];

    // Buat kejadian tugas berulang untuk tanggal yang akan ditampilkan.
    P.store.materialize(current === 'pekan' ? [today, ...D.weekKeys(selected)] : [selected, today]);

    const fresh = !mounted || mounted.view !== current || mounted.date !== selected
      || reason === 'nav' || reason === 'date' || reason === 'reset';

    if (!fresh) {
      Object.assign(mounted.ctx, context(reason));
      const next = doc.createElement('div');
      next.className = mounted.el.className;
      next.innerHTML = view.render(mounted.ctx);
      P.morph.morph(mounted.el, next, { animate: reason === 'data' || reason === 'pref' });
      afterRender(mounted.el);
      return;
    }

    // Simpan fokus & ketikan yang sedang berlangsung.
    const active = doc.activeElement;
    const inView = active && host.contains(active);
    const key = inView ? focusKey(active) : null;
    const typing = inView && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && /^(text|search|number)$/.test(active.type)));
    const snapshot = typing ? { value: active.value, start: active.selectionStart, end: active.selectionEnd } : null;

    if (teardown) {
      teardown();
      teardown = null;
    }

    const ctx = context(reason);
    const el = doc.createElement('div');
    el.className = `page page-${current}`;
    el.innerHTML = view.render(ctx);
    mounted = { view: current, date: selected, el, ctx };
    const dir = flip;
    flip = null;

    const animated = (reason === 'nav' || reason === 'date') && host.childElementCount && !reducedMotion();
    host.replaceChildren(el);
    if (reason === 'nav' && scrollTop) {
      scrollTop = false;
      root.scrollTo(0, 0);
    }
    const cleanup = view.mount ? view.mount(el, ctx) : null;
    if (typeof cleanup === 'function') teardown = cleanup;
    if (dir) {
      const sheet = el.querySelector('[data-sheet]');
      if (sheet) sheet.classList.add(`flip-${dir}`);
    }
    if (key) {
      const again = el.querySelector(key);
      if (again) {
        again.focus({ preventScroll: true });
        if (snapshot && again.value !== snapshot.value) again.value = snapshot.value;
        if (snapshot && typeof again.setSelectionRange === 'function' && snapshot.start != null) {
          try {
            again.setSelectionRange(snapshot.start, snapshot.end);
          } catch {
            /* input number tidak mendukung seleksi */
          }
        }
      }
    }
    // Animasi "pop" hanya untuk perubahan, bukan saat halaman baru dipasang.
    el.classList.add('settling');
    setTimeout(() => el.classList.remove('settling'), 500);
    // Animasi masuk murni CSS (transform/opacity) sehingga halaman langsung bisa diklik.
    if (animated) el.classList.add(reason === 'date' ? `page-enter-${dir || 'next'}` : 'page-enter');
    P.ui.countUp(el);
    afterRender(el);
  }

  function afterRender(el) {
    updateChrome();
    P.timer.paint();
    moveNavIndicator();
    if (highlight) {
      const id = highlight;
      highlight = null;
      root.requestAnimationFrame(() => {
        const row = el.querySelector(`[data-id="${CSS.escape(id)}"]`);
        if (!row) return;
        row.classList.add('flash');
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => row.classList.remove('flash'), 1700);
      });
    }
  }

  /** Render ulang kecuali pengguna sedang mengetik. */
  function refreshIfIdle() {
    const a = doc.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') && doc.getElementById('view').contains(a)) return;
    if (mounted) render('data');
  }

  let navOn = null;
  /** Indikator pil yang meluncur di navigasi samping (hanya dihitung ulang bila pindah halaman). */
  function moveNavIndicator() {
    const nav = doc.getElementById('nav');
    const on = nav && nav.querySelector('.nav-item.on');
    const ind = nav && nav.querySelector('.nav-indicator');
    if (!on || !ind || on === navOn || nav.offsetParent === null) return;
    navOn = on;
    ind.style.transform = `translateY(${on.offsetTop}px)`;
    ind.style.height = `${on.offsetHeight}px`;
    ind.classList.add('ready');
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
    const t = P.store.findTask(id);
    go(t ? P.logic.areaOf(t) : lastPlan());
  }

  // ----- Pengingat & detak -----

  /** Notifikasi sistem saat tab tersembunyi (lewat service worker agar jalan juga di Android). */
  function notify(title, body) {
    if (!('Notification' in root) || root.Notification.permission !== 'granted' || !doc.hidden) return;
    const opts = { body, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'rencana-harian' };
    const sw = root.navigator.serviceWorker;
    if (sw && sw.controller) {
      sw.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {});
      return;
    }
    try {
      new root.Notification(title, opts);
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
    P.reminder.onMinute(now);
    P.ops.onMinute(now);
    // Beranda & linimasa bergantung pada jam sekarang; perbarui tiap menit bila pengguna tidak sedang mengetik.
    const a = doc.activeElement;
    const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
    if (!typing && (current === 'beranda' || PLAN_VIEWS.includes(current))) render('clock');
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
      // Di Rencana Kerja/Pribadi, tugas baru langsung masuk ruang yang sedang dibuka.
      const defaults = PLAN_VIEWS.includes(current) && mounted ? P.views[current].newDefaults(mounted.ctx) : { date: selected };
      P.components.openTaskEditor({ defaults });
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
    } else if (/^[1-9]$/.test(k) && NAV[Number(k) - 1]) {
      go(NAV[Number(k) - 1].id);
    } else if (k === 'm' || k === 'M') {
      toggleMenu();
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
      if (e.target.closest('[data-menu-toggle]')) return toggleMenu();
      const shift = e.target.closest('[data-shift]');
      if (shift) return setDate(D.addDays(selected, Number(shift.dataset.shift)));
      if (e.target.closest('[data-today]')) return setDate(today);
      if (e.target.closest('[data-open-cal]')) return openCalendarDialog();
      if (e.target.closest('[data-search]')) return P.components.openSearch();
      const themeBtn = e.target.closest('[data-theme-toggle]');
      if (themeBtn) toggleTheme(themeBtn);
    });
    bindCalendar(doc.getElementById('mini-cal'));
    doc.addEventListener('keydown', onKey);
    root.addEventListener('popstate', () => go(fromHash(), { push: false }));
    root.addEventListener('hashchange', () => {
      if (handleFillHash()) return;
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
    P.sync.init();
    P.account.init();
    P.account.handlePairHash();
    P.reminder.init();
    P.ops.init();
    handleFillHash();
    root.addEventListener('resize', () => {
      navOn = null;
      moveNavIndicator();
      paintMiniCal();
    });
    root.addEventListener('scroll', () => {
      doc.documentElement.classList.toggle('scrolled', root.scrollY > 8);
    }, { passive: true });
    lastMinute = D.minutesOfDay(new Date());
    setInterval(tick, 1000);

    if (!P.store.storageOk) {
      P.ui.toast('Penyimpanan browser tidak tersedia. Perubahan akan hilang saat halaman ditutup.', { tone: 'warn', duration: 9000 });
    }

    if ('serviceWorker' in root.navigator && /^https?:$/.test(root.location.protocol)) {
      root.navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  P.app = { NAV, toggleTheme: () => toggleTheme(doc.querySelector('[data-theme-toggle]') || doc.body), start, go, setDate, reveal, setPref, refreshIfIdle, selected: () => selected, applyTheme, notify, refresh: () => render('data') };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start);
  else start();
})(typeof self !== 'undefined' ? self : this);
