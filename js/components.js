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
    if (task.priority === 'tinggi') meta.push('<span class="prio" data-prio="tinggi">Prioritas tinggi</span>');
    if (task.priority === 'rendah' && !compact) meta.push('<span class="prio" data-prio="rendah">Santai</span>');
    if (task.subtasks.length && (compact || !showSubtasks)) {
      meta.push(`<span class="meta-item">${subsDone}/${task.subtasks.length} subtugas</span>`);
    }
    if (task.pomodoros) {
      meta.push(`<span class="meta-item" title="Sesi fokus">${icon('timer')}${task.pomodoros}</span>`);
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
          <button type="button" class="task-title" data-action="edit-task">${esc(task.title)}</button>
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

  /**
   * @param {object} opts
   * @param {object} [opts.task] tugas yang diedit; kosong untuk tugas baru
   * @param {object} [opts.defaults] nilai awal tugas baru (date, start, end, title)
   */
  function openTaskEditor({ task = null, defaults = {} } = {}) {
    const store = P.store;
    const t = task || {
      title: '', date: defaults.date, start: defaults.start || null, end: defaults.end || null,
      category: defaults.category || 'pribadi', priority: 'sedang', starred: false, notes: '', subtasks: [],
    };
    const body = `
      <form class="form" novalidate>
        <div class="field">
          <label for="task-title">Judul</label>
          <input id="task-title" name="title" type="text" required maxlength="140" value="${esc(t.title)}" placeholder="Mis. Selesaikan laporan bulanan" autofocus>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="task-date">Tanggal</label>
            <input id="task-date" name="date" type="date" required value="${esc(t.date)}">
          </div>
          <div class="field">
            <label for="task-start">Mulai</label>
            <input id="task-start" name="start" type="time" value="${esc(t.start || '')}">
          </div>
          <div class="field">
            <label for="task-end">Selesai</label>
            <input id="task-end" name="end" type="time" value="${esc(t.end || '')}">
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
          ${task ? `<button type="button" class="btn ghost danger-text" data-delete>${icon('trash')}Hapus</button>` : ''}
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
          if (s != null && (e == null || e <= s)) endEl.value = D.formatTime(Math.min(s + 60, 24 * 60 - 1));
        });

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
            starred: wantStar,
            notes: String(fd.get('notes') || '').trim(),
            subtasks,
          };
          if (task) {
            store.updateTask(task.id, data);
            P.ui.toast('Perubahan disimpan.');
          } else {
            store.addTask(data);
            P.ui.toast(`Ditambahkan ke ${D.formatLong(date)}.`);
          }
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

  function openTemplates(date) {
    const body = `
      <p class="dialog-text">Terapkan rangkaian kegiatan siap pakai ke <strong>${esc(D.formatLong(date))}</strong>. Semua tugas bisa diubah setelahnya.</p>
      <ul class="template-list">
        ${P.templates.map((tpl) => `
          <li class="template">
            <div class="template-info">
              <h3>${esc(tpl.name)}</h3>
              <p>${esc(tpl.description)}</p>
              <p class="template-meta">${tpl.tasks.length} tugas · ${esc(tpl.tasks[0].start)}–${esc(tpl.tasks[tpl.tasks.length - 1].end)}</p>
            </div>
            <button type="button" class="btn secondary small" data-template="${esc(tpl.id)}">Terapkan</button>
          </li>`).join('')}
      </ul>`;
    P.ui.openDialog({
      title: 'Template rutinitas',
      body,
      onMount(el, close) {
        el.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-template]');
          if (!btn) return;
          const tpl = P.templates.find((x) => x.id === btn.dataset.template);
          const ids = P.store.applyTemplate(tpl, date);
          close();
          P.ui.toast(`${ids.length} tugas dari "${tpl.name}" ditambahkan.`, {
            action: 'Urungkan',
            onAction: () => P.store.deleteTasks(ids),
          });
        });
      },
    });
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
        if (t && t.done) celebrate(t.date);
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
  function celebrate(date) {
    const p = L.progress(P.store.state.tasks.filter((t) => t.date === date));
    if (p.total > 1 && p.done === p.total) {
      const rel = D.relativeLabel(date, D.todayKey());
      const when = rel ? rel.toLowerCase() : `pada ${D.formatLong(date)}`;
      P.ui.toast(`Semua rencana ${when} selesai. Kerja bagus!`, { tone: 'success' });
    }
  }

  P.components = { taskRow, openTaskEditor, openTemplates, removeWithUndo, handleTaskClick };
})(typeof self !== 'undefined' ? self : this);
