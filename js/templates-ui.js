/**
 * Template rutinitas: daftar (template saya + saran), terapkan ke tanggal, saran acak,
 * editor template (nama, ikon, kegiatan berjam), dan simpan hari ini sebagai template.
 * Template milik pengguna tersimpan di data (ikut sinkron); saran bawaan tidak bisa
 * rusak: mengubahnya membuat salinan milik pengguna, menyembunyikannya bisa dipulihkan.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;
  const doc = root.document;

  const EMOJIS = ['🌅', '💼', '📚', '🌿', '🚀', '🏃', '🧹', '🎨', '🧘', '🌙', '👨‍👩‍👧', '💰', '🕌', '🍲', '🧳', '🏡', '⭐', '🎯', '☕', '🎮'];

  // ----- Data -----

  function suggestions() {
    const s = P.store.state;
    const hidden = new Set(s.settings.hiddenTemplates || []);
    const customized = new Set(s.templates.map((t) => t.from).filter(Boolean));
    return P.templateSuggestions.filter((x) => !hidden.has(x.id) && !customized.has(x.id));
  }

  /** Semua template yang bisa dipakai, dengan kunci "mine:id" / "saran:id". */
  function available() {
    return [
      ...P.store.state.templates.map((tpl) => ({ key: `mine:${tpl.id}`, kind: 'mine', tpl })),
      ...suggestions().map((tpl) => ({ key: `saran:${tpl.id}`, kind: 'saran', tpl })),
    ];
  }

  function resolve(key) {
    const [kind, ...rest] = String(key || '').split(':');
    const id = rest.join(':');
    const tpl = kind === 'mine' ? P.store.findTemplate(id) : P.templateSuggestions.find((x) => x.id === id);
    return tpl ? { key, kind, tpl } : null;
  }

  function span(tpl) {
    const timed = tpl.tasks.filter((x) => x.start);
    if (!timed.length) return 'tanpa jam';
    const last = timed[timed.length - 1];
    return `${timed[0].start}–${last.end || last.start}`;
  }

  /** Saran yang dipilih acak, tidak sama dengan pilihan sebelumnya. */
  function randomPick(exceptKey) {
    const pool = available().filter((x) => x.key !== exceptKey);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function applyToDate(tpl, date) {
    const ids = P.store.applyTemplate(tpl, date);
    P.ui.haptic(10);
    P.ui.toast(`${ids.length} kegiatan dari "${tpl.name}" ditambahkan ke ${D.formatLong(date)}.`, {
      tone: 'success',
      action: 'Urungkan',
      onAction: () => P.store.deleteTasks(ids),
    });
    return ids;
  }

  // ----- Daftar -----

  function card(entry, picked = false) {
    const { kind, tpl, key } = entry;
    const extra = kind === 'mine'
      ? `<button type="button" class="icon-btn" data-tpl-delete="${esc(key)}" aria-label="Hapus template ${esc(tpl.name)}" title="Hapus">${icon('trash')}</button>`
      : `<button type="button" class="icon-btn" data-tpl-hide="${esc(key)}" aria-label="Sembunyikan saran ${esc(tpl.name)}" title="Sembunyikan">${icon('eyeoff')}</button>`;
    return `
      <li class="template${picked ? ' is-picked' : ''}" data-key="${esc(`${picked ? 'pick' : 'row'}-${key}`)}">
        <span class="template-emoji" aria-hidden="true">${esc(tpl.emoji || '🗂️')}</span>
        <div class="template-info">
          <h3>${esc(tpl.name)}${kind === 'mine' && tpl.from ? ' <span class="badge">diubah</span>' : ''}</h3>
          ${tpl.description ? `<p>${esc(tpl.description)}</p>` : ''}
          <details class="template-peek">
            <summary>${tpl.tasks.length} kegiatan · ${esc(span(tpl))}</summary>
            <ol class="template-tasks">
              ${tpl.tasks.map((x) => `
                <li><span class="tt-time">${x.start ? esc(x.end ? `${x.start}–${x.end}` : x.start) : '—'}</span><span class="tt-title">${esc(x.title)}</span>${x.starred ? icon('star', 'tiny') : ''}</li>`).join('')}
            </ol>
          </details>
        </div>
        <div class="template-actions">
          <button type="button" class="btn secondary small" data-tpl-apply="${esc(key)}">Terapkan</button>
          <button type="button" class="icon-btn" data-tpl-edit="${esc(key)}" aria-label="Ubah template ${esc(tpl.name)}" title="Ubah">${icon('edit')}</button>
          ${extra}
        </div>
      </li>`;
  }

  function listHTML(date, picked) {
    const s = P.store.state;
    const mine = available().filter((x) => x.kind === 'mine');
    const sug = available().filter((x) => x.kind === 'saran');
    const hidden = (s.settings.hiddenTemplates || []).length;
    const dayCount = s.tasks.filter((t) => t.date === date).length;
    const pick = picked && resolve(picked);
    return `
      <p class="dialog-text">Terapkan ke <strong>${esc(D.formatLong(date))}</strong>. Semua template bisa kamu ubah lewat tombol ${icon('edit', 'inline')}, termasuk kegiatan dan jamnya.</p>
      <div class="template-tools">
        <button type="button" class="btn primary small" data-tpl-new>${icon('plus')}Buat template</button>
        <button type="button" class="btn ghost small" data-tpl-random>${icon('dice')}Saran acak</button>
        <button type="button" class="btn ghost small" data-tpl-from-day ${dayCount ? '' : 'disabled'} title="${dayCount ? '' : 'Belum ada tugas di tanggal ini'}">${icon('bookmark')}Simpan hari ini sebagai template</button>
      </div>
      ${pick ? `
        <section class="template-section picked" data-key="picked">
          <h3 class="section-label">${icon('dice', 'inline')} Saran acak untukmu</h3>
          <ul class="template-list">${card(pick, true)}</ul>
        </section>` : ''}
      <section class="template-section" data-key="mine">
        <h3 class="section-label">Template saya</h3>
        ${mine.length
          ? `<ul class="template-list">${mine.map((x) => card(x)).join('')}</ul>`
          : '<p class="muted small-text">Belum ada. Buat sendiri, simpan hari yang sudah kamu susun, atau ubah salah satu saran di bawah. Hasilnya muncul di sini.</p>'}
      </section>
      <section class="template-section" data-key="saran">
        <h3 class="section-label">Saran template</h3>
        ${sug.length ? `<ul class="template-list">${sug.map((x) => card(x)).join('')}</ul>` : '<p class="muted small-text">Semua saran sedang disembunyikan.</p>'}
        ${hidden ? `<button type="button" class="link-btn" data-tpl-unhide>Tampilkan lagi ${hidden} saran yang disembunyikan</button>` : ''}
      </section>`;
  }

  /**
   * Buka pengelola template.
   * @param {string} [date] tanggal tujuan "Terapkan" (bawaan: tanggal terpilih)
   * @param {{picked?: string}} [opts] kunci template yang disorot sebagai saran acak
   */
  function open(date, opts = {}) {
    const target = D.isKey(date) ? date : (P.app ? P.app.selected() : D.todayKey());
    let picked = opts.picked || null;
    P.ui.openDialog({
      title: 'Template rutinitas',
      size: 'wide',
      body: `<div data-tpl-root>${listHTML(target, picked)}</div>`,
      onMount(el, close) {
        const rootEl = el.querySelector('[data-tpl-root]');
        const refresh = () => {
          if (!rootEl.isConnected) return;
          const next = doc.createElement('div');
          next.innerHTML = listHTML(target, picked);
          P.morph.morph(rootEl, next, { animate: true });
        };
        el.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b || !rootEl.contains(b)) return;
          const d = b.dataset;
          if (d.tplApply) {
            const entry = resolve(d.tplApply);
            if (!entry) return;
            close();
            applyToDate(entry.tpl, target);
          } else if (d.tplEdit) {
            const entry = resolve(d.tplEdit);
            if (entry) openEditor(entry.tpl, { kind: entry.kind, onDone: () => open(target) });
          } else if (d.tplDelete) {
            const entry = resolve(d.tplDelete);
            if (!entry) return;
            const removed = P.store.deleteTemplate(entry.tpl.id);
            if (picked === d.tplDelete) picked = null;
            refresh();
            P.ui.toast(`Template "${removed.name}" dihapus.`, {
              action: 'Urungkan',
              onAction: () => {
                P.store.restoreTemplate(removed);
                refresh();
              },
            });
          } else if (d.tplHide) {
            const entry = resolve(d.tplHide);
            if (!entry) return;
            P.store.hideSuggestion(entry.tpl.id, true);
            if (picked === d.tplHide) picked = null;
            refresh();
            P.ui.toast(`Saran "${entry.tpl.name}" disembunyikan.`, {
              action: 'Urungkan',
              onAction: () => {
                P.store.hideSuggestion(entry.tpl.id, false);
                refresh();
              },
            });
          } else if ('tplUnhide' in d) {
            P.store.showAllSuggestions();
            refresh();
          } else if ('tplRandom' in d) {
            const next = randomPick(picked);
            if (!next) {
              P.ui.toast('Belum ada template untuk diacak.', { tone: 'warn' });
              return;
            }
            picked = next.key;
            refresh();
            const box = el.closest('dialog');
            if (box) box.scrollTo({ top: 0, behavior: 'smooth' });
          } else if ('tplNew' in d) {
            openEditor(null, { kind: 'new', onDone: () => open(target) });
          } else if ('tplFromDay' in d) {
            const data = P.store.templateFromDate(target);
            data.name = `Rutinitas ${D.dayName(target)}`;
            openEditor(data, { kind: 'new', onDone: () => open(target) });
          }
        });
      },
    });
  }

  // ----- Editor -----

  function options(list, value) {
    return list.map((o) => `<option value="${o.id}" ${o.id === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  }

  function rowHTML(x = {}) {
    return `
      <li class="tpl-row">
        <input class="tpl-title" type="text" name="title" maxlength="140" value="${esc(x.title || '')}" placeholder="Nama kegiatan" aria-label="Nama kegiatan">
        <div class="tpl-row-meta">
          <input type="time" name="start" value="${esc(x.start || '')}" aria-label="Jam mulai">
          <span class="tpl-dash" aria-hidden="true">–</span>
          <input type="time" name="end" value="${esc(x.end || '')}" aria-label="Jam selesai">
          <select name="category" aria-label="Kategori">${options(L.CATEGORIES, x.category || 'pribadi')}</select>
          <select name="priority" aria-label="Prioritas">${options(L.PRIORITIES, x.priority || 'sedang')}</select>
          <label class="tpl-star" title="Masukkan ke Tiga Prioritas">
            <input type="checkbox" name="starred" ${x.starred ? 'checked' : ''}>${icon('star')}<span class="sr-only">Tiga Prioritas</span>
          </label>
          <button type="button" class="icon-btn" data-row-remove aria-label="Hapus kegiatan" title="Hapus kegiatan">${icon('x')}</button>
        </div>
      </li>`;
  }

  /**
   * @param {object|null} tpl template yang diubah (null = baru)
   * @param {{kind: 'mine'|'saran'|'new', onDone?: Function}} opts
   */
  function openEditor(tpl, { kind = 'new', onDone } = {}) {
    const t = tpl || { name: '', emoji: '⭐', description: '', tasks: [] };
    const rows = t.tasks.length ? t.tasks : [{}, {}, {}];
    const title = kind === 'mine' ? 'Ubah template' : kind === 'saran' ? 'Ubah saran template' : 'Template baru';
    P.ui.openDialog({
      title,
      size: 'wide',
      body: `
        <form class="form tpl-form" novalidate>
          ${kind === 'saran' ? '<p class="dialog-text small-text">Perubahanmu disimpan sebagai <strong>Template saya</strong>. Saran aslinya disembunyikan dan kembali lagi bila salinanmu dihapus.</p>' : ''}
          <div class="field-row tpl-head">
            <div class="field compact tpl-emoji-field">
              <label for="tpl-emoji">Ikon</label>
              <input id="tpl-emoji" name="emoji" type="text" maxlength="8" value="${esc(t.emoji || '')}" autocomplete="off">
            </div>
            <div class="field">
              <label for="tpl-name">Nama template</label>
              <input id="tpl-name" name="name" type="text" maxlength="60" required value="${esc(t.name || '')}" placeholder="Mis. Senin Produktif" autofocus>
            </div>
          </div>
          <div class="emoji-picks" role="group" aria-label="Pilih ikon">
            ${EMOJIS.map((em) => `<button type="button" class="emoji-pick" data-emoji="${esc(em)}" aria-label="Pakai ikon ${esc(em)}">${esc(em)}</button>`).join('')}
          </div>
          <div class="field">
            <label for="tpl-desc">Keterangan <span class="muted">(opsional)</span></label>
            <input id="tpl-desc" name="description" type="text" maxlength="200" value="${esc(t.description || '')}" placeholder="Kapan template ini cocok dipakai?">
          </div>
          <fieldset class="field">
            <legend>Kegiatan</legend>
            <ul class="tpl-rows" data-rows>${rows.map(rowHTML).join('')}</ul>
            <button type="button" class="btn ghost small" data-row-add>${icon('plus')}Tambah kegiatan</button>
            <p class="hint">Kegiatan diurutkan otomatis menurut jam mulai. Jam boleh dikosongkan; baris tanpa nama diabaikan.</p>
          </fieldset>
          <p class="form-error" role="alert" hidden></p>
          <div class="dialog-actions">
            <button type="button" class="btn ghost" data-back>${icon('left')}Kembali</button>
            <span class="spacer"></span>
            <button type="submit" class="btn primary">Simpan template</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const list = form.querySelector('[data-rows]');
        const error = form.querySelector('.form-error');
        const back = () => {
          if (onDone) onDone();
          else close();
        };

        form.addEventListener('click', (e) => {
          const pick = e.target.closest('[data-emoji]');
          if (pick) {
            form.emoji.value = pick.dataset.emoji;
            return;
          }
          if (e.target.closest('[data-row-add]')) {
            list.insertAdjacentHTML('beforeend', rowHTML());
            list.lastElementChild.querySelector('input').focus();
            return;
          }
          const rm = e.target.closest('[data-row-remove]');
          if (rm) {
            rm.closest('.tpl-row').remove();
            if (!list.children.length) list.insertAdjacentHTML('beforeend', rowHTML());
            return;
          }
          if (e.target.closest('[data-back]')) back();
        });

        form.addEventListener('submit', (e) => {
          e.preventDefault();
          error.hidden = true;
          const tasks = [...list.querySelectorAll('.tpl-row')].map((row) => ({
            title: row.querySelector('[name="title"]').value,
            start: row.querySelector('[name="start"]').value || null,
            end: row.querySelector('[name="end"]').value || null,
            category: row.querySelector('[name="category"]').value,
            priority: row.querySelector('[name="priority"]').value,
            starred: row.querySelector('[name="starred"]').checked,
          }));
          const bad = tasks.find((x) => x.title.trim() && x.start && x.end && x.end <= x.start);
          if (bad) {
            error.textContent = `Jam selesai "${bad.title.trim()}" harus setelah jam mulainya.`;
            error.hidden = false;
            return;
          }
          try {
            const saved = P.store.saveTemplate({
              id: kind === 'mine' ? tpl.id : undefined,
              from: kind === 'saran' ? tpl.id : null,
              name: form.name.value,
              emoji: form.emoji.value,
              description: form.description.value,
              tasks,
            });
            P.ui.toast(`Template "${saved.name}" disimpan.`, { tone: 'success' });
            back();
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
          }
        });
      },
    });
  }

  // ----- Kartu saran di Beranda (hari yang masih kosong) -----

  let shuffle = 0;
  function hashText(text) {
    let h = 0;
    for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
    return h;
  }

  /** Satu saran template untuk tanggal kosong; "Acak lagi" menggeser pilihan. */
  function suggestionCard(date) {
    const pool = available();
    if (!pool.length) return '';
    const entry = pool[(hashText(date) + shuffle) % pool.length];
    const { tpl } = entry;
    return `
      <div class="tpl-suggest" data-key="tpl-suggest">
        <span class="template-emoji" aria-hidden="true">${esc(tpl.emoji || '🗂️')}</span>
        <div class="tpl-suggest-info">
          <p class="eyebrow">Saran template</p>
          <p class="tpl-suggest-name">${esc(tpl.name)}</p>
          <p class="muted small-text">${tpl.tasks.length} kegiatan · ${esc(span(tpl))}</p>
        </div>
        <div class="tpl-suggest-actions">
          <button type="button" class="btn small secondary" data-tpl-quick="${esc(entry.key)}">Terapkan</button>
          <button type="button" class="icon-btn" data-tpl-shuffle aria-label="Acak saran lain" title="Acak lagi">${icon('dice')}</button>
        </div>
      </div>`;
  }

  /** Tangani klik kartu saran; true bila ditangani. */
  function handleSuggestClick(e, date) {
    const quick = e.target.closest('[data-tpl-quick]');
    if (quick) {
      const entry = resolve(quick.dataset.tplQuick);
      if (entry) applyToDate(entry.tpl, date);
      return true;
    }
    if (e.target.closest('[data-tpl-shuffle]')) {
      shuffle += 1;
      if (P.app) P.app.refresh();
      return true;
    }
    return false;
  }

  P.templatesUI = { open, openEditor, suggestionCard, handleSuggestClick, available, suggestions, randomPick, applyToDate };
})(typeof self !== 'undefined' ? self : this);
