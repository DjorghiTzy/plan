/**
 * Ritual harian (terinspirasi kebiasaan "daily planning" & "shutdown"):
 *  - Rencanakan hari: bawa tugas tertunda, pilih Tiga Prioritas, cek kapasitas,
 *    atur jadwal otomatis, dan tulis niat hari ini.
 *  - Tutup hari: tinjau yang belum selesai (pindah ke besok/hapus), catat
 *    suasana hati & rasa syukur, lalu lihat ringkasannya.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon, moodFace } = P.ui;

  const st = () => P.store.state;

  /** Interval waktu sholat yang tidak boleh diisi jadwal otomatis. */
  function prayerBlocks(date) {
    const s = st().settings;
    if (!s.prayerEnabled) return [];
    return P.prayer.times(date, P.prayer.findCity(s.prayerCity))
      .filter((p) => !['imsak', 'terbit'].includes(p.id))
      .map((p) => [p.minutes, p.minutes + 15]);
  }

  /** Jadwalkan tugas tanpa jam pada tanggal ini; tampilkan toast dengan Urungkan. */
  function autoSchedule(date) {
    const today = D.todayKey();
    const tasks = st().tasks.filter((t) => t.date === date);
    const plan = L.autoSchedule(tasks, {
      dayStart: st().settings.dayStart,
      dayEnd: st().settings.dayEnd,
      fromMin: date === today ? D.minutesOfDay(new Date()) + 10 : 0,
      blocked: prayerBlocks(date),
    });
    if (!plan.length) {
      P.ui.toast(tasks.some((t) => !t.start && !t.done)
        ? 'Tidak ada celah kosong yang cukup di sisa hari ini.'
        : 'Semua tugas sudah punya jam.', { tone: 'warn' });
      return 0;
    }
    const before = P.store.applySchedule(plan);
    P.ui.toast(`${plan.length} tugas dijadwalkan ke celah kosong.`, {
      tone: 'success',
      action: 'Urungkan',
      onAction: () => P.store.applySchedule(before),
    });
    return plan.length;
  }

  function capacityHTML(date) {
    const tasks = st().tasks.filter((t) => t.date === date);
    const c = L.capacity(tasks, st().settings.dayStart, st().settings.dayEnd);
    const level = c.pct >= 85 ? 'full' : c.pct >= 60 ? 'busy' : 'ok';
    return `
      <div class="capacity" data-level="${level}">
        <div class="capacity-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.pct}" aria-label="Kapasitas terpakai ${c.pct}%">
          <span style="width:${Math.min(100, c.pct)}%"></span>
        </div>
        <p>
          <strong>${esc(D.formatDuration(c.scheduled))}</strong> terjadwal · luang ${esc(D.formatDuration(c.free))}
          ${level === 'full' ? ' · <span class="cap-warn">hari ini sangat padat</span>' : ''}
          ${c.untimed ? ` · ${c.untimed} tugas belum berjam` : ''}
        </p>
      </div>`;
  }

  // ----- Kerangka wizard -----

  function wizard({ title, steps, onFinish }) {
    let i = 0;
    P.ui.openDialog({
      title,
      body: '<div class="wizard" data-wizard></div>',
      onMount(el, close) {
        const host = el.querySelector('[data-wizard]');
        const paint = (dir) => {
          const step = steps[i];
          host.innerHTML = `
            <ol class="wizard-dots" aria-label="Langkah ${i + 1} dari ${steps.length}">
              ${steps.map((s, k) => `<li class="${k < i ? 'done' : k === i ? 'on' : ''}"><span>${esc(s.label)}</span></li>`).join('')}
            </ol>
            <div class="wizard-step ${dir ? `from-${dir}` : ''}">${step.render()}</div>
            <div class="dialog-actions">
              ${i ? '<button type="button" class="btn ghost" data-wz="back">Kembali</button>' : ''}
              <span class="spacer"></span>
              <button type="button" class="btn primary" data-wz="next">${i === steps.length - 1 ? 'Selesai' : 'Lanjut'}${icon('arrow')}</button>
            </div>`;
          if (step.mount) step.mount(host.querySelector('.wizard-step'), () => paint());
          const first = host.querySelector('.wizard-step input, .wizard-step textarea');
          if (first && step.focus !== false) first.focus({ preventScroll: true });
        };
        host.addEventListener('click', (e) => {
          const b = e.target.closest('[data-wz]');
          if (!b) return;
          if (steps[i].save) steps[i].save(host.querySelector('.wizard-step'));
          if (b.dataset.wz === 'back') {
            i -= 1;
            paint('left');
          } else if (i < steps.length - 1) {
            i += 1;
            paint('right');
          } else {
            close();
            onFinish();
          }
        });
        paint();
      },
    });
  }

  // ----- Rencanakan hari -----

  function planDay(date = D.todayKey()) {
    const today = D.todayKey();
    wizard({
      title: `Rencanakan ${date === today ? 'hari ini' : D.formatLong(date)}`,
      steps: [
        {
          label: 'Tertunda',
          render() {
            const left = L.rolloverCandidates(st().tasks, date);
            if (!left.length) return '<p class="wizard-empty">Tidak ada tugas tertunda dari 7 hari terakhir. Awal yang bersih!</p>';
            return `
              <p class="dialog-text">Pilih tugas dari hari-hari sebelumnya yang ingin dikerjakan hari ini.</p>
              <ul class="pick-rows">
                ${left.map((t) => `
                  <li><label class="radio-row"><input type="checkbox" value="${esc(t.id)}" checked>
                    <span><strong>${esc(t.title)}</strong> <span class="muted">· ${esc(D.dayShort(t.date))}, ${esc(D.formatShort(t.date))}</span></span></label></li>`).join('')}
              </ul>`;
          },
          save(el) {
            const ids = [...el.querySelectorAll('input:checked')].map((x) => x.value);
            if (ids.length) P.store.moveTasks(ids, date);
          },
        },
        {
          label: 'Prioritas',
          focus: false,
          render() {
            const tasks = L.sortTasks(st().tasks.filter((t) => t.date === date && !t.done));
            const starred = tasks.filter((t) => t.starred).length;
            return `
              <p class="dialog-text">Pilih <strong>tiga hal terpenting</strong>. Jika hanya tiga ini yang selesai, harimu tetap berhasil. <span class="muted">(${starred}/3 dipilih)</span></p>
              <ul class="pick-rows">
                ${tasks.map((t) => `
                  <li><button type="button" class="star-row${t.starred ? ' on' : ''}" data-star="${esc(t.id)}" aria-pressed="${t.starred}">
                    ${icon('star')}<span>${esc(t.title)}</span>${t.start ? `<span class="time">${esc(t.start)}</span>` : ''}</button></li>`).join('') || '<li class="muted">Belum ada tugas. Tambahkan di bawah.</li>'}
              </ul>
              <form class="sub-add" data-quick>
                <input type="text" id="ritual-add" maxlength="140" placeholder="Tambah tugas, mis. Kirim proposal 10.00 *">
                <button type="submit" class="btn ghost small">${icon('plus')}Tambah</button>
              </form>`;
          },
          mount(el, repaint) {
            el.addEventListener('click', (e) => {
              const b = e.target.closest('[data-star]');
              if (!b) return;
              if (!P.store.toggleStar(b.dataset.star)) P.ui.toast('Tiga Prioritas sudah penuh.', { tone: 'warn' });
              repaint();
            });
            el.querySelector('[data-quick]').addEventListener('submit', (e) => {
              e.preventDefault();
              const input = el.querySelector('#ritual-add');
              const r = L.parseQuickAdd(input.value);
              if (!r.title) return;
              P.store.saveTask(null, {
                title: r.title, date, start: r.start, end: r.end, category: r.category || 'pribadi',
                priority: r.priority || 'sedang', starred: r.starred && P.store.starredCount(date) < P.store.MAX_STARRED,
              }, r.repeat);
              repaint();
            });
          },
        },
        {
          label: 'Jadwal',
          focus: false,
          render() {
            const untimed = st().tasks.filter((t) => t.date === date && !t.start && !t.done);
            return `
              <p class="dialog-text">Cek apakah rencanamu muat dalam sehari.</p>
              ${capacityHTML(date)}
              ${untimed.length ? `
                <p class="dialog-text">${untimed.length} tugas belum punya jam. Biarkan aplikasi mencarikan celah kosong${st().settings.prayerEnabled ? ' (waktu sholat dilewati)' : ''}.</p>
                <button type="button" class="btn secondary" data-auto>${icon('sparkle')}Atur otomatis</button>` : '<p class="muted">Semua tugas sudah punya jam.</p>'}`;
          },
          mount(el, repaint) {
            const b = el.querySelector('[data-auto]');
            if (b) b.addEventListener('click', () => { autoSchedule(date); repaint(); });
          },
        },
        {
          label: 'Niat',
          render() {
            const j = P.store.journalFor(date);
            return `
              <p class="dialog-text">Tulis satu kalimat niat atau fokus hari ini. Kalimat ini muncul di Beranda sebagai pengingat.</p>
              <input type="text" id="ritual-intention" maxlength="140" value="${esc(j.intention)}" placeholder="Mis. Tenang, satu per satu, selesaikan laporan sebelum makan siang">`;
          },
          save(el) {
            const v = el.querySelector('#ritual-intention').value.trim();
            P.store.setJournal(date, { intention: v, planned: true });
          },
        },
      ],
      onFinish() {
        P.store.setJournal(date, { planned: true });
        P.ui.confetti(null, { count: 70 });
        P.ui.toast('Rencana siap. Semangat!', { tone: 'success' });
      },
    });
  }

  // ----- Tutup hari -----

  function closeDay(date = D.todayKey()) {
    const tomorrow = D.addDays(date, 1);
    wizard({
      title: `Tutup ${date === D.todayKey() ? 'hari ini' : D.formatLong(date)}`,
      steps: [
        {
          label: 'Tinjau',
          focus: false,
          render() {
            const tasks = st().tasks.filter((t) => t.date === date);
            const p = L.progress(tasks);
            const open = L.sortTasks(tasks.filter((t) => !t.done));
            return `
              <p class="dialog-text"><strong>${p.done} dari ${p.total}</strong> rencana selesai (${p.pct}%). ${open.length ? 'Putuskan nasib yang belum selesai:' : 'Semua beres!'}</p>
              <ul class="pick-rows">
                ${open.map((t) => `
                  <li class="triage">
                    <span class="triage-title">${esc(t.title)}</span>
                    <span class="segmented small" role="radiogroup" aria-label="Tindakan untuk ${esc(t.title)}">
                      <label><input type="radio" name="tr-${esc(t.id)}" value="besok" checked><span>Besok</span></label>
                      <label><input type="radio" name="tr-${esc(t.id)}" value="biar"><span>Biarkan</span></label>
                      <label><input type="radio" name="tr-${esc(t.id)}" value="hapus"><span>Hapus</span></label>
                    </span>
                  </li>`).join('')}
              </ul>`;
          },
          save(el) {
            const move = [];
            const drop = [];
            el.querySelectorAll('.triage input:checked').forEach((r) => {
              const id = r.name.slice(3);
              if (r.value === 'besok') move.push(id);
              if (r.value === 'hapus') drop.push(id);
            });
            if (move.length) P.store.moveTasks(move, tomorrow);
            drop.forEach((id) => P.store.deleteTask(id));
          },
        },
        {
          label: 'Refleksi',
          render() {
            const j = P.store.journalFor(date);
            return `
              <p class="dialog-text">Bagaimana harimu?</p>
              <div class="moods" role="radiogroup" aria-label="Suasana hati">
                ${L.MOODS.map((m) => `
                  <button type="button" class="mood${j.mood === m.value ? ' on' : ''}" data-rmood="${m.value}" data-level="${m.value}" role="radio" aria-checked="${j.mood === m.value}">
                    ${moodFace(m.value)}<span>${esc(m.label)}</span></button>`).join('')}
              </div>
              <label class="legend" for="ritual-grat">Satu hal yang kusyukuri hari ini</label>
              <input type="text" id="ritual-grat" maxlength="160" value="${esc(j.gratitude[0])}">
              <label class="legend" for="ritual-better">Besok ingin lebih baik dalam…</label>
              <input type="text" id="ritual-better" maxlength="200" value="${esc(j.better)}">`;
          },
          mount(el, repaint) {
            el.addEventListener('click', (e) => {
              const m = e.target.closest('[data-rmood]');
              if (!m) return;
              P.store.setJournal(date, { mood: Number(m.dataset.rmood) });
              const keep = { g: el.querySelector('#ritual-grat').value, b: el.querySelector('#ritual-better').value };
              repaint();
              const g = root.document.querySelector('#ritual-grat');
              if (g) g.value = keep.g;
              const b = root.document.querySelector('#ritual-better');
              if (b) b.value = keep.b;
            });
          },
          save(el) {
            const j = P.store.journalFor(date);
            const gratitude = [...j.gratitude];
            gratitude[0] = el.querySelector('#ritual-grat').value.trim();
            P.store.setJournal(date, { gratitude, better: el.querySelector('#ritual-better').value.trim() });
          },
        },
        {
          label: 'Ringkasan',
          focus: false,
          render() {
            const s = st();
            const tasks = s.tasks.filter((t) => t.date === date);
            const p = L.progress(tasks);
            const focus = L.focusMinutesOn(s.focusSessions, date);
            const habits = s.habits.filter((h) => !h.archived);
            const hDone = habits.filter((h) => L.habitDoneOn(s.habitLog, h.id, date)).length;
            const next = s.tasks.filter((t) => t.date === tomorrow).length;
            return `
              <div class="summary-grid">
                <div><strong>${p.done}</strong><span>tugas selesai</span></div>
                <div><strong>${esc(D.formatDuration(focus))}</strong><span>waktu fokus</span></div>
                <div><strong>${s.water[date] || 0}</strong><span>gelas air</span></div>
                <div><strong>${hDone}/${habits.length}</strong><span>kebiasaan</span></div>
              </div>
              <p class="dialog-text">${next ? `Besok sudah ada <strong>${next} rencana</strong>. ` : ''}Istirahatlah. Pekerjaan yang belum selesai sudah punya tempatnya.</p>`;
          },
        },
      ],
      onFinish() {
        P.store.setJournal(date, { closed: true });
        P.ui.toast('Hari ditutup. Selamat beristirahat!', { tone: 'success' });
      },
    });
  }

  /** Kartu ritual di Beranda sesuai waktu. */
  function card(ctx) {
    if (ctx.date !== ctx.today) return '';
    const j = P.store.journalFor(ctx.date);
    const h = ctx.nowMin / 60;
    if (!j.planned && h < 14) {
      return `
        <section class="panel ritual" data-ritual="plan">
          <div>
            <p class="eyebrow">Ritual pagi · 3 menit</p>
            <h2>Rencanakan hari ini</h2>
            <p class="muted">Bawa tugas tertunda, pilih Tiga Prioritas, cek kapasitas, tulis niat.</p>
          </div>
          <button type="button" class="btn primary" data-ritual-start="plan">Mulai${icon('arrow')}</button>
        </section>`;
    }
    if (!j.closed && h >= 17) {
      return `
        <section class="panel ritual evening" data-ritual="close">
          <div>
            <p class="eyebrow">Ritual malam · 2 menit</p>
            <h2>Tutup hari ini</h2>
            <p class="muted">Pindahkan yang belum selesai, catat suasana hati, lalu istirahat tanpa beban.</p>
          </div>
          <button type="button" class="btn primary" data-ritual-start="close">Mulai${icon('arrow')}</button>
        </section>`;
    }
    return '';
  }

  root.document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ritual-start]');
    if (!b) return;
    if (b.dataset.ritualStart === 'plan') planDay();
    else closeDay();
  });

  P.ritual = { planDay, closeDay, autoSchedule, capacityHTML, card, prayerBlocks };
})(typeof self !== 'undefined' ? self : this);
