/**
 * Rencana: daftar tugas per bagian hari, atau linimasa per jam.
 * Tiga ruang: Semua, Rencana Kerja (jam kerja, proyek, laporan), dan Rencana Pribadi.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;
  const C = P.components;

  const HOUR_PX = 60;

  const SPACES = [
    { id: 'semua', label: 'Semua', icon: 'list' },
    { id: 'kerja', label: 'Kerja', icon: 'briefcase' },
    { id: 'pribadi', label: 'Pribadi', icon: 'heart' },
  ];
  const TITLES = { semua: 'Rencana', kerja: 'Rencana Kerja', pribadi: 'Rencana Pribadi' };

  const spaceOf = (ctx) => (SPACES.some((s) => s.id === ctx.prefs.planSpace) ? ctx.prefs.planSpace : 'semua');
  const inSpace = (space, tasks) => (space === 'semua' ? tasks : tasks.filter((t) => L.areaOf(t) === space));
  const liveProject = (t) => (t.projectId ? P.store.findProject(t.projectId) : null);

  /** Saringan yang berlaku di ruang ini: Kerja per proyek, lainnya per kategori. */
  function effectiveFilter(space, filter) {
    if (space === 'kerja') {
      const f = String(filter || '');
      if (f === 'proj:none') return f;
      return f.startsWith('proj:') && P.store.findProject(f.slice(5)) ? f : 'semua';
    }
    return L.CATEGORIES.some((c) => c.id === filter) ? filter : 'semua';
  }

  function applyFilter(filter, tasks) {
    if (filter === 'semua') return tasks;
    if (filter === 'proj:none') return tasks.filter((t) => !liveProject(t));
    if (filter.startsWith('proj:')) return tasks.filter((t) => t.projectId === filter.slice(5));
    return tasks.filter((t) => t.category === filter);
  }

  function switcher(space, all) {
    return `
      <div class="space-switch" role="group" aria-label="Pilih rencana" data-key="space-switch">
        ${SPACES.map((sp) => {
          const list = inSpace(sp.id, all);
          const done = list.filter((t) => t.done).length;
          return `
            <button type="button" class="space-tab" data-space="${sp.id}" aria-pressed="${space === sp.id}">
              ${icon(sp.icon)}
              <span class="space-label">${sp.id === 'semua' ? 'Semua' : `<span class="space-long">Rencana </span>${esc(sp.label)}`}</span>
              <span class="space-count" aria-label="${done} dari ${list.length} selesai">${list.length ? `${done}/${list.length}` : '0'}</span>
            </button>`;
        }).join('')}
      </div>`;
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
    for (const c of L.CATEGORIES) {
      if (counts[c.id].total || filter === c.id) chips.push(chip(c.id, esc(c.label), counts[c.id].total, `data-cat="${c.id}"`));
    }
    return `<div class="filters" role="group" aria-label="Saring kategori">${chips.join('')}</div>`;
  }

  function toolbar(ctx, space, filter, tasks) {
    const mode = ctx.prefs.planMode;
    const future = D.diffDays(ctx.today, ctx.date) >= 0;
    const untimed = tasks.some((t) => !t.start && !t.done);
    let auto = '';
    if (untimed && future && space === 'semua') {
      auto = `<button type="button" class="btn secondary small" data-act="auto">${icon('sparkle')}Atur otomatis</button>`;
    } else if (untimed && future && space === 'pribadi') {
      auto = `<button type="button" class="btn secondary small" data-work="auto-personal" title="Tugas pribadi ditempatkan di luar jam kerja">${icon('sparkle')}Atur otomatis</button>`;
    }
    return `
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Tampilan">
          <button type="button" data-mode="daftar" aria-pressed="${mode === 'daftar'}">${icon('rows')}Daftar</button>
          <button type="button" data-mode="linimasa" aria-pressed="${mode === 'linimasa'}">${icon('clock')}Linimasa</button>
        </div>
        ${filterChips(space, filter, tasks)}
        ${auto}
        <label class="toggle">
          <input id="hide-done" type="checkbox" ${ctx.prefs.hideDone ? 'checked' : ''}>
          <span>Sembunyikan yang selesai</span>
        </label>
      </div>`;
  }

  function listView(ctx, tasks) {
    const groups = L.groupByDayPart(tasks);
    const sections = L.DAY_PARTS.filter((p) => groups[p.id].length).map((p) => `
      <section class="daypart">
        <h2 class="daypart-head"><span>${esc(p.label)}</span><small>${esc(p.range)}</small></h2>
        <ul class="tasks">${groups[p.id].map((t) => C.taskRow(t)).join('')}</ul>
      </section>`);
    return sections.join('');
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
        + (work.rest ? band(work.rest[0], work.rest[1], 'rest-band', 'Istirahat') : '')
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

  function emptyState(ctx, space) {
    const rel = D.relativeLabel(ctx.date, ctx.today);
    const when = rel ? rel.toLowerCase() : D.formatLong(ctx.date);
    if (space === 'semua') {
      return `
        <div class="empty big">
          <p class="empty-title">Belum ada rencana untuk ${esc(when)}.</p>
          <p>Tambahkan satu per satu, atau mulai dari template rutinitas lalu sesuaikan.</p>
          <div class="empty-actions">
            <button type="button" class="btn primary" data-act="new-task">${icon('plus')}Tambah tugas</button>
            <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Pakai template</button>
          </div>
          ${P.templatesUI.suggestionCard(ctx.date)}
        </div>`;
    }
    const work = space === 'kerja';
    const off = work && !L.workWindow(ctx.state.settings, ctx.date).isWorkday;
    const text = work
      ? off ? 'Hari ini bukan hari kerja. Nikmati waktumu, atau tambahkan pekerjaan bila memang perlu.'
        : 'Tulis pekerjaan, rapat, dan tenggat hari ini. Kelompokkan ke proyek agar kemajuannya terlihat.'
      : 'Olahraga, ibadah, urusan rumah, belajar, keluarga, atau waktu untuk diri sendiri.';
    return `
      <div class="empty big">
        <p class="empty-title">${off ? 'Hari libur kerja 🎉' : `Belum ada rencana ${work ? 'kerja' : 'pribadi'} untuk ${esc(when)}.`}</p>
        <p>${esc(text)}</p>
        <div class="empty-actions">
          <button type="button" class="btn primary" data-act="new-task">${icon('plus')}${work ? 'Tambah tugas kerja' : 'Tambah tugas pribadi'}</button>
          <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Pakai template</button>
        </div>
        ${off ? '' : P.templatesUI.suggestionCard(ctx.date, space)}
      </div>`;
  }

  function headActions(space) {
    const share = space === 'kerja'
      ? `<button type="button" class="btn ghost" data-work="report">${icon('report')}Laporan</button>`
      : `<button type="button" class="btn ghost" data-act="share">${icon('share')}Bagikan</button>`;
    const label = space === 'kerja' ? 'Tugas kerja' : space === 'pribadi' ? 'Tugas pribadi' : 'Tugas baru';
    return `
      <div class="view-actions">
        ${share}
        <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Template</button>
        <button type="button" class="btn primary" data-act="new-task">${icon('plus')}${label}</button>
      </div>`;
  }

  function render(ctx) {
    const space = spaceOf(ctx);
    const all = ctx.state.tasks.filter((t) => t.date === ctx.date);
    const mine = inSpace(space, all);
    const filter = effectiveFilter(space, ctx.prefs.planFilter);
    let tasks = applyFilter(filter, mine);
    if (ctx.prefs.hideDone) tasks = tasks.filter((t) => !t.done);
    const rel = D.relativeLabel(ctx.date, ctx.today);

    let top = '';
    if (space === 'kerja') {
      top = P.work.workCard(ctx, mine) + P.work.projectsSection('kerja', ctx);
    } else if (space === 'pribadi') {
      top = (mine.length ? progressHTML(mine, 'Kemajuan rencana pribadi') : '') + P.work.projectsSection('pribadi', ctx);
    } else if (all.length) {
      top = progressHTML(all, 'Kemajuan hari ini') + P.ritual.capacityHTML(ctx.date);
    }

    let body;
    if (!all.length && C.syncLoading()) {
      body = C.loadingBlock(4);
    } else if (!mine.length) {
      body = emptyState(ctx, space);
    } else if (!tasks.length) {
      body = '<div class="empty"><p>Tidak ada tugas yang cocok dengan saringan ini.</p></div>';
    } else {
      body = ctx.prefs.planMode === 'linimasa' ? timelineView(ctx, tasks, space) : listView(ctx, tasks);
    }

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">${esc(rel || D.dayName(ctx.date))} · ${esc(TITLES[space])}</p>
          <h1>${esc(D.formatLong(ctx.date))}</h1>
        </div>
        ${headActions(space)}
      </header>
      ${switcher(space, all)}
      <div class="space-body" data-space-body="${space}">
        ${top}
        ${mine.length ? toolbar(ctx, space, filter, mine) : ''}
        ${body}
      </div>`;
  }

  /** Nilai awal tugas baru sesuai ruang & saringan yang sedang dibuka. */
  function newDefaults(ctx, extra = {}) {
    const space = spaceOf(ctx);
    const filter = effectiveFilter(space, ctx.prefs.planFilter);
    const d = { date: ctx.date, ...extra };
    if (space !== 'semua') {
      d.area = space;
      d.category = space === 'kerja' ? 'kerja' : 'pribadi';
    }
    if (L.CATEGORIES.some((c) => c.id === filter)) d.category = filter;
    if (filter.startsWith('proj:') && filter !== 'proj:none') d.projectId = filter.slice(5);
    return d;
  }

  function mount(el, ctx) {
    el.addEventListener('click', (e) => {
      if (C.handleTaskClick(e)) return;
      if (P.templatesUI.handleSuggestClick(e, ctx.date)) return;
      if (P.work.handleClick(e, ctx)) return;
      const space = e.target.closest('[data-space]');
      if (space) return ctx.setSpace(space.dataset.space);
      const mode = e.target.closest('[data-mode]');
      if (mode) return ctx.setPref('planMode', mode.dataset.mode);
      const filter = e.target.closest('[data-filter]');
      if (filter) return ctx.setPref('planFilter', filter.dataset.filter);
      const slot = e.target.closest('[data-slot]');
      if (slot) {
        const m = Number(slot.dataset.slot);
        return C.openTaskEditor({ defaults: newDefaults(ctx, { start: D.formatTime(m), end: D.formatTime(Math.min(m + 60, 1439)) }) });
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const sp = spaceOf(ctx);
      if (act.dataset.act === 'new-task') C.openTaskEditor({ defaults: newDefaults(ctx) });
      if (act.dataset.act === 'templates') C.openTemplates(ctx.date);
      if (act.dataset.act === 'share') C.openShare(ctx.date, { area: sp === 'semua' ? null : sp });
      if (act.dataset.act === 'auto') P.ritual.autoSchedule(ctx.date);
    });
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

  (P.views = P.views || {}).rencana = { title: 'Rencana', render, mount, SPACES, newDefaults };
})(typeof self !== 'undefined' ? self : this);
