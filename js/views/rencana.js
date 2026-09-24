/** Rencana: daftar tugas per bagian hari, atau linimasa per jam. */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;
  const C = P.components;

  const HOUR_PX = 60;

  function toolbar(ctx, tasks) {
    const mode = ctx.prefs.planMode;
    const filter = ctx.prefs.planFilter;
    const counts = L.categoryCounts(tasks);
    const chips = [`<button type="button" class="filter${filter === 'semua' ? ' on' : ''}" data-filter="semua" aria-pressed="${filter === 'semua'}">Semua <span>${tasks.length}</span></button>`]
      .concat(L.CATEGORIES.filter((c) => counts[c.id].total || filter === c.id).map((c) => `
        <button type="button" class="filter${filter === c.id ? ' on' : ''}" data-filter="${c.id}" data-cat="${c.id}" aria-pressed="${filter === c.id}">${esc(c.label)} <span>${counts[c.id].total}</span></button>`));
    return `
      <div class="toolbar">
        <div class="segmented" role="group" aria-label="Tampilan">
          <button type="button" data-mode="daftar" aria-pressed="${mode === 'daftar'}">${icon('rows')}Daftar</button>
          <button type="button" data-mode="linimasa" aria-pressed="${mode === 'linimasa'}">${icon('clock')}Linimasa</button>
        </div>
        <div class="filters" role="group" aria-label="Saring kategori">${chips.join('')}</div>
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

  function timelineView(ctx, tasks) {
    const s = ctx.state.settings;
    const timed = tasks.filter((t) => t.start);
    const untimed = tasks.filter((t) => !t.start);
    const items = timed.map((t) => {
      const start = D.parseTime(t.start);
      const end = Math.max(start + 15, t.end ? D.parseTime(t.end) : start + 30);
      return { id: t.id, start, end, task: t };
    });
    let from = s.dayStart * 60;
    let to = s.dayEnd * 60;
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
      return `
        <div class="block${t.done ? ' is-done' : ''}${height < 40 ? ' short' : ''}" data-id="${esc(t.id)}" data-cat="${esc(t.category)}"
          style="top:${(it.start - from) * px}px;height:${height - 2}px;left:calc(${(col / cols) * 100}% + 2px);width:calc(${100 / cols}% - 4px)">
          <button type="button" class="block-check" role="checkbox" aria-checked="${t.done}" data-action="toggle-task" aria-label="Tandai selesai: ${esc(t.title)}">${icon('check')}</button>
          <button type="button" class="block-body" data-action="edit-task">
            <span class="block-title">${t.starred ? icon('star', 'tiny') : ''}${esc(t.title)}</span>
            <span class="block-time">${esc(P.ui.timeRange(t))}</span>
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

  function render(ctx) {
    const all = ctx.state.tasks.filter((t) => t.date === ctx.date);
    const prog = L.progress(all);
    let tasks = all;
    if (ctx.prefs.planFilter !== 'semua') tasks = tasks.filter((t) => t.category === ctx.prefs.planFilter);
    if (ctx.prefs.hideDone) tasks = tasks.filter((t) => !t.done);
    const rel = D.relativeLabel(ctx.date, ctx.today);

    let body;
    if (!all.length) {
      body = `
        <div class="empty big">
          <p class="empty-title">Belum ada rencana untuk ${esc(rel ? rel.toLowerCase() : D.formatLong(ctx.date))}.</p>
          <p>Tambahkan satu per satu, atau mulai dari template rutinitas lalu sesuaikan.</p>
          <div class="empty-actions">
            <button type="button" class="btn primary" data-act="new-task">${icon('plus')}Tambah tugas</button>
            <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Pakai template</button>
          </div>
        </div>`;
    } else if (!tasks.length) {
      body = '<div class="empty"><p>Tidak ada tugas yang cocok dengan saringan ini.</p></div>';
    } else {
      body = ctx.prefs.planMode === 'linimasa' ? timelineView(ctx, tasks) : listView(ctx, tasks);
    }

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">${esc(rel || D.dayName(ctx.date))} · Rencana</p>
          <h1>${esc(D.formatLong(ctx.date))}</h1>
        </div>
        <div class="view-actions">
          <button type="button" class="btn ghost" data-act="share">${icon('share')}Bagikan</button>
          <button type="button" class="btn ghost" data-act="templates">${icon('layers')}Template</button>
          <button type="button" class="btn primary" data-act="new-task">${icon('plus')}Tugas baru</button>
        </div>
      </header>
      ${all.length ? `
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog.pct}" aria-label="Kemajuan hari ini">
          <div class="progress-bar"><span style="width:${prog.pct}%"></span></div>
          <p><strong>${prog.done}</strong> dari ${prog.total} selesai · ${prog.pct}%</p>
        </div>
        ${toolbar(ctx, all)}` : ''}
      ${body}`;
  }

  function mount(el, ctx) {
    el.addEventListener('click', (e) => {
      if (C.handleTaskClick(e)) return;
      const mode = e.target.closest('[data-mode]');
      if (mode) return ctx.setPref('planMode', mode.dataset.mode);
      const filter = e.target.closest('[data-filter]');
      if (filter) return ctx.setPref('planFilter', filter.dataset.filter);
      const slot = e.target.closest('[data-slot]');
      if (slot) {
        const m = Number(slot.dataset.slot);
        return C.openTaskEditor({ defaults: { date: ctx.date, start: D.formatTime(m), end: D.formatTime(Math.min(m + 60, 1439)) } });
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'new-task') C.openTaskEditor({ defaults: { date: ctx.date } });
      if (act.dataset.act === 'templates') C.openTemplates(ctx.date);
      if (act.dataset.act === 'share') C.openShare(ctx.date);
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

  (P.views = P.views || {}).rencana = { title: 'Rencana', render, mount };
})(typeof self !== 'undefined' ? self : this);
