/**
 * Rencana Kerja & Pribadi: jam kerja, beban kerja, proyek (dengan tenggat dan
 * kemajuan), atur otomatis di jam kerja, dan laporan kerja siap kirim ke WhatsApp.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;

  const PROJECT_EMOJIS = ['📁', '🚀', '📊', '💡', '🛠️', '📣', '🧾', '🤝', '🎯', '📚', '🏗️', '🧪', '🏡', '🏃', '💰', '✈️'];
  const REPORT_KEY = 'rencana-harian/laporan';
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

  const st = () => P.store.state;
  const fmt = (m) => D.formatTime(m);

  function spaceLabel(area) {
    return area === 'kerja' ? 'Rencana Kerja' : 'Rencana Pribadi';
  }

  /** "Sen–Jum", "Setiap hari", atau "Sen, Rab, Jum". */
  function daysLabel(days) {
    const list = WEEK_ORDER.filter((d) => (days || []).includes(d));
    if (!list.length) return 'Tanpa hari kerja';
    if (list.length === 7) return 'Setiap hari';
    const idx = list.map((d) => WEEK_ORDER.indexOf(d));
    const contiguous = idx.every((v, i) => !i || v === idx[i - 1] + 1);
    if (contiguous && list.length >= 3) return `${D.DAYS_SHORT[list[0]]}–${D.DAYS_SHORT[list[list.length - 1]]}`;
    return list.map((d) => D.DAYS_SHORT[d]).join(', ');
  }

  function dateShort(key, today) {
    return D.relativeLabel(key, today) || `${D.dayShort(key)}, ${D.formatShort(key)}`;
  }

  // ----- Proyek -----

  function projectsIn(area, { all = false } = {}) {
    return st().projects.filter((p) => p.area === area && (all || p.status !== 'selesai'));
  }

  /** Yang aktif dulu; di antaranya, tenggat paling dekat (atau terlambat) di depan. */
  function sortProjects(list) {
    return [...list].sort((a, b) => {
      if ((a.status === 'selesai') !== (b.status === 'selesai')) return a.status === 'selesai' ? 1 : -1;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      if (a.deadline || b.deadline) return a.deadline ? -1 : 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function dueTone(project, stats) {
    if (project.status === 'selesai') return 'done';
    if (stats.daysLeft == null) return 'none';
    if (stats.daysLeft < 0) return 'late';
    if (stats.daysLeft <= 3) return 'soon';
    return 'ok';
  }

  function dueText(project, stats) {
    return project.status === 'selesai' ? 'Selesai' : L.deadlineLabel(stats.daysLeft);
  }

  /** Label proyek di baris tugas. */
  function projectChip(task) {
    if (!task.projectId) return '';
    const pj = P.store.findProject(task.projectId);
    return pj ? `<span class="chip proj" title="Proyek: ${esc(pj.name)}"><span aria-hidden="true">${esc(pj.emoji || '📁')}</span>${esc(pj.name)}</span>` : '';
  }

  function projectCard(pj, today) {
    const s = L.projectStats(pj, st().tasks, today);
    const due = dueText(pj, s);
    return `
      <li>
        <button type="button" class="proj-card" data-project="${esc(pj.id)}" data-tone="${dueTone(pj, s)}">
          <span class="proj-top">
            <span class="proj-emoji" aria-hidden="true">${esc(pj.emoji || '📁')}</span>
            <span class="proj-name">${esc(pj.name)}</span>
            ${due ? `<span class="proj-due">${esc(due)}</span>` : ''}
          </span>
          <span class="proj-bar" aria-hidden="true"><span style="width:${s.pct}%"></span></span>
          <span class="proj-meta">${s.total ? `${s.done}/${s.total} tugas · ${s.pct}%` : 'Belum ada tugas'}${s.overdue ? ` · <span class="proj-late">${s.overdue} terlewat</span>` : ''}</span>
          ${s.next ? `<span class="proj-next">Berikutnya: ${esc(s.next.title)} <span class="muted">· ${esc(dateShort(s.next.date, today))}</span></span>` : ''}
        </button>
      </li>`;
  }

  /** Bagian "Proyek" di halaman Rencana Kerja/Pribadi. */
  function projectsSection(area, ctx) {
    const active = sortProjects(projectsIn(area));
    const total = projectsIn(area, { all: true }).length;
    if (!active.length) {
      return `
        <section class="projects is-empty" data-key="projects-${area}">
          <p class="proj-empty">${icon('folder')}<span>${area === 'kerja'
            ? 'Kelompokkan pekerjaan menjadi proyek agar kemajuan dan tenggatnya terlihat.'
            : 'Punya target pribadi, mis. renovasi kamar atau persiapan lari 10K? Jadikan proyek.'}</span>
            <button type="button" class="link-btn" data-work="project-new" data-area="${area}">${icon('plus')}Buat proyek</button>
            ${total ? `<button type="button" class="link-btn" data-work="projects" data-area="${area}">Proyek selesai (${total})</button>` : ''}
          </p>
        </section>`;
    }
    return `
      <section class="projects" data-key="projects-${area}">
        <div class="section-head">
          <h2>${area === 'kerja' ? 'Proyek kerja' : 'Proyek pribadi'} <span class="count">${active.length}</span></h2>
          <div class="section-actions">
            ${total > active.length ? `<button type="button" class="link-btn" data-work="projects" data-area="${area}">Semua (${total})</button>` : ''}
            <button type="button" class="btn ghost small" data-work="project-new" data-area="${area}">${icon('plus')}Proyek</button>
          </div>
        </div>
        <ul class="proj-grid">${active.map((pj) => projectCard(pj, ctx.today)).join('')}</ul>
      </section>`;
  }

  function projectTaskRow(t, today) {
    const when = `${dateShort(t.date, today)}${t.start ? ` · ${P.ui.timeRange(t)}` : ''}`;
    const late = !t.done && t.date < today;
    return `
      <li class="task compact${t.done ? ' is-done' : ''}" data-id="${esc(t.id)}">
        <button type="button" class="check" role="checkbox" aria-checked="${t.done}" data-action="toggle-task" aria-label="Tandai selesai: ${esc(t.title)}">${icon('check')}</button>
        <div class="task-main">
          <button type="button" class="task-title" data-action="edit-task"><span class="tt">${esc(t.title)}</span></button>
          <div class="task-meta">
            <span class="time${late ? ' is-late' : ''}">${esc(when)}${late ? ' · terlewat' : ''}</span>
            ${t.priority === 'tinggi' ? '<span class="prio" data-prio="tinggi">Prioritas tinggi</span>' : ''}
          </div>
        </div>
        <div class="task-actions">
          <button type="button" class="icon-btn" data-pv="reveal" aria-label="Buka di Rencana" title="Buka di Rencana">${icon('arrow')}</button>
        </div>
      </li>`;
  }

  function projectViewHTML(pj, today) {
    const all = st().tasks.filter((t) => t.projectId === pj.id);
    const s = L.projectStats(pj, st().tasks, today);
    const byDate = (a, b) => a.date.localeCompare(b.date) || (a.start || '99').localeCompare(b.start || '99');
    const open = all.filter((t) => !t.done).sort(byDate);
    const done = all.filter((t) => t.done).sort((a, b) => byDate(b, a));
    const due = pj.deadline
      ? `Tenggat <strong>${esc(D.formatLong(pj.deadline))}</strong>${pj.status === 'selesai' ? '' : ` · <span class="proj-due-text" data-tone="${dueTone(pj, s)}">${esc(L.deadlineLabel(s.daysLeft))}</span>`}`
      : 'Tanpa tenggat';
    return `
      <div class="proj-summary">
        <div class="progress-bar"><span style="width:${s.pct}%"></span></div>
        <p><strong>${s.done}</strong> dari ${s.total} tugas selesai · ${s.pct}%</p>
        <p class="muted">${pj.area === 'kerja' ? '💼' : '🏡'} ${esc(spaceLabel(pj.area))} · ${due}${pj.status === 'selesai' ? ' · <strong>Selesai</strong>' : ''}</p>
      </div>
      ${pj.notes ? `<p class="proj-notes">${esc(pj.notes)}</p>` : ''}
      <div class="button-row">
        <button type="button" class="btn primary small" data-pv="add">${icon('plus')}Tambah tugas</button>
        <button type="button" class="btn ghost small" data-pv="edit">${icon('edit')}Ubah</button>
        <button type="button" class="btn ghost small" data-pv="status">${pj.status === 'selesai' ? `${icon('reset')}Aktifkan lagi` : `${icon('check')}Tandai selesai`}</button>
        <button type="button" class="btn ghost small danger-text" data-pv="delete">${icon('trash')}Hapus</button>
      </div>
      <h3 class="dialog-sub">Belum selesai <span class="muted">${open.length}</span></h3>
      ${open.length
        ? `<ul class="tasks">${open.map((t) => projectTaskRow(t, today)).join('')}</ul>`
        : `<p class="muted">${all.length ? 'Semua tugas proyek ini sudah selesai. 🎉' : 'Belum ada tugas. Pecah proyek ini menjadi langkah-langkah kecil lewat tombol Tambah tugas.'}</p>`}
      ${done.length ? `
        <details class="proj-done">
          <summary>Selesai <span class="muted">${done.length}</span></summary>
          <ul class="tasks">${done.slice(0, 50).map((t) => projectTaskRow(t, today)).join('')}</ul>
        </details>` : ''}`;
  }

  /** Detail proyek: kemajuan, tugas-tugasnya, dan aksi. */
  function openProject(id, { date } = {}) {
    const pj = P.store.findProject(id);
    if (!pj) return;
    let unsub = null;
    P.ui.openDialog({
      title: `${pj.emoji || '📁'} ${pj.name}`,
      size: 'wide',
      body: '<div class="proj-view" data-proj-view></div>',
      onMount(el, close) {
        const host = el.querySelector('[data-proj-view]');
        const paint = () => {
          const cur = P.store.findProject(id);
          if (!cur) return;
          const open = host.querySelector('details.proj-done');
          const keepOpen = open && open.open;
          host.innerHTML = projectViewHTML(cur, D.todayKey());
          if (keepOpen) host.querySelector('details.proj-done').open = true;
        };
        paint();
        unsub = P.store.subscribe(paint);
        host.addEventListener('click', async (e) => {
          const pv = e.target.closest('[data-pv]');
          const cur = P.store.findProject(id);
          if (!cur) return;
          if (pv && pv.dataset.pv === 'reveal') {
            const row = pv.closest('[data-id]');
            const t = row && P.store.findTask(row.dataset.id);
            close();
            if (t) P.app.reveal(t.id, t.date);
            return;
          }
          if (P.components.handleTaskClick(e)) return;
          if (!pv) return;
          switch (pv.dataset.pv) {
            case 'add': {
              const sel = date || P.app.selected();
              const today = D.todayKey();
              P.components.openTaskEditor({
                defaults: {
                  date: sel < today ? today : sel,
                  area: cur.area,
                  category: cur.area === 'kerja' ? 'kerja' : 'pribadi',
                  projectId: cur.id,
                },
              });
              break;
            }
            case 'edit':
              openProjectEditor(cur, { onDone: (saved) => openProject((saved || cur).id, { date }) });
              break;
            case 'status': {
              const finishing = cur.status !== 'selesai';
              if (finishing) P.ui.confetti(pv, { count: 50 });
              P.store.setProjectStatus(cur.id, finishing ? 'selesai' : 'aktif');
              if (finishing) P.ui.toast(`Proyek "${cur.name}" selesai. Mantap!`, { tone: 'success' });
              break;
            }
            case 'delete': {
              const ok = await P.ui.confirmDialog({
                title: 'Hapus proyek?',
                message: `Proyek "${cur.name}" akan dihapus. Tugas-tugasnya tetap ada, hanya tidak lagi tertaut ke proyek.`,
                confirmText: 'Hapus proyek',
                danger: true,
              });
              if (!ok) return;
              const removed = P.store.deleteProject(cur.id);
              if (removed) {
                P.ui.toast(`Proyek "${cur.name}" dihapus.`, { action: 'Urungkan', onAction: () => P.store.restoreProject(removed) });
              }
              break;
            }
            default:
          }
        });
      },
      onClose() {
        if (unsub) unsub();
      },
    });
  }

  /**
   * Formulir proyek baru / ubah proyek.
   * @param {object|null} pj
   * @param {{area?: string, onDone?: Function}} opts onDone(saved|null) dipanggil setelah simpan atau Kembali
   */
  function openProjectEditor(pj, { area = 'kerja', onDone } = {}) {
    const p = pj || { name: '', emoji: area === 'kerja' ? '📁' : '🎯', area, deadline: null, notes: '' };
    P.ui.openDialog({
      title: pj ? 'Ubah proyek' : area === 'kerja' ? 'Proyek kerja baru' : 'Proyek pribadi baru',
      body: `
        <form class="form" novalidate>
          <div class="field-row tpl-head">
            <div class="field compact tpl-emoji-field">
              <label for="pj-emoji">Ikon</label>
              <input id="pj-emoji" name="emoji" type="text" maxlength="8" value="${esc(p.emoji || '')}" autocomplete="off">
            </div>
            <div class="field">
              <label for="pj-name">Nama proyek</label>
              <input id="pj-name" name="name" type="text" maxlength="80" required value="${esc(p.name)}" placeholder="${p.area === 'kerja' ? 'Mis. Peluncuran aplikasi v2' : 'Mis. Renovasi kamar'}" autofocus>
            </div>
          </div>
          <div class="emoji-picks" role="group" aria-label="Pilih ikon">
            ${PROJECT_EMOJIS.map((em) => `<button type="button" class="emoji-pick" data-emoji="${esc(em)}" aria-label="Pakai ikon ${esc(em)}">${esc(em)}</button>`).join('')}
          </div>
          <div class="field-row">
            <fieldset class="field compact">
              <legend>Masuk ke</legend>
              <div class="segmented small" role="radiogroup">
                ${L.AREAS.map((a) => `<label><input type="radio" name="area" value="${a.id}" ${p.area === a.id ? 'checked' : ''}><span>${a.emoji} ${esc(a.label)}</span></label>`).join('')}
              </div>
            </fieldset>
            <div class="field compact">
              <label for="pj-deadline">Tenggat <span class="muted">(opsional)</span></label>
              <input id="pj-deadline" name="deadline" type="date" value="${esc(p.deadline || '')}">
            </div>
          </div>
          <div class="field">
            <label for="pj-notes">Catatan <span class="muted">(opsional)</span></label>
            <textarea id="pj-notes" name="notes" rows="3" maxlength="2000" placeholder="Tujuan, target, tautan dokumen, atau orang yang terlibat">${esc(p.notes || '')}</textarea>
          </div>
          <p class="form-error" role="alert" hidden></p>
          <div class="dialog-actions">
            ${pj && onDone ? `<button type="button" class="btn ghost" data-back>${icon('left')}Kembali</button>` : ''}
            <span class="spacer"></span>
            ${pj ? '' : '<button type="button" class="btn ghost" data-close>Batal</button>'}
            <button type="submit" class="btn primary">${pj ? 'Simpan proyek' : 'Buat proyek'}</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const error = form.querySelector('.form-error');
        form.addEventListener('click', (e) => {
          const pick = e.target.closest('[data-emoji]');
          if (pick) form.emoji.value = pick.dataset.emoji;
          if (e.target.closest('[data-back]')) onDone(null);
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          let saved;
          try {
            saved = P.store.saveProject({
              id: pj ? pj.id : undefined,
              name: form.name.value,
              emoji: form.emoji.value,
              area: new FormData(form).get('area'),
              deadline: form.deadline.value || null,
              notes: form.notes.value,
            });
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            return;
          }
          P.ui.toast(pj ? 'Proyek disimpan.' : `Proyek "${saved.name}" dibuat. Tambahkan tugas-tugasnya.`, { tone: 'success' });
          if (onDone) onDone(saved);
          else if (!pj) openProject(saved.id);
          else close();
        });
      },
    });
  }

  /** Semua proyek di satu ruang, termasuk yang sudah selesai. */
  function openProjects(area) {
    const today = D.todayKey();
    const list = sortProjects(projectsIn(area, { all: true }));
    P.ui.openDialog({
      title: area === 'kerja' ? 'Proyek kerja' : 'Proyek pribadi',
      size: 'wide',
      body: `
        <div class="button-row tight">
          <button type="button" class="btn primary small" data-new>${icon('plus')}Proyek baru</button>
        </div>
        ${list.length ? `<ul class="proj-grid in-dialog">${list.map((pj) => projectCard(pj, today)).join('')}</ul>`
          : '<p class="muted">Belum ada proyek.</p>'}`,
      onMount(el) {
        el.addEventListener('click', (e) => {
          const card = e.target.closest('[data-project]');
          if (card) openProject(card.dataset.project);
          else if (e.target.closest('[data-new]')) openProjectEditor(null, { area });
        });
      },
    });
  }

  // ----- Jam kerja -----

  function workStatus(w, ctx) {
    if (!w.isWorkday) return { tone: 'off', text: 'Hari libur kerja' };
    if (ctx.date !== ctx.today) return null;
    const now = ctx.nowMin;
    if (now < w.start) return { tone: 'wait', text: `Mulai ${fmt(w.start)}` };
    if (now >= w.end) return { tone: 'done', text: 'Jam kerja selesai' };
    if (w.rest && now >= w.rest[0] && now < w.rest[1]) return { tone: 'rest', text: `Istirahat s.d. ${fmt(w.rest[1])}` };
    return { tone: 'on', text: `Jam kerja · sisa ${D.formatDuration(w.end - now)}` };
  }

  /** Kartu ringkasan di Rencana Kerja: jam kerja, tugas selesai, dan beban jam kerja. */
  function workCard(ctx, tasks) {
    const s = st().settings;
    const w = L.workWindow(s, ctx.date);
    const cap = L.capacityIn(tasks, w.start, w.end, w.rest ? [w.rest] : []);
    const prog = L.progress(tasks);
    const status = workStatus(w, ctx);
    const level = cap.pct >= 100 ? 'full' : cap.pct >= 80 ? 'busy' : 'ok';
    const canAuto = cap.untimed > 0 && D.diffDays(ctx.today, ctx.date) >= 0;
    return `
      <section class="work-card" data-key="work-card">
        <div class="work-head">
          <span class="work-icon" aria-hidden="true">${icon('briefcase')}</span>
          <div class="work-hours">
            <p class="work-title">Jam kerja <strong>${fmt(w.start)}–${fmt(w.end)}</strong></p>
            <p class="muted">${w.rest ? `Istirahat ${fmt(w.rest[0])}–${fmt(w.rest[1])} · ` : ''}${esc(D.formatDuration(w.minutes))} efektif · <span class="work-days">${esc(daysLabel(s.workDays))}</span></p>
          </div>
          ${status ? `<span class="work-status" data-tone="${status.tone}">${esc(status.text)}</span>` : ''}
          <button type="button" class="icon-btn" data-work="hours" aria-label="Atur jam kerja" title="Atur jam kerja">${icon('sliders')}</button>
        </div>
        ${tasks.length ? `
          <div class="work-meters">
            <div class="work-meter">
              <p class="work-meter-top"><span>Tugas kerja selesai</span><strong>${prog.done}/${prog.total}</strong></p>
              <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${prog.pct}" aria-label="Kemajuan tugas kerja"><span style="width:${prog.pct}%"></span></div>
            </div>
            <div class="work-meter" data-level="${level}">
              <p class="work-meter-top"><span>Beban jam kerja</span><strong>${cap.pct}%</strong></p>
              <div class="capacity-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, cap.pct)}" aria-label="Jam kerja terisi"><span style="width:${Math.min(100, cap.pct)}%"></span></div>
              <p class="work-meter-note">${esc(D.formatDuration(cap.scheduled))} terjadwal · luang ${esc(D.formatDuration(cap.free))}${cap.untimed ? ` · ${cap.untimed} belum berjam` : ''}${level === 'full' ? ' · <span class="cap-warn">melebihi jam kerja</span>' : ''}</p>
            </div>
          </div>` : ''}
        <div class="button-row">
          ${canAuto ? `<button type="button" class="btn secondary small" data-work="auto">${icon('sparkle')}Atur otomatis di jam kerja</button>` : ''}
          <button type="button" class="btn ghost small" data-work="report">${icon('report')}Laporan kerja</button>
          ${tasks.length ? `<button type="button" class="btn ghost small" data-work="save-template">${icon('bookmark')}Simpan sebagai template</button>` : ''}
        </div>
      </section>`;
  }

  /** Jadwalkan tugas kerja tanpa jam ke celah kosong di jam kerja (istirahat & sholat dilewati). */
  function autoScheduleWork(date) {
    const s = st().settings;
    const w = L.workWindow(s, date);
    const today = D.todayKey();
    const pool = st().tasks.filter((t) => t.date === date && (t.start || L.areaOf(t) === 'kerja'));
    const plan = L.autoSchedule(pool, {
      startMin: w.start,
      endMin: w.end,
      fromMin: date === today ? D.minutesOfDay(new Date()) + 10 : 0,
      blocked: [...(w.rest ? [w.rest] : []), ...P.ritual.prayerBlocks(date)],
    });
    if (!plan.length) {
      P.ui.toast(pool.some((t) => !t.start && !t.done)
        ? 'Tidak ada celah kosong yang cukup di sisa jam kerja.'
        : 'Semua tugas kerja sudah punya jam.', { tone: 'warn' });
      return 0;
    }
    const before = P.store.applySchedule(plan);
    P.ui.toast(`${plan.length} tugas kerja dijadwalkan di jam kerja.`, {
      tone: 'success',
      action: 'Urungkan',
      onAction: () => P.store.applySchedule(before),
    });
    return plan.length;
  }

  /** Jadwalkan tugas pribadi tanpa jam di luar jam kerja (pada hari kerja). */
  function autoSchedulePersonal(date) {
    const s = st().settings;
    const w = L.workWindow(s, date);
    const today = D.todayKey();
    const pool = st().tasks.filter((t) => t.date === date && (t.start || L.areaOf(t) === 'pribadi'));
    const plan = L.autoSchedule(pool, {
      dayStart: s.dayStart,
      dayEnd: s.dayEnd,
      fromMin: date === today ? D.minutesOfDay(new Date()) + 10 : 0,
      blocked: [...(w.isWorkday ? [[w.start, w.end]] : []), ...P.ritual.prayerBlocks(date)],
    });
    if (!plan.length) {
      P.ui.toast(pool.some((t) => !t.start && !t.done)
        ? 'Tidak ada celah kosong yang cukup di luar jam kerja.'
        : 'Semua tugas pribadi sudah punya jam.', { tone: 'warn' });
      return 0;
    }
    const before = P.store.applySchedule(plan);
    P.ui.toast(`${plan.length} tugas pribadi dijadwalkan${w.isWorkday ? ' di luar jam kerja' : ''}.`, {
      tone: 'success',
      action: 'Urungkan',
      onAction: () => P.store.applySchedule(before),
    });
    return plan.length;
  }

  function openWorkHours() {
    const s = st().settings;
    P.ui.openDialog({
      title: 'Jam kerja',
      body: `
        <form class="form" novalidate>
          <p class="dialog-text">Dipakai Rencana Kerja untuk menghitung beban kerja, menata tugas otomatis, dan menandai jam kerja di linimasa.</p>
          <div class="field-row">
            <div class="field compact">
              <label for="wk-start-h">Jam masuk</label>
              ${P.ui.timeSelect({ id: 'wk-start', name: 'workStart', value: s.workStart, optional: false, label: 'Jam masuk' })}
            </div>
            <div class="field compact">
              <label for="wk-end-h">Jam pulang</label>
              ${P.ui.timeSelect({ id: 'wk-end', name: 'workEnd', value: s.workEnd, optional: false, label: 'Jam pulang' })}
            </div>
          </div>
          <div class="field-row">
            <div class="field compact">
              <label for="wk-break-start-h">Istirahat mulai</label>
              ${P.ui.timeSelect({ id: 'wk-break-start', name: 'breakStart', value: s.breakStart || '', label: 'Istirahat mulai' })}
            </div>
            <div class="field compact">
              <label for="wk-break-end-h">Istirahat selesai</label>
              ${P.ui.timeSelect({ id: 'wk-break-end', name: 'breakEnd', value: s.breakEnd || '', label: 'Istirahat selesai' })}
            </div>
          </div>
          <fieldset class="field">
            <legend>Hari kerja</legend>
            <div class="weekday-picks" role="group" aria-label="Hari kerja">
              ${WEEK_ORDER.map((d) => `
                <label class="pick day-pick${d === 0 ? ' is-sunday' : ''}">
                  <input type="checkbox" name="workDays" value="${d}" ${(s.workDays || []).includes(d) ? 'checked' : ''}>
                  <span>${esc(D.DAYS_SHORT[d])}</span>
                </label>`).join('')}
            </div>
            <p class="hint">Kosongkan kedua jam istirahat bila tidak ada jam istirahat tetap.</p>
          </fieldset>
          <p class="form-error" role="alert" hidden></p>
          <div class="dialog-actions">
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn primary">Simpan jam kerja</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const error = form.querySelector('.form-error');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const v = (k) => String(fd.get(k) || '');
          const fail = (msg) => {
            error.textContent = msg;
            error.hidden = false;
          };
          const start = D.parseTime(v('workStart'));
          const end = D.parseTime(v('workEnd'));
          if (start == null || end == null) return fail('Isi jam masuk dan jam pulang.');
          if (end <= start) return fail('Jam pulang harus setelah jam masuk.');
          const bs = D.parseTime(v('breakStart'));
          const be = D.parseTime(v('breakEnd'));
          if ((bs == null) !== (be == null)) return fail('Isi kedua jam istirahat, atau kosongkan keduanya.');
          if (bs != null && (be <= bs || bs < start || be > end)) return fail('Jam istirahat harus di dalam jam kerja dan selesai setelah mulai.');
          const days = fd.getAll('workDays').map(Number);
          if (!days.length) return fail('Pilih minimal satu hari kerja.');
          P.store.setSettings({
            workStart: fmt(start),
            workEnd: fmt(end),
            breakStart: bs == null ? '' : fmt(bs),
            breakEnd: be == null ? '' : fmt(be),
            workDays: [...new Set(days)].sort((a, b) => a - b),
          });
          P.ui.toast('Jam kerja disimpan.', { tone: 'success' });
          close();
        });
      },
    });
  }

  // ----- Laporan kerja -----

  function loadDraft(date) {
    try {
      const d = JSON.parse(root.localStorage.getItem(REPORT_KEY) || 'null');
      if (d && d.date === date) return { date, blockers: String(d.blockers || ''), notes: String(d.notes || '') };
    } catch {
      /* draf bersifat opsional */
    }
    return { date, blockers: '', notes: '' };
  }

  function saveDraft(draft) {
    try {
      root.localStorage.setItem(REPORT_KEY, JSON.stringify(draft));
    } catch {
      /* abaikan */
    }
  }

  function reportText(date, mode, draft, withNext) {
    const s = st().settings;
    const work = st().tasks.filter((t) => L.areaOf(t) === 'kerja');
    const common = {
      name: s.name, projects: st().projects, blockers: draft.blockers, notes: draft.notes,
      sections: P.ops ? P.ops.reportSections(date, mode) : [],
    };
    if (mode === 'pekan') {
      return L.workReportWeek({ ...common, keys: D.weekKeys(date), tasks: work, today: D.todayKey() });
    }
    const nextDate = L.nextWorkday(date, s.workDays);
    return L.workReport({
      ...common,
      date,
      tasks: work.filter((t) => t.date === date),
      next: withNext ? work.filter((t) => t.date === nextDate) : null,
      nextDate: withNext ? nextDate : null,
    });
  }

  /** Laporan kerja harian/mingguan untuk atasan atau grup kantor. */
  function openReport(date, { mode = 'hari' } = {}) {
    const s = st().settings;
    const nextDate = L.nextWorkday(date, s.workDays);
    // Pastikan tugas berulang pekan ini & hari kerja berikutnya ikut terhitung.
    P.store.materialize([...D.weekKeys(date), nextDate]);
    const draft = loadDraft(date);
    let current = mode;
    P.ui.openDialog({
      title: 'Laporan kerja',
      body: `
        <div class="segmented" role="group" aria-label="Periode laporan">
          <button type="button" data-rmode="hari" aria-pressed="${current === 'hari'}">Harian</button>
          <button type="button" data-rmode="pekan" aria-pressed="${current === 'pekan'}">Mingguan</button>
        </div>
        <div class="field-row report-fields">
          <div class="field">
            <label for="rep-blockers">Kendala <span class="muted">(opsional)</span></label>
            <textarea id="rep-blockers" rows="2" maxlength="1000" placeholder="Mis. Menunggu data dari tim keuangan">${esc(draft.blockers)}</textarea>
          </div>
          <div class="field">
            <label for="rep-notes">Catatan <span class="muted">(opsional)</span></label>
            <textarea id="rep-notes" rows="2" maxlength="1000" placeholder="Hal lain yang perlu diketahui">${esc(draft.notes)}</textarea>
          </div>
        </div>
        <label class="switch-row" data-next-row ${current === 'hari' ? '' : 'hidden'}>
          <input id="rep-next" type="checkbox" checked>
          <span>Sertakan rencana ${esc(D.dayName(nextDate))}, ${esc(D.formatShort(nextDate))}</span>
        </label>
        <label class="legend" for="rep-text">Pratinjau</label>
        <textarea id="rep-text" class="share-text" rows="12" readonly></textarea>
        <div class="button-row">
          <button type="button" class="btn primary" data-rep="copy">${icon('copy')}Salin teks</button>
          <a class="btn ghost" data-rep="wa" href="#" target="_blank" rel="noopener">${icon('share')}Buka WhatsApp</a>
        </div>
        <p class="hint">Berisi agenda & rencana kerja, retur, dan Delivery Order. Nama pelapor diambil dari Pengaturan.</p>`,
      onMount(el) {
        const text = el.querySelector('#rep-text');
        const wa = el.querySelector('[data-rep="wa"]');
        const blockers = el.querySelector('#rep-blockers');
        const notes = el.querySelector('#rep-notes');
        const next = el.querySelector('#rep-next');
        const nextRow = el.querySelector('[data-next-row]');
        const paint = () => {
          draft.blockers = blockers.value;
          draft.notes = notes.value;
          const out = reportText(date, current, draft, next.checked);
          text.value = out;
          wa.href = `https://wa.me/?text=${encodeURIComponent(out)}`;
          nextRow.hidden = current !== 'hari';
          el.querySelectorAll('[data-rmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rmode === current)));
        };
        paint();
        blockers.addEventListener('input', () => { paint(); saveDraft(draft); });
        notes.addEventListener('input', () => { paint(); saveDraft(draft); });
        next.addEventListener('change', paint);
        el.addEventListener('click', async (e) => {
          const m = e.target.closest('[data-rmode]');
          if (m) {
            current = m.dataset.rmode;
            paint();
            return;
          }
          if (e.target.closest('[data-rep="copy"]')) {
            if (await P.ui.copyText(text.value)) {
              P.ui.toast('Laporan disalin. Tempel di WhatsApp atau email.', { tone: 'success' });
            } else {
              text.focus();
              text.select();
              P.ui.toast('Browser menolak papan klip. Teks sudah dipilih, salin manual.', { tone: 'warn' });
            }
          }
        });
      },
    });
  }

  // ----- Klik bersama di halaman Rencana -----

  /** @returns {boolean} true bila klik ditangani */
  function handleClick(e, ctx) {
    if (P.ops && P.ops.handleClick(e, ctx)) return true;
    const card = e.target.closest('[data-project]');
    if (card) {
      openProject(card.dataset.project, { date: ctx.date });
      return true;
    }
    const b = e.target.closest('[data-work]');
    if (!b) return false;
    const area = b.dataset.area || 'kerja';
    switch (b.dataset.work) {
      case 'hours': openWorkHours(); break;
      case 'auto': autoScheduleWork(ctx.date); break;
      case 'auto-personal': autoSchedulePersonal(ctx.date); break;
      case 'report': openReport(ctx.date); break;
      case 'project-new': openProjectEditor(null, { area }); break;
      case 'projects': openProjects(area); break;
      case 'save-template': {
        const data = P.store.templateFromDate(ctx.date, 'kerja');
        data.name = `Kerja ${D.dayName(ctx.date)}`;
        P.templatesUI.openEditor(data, { kind: 'new' });
        break;
      }
      default: return false;
    }
    return true;
  }

  P.work = {
    daysLabel, projectChip, projectsSection, workCard, autoScheduleWork, autoSchedulePersonal, handleClick, spaceLabel,
    openProject, openProjectEditor, openProjects, openWorkHours, openReport, sortProjects,
  };
})(typeof self !== 'undefined' ? self : this);
