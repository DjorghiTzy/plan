/**
 * Dua menu terpisah:
 * - Rencana Kerja: jam kerja, beban kerja, proyek, laporan kerja, tugas per bagian hari.
 * - Rencana Pribadi: checklist sholat 5 waktu, lalu tugas per bidang hidup
 *   (Ibadah, Kesehatan, Belajar, Rumah, Pribadi).
 * Keduanya bisa ditampilkan sebagai daftar atau linimasa per jam.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;
  const C = P.components;

  const HOUR_PX = 60;
  const TITLES = { kerja: 'Rencana Kerja', pribadi: 'Rencana Pribadi' };
  const FILTER_PREF = { kerja: 'filterKerja', pribadi: 'filterPribadi' };
  // Urutan bidang di Rencana Pribadi.
  const PERSONAL = [
    { id: 'ibadah', emoji: '🕌' },
    { id: 'kesehatan', emoji: '💪' },
    { id: 'belajar', emoji: '📚' },
    { id: 'rumah', emoji: '🏠' },
    { id: 'pribadi', emoji: '✨' },
    { id: 'kerja', emoji: '💼' },
  ];
  const SHOLAT_LABEL = { subuh: 'Subuh', dzuhur: 'Dzuhur', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya' };

  const catLabel = (id) => (L.CATEGORIES.find((c) => c.id === id) || { label: 'Pribadi' }).label;
  const liveProject = (t) => (t.projectId ? P.store.findProject(t.projectId) : null);
  const filterOf = (space, ctx) => effectiveFilter(space, ctx.prefs[FILTER_PREF[space]]);

  /** Saringan yang berlaku: Kerja per proyek, Pribadi per bidang. */
  function effectiveFilter(space, filter) {
    const f = String(filter || '');
    if (space === 'kerja') {
      if (f === 'proj:none') return f;
      return f.startsWith('proj:') && P.store.findProject(f.slice(5)) ? f : 'semua';
    }
    return L.CATEGORIES.some((c) => c.id === f) ? f : 'semua';
  }

  function applyFilter(filter, tasks) {
    if (filter === 'semua') return tasks;
    if (filter === 'proj:none') return tasks.filter((t) => !liveProject(t));
    if (filter.startsWith('proj:')) return tasks.filter((t) => t.projectId === filter.slice(5));
    return tasks.filter((t) => t.category === filter);
  }

  function filterChips(space, filter, tasks) {
    const chip = (value, label, count, extra = '') => `
      <button type="button" class="filter${filter === value ? ' on' : ''}" data-filter="${esc(value)}" aria-pressed="${filter === value}" ${extra}>${label} <span>${count}</span></button>`;
    const chips = [chip('semua', 'Semua', tasks.length)];
    if (space === 'kerja') {
      const ids = [...new Set(tasks.map((t) => t.projectId).filter(Boolean))];
      const projects = P.work.sortProjects(ids.map((id) => P.store.findProject(id)).filter(Boolean));
      if (!projects.length && filter === 'semua') return '';
      for (const pj of projects) {
        chips.push(chip(`proj:${pj.id}`, `${esc(pj.emoji || '📁')} ${esc(pj.name)}`, tasks.filter((t) => t.projectId === pj.id).length));
      }
      const none = tasks.filter((t) => !liveProject(t)).length;
      if (none || filter === 'proj:none') chips.push(chip('proj:none', 'Tanpa proyek', none));
      return `<div class="filters" role="group" aria-label="Saring proyek">${chips.join('')}</div>`;
    }
    const counts = L.categoryCounts(tasks);
    for (const c of PERSONAL) {
      if (counts[c.id].total || filter === c.id) chips.push(chip(c.id, esc(catLabel(c.id)), counts[c.id].total, `data-cat="${c.id}"`));
    }
    return `<div class="filters" role="group" aria-label="Saring bidang">${chips.join('')}</div>`;
  }

  function toolbar(ctx, space, filter, tasks) {
    const mode = ctx.prefs.planMode;
    const future = D.diffDays(ctx.today, ctx.date) >= 0;
    const untimed = tasks.some((t) => !t.start && !t.done);
    const auto = untimed && future && space === 'pribadi'
      ? `<button type="button" class="btn secondary small" data-work="auto-personal" title="Tugas pribadi ditempatkan di luar jam kerja">${icon('sparkle')}Atur otomatis</button>`
      : '';
    const noProjects = space === 'pribadi' && !ctx.state.projects.some((p) => p.area === 'pribadi' && p.status !== 'selesai');
    return `
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Tampilan">
          <button type="button" data-mode="daftar" aria-pressed="${mode === 'daftar'}">${icon('rows')}Daftar</button>
          <button type="button" data-mode="linimasa" aria-pressed="${mode === 'linimasa'}">${icon('clock')}Linimasa</button>
        </div>
        ${filterChips(space, filter, tasks)}
        ${auto}
        ${noProjects ? `<button type="button" class="link-btn" data-work="project-new" data-area="pribadi">${icon('folder')}Proyek pribadi</button>` : ''}
        <label class="toggle">
          <input id="hide-done" type="checkbox" ${ctx.prefs.hideDone ? 'checked' : ''}>
          <span>Sembunyikan yang selesai</span>
        </label>
      </div>`;
  }

  /** Rencana Kerja: per bagian hari. */
  function dayPartList(tasks) {
    const groups = L.groupByDayPart(tasks);
    return L.DAY_PARTS.filter((p) => groups[p.id].length).map((p) => `
      <section class="daypart">
        <h2 class="daypart-head"><span>${esc(p.label)}</span><small>${esc(p.range)}</small></h2>
        <ul class="tasks">${groups[p.id].map((t) => C.taskRow(t)).join('')}</ul>
      </section>`).join('');
  }

  /** Rencana Pribadi: per bidang, diurutkan menurut jam di dalamnya. */
  function categoryList(tasks) {
    return PERSONAL.map((c) => {
      const list = L.sortTasks(tasks.filter((t) => (L.CATEGORIES.some((x) => x.id === t.category) ? t.category : 'pribadi') === c.id));
      if (!list.length) return '';
      const done = list.filter((t) => t.done).length;
      return `
        <section class="daypart cat-section" data-cat="${c.id}" data-key="cat-${c.id}">
          <h2 class="daypart-head">
            <span class="cat-emoji" aria-hidden="true">${c.emoji}</span><span>${esc(catLabel(c.id))}</span>
            <small>${done}/${list.length}</small>
            <button type="button" class="icon-btn cat-add" data-add-cat="${c.id}" aria-label="Tambah ke ${esc(catLabel(c.id))}" title="Tambah ke ${esc(catLabel(c.id))}">${icon('plus')}</button>
          </h2>
          <ul class="tasks">${list.map((t) => C.taskRow(t)).join('')}</ul>
        </section>`;
    }).join('');
  }

  function timelineView(ctx, tasks, space) {
    const s = ctx.state.settings;
    const work = L.workWindow(s, ctx.date);
    const timed = tasks.filter((t) => t.start);
    const untimed = tasks.filter((t) => !t.start);
    const items = timed.map((t) => {
      const start = D.parseTime(t.start);
      const end = Math.max(start + 15, t.end ? D.parseTime(t.end) : start + 30);
      return { id: t.id, start, end, task: t };
    });
    let from = space === 'kerja' ? Math.floor(work.start / 60) * 60 : s.dayStart * 60;
    let to = space === 'kerja' ? Math.ceil(work.end / 60) * 60 : s.dayEnd * 60;
    for (const it of items) {
      from = Math.min(from, Math.floor(it.start / 60) * 60);
      to = Math.max(to, Math.ceil(it.end / 60) * 60);
    }
    to = Math.min(to, 24 * 60);
    const layout = L.layoutTimeline(items);
    const px = HOUR_PX / 60;
    const hours = [];
    for (let m = from; m < to; m += 60) hours.push(m);

    const nowLine = ctx.date === ctx.today && ctx.nowMin >= from && ctx.nowMin <= to
      ? `<div class="now-line" style="top:${(ctx.nowMin - from) * px}px" aria-hidden="true"><span>${esc(D.formatTime(ctx.nowMin))}</span></div>`
      : '';

    // Pita jam kerja & istirahat (hanya di hari kerja).
    const band = (a, b, cls, label) => {
      const top = Math.max(a, from);
      const bottom = Math.min(b, to);
      return bottom > top ? `<div class="${cls}" style="top:${(top - from) * px}px;height:${(bottom - top) * px}px" aria-hidden="true"><span>${esc(label)}</span></div>` : '';
    };
    const bands = work.isWorkday
      ? band(work.start, work.end, 'work-band', `Jam kerja ${D.formatTime(work.start)}–${D.formatTime(work.end)}`)
        + (work.rest && space === 'kerja' ? band(work.rest[0], work.rest[1], 'rest-band', 'Istirahat') : '')
      : '';

    const prayers = s.prayerEnabled
      ? P.prayer.times(ctx.date, P.prayer.findCity(s.prayerCity))
        .filter((p) => p.id !== 'imsak' && p.minutes >= from && p.minutes <= to)
      : [];
    const prayerLines = prayers.map((p) => `
      <div class="prayer-line" style="top:${(p.minutes - from) * px}px" aria-hidden="true"><span>${esc(p.label)} ${esc(p.time)}</span></div>`).join('');

    const blocks = items.map((it) => {
      const { col, cols } = layout[it.id];
      const t = it.task;
      const height = (it.end - it.start) * px;
      const pj = liveProject(t);
      return `
        <div class="block${t.done ? ' is-done' : ''}${height < 40 ? ' short' : ''}" data-id="${esc(t.id)}" data-cat="${esc(t.category)}"
          style="top:${(it.start - from) * px}px;height:${height - 2}px;left:calc(${(col / cols) * 100}% + 2px);width:calc(${100 / cols}% - 4px)">
          <button type="button" class="block-check" role="checkbox" aria-checked="${t.done}" data-action="toggle-task" aria-label="Tandai selesai: ${esc(t.title)}">${icon('check')}</button>
          <button type="button" class="block-body" data-action="edit-task">
            <span class="block-title">${t.starred ? icon('star', 'tiny') : ''}${esc(t.title)}</span>
            <span class="block-time">${esc(P.ui.timeRange(t))}${pj ? ` · ${esc(pj.emoji || '📁')} ${esc(pj.name)}` : ''}</span>
          </button>
        </div>`;
    }).join('');

    return `
      ${untimed.length ? `
        <section class="untimed">
          <h2 class="daypart-head"><span>Kapan saja</span><small>tanpa jam</small></h2>
          <ul class="tasks">${L.sortTasks(untimed).map((t) => C.taskRow(t, { compact: true })).join('')}</ul>
        </section>` : ''}
      <div class="timeline" style="height:${hours.length * HOUR_PX}px">
        ${bands}
        ${hours.map((m, i) => `
          <button type="button" class="hour" style="top:${i * HOUR_PX}px" data-slot="${m}" aria-label="Tambah tugas pukul ${esc(D.formatTime(m))}">
            <span class="hour-label">${esc(D.formatTime(m))}</span>
          </button>`).join('')}
        ${prayerLines}
        <div class="blocks">${blocks}</div>
        ${nowLine}
      </div>
      <p class="hint">Klik jam yang kosong untuk menambah tugas di jam tersebut.</p>`;
  }

  function progressHTML(tasks, label) {
    const prog = L.progress(tasks);
    return `
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog.pct}" aria-label="${esc(label)}">
        <div class="progress-bar"><span style="width:${prog.pct}%"></span></div>
        <p><strong>${prog.done}</strong> dari ${prog.total} selesai · ${prog.pct}%</p>
      </div>`;
  }

  // ----- Ibadah: checklist sholat 5 waktu -----

  /** Hari berturut-turut dengan sholat 5 waktu lengkap sampai `endKey`. */
  function sholatStreak(log, endKey, today) {
    const full = (k) => (log[k] || []).length === P.store.SHOLAT.length;
    let key = endKey;
    if (key === today && !full(key)) key = D.addDays(key, -1);
    let n = 0;
    while (full(key) && n < 3660) {
      n += 1;
      key = D.addDays(key, -1);
    }
    return n;
  }

  function ibadahCard(ctx) {
    const s = ctx.state.settings;
    if (s.sholatChecklist === false) return '';
    const list = P.store.SHOLAT;
    const done = ctx.state.ibadah[ctx.date] || [];
    const future = ctx.date > ctx.today;
    const city = s.prayerEnabled ? P.prayer.findCity(s.prayerCity) : null;
    const at = city ? Object.fromEntries(P.prayer.times(ctx.date, city).map((p) => [p.id, p])) : {};
    const next = ctx.date === ctx.today && city ? list.find((id) => at[id] && at[id].minutes > ctx.nowMin) : null;
    const streak = sholatStreak(ctx.state.ibadah, ctx.date, ctx.today);
    const notes = [];
    if (next) notes.push(`${SHOLAT_LABEL[next]} ${at[next].time} · dalam ${D.formatDuration(at[next].minutes - ctx.nowMin)}`);
    if (city) notes.push(`${city.name} (${city.zone})`);
    if (streak >= 2) notes.push(`🔥 lengkap ${streak} hari berturut-turut`);
    return `
      <section class="ibadah-card" data-key="ibadah">
        <div class="ibadah-head">
          <span class="ibadah-icon" aria-hidden="true">🕌</span>
          <div class="ibadah-info">
            <p class="ibadah-title">Sholat ${ctx.date === ctx.today ? 'hari ini' : esc(D.dayName(ctx.date))} <strong>${done.length}/${list.length}</strong></p>
            ${notes.length ? `<p class="muted">${esc(notes.join(' · '))}</p>` : ''}
          </div>
        </div>
        <div class="sholat-row" role="group" aria-label="Checklist sholat">
          ${list.map((id) => {
            const on = done.includes(id);
            const time = at[id] ? at[id].time : '';
            return `
              <button type="button" class="sholat${on ? ' on' : ''}${id === next ? ' is-next' : ''}" data-sholat="${id}" aria-pressed="${on}" ${future ? 'disabled title="Belum waktunya"' : ''}>
                <span class="sholat-check" aria-hidden="true">${icon('check')}</span>
                <span class="sholat-name">${SHOLAT_LABEL[id]}</span>
                ${time ? `<span class="sholat-time">${esc(time)}</span>` : ''}
              </button>`;
          }).join('')}
        </div>
        ${city ? '' : `<p class="hint">Jadwal sholat belum ditampilkan. <button type="button" class="link-btn" data-act="prayer-on">Tampilkan jadwal sholat</button></p>`}
      </section>`;
  }

  function onSholat(ctx, id, btn) {
    const before = (ctx.state.ibadah[ctx.date] || []).length;
    P.store.toggleSholat(ctx.date, id);
    const after = (P.store.state.ibadah[ctx.date] || []).length;
    P.ui.haptic(after > before ? 12 : 6);
    if (after === P.store.SHOLAT.length && after > before) {
      P.ui.confetti(btn, { count: 60 });
      P.ui.toast('Alhamdulillah, sholat 5 waktu lengkap.', { tone: 'success' });
    }
  }

  // ----- Halaman -----

  function emptyState(ctx, space) {
    const rel = D.relativeLabel(ctx.date, ctx.today);
    const when = rel ? rel.toLowerCase() : D.formatLong(ctx.date);
    if (space === 'pribadi') {
      return `
        <div class="empty big">
          <p class="empty-title">Belum ada rencana pribadi untuk ${esc(when)}.</p>
          <p>Ibadah, olahraga, urusan rumah, belajar, keluarga, atau waktu untuk diri sendiri.</p>
          <div class="empty-actions cat-quick">
            ${PERSONAL.filter((c) => c.id !== 'kerja').map((c) => `
              <button type="button" class="btn ghost small" data-add-cat="${c.id}" data-cat="${c.id}">${c.emoji} ${esc(catLabel(c.id))}</button>`).join('')}
          </div>
          <div class="empty-actions">
            <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Pakai template</button>
          </div>
          ${P.templatesUI.suggestionCard(ctx.date, 'pribadi')}
        </div>`;
    }
    const off = !L.workWindow(ctx.state.settings, ctx.date).isWorkday;
    return `
      <div class="empty big">
        <p class="empty-title">${off ? 'Hari libur kerja 🎉' : `Belum ada rencana kerja untuk ${esc(when)}.`}</p>
        <p>${off ? 'Hari ini bukan hari kerja. Nikmati waktumu, atau tambahkan pekerjaan bila memang perlu.'
          : 'Tulis pekerjaan, rapat, dan tenggat hari ini. Kelompokkan ke proyek agar kemajuannya terlihat.'}</p>
        <div class="empty-actions">
          <button type="button" class="btn primary" data-act="new-task">${icon('plus')}Tambah tugas kerja</button>
          <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Pakai template</button>
        </div>
        ${off ? '' : P.templatesUI.suggestionCard(ctx.date, 'kerja')}
      </div>`;
  }

  /** Rencana Kerja tanpa tugas: rencana kerja & SLA sudah tampil di atas, jadi cukup ringkas. */
  function emptyKerja(ctx) {
    const off = !L.workWindow(ctx.state.settings, ctx.date).isWorkday;
    return `
      <div class="empty tasks-empty">
        <p>${off ? 'Hari libur kerja 🎉 Belum ada tugas kerja.' : 'Belum ada tugas kerja berjam untuk hari ini.'}</p>
        <div class="empty-actions">
          <button type="button" class="btn small primary" data-act="new-task">${icon('plus')}Tambah tugas kerja</button>
          <button type="button" class="btn small ghost" data-act="templates">${icon('layers')}Pakai template</button>
        </div>
      </div>`;
  }

  function headActions(space) {
    const first = space === 'kerja'
      ? `<button type="button" class="btn ghost" data-work="report">${icon('report')}Laporan</button>`
      : `<button type="button" class="btn ghost" data-act="share">${icon('share')}Bagikan</button>`;
    return `
      <div class="view-actions">
        ${first}
        <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Template</button>
        <button type="button" class="btn primary" data-act="new-task">${icon('plus')}${space === 'kerja' ? 'Tugas kerja' : 'Tugas pribadi'}</button>
      </div>`;
  }

  function renderSpace(space, ctx) {
    const mine = ctx.state.tasks.filter((t) => t.date === ctx.date && L.areaOf(t) === space);
    const filter = filterOf(space, ctx);
    let tasks = applyFilter(filter, mine);
    if (ctx.prefs.hideDone) tasks = tasks.filter((t) => !t.done);
    const rel = D.relativeLabel(ctx.date, ctx.today);

    let top;
    if (space === 'kerja') {
      top = P.ops.workPlanPanel(ctx) + P.ops.slaSection(ctx) + P.work.workCard(ctx, mine) + P.work.projectsSection('kerja', ctx);
    } else {
      const hasProjects = ctx.state.projects.some((p) => p.area === 'pribadi' && p.status !== 'selesai');
      top = (mine.length ? progressHTML(mine, 'Kemajuan rencana pribadi') : '')
        + ibadahCard(ctx)
        + (hasProjects ? P.work.projectsSection('pribadi', ctx) : '');
    }

    let body;
    if (!mine.length && C.syncLoading()) body = C.loadingBlock(4);
    else if (!mine.length) body = space === 'kerja' ? emptyKerja(ctx) : emptyState(ctx, space);
    else if (!tasks.length) body = '<div class="empty"><p>Tidak ada tugas yang cocok dengan saringan ini.</p></div>';
    else if (ctx.prefs.planMode === 'linimasa') body = timelineView(ctx, tasks, space);
    else body = space === 'kerja' ? dayPartList(tasks) : categoryList(tasks);

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">${esc(rel || D.dayName(ctx.date))} · ${esc(TITLES[space])}</p>
          <h1>${esc(D.formatLong(ctx.date))}</h1>
        </div>
        ${headActions(space)}
      </header>
      <div class="space-body" data-space-body="${space}">
        ${top}
        ${space === 'kerja' ? '<div class="section-head agenda-head"><h2>Agenda kerja</h2><span class="muted">tugas yang punya jam, tenggat, atau proyek</span></div>' : ''}
        ${mine.length ? toolbar(ctx, space, filter, mine) : ''}
        ${body}
      </div>`;
  }

  /** Nilai awal tugas baru sesuai halaman & saringan yang sedang dibuka. */
  function defaultsFor(space, ctx, extra = {}) {
    const filter = filterOf(space, ctx);
    const d = { date: ctx.date, area: space, category: space === 'kerja' ? 'kerja' : 'pribadi', ...extra };
    if (space === 'pribadi' && filter !== 'semua' && !extra.category) d.category = filter;
    if (filter.startsWith('proj:') && filter !== 'proj:none') d.projectId = filter.slice(5);
    return d;
  }

  function mountSpace(space, el, ctx) {
    el.addEventListener('click', (e) => {
      if (C.handleTaskClick(e)) return;
      if (P.templatesUI.handleSuggestClick(e, ctx.date)) return;
      if (P.work.handleClick(e, ctx)) return;
      const sholat = e.target.closest('[data-sholat]');
      if (sholat) return onSholat(ctx, sholat.dataset.sholat, sholat);
      const addCat = e.target.closest('[data-add-cat]');
      if (addCat) return C.openTaskEditor({ defaults: defaultsFor(space, ctx, { category: addCat.dataset.addCat }) });
      const mode = e.target.closest('[data-mode]');
      if (mode) return ctx.setPref('planMode', mode.dataset.mode);
      const filter = e.target.closest('[data-filter]');
      if (filter) return ctx.setPref(FILTER_PREF[space], filter.dataset.filter);
      const slot = e.target.closest('[data-slot]');
      if (slot) {
        const m = Number(slot.dataset.slot);
        return C.openTaskEditor({ defaults: defaultsFor(space, ctx, { start: D.formatTime(m), end: D.formatTime(Math.min(m + 60, 1439)) }) });
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'new-task') C.openTaskEditor({ defaults: defaultsFor(space, ctx) });
      if (act.dataset.act === 'templates') C.openTemplates(ctx.date);
      if (act.dataset.act === 'share') C.openShare(ctx.date, { area: space });
      if (act.dataset.act === 'prayer-on') {
        P.store.setSettings({ prayerEnabled: true });
        const city = P.prayer.findCity(P.store.state.settings.prayerCity);
        P.ui.toast(`Jadwal sholat untuk ${city.name} ditampilkan. Ganti kota di Pengaturan.`, { tone: 'success', duration: 6000 });
      }
    });
    if (space === 'kerja') el.addEventListener('submit', (e) => P.ops.handleSubmit(e, ctx));
    const hide = el.querySelector('#hide-done');
    if (hide) hide.addEventListener('change', () => ctx.setPref('hideDone', hide.checked));

    // Gulir linimasa ke sekitar jam sekarang / tugas pertama.
    const timeline = el.querySelector('.timeline');
    if (timeline && !ctx.keepScroll) {
      const target = timeline.querySelector('.now-line') || timeline.querySelector('.block');
      if (target) {
        root.requestAnimationFrame(() => {
          const top = target.getBoundingClientRect().top + root.scrollY - 160;
          if (top > root.scrollY + root.innerHeight - 200 || top < root.scrollY) {
            root.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
          }
        });
      }
    }
  }

  const views = (P.views = P.views || {});
  for (const space of ['kerja', 'pribadi']) {
    views[space] = {
      title: TITLES[space],
      render: (ctx) => renderSpace(space, ctx),
      mount: (el, ctx) => mountSpace(space, el, ctx),
      newDefaults: (ctx) => defaultsFor(space, ctx),
    };
  }
})(typeof self !== 'undefined' ? self : this);
