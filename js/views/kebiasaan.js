/** Kebiasaan: pelacak harian dengan streak dan persentase 30 hari. */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;

  function colorPicks(value) {
    return L.CATEGORIES.map((c) => `
      <label class="swatch" data-cat="${c.id}" title="${esc(c.label)}">
        <input type="radio" name="color" value="${c.id}" ${c.id === value ? 'checked' : ''} aria-label="Warna ${esc(c.label)}">
        <span></span>
      </label>`).join('');
  }

  function openHabitEditor(habit) {
    const h = habit || { name: '', color: 'kesehatan' };
    P.ui.openDialog({
      title: habit ? 'Ubah kebiasaan' : 'Kebiasaan baru',
      size: 'small',
      body: `
        <form class="form" novalidate>
          <div class="field">
            <label for="habit-name">Nama kebiasaan</label>
            <input id="habit-name" name="name" type="text" maxlength="60" required value="${esc(h.name)}" placeholder="Mis. Jalan kaki 5.000 langkah" autofocus>
          </div>
          <fieldset class="field">
            <legend>Warna</legend>
            <div class="swatches">${colorPicks(h.color)}</div>
          </fieldset>
          <p class="form-error" role="alert" hidden></p>
          <div class="dialog-actions">
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn primary">${habit ? 'Simpan' : 'Tambah kebiasaan'}</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const name = String(fd.get('name') || '').trim();
          if (!name) {
            const err = form.querySelector('.form-error');
            err.textContent = 'Nama kebiasaan belum diisi.';
            err.hidden = false;
            return;
          }
          const color = String(fd.get('color') || 'kesehatan');
          if (habit) P.store.updateHabit(habit.id, { name, color });
          else P.store.addHabit({ name, color });
          close();
        });
      },
    });
  }

  function render(ctx) {
    const { state, date, today } = ctx;
    const habits = state.habits.filter((h) => !h.archived);
    const days = D.lastNDays(date, 7);
    const done = habits.filter((h) => L.habitDoneOn(state.habitLog, h.id, date)).length;
    const rel = D.relativeLabel(date, today);

    const head = `
      <header class="view-head">
        <div>
          <p class="eyebrow">Kebiasaan</p>
          <h1>${habits.length ? `${done} dari ${habits.length} tercentang ${esc(rel ? rel.toLowerCase() : `pada ${D.formatShort(date)}`)}` : 'Bangun kebiasaan kecil'}</h1>
        </div>
        <div class="view-actions">
          <button type="button" class="btn primary" data-act="new-habit">${icon('plus')}Kebiasaan baru</button>
        </div>
      </header>`;

    if (!habits.length) {
      return `${head}
        <div class="empty big">
          <p class="empty-title">Belum ada kebiasaan yang dilacak.</p>
          <p>Pilih satu kebiasaan kecil yang mudah dilakukan setiap hari, misalnya minum air setelah bangun atau membaca 10 halaman.</p>
          <div class="empty-actions"><button type="button" class="btn primary" data-act="new-habit">${icon('plus')}Kebiasaan baru</button></div>
        </div>`;
    }

    const header = days.map((k) => `
      <div class="hcol${k === date ? ' is-selected' : ''}${D.dayIndex(k) === 0 ? ' is-sunday' : ''}">
        <span>${esc(D.dayShort(k))}</span><strong>${Number(k.slice(8))}</strong>
      </div>`).join('');

    const rows = habits.map((h) => {
      const streak = L.currentStreak(state.habitLog, h.id, date, today);
      const best = L.bestStreak(state.habitLog, h.id);
      const rate = L.habitRate(state.habitLog, h, date, 30);
      const cells = days.map((k) => {
        const on = L.habitDoneOn(state.habitLog, h.id, k);
        const future = D.diffDays(today, k) > 0;
        return `
          <button type="button" class="hcell${on ? ' on' : ''}${k === date ? ' is-selected' : ''}" data-toggle="${esc(h.id)}" data-day="${k}" data-fk="h-${esc(h.id)}-${k}"
            role="checkbox" aria-checked="${on}" aria-label="${esc(h.name)}, ${esc(D.formatLong(k))}" ${future ? 'disabled' : ''}>${icon('check')}</button>`;
      }).join('');
      return `
        <div class="hrow" data-color="${esc(h.color)}">
          <div class="hname">
            <span class="hdot" aria-hidden="true"></span>
            <div>
              <p class="htitle">${esc(h.name)}</p>
              <p class="hmeta">
                <span class="streak${streak ? '' : ' zero'}">${icon('flame')}${streak} hari</span>
                <span>Terbaik ${best} hari</span>
                <span class="hrate"><span class="meter"><span style="width:${rate}%"></span></span>${rate}% · 30 hari</span>
              </p>
            </div>
            <div class="hactions">
              <button type="button" class="icon-btn" data-edit="${esc(h.id)}" aria-label="Ubah ${esc(h.name)}">${icon('edit')}</button>
              <button type="button" class="icon-btn" data-delete="${esc(h.id)}" aria-label="Hapus ${esc(h.name)}">${icon('trash')}</button>
            </div>
          </div>
          <div class="hcells">${cells}</div>
        </div>`;
    }).join('');

    return `${head}
      <section class="habit-board">
        <div class="hrow hhead">
          <div class="hname"><p class="muted">7 hari sampai ${esc(D.formatShort(date))}</p></div>
          <div class="hcells">${header}</div>
        </div>
        ${rows}
      </section>
      <p class="hint">Streak dihitung dari hari berturut-turut. Hari ini yang belum dicentang belum memutus streak.</p>`;
  }

  function mount(el, ctx) {
    el.addEventListener('click', async (e) => {
      const toggle = e.target.closest('[data-toggle]');
      if (toggle) {
        P.ui.haptic(8);
        P.store.toggleHabit(toggle.dataset.toggle, toggle.dataset.day);
        const h = ctx.state.habits.find((x) => x.id === toggle.dataset.toggle);
        const streak = P.logic.currentStreak(ctx.state.habitLog, toggle.dataset.toggle, ctx.today, ctx.today);
        if (h && toggle.dataset.day === ctx.today && [7, 21, 30, 50, 100].includes(streak)
          && P.logic.habitDoneOn(ctx.state.habitLog, h.id, ctx.today)) {
          P.ui.confetti(toggle, { count: 70 });
          P.ui.toast(`Streak ${streak} hari untuk "${h.name}". Pertahankan!`, { tone: 'success' });
        }
        return;
      }
      const edit = e.target.closest('[data-edit]');
      if (edit) return openHabitEditor(ctx.state.habits.find((h) => h.id === edit.dataset.edit));
      const del = e.target.closest('[data-delete]');
      if (del) {
        const habit = ctx.state.habits.find((h) => h.id === del.dataset.delete);
        const ok = await P.ui.confirmDialog({
          title: `Hapus "${habit.name}"?`,
          message: 'Riwayat centang dan streak kebiasaan ini juga akan terhapus.',
          confirmText: 'Hapus kebiasaan',
          danger: true,
        });
        if (ok) P.store.deleteHabit(habit.id);
        return;
      }
      const act = e.target.closest('[data-act="new-habit"]');
      if (act) openHabitEditor(null);
    });
  }

  (P.views = P.views || {}).kebiasaan = { title: 'Kebiasaan', render, mount };
})(typeof self !== 'undefined' ? self : this);
