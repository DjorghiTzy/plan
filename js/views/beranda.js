/** Beranda: ringkasan satu hari dalam bentuk kalender sobek + panel-panel kecil. */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon, moodFace } = P.ui;
  const C = P.components;

  function sheet(date) {
    const [y, m, d] = date.split('-').map(Number);
    const sunday = D.dayIndex(date) === 0;
    const hijri = D.hijri(date);
    return `
      <div class="sheet${sunday ? ' is-sunday' : ''}" data-sheet role="img" aria-label="${esc(`${D.formatLong(date)}, ${D.dayName(date)} ${D.pasaran(date)}${hijri ? `, ${hijri}` : ''}`)}">
        <div class="sheet-holes" aria-hidden="true">${'<span></span>'.repeat(7)}</div>
        <div class="sheet-band">${esc(D.dayName(date))}</div>
        <div class="sheet-num">${d}</div>
        <div class="sheet-month">${esc(D.MONTHS[m - 1])} ${y}</div>
        <div class="sheet-foot">
          <span>${esc(D.dayName(date))} ${esc(D.pasaran(date))}</span>
          ${hijri ? `<span>${esc(hijri)}</span>` : ''}
        </div>
      </div>`;
  }

  function ring(pct) {
    const r = 26;
    const len = 2 * Math.PI * r;
    return `
      <svg class="ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle class="ring-track" cx="32" cy="32" r="${r}"/>
        <circle class="ring-value" cx="32" cy="32" r="${r}" stroke-dasharray="${len.toFixed(2)}" style="stroke-dashoffset:${(len * (1 - pct / 100)).toFixed(2)}"/>
      </svg>`;
  }

  function headline(ctx, prog) {
    const { date, today } = ctx;
    const diff = D.diffDays(today, date);
    if (!prog.total && C.syncLoading()) return 'Sebentar, memuat rencanamu…';
    if (diff === 0) {
      if (!prog.total) return 'Hari ini masih kosong. Mau mulai dari mana?';
      if (prog.done === prog.total) return `Semua ${prog.total} rencana hari ini selesai.`;
      return `${prog.done} dari ${prog.total} rencana selesai.`;
    }
    if (diff < 0) {
      if (!prog.total) return 'Tidak ada rencana tercatat di hari itu.';
      return `${prog.done} dari ${prog.total} rencana selesai hari itu.`;
    }
    if (!prog.total) return 'Belum ada rencana. Siapkan dari sekarang.';
    return `${prog.total} rencana sudah disiapkan.`;
  }

  function eyebrow(ctx) {
    const { date, today, state } = ctx;
    const diff = D.diffDays(today, date);
    if (diff === 0) {
      const name = state.settings.name.trim();
      return `${D.greeting(ctx.now)}${name ? `, ${name}` : ''}`;
    }
    const rel = D.relativeLabel(date, today);
    if (rel) return rel;
    return diff > 0 ? `${diff} hari lagi` : `${-diff} hari yang lalu`;
  }

  function banners(ctx) {
    const { state, date, today, prefs } = ctx;
    const out = [P.account.banner(ctx)];
    if (date === today && prefs.rolloverDismissed !== today) {
      const left = L.rolloverCandidates(state.tasks, today);
      if (left.length) {
        const names = left.slice(0, 3).map((t) => `"${esc(t.title)}"`).join(', ');
        out.push(`
          <div class="banner" data-tone="warn">
            <p><strong>${left.length} rencana belum selesai</strong> dari hari-hari sebelumnya: ${names}${left.length > 3 ? `, dan ${left.length - 3} lainnya` : ''}.</p>
            <div class="banner-actions">
              <button type="button" class="btn small primary" data-act="rollover">Pindahkan ke hari ini</button>
              <button type="button" class="btn small ghost" data-act="dismiss-rollover">Abaikan</button>
            </div>
          </div>`);
      }
    }
    return out.join('');
  }

  function priorities(tasks) {
    const starred = L.sortTasks(tasks.filter((t) => t.starred));
    const empty = Math.max(0, P.store.MAX_STARRED - starred.length);
    return `
      <section class="panel">
        <div class="panel-head">
          <h2>Tiga Prioritas</h2>
          <span class="panel-note">${starred.filter((t) => t.done).length}/${starred.length || 0} selesai</span>
        </div>
        <ul class="tasks">
          ${starred.map((t) => C.taskRow(t, { compact: true })).join('')}
          ${Array.from({ length: empty }, () => `
            <li class="slot">Slot kosong. Tekan ${icon('star')} pada tugas untuk mengisinya.</li>`).join('')}
        </ul>
      </section>`;
  }

  const AGENDA_GROUPS = [
    { id: 'kerja', label: 'Rencana Kerja', emoji: '💼' },
    { id: 'pribadi', label: 'Rencana Pribadi', emoji: '🏡' },
  ];

  /** Agenda hari itu, dipisah Rencana Kerja dan Rencana Pribadi. */
  function agendaGroups(tasks) {
    return AGENDA_GROUPS.map((g) => {
      const list = L.sortTasks(tasks.filter((t) => L.areaOf(t) === g.id));
      const done = list.filter((t) => t.done).length;
      return `
        <div class="agenda-group" data-area="${g.id}" data-key="agenda-${g.id}">
          <div class="agenda-group-head">
            <h3><span aria-hidden="true">${g.emoji}</span> ${esc(g.label)} <span class="muted">${done}/${list.length}</span></h3>
            <button type="button" class="link-btn" data-go="${g.id}">Buka ${icon('arrow')}</button>
          </div>
          ${list.length
            ? `<ul class="tasks">${list.map((t) => C.taskRow(t, { compact: true })).join('')}</ul>`
            : `<p class="agenda-none">Belum ada ${g.id === 'kerja' ? 'rencana kerja' : 'rencana pribadi'}.</p>`}
        </div>`;
    }).join('');
  }

  function agenda(ctx, tasks) {
    return `
      <section class="panel">
        <div class="panel-head">
          <h2>Agenda</h2>
        </div>
        ${tasks.length
          ? agendaGroups(tasks)
          : C.syncLoading() ? C.loadingBlock()
          : `<div class="empty">
              <p>Belum ada agenda untuk ${esc(D.formatLong(ctx.date))}.</p>
              <div class="empty-actions">
                <button type="button" class="btn small primary" data-act="new-task">${icon('plus')}Tambah tugas</button>
                <button type="button" class="btn small ghost" data-act="templates">${icon('layers')}Pakai template</button>
              </div>
              ${P.templatesUI.suggestionCard(ctx.date)}
            </div>`}
      </section>`;
  }

  function nextPanel(ctx, tasks) {
    if (ctx.date !== ctx.today) return '';
    const next = L.nextTask(tasks, ctx.nowMin);
    if (!next) {
      return `
        <section class="panel next">
          <div class="panel-head"><h2>Berikutnya</h2></div>
          <p class="muted">Tidak ada jadwal berjam yang tersisa hari ini.</p>
        </section>`;
    }
    const running = next.status === 'berjalan';
    return `
      <section class="panel next${running ? ' is-running' : ''}" data-id="${esc(next.task.id)}">
        <div class="panel-head">
          <h2>${running ? 'Sedang berjalan' : 'Berikutnya'}</h2>
          <span class="pill">${running ? `sisa ${esc(D.formatDuration(next.minutes))}` : `dalam ${esc(D.formatDuration(next.minutes))}`}</span>
        </div>
        <p class="next-title">${esc(next.task.title)}</p>
        <p class="next-meta"><span class="time">${esc(P.ui.timeRange(next.task))}</span>${P.ui.catChip(next.task.category)}</p>
        <div class="next-actions">
          <button type="button" class="btn small primary" data-act="focus-task">${icon('timer')}Mulai fokus</button>
          <button type="button" class="btn small ghost" data-action="toggle-task">${icon('check')}Tandai selesai</button>
        </div>
      </section>`;
  }

  function prayerPanel(ctx) {
    const s = ctx.state.settings;
    if (!s.prayerEnabled) return '';
    const city = P.prayer.findCity(s.prayerCity);
    const list = P.prayer.times(ctx.date, city);
    const next = ctx.date === ctx.today ? P.prayer.next(list, ctx.nowMin) : null;
    return `
      <section class="panel prayer">
        <div class="panel-head">
          <h2>Waktu sholat</h2>
          <span class="panel-note">${esc(city.name)} · ${esc(city.zone)}</span>
        </div>
        ${next ? `<p class="prayer-next"><strong>${esc(next.label)}</strong> dalam ${esc(D.formatDuration(next.minutes - ctx.nowMin))}</p>` : ''}
        <ol class="prayer-list">
          ${list.map((p) => `
            <li class="${next && p.id === next.id ? 'is-next' : ''}${ctx.date === ctx.today && p.minutes <= ctx.nowMin ? ' is-past' : ''}">
              <span>${esc(p.label)}</span><span class="time">${esc(p.time)}</span>
            </li>`).join('')}
        </ol>
        <p class="hint">Perkiraan kriteria Kemenag; bisa selisih 1–2 menit.</p>
      </section>`;
  }

  function proverbPanel(date) {
    const p = L.pickForDate(date, P.proverbs);
    if (!p) return '';
    return `
      <section class="panel proverb">
        <h2 class="eyebrow">Peribahasa hari ini</h2>
        <blockquote>${esc(p.text)}</blockquote>
        <p>${esc(p.meaning)}</p>
      </section>`;
  }

  function waterPanel(ctx) {
    const n = ctx.state.water[ctx.date] || 0;
    const goal = ctx.state.settings.waterGoal;
    const slots = Math.max(goal, n);
    const liters = (n * 0.25).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    return `
      <section class="panel water">
        <div class="panel-head">
          <h2>Air minum</h2>
          <span class="panel-note"><strong>${n}</strong>/${goal} gelas · ${liters} liter</span>
        </div>
        <div class="glasses" role="group" aria-label="Jumlah gelas air">
          ${Array.from({ length: slots }, (_, i) => `
            <button type="button" class="glass${i < n ? ' full' : ''}" data-glass="${i}" aria-label="${i + 1} gelas" aria-pressed="${i < n}">${icon('drop')}</button>`).join('')}
          <button type="button" class="glass add" data-glass="${slots}" aria-label="Tambah satu gelas">${icon('plus')}</button>
        </div>
        <p class="hint">Satu gelas dihitung 250 ml.</p>
      </section>`;
  }

  function habitsPanel(ctx) {
    const habits = ctx.state.habits.filter((h) => !h.archived);
    if (!habits.length) {
      return `
        <section class="panel">
          <div class="panel-head"><h2>Kebiasaan</h2></div>
          <p class="muted">Belum ada kebiasaan yang dilacak.</p>
          <button type="button" class="btn small ghost" data-go="kebiasaan">${icon('plus')}Buat kebiasaan</button>
        </section>`;
    }
    const done = habits.filter((h) => L.habitDoneOn(ctx.state.habitLog, h.id, ctx.date)).length;
    return `
      <section class="panel">
        <div class="panel-head">
          <h2>Kebiasaan</h2>
          <button type="button" class="link-btn" data-go="kebiasaan">${done}/${habits.length} ${icon('arrow')}</button>
        </div>
        <ul class="habit-mini">
          ${habits.map((h) => {
            const on = L.habitDoneOn(ctx.state.habitLog, h.id, ctx.date);
            const streak = L.currentStreak(ctx.state.habitLog, h.id, ctx.date, ctx.today);
            return `
              <li>
                <button type="button" class="habit-check${on ? ' on' : ''}" data-habit="${esc(h.id)}" data-color="${esc(h.color)}" role="checkbox" aria-checked="${on}" data-fk="habit-${esc(h.id)}">
                  <span class="box">${icon('check')}</span>
                  <span class="habit-name">${esc(h.name)}</span>
                </button>
                ${streak ? `<span class="streak" title="Streak ${streak} hari">${icon('flame')}${streak}</span>` : ''}
              </li>`;
          }).join('')}
        </ul>
      </section>`;
  }

  function moodPanel(ctx) {
    const j = P.store.journalFor(ctx.date);
    return `
      <section class="panel">
        <div class="panel-head">
          <h2>Suasana hati</h2>
          <button type="button" class="link-btn" data-go="jurnal">Tulis jurnal ${icon('arrow')}</button>
        </div>
        <div class="moods" role="radiogroup" aria-label="Suasana hati">
          ${L.MOODS.map((m) => `
            <button type="button" class="mood${j.mood === m.value ? ' on' : ''}" data-mood="${m.value}" data-level="${m.value}" role="radio" aria-checked="${j.mood === m.value}" title="${esc(m.label)}" data-fk="mood-${m.value}">
              ${moodFace(m.value)}<span>${esc(m.label)}</span>
            </button>`).join('')}
        </div>
      </section>`;
  }

  function render(ctx) {
    const { state, date } = ctx;
    const tasks = state.tasks.filter((t) => t.date === date);
    const prog = L.progress(tasks);
    const habits = state.habits.filter((h) => !h.archived);
    const habitsDone = habits.filter((h) => L.habitDoneOn(state.habitLog, h.id, date)).length;
    const focus = L.focusMinutesOn(state.focusSessions, date);
    const water = state.water[date] || 0;

    return `
      <section class="hero">
        ${sheet(date)}
        <div class="hero-text">
          <p class="eyebrow">${esc(eyebrow(ctx))}</p>
          <h1 class="hero-title">${esc(headline(ctx, prog))}</h1>
          ${P.store.journalFor(date).intention ? `<p class="intention">${icon('sparkle', 'inline')} <span>${esc(P.store.journalFor(date).intention)}</span></p>` : ''}
          <div class="hero-stats">
            <div class="ring-wrap" title="${prog.pct}% selesai">
              ${ring(prog.pct)}
              <span class="ring-label">${prog.pct}<small>%</small></span>
            </div>
            <dl class="stats-inline">
              <div><dt>Fokus</dt><dd>${esc(D.formatDuration(focus))}</dd></div>
              <div><dt>Air</dt><dd>${water}/${state.settings.waterGoal} gelas</dd></div>
              <div><dt>Kebiasaan</dt><dd>${habitsDone}/${habits.length}</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <form class="quickadd" data-quickadd autocomplete="off">
        <label for="quick-add" class="sr-only">Tambah rencana cepat</label>
        <span class="qa-icon" aria-hidden="true">${icon('plus')}</span>
        <input id="quick-add" name="q" type="text" maxlength="200" placeholder="Tulis rencana, mis. padel sore, solat isya, rapat 14.00">
        <button type="submit" class="btn primary">Tambah</button>
      </form>
      <p class="qa-hint" data-qa-preview>Tulis bebas, kegiatannya dikenali otomatis (mis. <code>padel</code> → Olahraga, <code>solat isya</code> → Ibadah, <code>zoom klien</code> → Kerja) lengkap dengan saran jam. Bisa juga tulis jam (<code>14.00</code>, <code>9.30-11.00</code>, <code>jam 7</code>), <code>#kerja</code> untuk kategori, <code>!</code> untuk prioritas tinggi, <code>*</code> untuk Tiga Prioritas, kata <code>besok</code>, atau pengulangan seperti <code>tiap hari</code> dan <code>setiap senin & kamis</code>.</p>

      ${banners(ctx)}

      <div class="dash">
        <div class="dash-main">
          ${P.ritual.card(ctx)}
          ${priorities(tasks)}
          ${agenda(ctx, tasks)}
        </div>
        <div class="dash-side">
          ${nextPanel(ctx, tasks)}
          ${prayerPanel(ctx)}
          ${proverbPanel(date)}
          ${waterPanel(ctx)}
          ${habitsPanel(ctx)}
          ${moodPanel(ctx)}
        </div>
      </div>`;
  }

  /** Hasil tambah cepat + jenis kegiatan yang dikenali + saran jam (bila jam belum ditulis). */
  function readQuick(text, ctx) {
    const r = L.parseQuickAdd(text);
    if (!r.title) return null;
    const date = r.dayOffset ? D.addDays(ctx.today, r.dayOffset) : ctx.date;
    const { det, recs } = r.start || r.repeat ? { det: P.smart.detect(r.title), recs: [] } : C.smartSuggest(r.title, date);
    return { r, date, det, recs, category: r.category || (det ? det.kind.category : 'pribadi') };
  }

  function previewParse(text, ctx) {
    const q = readQuick(text, ctx);
    if (!q) return null;
    const { r, date, det } = q;
    const parts = [`<strong>${esc(r.title)}</strong>`, esc(D.formatLong(date))];
    if (r.start) parts.push(`<span class="time">${esc(r.start)}–${esc(r.end)}</span>`);
    if (det) parts.push(`<span class="smart-tag">${esc(P.smart.describe(det))}</span>`);
    parts.push(P.ui.catChip(q.category));
    if (r.priority) parts.push(`Prioritas ${esc(P.ui.priorityLabel(r.priority).toLowerCase())}`);
    if (r.starred) parts.push('Tiga Prioritas');
    if (r.repeat) parts.push(`${P.ui.icon('repeat', 'inline')} ${esc(L.describeRule(r.repeat))}`);
    const times = q.recs.length
      ? `<span class="qa-times"><span class="smart-label">Pasang jam:</span>${C.timeChips(q.recs, 'data-qa-time', { none: false })}</span>`
      : '';
    return `${parts.join(' <span class="dot-sep">·</span> ')}${times}`;
  }

  function mount(el, ctx) {
    const store = P.store;
    const form = el.querySelector('[data-quickadd]');
    const input = form.querySelector('input');
    const preview = el.querySelector('[data-qa-preview]');
    const hintHTML = preview.innerHTML;

    input.addEventListener('input', () => {
      const html = input.value.trim() ? previewParse(input.value, ctx) : null;
      preview.innerHTML = html ? `Akan ditambahkan: ${html}` : hintHTML;
      preview.classList.toggle('is-preview', Boolean(html));
    });

    /** Tambahkan dari kotak tambah cepat; `time` = "HH:MM-HH:MM" dari tombol saran jam. */
    const addQuick = (time = null) => {
      const q = readQuick(input.value, ctx);
      if (!q) {
        P.ui.toast('Tulis judul rencananya dulu.', { tone: 'warn' });
        return;
      }
      const { r, date, det, recs } = q;
      const [start, end] = time ? time.split('-') : [r.start, r.end];
      let starred = r.starred;
      if (starred && store.starredCount(date) >= store.MAX_STARRED) {
        starred = false;
        P.ui.toast('Tiga Prioritas sudah penuh, tugas ditambahkan tanpa bintang.', { tone: 'warn' });
      }
      const data = {
        title: r.title, date, start: start || null, end: end || null,
        category: q.category, priority: r.priority || 'sedang', starred,
      };
      if (det) data.kind = det.kind.id;
      const task = store.saveTask(null, data, r.repeat);
      input.value = '';
      preview.innerHTML = hintHTML;
      preview.classList.remove('is-preview');
      const where = det ? ` ke ${L.areaOf(data) === 'kerja' ? 'Rencana Kerja' : 'Rencana Pribadi'} (${P.smart.describe(det)})` : '';
      if (r.repeat) {
        P.ui.toast(`Tugas berulang dibuat: ${L.describeRule(r.repeat).toLowerCase()}.`, { tone: 'success' });
      } else if (!start && recs.length && task) {
        // Fleksibel: tanpa jam dulu, jam yang cocok tinggal satu ketukan.
        P.ui.toast(`"${r.title}" ditambahkan${where}.`, {
          duration: 8000,
          action: `Pasang ${recs[0].start}`,
          onAction: () => store.updateTask(task.id, { start: recs[0].start, end: recs[0].end }),
        });
      } else if (det || date !== ctx.date) {
        P.ui.toast(`Ditambahkan${date !== ctx.date ? ` ke ${D.formatLong(date)}` : ''}${where}.`);
      }
    };

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addQuick();
    });
    preview.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-qa-time]');
      if (chip) addQuick(chip.dataset.qaTime);
    });

    el.addEventListener('click', async (e) => {
      if (C.handleTaskClick(e)) return;
      if (P.templatesUI.handleSuggestClick(e, ctx.date)) return;
      const go = e.target.closest('[data-go]');
      if (go) return ctx.go(go.dataset.go);

      const glass = e.target.closest('[data-glass]');
      if (glass) {
        const i = Number(glass.dataset.glass);
        const n = ctx.state.water[ctx.date] || 0;
        store.setWater(ctx.date, n === i + 1 ? i : i + 1);
        return;
      }
      const habit = e.target.closest('[data-habit]');
      if (habit) {
        P.ui.haptic(8);
        return store.toggleHabit(habit.dataset.habit, ctx.date);
      }

      const mood = e.target.closest('[data-mood]');
      if (mood) {
        const value = Number(mood.dataset.mood);
        const current = store.journalFor(ctx.date).mood;
        return store.setJournal(ctx.date, { mood: current === value ? null : value });
      }

      const act = e.target.closest('[data-act]');
      if (!act) return;
      switch (act.dataset.act) {
        case 'new-task':
          C.openTaskEditor({ defaults: { date: ctx.date } });
          break;
        case 'templates':
          C.openTemplates(ctx.date);
          break;
        case 'focus-task': {
          const id = act.closest('[data-id]').dataset.id;
          P.timer.setTask(id);
          ctx.go('fokus');
          break;
        }
        case 'rollover': {
          const ids = L.rolloverCandidates(ctx.state.tasks, ctx.today).map((t) => t.id);
          store.moveTasks(ids, ctx.today);
          P.ui.toast(`${ids.length} rencana dipindahkan ke hari ini.`, { tone: 'success' });
          break;
        }
        case 'dismiss-rollover':
          ctx.setPref('rolloverDismissed', ctx.today);
          break;
        default:
      }
    });
  }

  (P.views = P.views || {}).beranda = { title: 'Beranda', render, mount };
})(typeof self !== 'undefined' ? self : this);
