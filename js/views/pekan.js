/** Pekan: tujuh hari Senin–Minggu, target pekanan, dan pindah tugas antarhari. */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;
  const C = P.components;

  function card(t) {
    return `
      <li class="wtask${t.done ? ' is-done' : ''}" data-id="${esc(t.id)}" data-cat="${esc(t.category)}" draggable="true">
        <button type="button" class="check small" role="checkbox" aria-checked="${t.done}" data-action="toggle-task" aria-label="Tandai selesai: ${esc(t.title)}">${icon('check')}</button>
        <div class="wtask-main">
          <button type="button" class="task-title" data-action="edit-task">${t.starred ? icon('star', 'tiny') : ''}${esc(t.title)}</button>
          <span class="wtask-meta">${t.start ? `<span class="time">${esc(t.start)}</span>` : ''}${t.seriesId ? icon('repeat', 'inline') : ''}</span>
        </div>
        <button type="button" class="icon-btn tiny-btn" data-postpone aria-label="Geser ke hari berikutnya" title="Geser ke hari berikutnya">${icon('right')}</button>
      </li>`;
  }

  function dayColumn(ctx, key) {
    const tasks = L.sortTasks(ctx.state.tasks.filter((t) => t.date === key));
    const p = L.progress(tasks);
    const rel = D.relativeLabel(key, ctx.today);
    const cls = ['wday'];
    if (key === ctx.today) cls.push('is-today');
    if (key === ctx.date) cls.push('is-selected');
    if (D.dayIndex(key) === 0) cls.push('is-sunday');
    if (D.diffDays(ctx.today, key) < 0) cls.push('is-past');
    return `
      <section class="${cls.join(' ')}" data-day="${key}" aria-label="${esc(D.formatLong(key))}">
        <header class="wday-head">
          <button type="button" class="wday-date" data-open-day="${key}" title="Buka rencana hari ini">
            <span class="wday-name">${esc(D.dayName(key))}</span>
            <span class="wday-num">${Number(key.slice(8))}</span>
            ${rel ? `<span class="wday-rel">${esc(rel)}</span>` : ''}
          </button>
          <button type="button" class="icon-btn" data-add-day="${key}" aria-label="Tambah tugas ${esc(D.formatLong(key))}">${icon('plus')}</button>
        </header>
        <div class="wday-progress" title="${p.done} dari ${p.total} selesai"><span style="width:${p.pct}%"></span></div>
        <ul class="wlist">
          ${tasks.map(card).join('') || '<li class="wempty">Kosong. Seret tugas ke sini.</li>'}
        </ul>
      </section>`;
  }

  function render(ctx) {
    const { state, date } = ctx;
    const keys = D.weekKeys(date);
    const week = keys[0];
    const weekTasks = state.tasks.filter((t) => keys.includes(t.date));
    const p = L.progress(weekTasks);
    const focus = state.focusSessions.filter((f) => keys.includes(f.date)).reduce((s, f) => s + f.minutes, 0);
    const habits = state.habits.filter((h) => !h.archived);
    const habitChecks = keys.reduce((n, k) => n + (state.habitLog[k] || []).length, 0);
    const [y1, m1, d1] = keys[0].split('-').map(Number);
    const [y2, m2, d2] = keys[6].split('-').map(Number);
    const range = m1 === m2
      ? `${d1}–${d2} ${D.MONTHS[m1 - 1]} ${y2}`
      : `${d1} ${D.MONTHS_SHORT[m1 - 1]}${y1 !== y2 ? ` ${y1}` : ''} – ${d2} ${D.MONTHS_SHORT[m2 - 1]} ${y2}`;
    const isThisWeek = keys.includes(ctx.today);

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">Pekan ke-${D.isoWeek(week)}${isThisWeek ? ' · pekan ini' : ''}</p>
          <h1>${esc(range)}</h1>
        </div>
        <div class="view-actions">
          <button type="button" class="btn ghost" data-share-week>${icon('share')}Bagikan</button>
          <button type="button" class="icon-btn big" data-week="-7" aria-label="Pekan sebelumnya">${icon('left')}</button>
          ${isThisWeek ? '' : '<button type="button" class="btn ghost" data-week="this">Pekan ini</button>'}
          <button type="button" class="icon-btn big" data-week="7" aria-label="Pekan berikutnya">${icon('right')}</button>
        </div>
      </header>

      <div class="week-top">
        <dl class="week-stats">
          <div><dt>Rencana selesai</dt><dd>${p.done}<small>/${p.total}</small></dd></div>
          <div><dt>Kemajuan</dt><dd>${p.pct}%</dd></div>
          <div><dt>Waktu fokus</dt><dd>${esc(D.formatDuration(focus))}</dd></div>
          <div><dt>Centang kebiasaan</dt><dd>${habitChecks}<small>/${habits.length * 7}</small></dd></div>
        </dl>
        <div class="week-goal">
          <label for="week-goal" class="legend">Target pekan ini</label>
          <textarea id="week-goal" rows="3" maxlength="1000" placeholder="Mis. Selesaikan proposal, olahraga 3 kali, baca 1 buku">${esc(state.weekNotes[week] || '')}</textarea>
        </div>
      </div>

      <div class="week-grid">${keys.map((k) => dayColumn(ctx, k)).join('')}</div>
      <p class="hint">Seret tugas ke hari lain untuk memindahkannya, atau tekan ${icon('right', 'inline')} untuk menggeser ke hari berikutnya.</p>`;
  }

  function move(id, date) {
    const t = P.store.findTask(id);
    if (!t || t.date === date) return;
    const from = t.date;
    P.store.moveTasks([id], date);
    P.ui.toast(`"${t.title}" dipindah ke ${D.dayName(date)}, ${D.formatShort(date)}.`, {
      action: 'Urungkan',
      onAction: () => P.store.moveTasks([id], from),
    });
  }

  function mount(el, ctx) {
    const week = D.weekStart(ctx.date);
    const goal = el.querySelector('#week-goal');
    let timer = null;
    const save = () => P.store.setWeekNote(week, goal.value, { silent: true });
    goal.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    });

    el.addEventListener('click', (e) => {
      if (C.handleTaskClick(e)) return;
      const post = e.target.closest('[data-postpone]');
      if (post) {
        const id = post.closest('[data-id]').dataset.id;
        const t = P.store.findTask(id);
        if (t) move(id, D.addDays(t.date, 1));
        return;
      }
      const wk = e.target.closest('[data-week]');
      if (wk) {
        ctx.setDate(wk.dataset.week === 'this' ? ctx.today : D.addDays(ctx.date, Number(wk.dataset.week)));
        return;
      }
      if (e.target.closest('[data-share-week]')) return C.openShare(ctx.date);
      const add = e.target.closest('[data-add-day]');
      if (add) return C.openTaskEditor({ defaults: { date: add.dataset.addDay } });
      const open = e.target.closest('[data-open-day]');
      if (open) {
        ctx.setDate(open.dataset.openDay);
        ctx.go('rencana');
      }
    });

    // Seret-lepas antarhari
    el.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.wtask');
      if (!item) return;
      e.dataTransfer.setData('text/plain', item.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      item.classList.add('dragging');
    });
    el.addEventListener('dragend', (e) => {
      const item = e.target.closest('.wtask');
      if (item) item.classList.remove('dragging');
      el.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
    });
    el.addEventListener('dragover', (e) => {
      const day = e.target.closest('[data-day]');
      if (!day) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!day.classList.contains('drop-over')) {
        el.querySelectorAll('.drop-over').forEach((x) => x.classList.remove('drop-over'));
        day.classList.add('drop-over');
      }
    });
    el.addEventListener('drop', (e) => {
      const day = e.target.closest('[data-day]');
      if (!day) return;
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain');
      if (id) move(id, day.dataset.day);
    });

    return () => {
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
  }

  (P.views = P.views || {}).pekan = { title: 'Pekan', render, mount };
})(typeof self !== 'undefined' ? self : this);
