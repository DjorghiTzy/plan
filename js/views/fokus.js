/** Fokus: timer Pomodoro yang bisa dikaitkan dengan satu tugas hari ini. */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const T = P.timer;
  const { esc, icon } = P.ui;

  const R = 108;
  const LEN = 2 * Math.PI * R;

  function render(ctx) {
    const { state, today } = ctx;
    const t = state.timer;
    const s = state.settings;
    const rem = T.remainingMs();
    const frac = 1 - rem / T.durationMs(t.mode);
    const todays = L.sortTasks(state.tasks.filter((x) => x.date === today && (!x.done || x.id === t.taskId)));
    const current = state.tasks.find((x) => x.id === t.taskId) || null;
    const sessions = state.focusSessions.filter((x) => x.date === today).sort((a, b) => b.endedAt - a.endedAt);
    const minutes = sessions.reduce((sum, x) => sum + x.minutes, 0);
    const done = T.roundDone();
    const running = t.status === 'running';

    const modeTabs = Object.entries(T.MODES).map(([id, m]) => `
      <button type="button" data-mode="${id}" aria-pressed="${t.mode === id}" title="${esc(m.label)}">${esc(m.short)}</button>`).join('');

    const statusText = {
      idle: t.mode === 'fokus' ? 'Siap mulai' : 'Waktunya istirahat',
      running: t.mode === 'fokus' ? 'Sedang fokus' : 'Sedang istirahat',
      paused: 'Dijeda',
    }[t.status];

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">Fokus · Teknik Pomodoro</p>
          <h1>${s.focusMin} menit fokus, ${s.shortMin} menit istirahat</h1>
        </div>
      </header>

      <div class="focus-layout">
        <section class="timer-card" data-mode="${esc(t.mode)}" data-status="${esc(t.status)}">
          <div class="segmented" role="group" aria-label="Mode timer">${modeTabs}</div>
          <div class="dial">
            <svg viewBox="0 0 240 240" aria-hidden="true">
              <circle class="dial-track" cx="120" cy="120" r="${R}"/>
              <circle class="dial-value" data-timer-ring data-len="${LEN.toFixed(2)}" cx="120" cy="120" r="${R}"
                stroke-dasharray="${LEN.toFixed(2)}" style="stroke-dashoffset:${(LEN * (1 - Math.min(1, Math.max(0, frac)))).toFixed(2)}"/>
            </svg>
            <div class="dial-center">
              <span class="dial-status">${esc(statusText)}</span>
              <span class="dial-time" data-timer-text role="timer" aria-live="off">${esc(T.format(rem))}</span>
              <span class="dial-task">${current ? esc(current.title) : 'Tanpa tugas terpilih'}</span>
            </div>
          </div>
          <div class="timer-controls">
            <button type="button" class="icon-btn big" data-timer="reset" aria-label="Ulangi dari awal" title="Ulangi">${icon('reset')}</button>
            <button type="button" class="play" data-timer="toggle" id="timer-toggle" aria-label="${running ? 'Jeda' : 'Mulai'}">${icon(running ? 'pause' : 'play')}<span>${running ? 'Jeda' : t.status === 'paused' ? 'Lanjut' : 'Mulai'}</span></button>
            <button type="button" class="icon-btn big" data-timer="skip" aria-label="Lewati ke sesi berikutnya" title="Lewati">${icon('skip')}</button>
          </div>
          <div class="cycle" aria-label="${done} dari ${s.longEvery} sesi menuju istirahat panjang">
            ${Array.from({ length: s.longEvery }, (_, i) => `<span class="${i < done ? 'on' : ''}"></span>`).join('')}
            <p>${done} dari ${s.longEvery} sesi menuju istirahat panjang</p>
          </div>
        </section>

        <div class="focus-side">
          <section class="panel">
            <div class="panel-head"><h2>Kerjakan apa?</h2><span class="panel-note">Tugas hari ini</span></div>
            ${todays.length ? `
              <ul class="pick-list" role="radiogroup" aria-label="Tugas untuk sesi fokus">
                <li><button type="button" class="pick-task${!t.taskId ? ' on' : ''}" data-task="" role="radio" aria-checked="${!t.taskId}">
                  <span class="radio" aria-hidden="true"></span><span>Tanpa tugas</span></button></li>
                ${todays.map((x) => `
                  <li><button type="button" class="pick-task${x.id === t.taskId ? ' on' : ''}" data-task="${esc(x.id)}" role="radio" aria-checked="${x.id === t.taskId}">
                    <span class="radio" aria-hidden="true"></span>
                    <span class="pick-title">${esc(x.title)}</span>
                    <span class="pick-meta">${x.start ? `<span class="time">${esc(x.start)}</span>` : ''}${x.pomodoros ? `${icon('timer')}${x.pomodoros}` : ''}</span>
                  </button></li>`).join('')}
              </ul>` : '<p class="muted">Belum ada tugas hari ini. Timer tetap bisa dipakai tanpa tugas.</p>'}
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Sesi hari ini</h2><span class="panel-note"><strong>${sessions.length}</strong> sesi · ${esc(D.formatDuration(minutes))}</span></div>
            ${sessions.length ? `
              <ul class="session-list">
                ${sessions.slice(0, 8).map((x) => {
                  const task = x.taskId && state.tasks.find((y) => y.id === x.taskId);
                  const at = new Date(x.endedAt);
                  return `<li><span class="time">${esc(D.formatTime(at.getHours() * 60 + at.getMinutes()))}</span><span>${task ? esc(task.title) : 'Sesi bebas'}</span><span class="muted">${x.minutes} mnt</span></li>`;
                }).join('')}
              </ul>` : '<p class="muted">Belum ada sesi fokus yang selesai hari ini.</p>'}
          </section>
        </div>
      </div>`;
  }

  function mount(el) {
    el.addEventListener('click', (e) => {
      const ctl = e.target.closest('[data-timer]');
      if (ctl) {
        const action = ctl.dataset.timer;
        if (action === 'toggle') T.toggle();
        if (action === 'reset') T.reset();
        if (action === 'skip') T.skip();
        return;
      }
      const mode = e.target.closest('[data-mode]');
      if (mode) return T.setMode(mode.dataset.mode);
      const pick = e.target.closest('[data-task]');
      if (pick) T.setTask(pick.dataset.task);
    });
    T.paint();
  }

  (P.views = P.views || {}).fokus = { title: 'Fokus', render, mount };
})(typeof self !== 'undefined' ? self : this);
