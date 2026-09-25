/** Jurnal harian: suasana hati, rasa syukur, catatan, dan niat untuk besok. */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon, moodFace } = P.ui;

  function render(ctx) {
    const { state, date, today } = ctx;
    const j = P.store.journalFor(date);
    const rel = D.relativeLabel(date, today);
    const past = Object.keys(state.journal)
      .filter((k) => k !== date)
      .filter((k) => {
        const e = state.journal[k];
        return e && (e.mood || (e.notes || '').trim() || (e.gratitude || []).some((g) => g && g.trim()));
      })
      .sort()
      .reverse()
      .slice(0, 8);

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">${esc(rel || D.dayName(date))} · Jurnal</p>
          <h1>${esc(D.formatLong(date))}</h1>
        </div>
        <p class="save-state" data-save-state aria-live="polite">Tersimpan otomatis</p>
      </header>

      <div class="journal-layout">
        <form class="journal" data-journal autocomplete="off">
          <fieldset class="journal-block">
            <legend>Bagaimana harimu?</legend>
            <div class="moods big" role="radiogroup" aria-label="Suasana hati">
              ${L.MOODS.map((m) => `
                <button type="button" class="mood${j.mood === m.value ? ' on' : ''}" data-mood="${m.value}" data-level="${m.value}" role="radio" aria-checked="${j.mood === m.value}" data-fk="jmood-${m.value}">
                  ${moodFace(m.value)}<span>${esc(m.label)}</span>
                </button>`).join('')}
            </div>
          </fieldset>

          <fieldset class="journal-block">
            <legend>Tiga hal yang kusyukuri</legend>
            <ol class="gratitude">
              ${j.gratitude.map((g, i) => `
                <li><input id="grat-${i}" type="text" maxlength="160" value="${esc(g)}" data-grat="${i}" placeholder="${['Mis. Sempat sarapan bersama keluarga', 'Mis. Pekerjaan selesai tepat waktu', 'Mis. Hujan reda saat pulang'][i]}" aria-label="Hal ke-${i + 1} yang disyukuri"></li>`).join('')}
            </ol>
          </fieldset>

          <div class="journal-block">
            <label for="journal-notes" class="legend">Catatan hari ini</label>
            <textarea id="journal-notes" rows="6" maxlength="5000" data-field="notes" placeholder="Apa yang terjadi hari ini? Apa yang berjalan baik?">${esc(j.notes)}</textarea>
          </div>

          <div class="journal-block">
            <label for="journal-better" class="legend">Besok ingin lebih baik dalam…</label>
            <textarea id="journal-better" rows="3" maxlength="1000" data-field="better" placeholder="Mis. mulai kerja fokus sebelum jam 9">${esc(j.better)}</textarea>
          </div>
        </form>

        <aside class="panel">
          <div class="panel-head"><h2>Catatan sebelumnya</h2></div>
          ${past.length ? `
            <ul class="past-list">
              ${past.map((k) => {
                const e = state.journal[k];
                const snippet = (e.notes || '').trim() || (e.gratitude || []).filter(Boolean).join(', ');
                return `
                  <li><button type="button" class="past" data-date="${k}">
                    <span class="past-mood" data-level="${e.mood || 0}">${e.mood ? moodFace(e.mood) : icon('note')}</span>
                    <span class="past-text"><strong>${esc(D.dayShort(k))}, ${esc(D.formatShort(k))}</strong><span>${esc(snippet || 'Hanya suasana hati')}</span></span>
                  </button></li>`;
              }).join('')}
            </ul>` : '<p class="muted">Catatan dari hari-hari lain akan muncul di sini.</p>'}
        </aside>
      </div>`;
  }

  function mount(el, ctx) {
    const form = el.querySelector('[data-journal]');
    const saveState = el.querySelector('[data-save-state]');
    let timer = null;

    const save = () => {
      const gratitude = [...form.querySelectorAll('[data-grat]')].map((i) => i.value);
      const patch = { gratitude };
      form.querySelectorAll('[data-field]').forEach((f) => { patch[f.dataset.field] = f.value; });
      // silent: jangan render ulang supaya kursor tidak hilang saat mengetik
      P.store.setJournal(ctx.date, patch, { silent: true });
      saveState.textContent = 'Tersimpan otomatis';
    };

    form.addEventListener('input', () => {
      saveState.textContent = 'Menyimpan…';
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    });
    form.addEventListener('submit', (e) => e.preventDefault());

    el.addEventListener('click', (e) => {
      const mood = e.target.closest('[data-mood]');
      if (mood) {
        clearTimeout(timer);
        save();
        const value = Number(mood.dataset.mood);
        const current = P.store.journalFor(ctx.date).mood;
        P.store.setJournal(ctx.date, { mood: current === value ? null : value });
        return;
      }
      const past = e.target.closest('[data-date]');
      if (past) {
        clearTimeout(timer);
        save();
        ctx.setDate(past.dataset.date);
      }
    });

    // Simpan sisa ketikan sebelum tampilan diganti.
    return () => {
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
  }

  (P.views = P.views || {}).jurnal = { title: 'Jurnal', render, mount };
})(typeof self !== 'undefined' ? self : this);
