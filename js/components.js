/**
 * Komponen tugas yang dipakai beberapa tampilan: baris tugas, editor tugas,
 * pemilih template, dan penanganan klik bersama.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon, catChip, timeRange } = P.ui;

  function taskRow(task, { compact = false, showSubtasks = !compact } = {}) {
    const subsDone = task.subtasks.filter((s) => s.done).length;
    const meta = [];
    if (task.start) meta.push(`<span class="time">${esc(timeRange(task))}</span>`);
    meta.push(catChip(task.category));
    if (task.projectId && P.work) meta.push(P.work.projectChip(task));
    if (task.priority === 'tinggi') meta.push('<span class="prio" data-prio="tinggi">Prioritas tinggi</span>');
    if (task.priority === 'rendah' && !compact) meta.push('<span class="prio" data-prio="rendah">Santai</span>');
    if (task.subtasks.length && (compact || !showSubtasks)) {
      meta.push(`<span class="meta-item">${subsDone}/${task.subtasks.length} subtugas</span>`);
    }
    if (task.pomodoros) {
      meta.push(`<span class="meta-item" title="Sesi fokus">${icon('timer')}${task.pomodoros}</span>`);
    }
    if (task.seriesId) {
      const rule = L.describeRule(P.store.findSeries(task.seriesId));
      meta.push(`<span class="meta-item" title="${esc(rule)}">${icon('repeat')}${compact ? '' : esc(rule)}</span>`);
    }
    if (task.notes && !compact) meta.push(`<span class="meta-item" title="Ada catatan">${icon('note')}</span>`);

    const subs = showSubtasks && task.subtasks.length
      ? `<ul class="subtasks">${task.subtasks.map((s) => `
          <li>
            <button type="button" class="subcheck" role="checkbox" aria-checked="${s.done}" data-action="toggle-sub" data-sub="${esc(s.id)}" aria-label="${esc(s.title)}">${icon('check')}</button>
            <span class="${s.done ? 'is-done' : ''}">${esc(s.title)}</span>
          </li>`).join('')}</ul>`
      : '';

    return `
      <li class="task${task.done ? ' is-done' : ''}${compact ? ' compact' : ''}" data-id="${esc(task.id)}">
        <button type="button" class="check" role="checkbox" aria-checked="${task.done}" data-action="toggle-task" aria-label="Tandai selesai: ${esc(task.title)}">${icon('check')}</button>
        <div class="task-main">
          <button type="button" class="task-title" data-action="edit-task"><span class="tt">${esc(task.title)}</span></button>
          <div class="task-meta">${meta.join('')}</div>
          ${subs}
        </div>
        <div class="task-actions">
          <button type="button" class="icon-btn star${task.starred ? ' on' : ''}" data-action="star-task" aria-pressed="${task.starred}" aria-label="${task.starred ? 'Lepas dari tiga prioritas' : 'Jadikan prioritas utama'}" title="${task.starred ? 'Lepas dari tiga prioritas' : 'Jadikan prioritas utama'}">${icon('star')}</button>
          ${compact ? '' : `<button type="button" class="icon-btn" data-action="delete-task" aria-label="Hapus tugas" title="Hapus">${icon('trash')}</button>`}
        </div>
      </li>`;
  }

  // ----- Editor tugas -----

  function radioChips(name, options, value) {
    return options.map((o) => `
      <label class="pick" ${name === 'category' ? `data-cat="${o.id}"` : `data-prio="${o.id}"`}>
        <input type="radio" name="${name}" value="${o.id}" ${o.id === value ? 'checked' : ''}>
        <span>${esc(o.label)}</span>
      </label>`).join('');
  }

  function subtaskField(sub) {
    return `
      <li class="sub-edit" data-sub="${esc(sub.id || '')}">
        <input type="checkbox" ${sub.done ? 'checked' : ''} aria-label="Selesai">
        <input type="text" value="${esc(sub.title)}" aria-label="Judul subtugas" maxlength="140">
        <button type="button" class="icon-btn" data-remove-sub aria-label="Hapus subtugas">${icon('x')}</button>
      </li>`;
  }

  // ----- Pengenalan kegiatan & saran jam -----

  /** Kenali jenis kegiatan dari judul dan sarankan jam yang cocok pada tanggal itu. */
  function smartSuggest(title, date, { excludeId = null, minutes = null } = {}) {
    const det = P.smart.detect(title);
    if (!det || !D.isKey(date)) return { det, recs: [] };
    const st = P.store.state;
    const city = P.prayer.findCity(st.settings.prayerCity);
    const prayers = Object.fromEntries(P.prayer.times(date, city).map((p) => [p.id, p.minutes]));
    const recs = P.smart.recommend({
      detection: det, date, tasks: st.tasks, settings: st.settings, prayers, excludeId, minutes,
      nowMin: date === D.todayKey() ? D.minutesOfDay(new Date()) : null,
    });
    return { det, recs };
  }

  /** Tombol-tombol saran jam (dipakai editor tugas & tambah cepat). */
  function timeChips(recs, attr, { none = true } = {}) {
    return `${recs.map((r) => `
      <button type="button" class="smart-time${r.clash ? ' clash' : ''}" ${attr}="${esc(`${r.start}-${r.end}`)}" title="${esc(r.reason)}${r.clash ? ' · bentrok dengan jadwal lain' : ''}">
        <span>${esc(r.label)}</span><strong>${esc(r.start)}–${esc(r.end)}</strong>
      </button>`).join('')}${none ? `<button type="button" class="smart-time ghost" ${attr}="">Kapan saja</button>` : ''}`;
  }

  /** Pilihan proyek untuk satu ruang; proyek yang sedang dipakai tetap tampil walau sudah selesai. */
  function projectOptions(area, selected) {
    const list = P.work.sortProjects(P.store.state.projects.filter((p) => (p.area === area && p.status !== 'selesai') || p.id === selected));
    return `<option value="">Tanpa proyek</option>${list.map((p) => `
      <option value="${esc(p.id)}" ${p.id === selected ? 'selected' : ''}>${esc(p.emoji || '📁')} ${esc(p.name)}${p.status === 'selesai' ? ' (selesai)' : ''}</option>`).join('')}`;
  }

  /**
   * @param {object} opts
   * @param {object} [opts.task] tugas yang diedit; kosong untuk tugas baru
   * @param {object} [opts.defaults] nilai awal tugas baru (date, start, end, title, category, area, projectId)
   */
  function openTaskEditor({ task = null, defaults = {} } = {}) {
    const store = P.store;
    const series = task ? store.findSeries(task.seriesId) : null;
    const t = task || {
      title: '', date: defaults.date, start: defaults.start || null, end: defaults.end || null,
      category: defaults.category || 'pribadi', priority: 'sedang', starred: false, notes: '', subtasks: [],
      area: defaults.area, projectId: defaults.projectId || null,
    };
    const area = L.areaOf(t);
    const hasProjects = store.state.projects.length > 0;
    const repeatRule = series ? series.rule : '';
    const repeatDays = series && series.rule === 'mingguan' ? series.days : [];
    const body = `
      <form class="form" novalidate>
        <div class="field">
          <label for="task-title">Judul</label>
          <input id="task-title" name="title" type="text" required maxlength="140" value="${esc(t.title)}" placeholder="Mis. Padel sore, solat isya, rapat klien" autofocus>
          <div class="smart" data-smart aria-live="polite" hidden></div>
        </div>
        <div class="field-row">
          <fieldset class="field compact">
            <legend>Masuk ke</legend>
            <div class="segmented small area-pick" role="radiogroup" aria-label="Rencana">
              ${L.AREAS.map((a) => `<label><input type="radio" name="area" value="${a.id}" ${area === a.id ? 'checked' : ''}><span>${a.emoji} Rencana ${esc(a.label)}</span></label>`).join('')}
            </div>
          </fieldset>
          <div class="field compact" data-project-field ${hasProjects ? '' : 'hidden'}>
            <label for="task-project">Proyek</label>
            <select id="task-project" name="projectId">${projectOptions(area, t.projectId || '')}</select>
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="task-date">Tanggal</label>
            <input id="task-date" name="date" type="date" required value="${esc(t.date)}">
          </div>
          <div class="field">
            <label for="task-start-h">Mulai</label>
            ${P.ui.timeSelect({ id: 'task-start', name: 'start', value: t.start || '', label: 'Mulai' })}
          </div>
          <div class="field">
            <label for="task-end-h">Selesai</label>
            ${P.ui.timeSelect({ id: 'task-end', name: 'end', value: t.end || '', label: 'Selesai' })}
          </div>
        </div>
        <fieldset class="field">
          <legend>Kategori</legend>
          <div class="picks">${radioChips('category', L.CATEGORIES, t.category)}</div>
        </fieldset>
        <fieldset class="field">
          <legend>Prioritas</legend>
          <div class="picks">${radioChips('priority', L.PRIORITIES, t.priority)}</div>
        </fieldset>
        <div class="field">
          <label for="task-repeat">Ulangi</label>
          <select id="task-repeat" name="repeat">
            ${L.REPEATS.map((r) => `<option value="${r.id}" ${r.id === repeatRule ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
          </select>
          <div class="weekday-picks" data-weekdays ${repeatRule === 'mingguan' ? '' : 'hidden'} role="group" aria-label="Hari pengulangan">
            ${[1, 2, 3, 4, 5, 6, 0].map((d) => `
              <label class="pick day-pick${d === 0 ? ' is-sunday' : ''}">
                <input type="checkbox" name="days" value="${d}" ${repeatDays.includes(d) ? 'checked' : ''}>
                <span>${esc(D.DAYS_SHORT[d])}</span>
              </label>`).join('')}
          </div>
          ${series ? `<p class="hint">Perubahan pada judul, jam, kategori, prioritas, dan catatan juga berlaku untuk jadwal berulang berikutnya.</p>` : ''}
        </div>
        <label class="switch-row">
          <input id="task-starred" type="checkbox" name="starred" ${t.starred ? 'checked' : ''}>
          <span>Masukkan ke <strong>Tiga Prioritas</strong> hari itu</span>
        </label>
        <div class="field">
          <label for="task-notes">Catatan</label>
          <textarea id="task-notes" name="notes" rows="3" maxlength="2000" placeholder="Detail, tautan, atau hal yang perlu diingat">${esc(t.notes)}</textarea>
        </div>
        <div class="field">
          <label for="task-sub-new">Subtugas</label>
          <ul class="sub-list">${t.subtasks.map(subtaskField).join('')}</ul>
          <div class="sub-add">
            <input id="task-sub-new" type="text" maxlength="140" placeholder="Tambah langkah kecil, lalu tekan Enter">
            <button type="button" class="btn ghost small" data-add-sub>${icon('plus')}Tambah</button>
          </div>
        </div>
        <p class="form-error" role="alert" hidden></p>
        <div class="dialog-actions">
          ${task ? `<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')}${series ? 'Hapus hari ini' : 'Hapus'}</button>` : ''}
          ${series ? `<button type="button" class="btn ghost danger-text" data-stop-series>${icon('x')}Hentikan pengulangan</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn ghost" data-close>Batal</button>
          <button type="submit" class="btn primary">${task ? 'Simpan perubahan' : 'Tambah tugas'}</button>
        </div>
      </form>`;

    P.ui.openDialog({
      title: task ? 'Ubah tugas' : 'Tugas baru',
      body,
      onMount(el, close) {
        const form = el.querySelector('form');
        const list = form.querySelector('.sub-list');
        const newSub = form.querySelector('#task-sub-new');
        const error = form.querySelector('.form-error');

        const addSub = () => {
          const title = newSub.value.trim();
          if (!title) return;
          list.insertAdjacentHTML('beforeend', subtaskField({ title, done: false }));
          newSub.value = '';
          newSub.focus();
        };
        form.querySelector('[data-add-sub]').addEventListener('click', addSub);
        newSub.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addSub();
          }
        });
        list.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-remove-sub]');
          if (btn) btn.closest('li').remove();
        });

        // Isi jam selesai otomatis satu jam setelah jam mulai.
        const startEl = form.querySelector('#task-start');
        const endEl = form.querySelector('#task-end');
        startEl.addEventListener('change', () => {
          const s = D.parseTime(startEl.value);
          const e = D.parseTime(endEl.value);
          if (s != null && (e == null || e <= s)) P.ui.setTime(endEl, D.formatTime(Math.min(s + 60, 24 * 60 - 1)));
          if (s == null) P.ui.setTime(endEl, '');
        });

        // Ruang & kategori saling menyesuaikan: kategori Kerja → Rencana Kerja, dan sebaliknya.
        const projectEl = form.querySelector('#task-project');
        const projectField = form.querySelector('[data-project-field]');
        const areaNow = () => (form.querySelector('input[name="area"]:checked') || {}).value || 'pribadi';
        const catNow = () => (form.querySelector('input[name="category"]:checked') || {}).value;
        const setCat = (id) => {
          const r = form.querySelector(`input[name="category"][value="${id}"]`);
          if (r) r.checked = true;
        };
        const paintProjects = () => {
          const keep = projectEl.value;
          projectEl.innerHTML = projectOptions(areaNow(), keep);
          if (![...projectEl.options].some((o) => o.value === keep)) projectEl.value = '';
          projectField.hidden = projectEl.options.length <= 1 && !hasProjects;
        };
        // Kategori/ruang yang dipilih sendiri tidak ditimpa tebakan otomatis.
        let catTouched = Boolean(task);
        let areaTouched = Boolean(task);
        const setArea = (id) => {
          const r = form.querySelector(`input[name="area"][value="${id}"]`);
          if (r) r.checked = true;
        };
        form.addEventListener('change', (e) => {
          if (e.isTrusted && e.target.name === 'category') catTouched = true;
          if (e.isTrusted && e.target.name === 'area') areaTouched = true;
          if (e.target.name === 'area') {
            if (e.target.value === 'kerja' && catNow() === 'pribadi') setCat('kerja');
            if (e.target.value === 'pribadi' && catNow() === 'kerja') setCat('pribadi');
            paintProjects();
          } else if (e.target.name === 'category' && e.target.value === 'kerja' && areaNow() !== 'kerja') {
            form.querySelector('input[name="area"][value="kerja"]').checked = true;
            paintProjects();
          }
        });

        // Kenali kegiatan dari judul ("padel" → Olahraga, "solad" → Ibadah) & sarankan jam.
        const titleEl = form.querySelector('#task-title');
        const dateEl = form.querySelector('#task-date');
        const smartEl = form.querySelector('[data-smart]');
        let smartTimer = null;
        const paintSmart = () => {
          const { det, recs } = smartSuggest(titleEl.value, dateEl.value, { excludeId: task && task.id });
          if (!det) {
            smartEl.hidden = true;
            smartEl.innerHTML = '';
            return;
          }
          const want = det.kind.category;
          if (!catTouched) setCat(want);
          if (!areaTouched && want !== 'belajar') setArea(want === 'kerja' ? 'kerja' : 'pribadi');
          paintProjects();
          const applied = catNow() === want;
          const area = areaNow() === 'kerja' ? 'Rencana Kerja' : 'Rencana Pribadi';
          const picked = `${startEl.value}-${endEl.value}`;
          smartEl.innerHTML = `
            <p class="smart-kind">${icon('sparkle')}<span>Dikenali: <strong>${esc(P.smart.describe(det))}</strong> · ${esc(P.ui.categoryLabel(want))} · ${area}</span>
              ${applied ? '' : `<button type="button" class="link-btn" data-smart-apply>Pakai kategori ${esc(P.ui.categoryLabel(want))}</button>`}</p>
            ${recs.length ? `<div class="smart-times"><span class="smart-label">Jam yang cocok:</span>${timeChips(recs, 'data-smart-time')}</div>`
              : `<p class="smart-note">${det.kind.minutes ? 'Belum ada jam kosong yang cocok di tanggal ini. Isi jamnya sendiri atau biarkan tanpa jam.' : 'Tidak perlu jam khusus; cukup dicentang saat sudah dilakukan.'}</p>`}`;
          smartEl.querySelectorAll('[data-smart-time]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.smartTime === picked || (!b.dataset.smartTime && !startEl.value))));
          smartEl.hidden = false;
        };
        titleEl.addEventListener('input', () => {
          clearTimeout(smartTimer);
          smartTimer = setTimeout(paintSmart, 120);
        });
        dateEl.addEventListener('change', paintSmart);
        smartEl.addEventListener('click', (e) => {
          const chip = e.target.closest('[data-smart-time]');
          if (chip) {
            const [a, b] = chip.dataset.smartTime ? chip.dataset.smartTime.split('-') : ['', ''];
            P.ui.setTime(startEl, a);
            P.ui.setTime(endEl, b);
            smartEl.querySelectorAll('[data-smart-time]').forEach((x) => x.setAttribute('aria-pressed', String(x === chip)));
            return;
          }
          if (e.target.closest('[data-smart-apply]')) {
            catTouched = false;
            areaTouched = false;
            paintSmart();
          }
        });
        if (titleEl.value.trim()) paintSmart();

        const repeatEl = form.querySelector('#task-repeat');
        const weekdays = form.querySelector('[data-weekdays]');
        repeatEl.addEventListener('change', () => {
          weekdays.hidden = repeatEl.value !== 'mingguan';
          if (repeatEl.value === 'mingguan' && !weekdays.querySelector('input:checked')) {
            const day = D.dayIndex(form.querySelector('#task-date').value || t.date);
            const box = weekdays.querySelector(`input[value="${day}"]`);
            if (box) box.checked = true;
          }
        });

        const stop = form.querySelector('[data-stop-series]');
        if (stop) {
          stop.addEventListener('click', () => {
            const n = store.stopSeries(task.id);
            close();
            P.ui.toast(`Pengulangan dihentikan. ${n} jadwal mulai hari itu dihapus.`);
          });
        }

        const del = form.querySelector('[data-delete]');
        if (del) {
          del.addEventListener('click', () => {
            close();
            removeWithUndo(task.id);
          });
        }

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = String(fd.get('title') || '').trim();
          const date = String(fd.get('date') || '');
          const start = String(fd.get('start') || '') || null;
          const end = String(fd.get('end') || '') || null;
          const showError = (msg) => {
            error.textContent = msg;
            error.hidden = false;
          };
          if (!title) return showError('Judul tugas belum diisi.');
          if (!D.isKey(date)) return showError('Pilih tanggal yang valid.');
          if (end && !start) return showError('Isi jam mulai terlebih dahulu, atau kosongkan jam selesai.');
          if (start && end && D.parseTime(end) <= D.parseTime(start)) {
            return showError('Jam selesai harus setelah jam mulai.');
          }
          const subtasks = [...list.querySelectorAll('li')]
            .map((li) => ({
              id: li.dataset.sub || store.uid('s'),
              title: li.querySelector('input[type="text"]').value.trim(),
              done: li.querySelector('input[type="checkbox"]').checked,
            }))
            .filter((s) => s.title);
          const wantStar = fd.get('starred') === 'on';
          if (wantStar && !(task && task.starred && task.date === date)
            && store.starredCount(date, task && task.id) >= store.MAX_STARRED) {
            return showError('Tiga Prioritas di tanggal itu sudah penuh. Lepas salah satunya dulu.');
          }
          const data = {
            title, date, start, end: start ? end || D.formatTime(Math.min(D.parseTime(start) + 60, 1439)) : null,
            category: fd.get('category') || 'pribadi',
            priority: fd.get('priority') || 'sedang',
            area: fd.get('area') === 'kerja' ? 'kerja' : 'pribadi',
            projectId: String(fd.get('projectId') || '') || null,
            starred: wantStar,
            notes: String(fd.get('notes') || '').trim(),
            subtasks,
          };
          const kindDet = P.smart.detect(title);
          if (kindDet) data.kind = kindDet.kind.id;
          else if (task && task.kind) data.kind = null;
          const repeat = {
            rule: String(fd.get('repeat') || ''),
            days: fd.getAll('days').map(Number),
          };
          try {
            store.saveTask(task, data, repeat);
          } catch (err) {
            return showError(err.message);
          }
          if (task) P.ui.toast('Perubahan disimpan.');
          else P.ui.toast(`Ditambahkan ke ${D.formatLong(date)}${repeat.rule ? ', berulang' : ''}.`);
          close();
        });
      },
    });
  }

  function removeWithUndo(id) {
    const removed = P.store.deleteTask(id);
    if (!removed) return;
    P.ui.toast(`"${removed.title}" dihapus.`, {
      action: 'Urungkan',
      onAction: () => P.store.restoreTask(removed),
    });
  }

  /** Pengelola template (lihat js/templates-ui.js). */
  function openTemplates(date) {
    return P.templatesUI.open(date);
  }

  /** Klik bersama untuk daftar tugas di tampilan mana pun. */
  function handleTaskClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return false;
    const row = btn.closest('[data-id]');
    const id = row && row.dataset.id;
    const store = P.store;
    switch (btn.dataset.action) {
      case 'toggle-task': {
        const t = store.toggleTask(id);
        P.ui.haptic(t && t.done ? 12 : 6);
        if (t && t.done) celebrate(t.date, btn);
        return true;
      }
      case 'star-task':
        if (!store.toggleStar(id)) {
          P.ui.toast('Tiga Prioritas sudah penuh. Lepas salah satunya dulu.', { tone: 'warn' });
        }
        return true;
      case 'edit-task':
        openTaskEditor({ task: store.findTask(id) });
        return true;
      case 'delete-task':
        removeWithUndo(id);
        return true;
      case 'toggle-sub':
        store.toggleSubtask(id, btn.dataset.sub);
        return true;
      default:
        return false;
    }
  }

  /** Bila semua tugas di tanggal itu selesai, beri ucapan singkat. */
  function celebrate(date, origin) {
    const dayTasks = P.store.state.tasks.filter((t) => t.date === date);
    const p = L.progress(dayTasks);
    const stars = dayTasks.filter((t) => t.starred);
    if (p.total > 1 && p.done === p.total) {
      P.ui.confetti(null, { count: 140 });
    } else if (stars.length === P.store.MAX_STARRED && stars.every((t) => t.done) && origin
      && stars.some((t) => origin.closest && origin.closest(`[data-id="${t.id}"]`))) {
      P.ui.confetti(origin, { count: 60 });
      P.ui.toast('Tiga Prioritas hari ini tuntas!', { tone: 'success' });
    }
    if (p.total > 1 && p.done === p.total) {
      const rel = D.relativeLabel(date, D.todayKey());
      const when = rel ? rel.toLowerCase() : `pada ${D.formatLong(date)}`;
      P.ui.toast(`Semua rencana ${when} selesai. Kerja bagus!`, { tone: 'success' });
    }
  }

  // ----- Bagikan -----

  /** Bagikan rencana satu hari: teks WhatsApp, atau berkas kalender (.ics). */
  function openShare(date, { area = null } = {}) {
    const store = P.store;
    const inArea = (t) => !area || L.areaOf(t) === area;
    const dayTasks = store.state.tasks.filter((t) => t.date === date && inArea(t));
    const text = L.shareText(dayTasks, date, area ? `Rencana ${area === 'kerja' ? 'Kerja' : 'Pribadi'}` : 'Rencana');
    const week = D.weekKeys(date);
    const weekTasks = store.state.tasks.filter((t) => week.includes(t.date) && inArea(t));
    P.ui.openDialog({
      title: 'Bagikan rencana',
      body: `
        <p class="dialog-text">Kirim rencana <strong>${esc(D.formatLong(date))}</strong> ke keluarga atau rekan kerja, atau masukkan ke aplikasi kalender.</p>
        <label class="legend" for="share-text">Teks untuk WhatsApp</label>
        <textarea id="share-text" class="share-text" rows="8" readonly>${esc(text)}</textarea>
        <div class="button-row">
          <button type="button" class="btn primary" data-share="copy">${icon('copy')}Salin teks</button>
          <a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${icon('share')}Buka WhatsApp</a>
        </div>
        <h3 class="dialog-sub">Ke aplikasi kalender</h3>
        <p class="hint">Berkas .ics bisa dibuka di Google Calendar, Kalender iPhone, atau Outlook.</p>
        <div class="button-row">
          <button type="button" class="btn ghost" data-share="ics-day" ${dayTasks.length ? '' : 'disabled'}>${icon('calendar')}Hari ini (${dayTasks.length} tugas)</button>
          <button type="button" class="btn ghost" data-share="ics-week" ${weekTasks.length ? '' : 'disabled'}>${icon('calendar')}Pekan ini (${weekTasks.length} tugas)</button>
        </div>`,
      onMount(el) {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-share]');
          if (!b) return;
          if (b.dataset.share === 'copy') {
            if (await P.ui.copyText(text)) {
              P.ui.toast('Teks rencana disalin. Tempel di WhatsApp.', { tone: 'success' });
            } else {
              const area = el.querySelector('#share-text');
              area.focus();
              area.select();
              P.ui.toast('Browser menolak papan klip. Teks sudah dipilih, salin manual.', { tone: 'warn' });
            }
          } else if (b.dataset.share === 'ics-day') {
            P.ui.download(`rencana-${date}.ics`, L.toICS(dayTasks), 'text/calendar');
          } else if (b.dataset.share === 'ics-week') {
            P.ui.download(`rencana-pekan-${week[0]}.ics`, L.toICS(weekTasks), 'text/calendar');
          }
        });
      },
    });
  }

  // ----- Cari -----

  /** Perintah untuk palet perintah (Ctrl+K). */
  function commands() {
    const date = P.app.selected();
    const info = P.sync ? P.sync.info() : {};
    const list = [
      { label: 'Tugas baru', keys: 'N', icon: 'plus', run: () => openTaskEditor({ defaults: { date } }) },
      { label: 'Rencanakan hari ini', icon: 'sparkle', run: () => P.ritual.planDay() },
      { label: 'Tutup hari ini', icon: 'moon', run: () => P.ritual.closeDay() },
      { label: 'Atur jadwal otomatis', icon: 'clock', run: () => P.ritual.autoSchedule(date) },
      { label: 'Mulai sesi fokus', icon: 'timer', run: () => { P.app.go('fokus'); P.timer.start(); } },
      { label: 'Bagikan rencana ke WhatsApp / kalender', icon: 'share', run: () => openShare(date) },
      { label: 'Pakai template rutinitas', icon: 'layers', run: () => openTemplates(date) },
      { label: 'Laporan kerja (WhatsApp)', icon: 'report', run: () => P.work.openReport(date) },
      { label: 'Proyek kerja baru', icon: 'folder', run: () => P.work.openProjectEditor(null, { area: 'kerja' }) },
      { label: 'Atur jam kerja', icon: 'briefcase', run: () => P.work.openWorkHours() },
      { label: 'Ke hari ini', keys: 'T', icon: 'calendar', run: () => P.app.setDate(D.todayKey()) },
      { label: 'Ganti tema terang/gelap', icon: 'sun', run: () => P.app.toggleTheme() },
      { label: info.loggedIn ? 'Akun & sinkronisasi' : 'Masuk / buat akun', icon: 'cloud', run: () => P.account.openAccount() },
    ];
    if (info.loggedIn) list.push({ label: 'Hubungkan perangkat lain (QR)', icon: 'phone', run: () => P.account.openPair() });
    P.app.NAV.forEach((n, i) => list.push({ label: `Buka ${n.label}`, keys: String(i + 1), icon: n.icon, run: () => P.app.go(n.id) }));
    return list;
  }

  function openSearch() {
    const store = P.store;
    const today = D.todayKey();
    P.ui.openDialog({
      title: 'Cari atau jalankan perintah',
      body: `
        <div class="search-box">
          ${icon('search')}
          <input id="search-input" type="search" placeholder="Cari tugas, atau ketik perintah (mis. fokus, tema, bagikan)" autocomplete="off" autofocus aria-describedby="search-count">
        </div>
        <p class="hint" id="search-count" aria-live="polite">Cari di semua tanggal.</p>
        <ul class="search-results" role="listbox" aria-label="Hasil pencarian"></ul>`,
      onMount(el, close) {
        const input = el.querySelector('#search-input');
        const list = el.querySelector('.search-results');
        const count = el.querySelector('#search-count');
        let active = 0;
        let results = [];

        const fold = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const paint = () => {
          const q = input.value.trim();
          const words = fold(q).split(/\s+/).filter(Boolean);
          const cmds = commands().filter((c) => words.every((w) => fold(c.label).includes(w)))
            .slice(0, q ? 5 : 8).map((c) => ({ kind: 'cmd', c }));
          const tasks = q ? P.smart.searchTasks(store.state.tasks, q, today).map((t) => ({ kind: 'task', t })) : [];
          results = [...cmds, ...tasks];
          active = Math.min(active, Math.max(0, results.length - 1));
          count.textContent = !q ? 'Perintah cepat. Ketik untuk mencari tugas di semua tanggal.'
            : tasks.length ? `${tasks.length}${tasks.length === 30 ? '+' : ''} tugas ditemukan.` : 'Tidak ada tugas yang cocok.';
          let html = '';
          results.forEach((r, i) => {
            if (i === 0 && r.kind === 'cmd') html += '<li class="search-group">Perintah</li>';
            if (r.kind === 'task' && (i === 0 || results[i - 1].kind === 'cmd')) html += '<li class="search-group">Tugas</li>';
            if (r.kind === 'cmd') {
              html += `
                <li><button type="button" class="search-hit cmd${i === active ? ' on' : ''}" data-hit="${i}" role="option" aria-selected="${i === active}">
                  <span class="hit-icon">${icon(r.c.icon)}</span>
                  <span class="hit-title">${esc(r.c.label)}</span>
                  ${r.c.keys ? `<kbd>${esc(r.c.keys)}</kbd>` : ''}
                </button></li>`;
              return;
            }
            const t = r.t;
            const rel = D.relativeLabel(t.date, today);
            html += `
              <li><button type="button" class="search-hit${i === active ? ' on' : ''}${t.done ? ' is-done' : ''}" data-hit="${i}" role="option" aria-selected="${i === active}">
                <span class="hit-date">${esc(rel || `${D.dayShort(t.date)}, ${D.formatShort(t.date)}`)}</span>
                <span class="hit-title">${esc(t.title)}</span>
                <span class="hit-meta">${t.start ? `<span class="time">${esc(t.start)}</span>` : ''}${P.ui.catChip(t.category)}</span>
              </button></li>`;
          });
          list.innerHTML = html;
          const on = list.querySelector('.search-hit.on');
          if (on) on.scrollIntoView({ block: 'nearest' });
        };
        const pick = (i) => {
          const r = results[i];
          if (!r) return;
          close();
          if (r.kind === 'cmd') r.c.run();
          else P.app.reveal(r.t.id, r.t.date);
        };
        input.addEventListener('input', () => { active = 0; paint(); });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, results.length - 1); paint(); }
          if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); paint(); }
          if (e.key === 'Enter') { e.preventDefault(); pick(active); }
        });
        list.addEventListener('click', (e) => {
          const hit = e.target.closest('[data-hit]');
          if (hit) pick(Number(hit.dataset.hit));
        });
        paint();
      },
    });
  }

  /** Data akun sedang ditarik pertama kali setelah masuk. */
  const syncLoading = () => Boolean(P.sync && P.sync.info().loading);

  function loadingBlock(rows = 3) {
    return `<div class="loading-block" role="status">
      <p class="loading-note"><span class="spinner" aria-hidden="true"></span>Memuat data akunmu…</p>
      ${P.ui.skeleton(rows)}
    </div>`;
  }

  P.components = {
    taskRow, openTaskEditor, openTemplates, removeWithUndo, handleTaskClick, openShare, openSearch,
    syncLoading, loadingBlock, smartSuggest, timeChips,
  };
})(typeof self !== 'undefined' ? self : this);
