/**
 * Operasional kerja harian (Rencana Kerja):
 * - Catatan kerja: rutinitas harian + catatan hari itu; ketuk sekali = tercoret (selesai).
 * - Retur per customer: tanggal mulai & selesai, SLA dalam hari (bawaan 7 hari),
 *   diingatkan setiap hari pukul 15.00 selama belum selesai.
 * - Delivery Order: jam mulai, SLA dalam menit (bawaan 1 jam), hitung mundur & peringatan.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;
  const doc = root.document;

  const RETUR_LAST_KEY = 'rencana-harian/retur-last';
  const DIGEST_CACHE = 'rencana-harian-meta';
  const DIGEST_URL = './__pengingat';

  const st = () => P.store.state;
  const fmt = (m) => D.formatTime(m);
  const clock = (ts) => {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const dateShort = (key, today) => D.relativeLabel(key, today) || `${D.dayShort(key)}, ${D.formatShort(key)}`;

  /** "1 j 5 mnt" */
  const dur = (min) => D.formatDuration(Math.abs(min));

  // ----- Catatan kerja -----

  /** Keterangan singkat di rutinitas yang tertaut ke Retur / DO. */
  function linkBadge(link, today, now) {
    if (link === 'retur') {
      const open = L.openReturs(st().cases, today);
      if (!open.length) return '<span class="note-badge">tidak ada retur aktif</span>';
      const late = open.filter((c) => L.returStatus(c, today).late).length;
      return `<span class="note-badge${late ? ' warn' : ''}">${open.length} retur aktif${late ? ` · ${late} lewat SLA` : ''}</span>`;
    }
    if (link === 'do') {
      const open = L.openDOs(st().cases);
      if (!open.length) return '<span class="note-badge">tidak ada DO aktif</span>';
      const late = open.filter((c) => L.doStatus(c, now).late).length;
      return `<span class="note-badge${late ? ' warn' : ''}">${open.length} DO aktif${late ? ` · ${late} terlambat` : ''}</span>`;
    }
    return '';
  }

  function noteRow({ id, text, done, routine, badge = '' }) {
    return `
      <li class="note${done ? ' is-done' : ''}" data-note="${esc(id)}" data-routine="${routine ? '1' : ''}">
        <button type="button" class="note-toggle" data-note-toggle aria-pressed="${done}" title="${done ? 'Ketuk untuk membatalkan' : 'Ketuk bila sudah selesai'}">
          <span class="note-box" aria-hidden="true">${icon('check')}</span>
          <span class="note-text"><span class="note-strike">${esc(text)}</span></span>
          ${routine ? `<span class="note-tag" title="Rutinitas harian">${icon('repeat')}</span>` : ''}
          ${badge}
        </button>
        ${routine ? '' : `<button type="button" class="icon-btn note-del" data-note-del aria-label="Hapus catatan" title="Hapus catatan">${icon('x')}</button>`}
      </li>`;
  }

  /** Kartu "Catatan kerja": rutinitas (hari kerja) + catatan hari itu. Ketuk = coret. */
  function notesCard(ctx) {
    const s = st().settings;
    const date = ctx.date;
    const work = L.workWindow(s, date);
    const note = P.store.workNoteFor(date);
    const routine = work.isWorkday ? s.workRoutine : [];
    const now = ctx.now ? ctx.now.getTime() : Date.now();
    const total = routine.length + note.items.length;
    const done = routine.filter((r) => note.done.includes(r.id)).length + note.items.filter((i) => i.done).length;
    const all = total > 0 && done === total;
    return `
      <section class="notes-card${all ? ' is-complete' : ''}" data-key="work-notes">
        <div class="notes-head">
          <h2><span aria-hidden="true">📝</span> Catatan kerja <span class="count">${done}/${total}</span></h2>
          <button type="button" class="link-btn" data-work="routine">${icon('edit')}Atur rutinitas</button>
        </div>
        ${total ? `<div class="notes-progress" aria-hidden="true"><span style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></div>` : ''}
        ${!work.isWorkday && s.workRoutine.length ? '<p class="hint notes-off">Hari libur kerja, jadi rutinitas tidak ditampilkan. Catatan hari ini tetap bisa ditulis.</p>' : ''}
        <ul class="notes">
          ${routine.map((r) => noteRow({ id: r.id, text: r.title, done: note.done.includes(r.id), routine: true, badge: linkBadge(r.link, ctx.today, now) })).join('')}
          ${note.items.map((i) => noteRow({ id: i.id, text: i.text, done: i.done })).join('')}
        </ul>
        ${all ? '<p class="notes-done">Semua catatan hari ini sudah selesai. 🎉</p>' : ''}
        <form class="note-add" data-note-add autocomplete="off">
          <input type="text" name="note" maxlength="200" placeholder="Tambah catatan untuk ${esc(D.relativeLabel(date, ctx.today) ? D.relativeLabel(date, ctx.today).toLowerCase() : D.formatShort(date))}…" aria-label="Tambah catatan kerja">
          <button type="submit" class="btn small secondary">${icon('plus')}Tambah</button>
        </form>
      </section>`;
  }

  function onNoteToggle(row, date) {
    const id = row.dataset.note;
    const wasDone = row.classList.contains('is-done');
    if (row.dataset.routine) P.store.toggleRoutine(date, id);
    else P.store.toggleWorkNote(date, id);
    P.ui.haptic(wasDone ? 6 : 12);
    const s = st().settings;
    const note = P.store.workNoteFor(date);
    const routine = L.workWindow(s, date).isWorkday ? s.workRoutine : [];
    const all = routine.every((r) => note.done.includes(r.id)) && note.items.every((i) => i.done) && routine.length + note.items.length > 1;
    if (!wasDone && all) {
      P.ui.confetti(null, { count: 80 });
      P.ui.toast('Semua catatan kerja hari ini selesai. Mantap!', { tone: 'success' });
    }
  }

  /** Atur daftar rutinitas kerja harian. */
  function openRoutine() {
    const list = st().settings.workRoutine;
    const row = (r = {}) => `
      <li class="routine-row" data-id="${esc(r.id || '')}">
        <input type="text" maxlength="120" value="${esc(r.title || '')}" placeholder="Mis. Cek stok gudang" aria-label="Nama rutinitas">
        <button type="button" class="icon-btn" data-row-up aria-label="Naikkan" title="Naikkan">${icon('left')}</button>
        <button type="button" class="icon-btn" data-row-del aria-label="Hapus" title="Hapus">${icon('x')}</button>
      </li>`;
    P.ui.openDialog({
      title: 'Rutinitas kerja harian',
      body: `
        <form class="form" novalidate>
          <p class="dialog-text">Muncul di Catatan kerja setiap hari kerja dan kembali belum tercoret keesokan harinya. Rutinitas yang menyebut <strong>retur</strong> atau <strong>delivery order</strong> ikut menampilkan jumlah yang masih aktif.</p>
          <ul class="routine-list" data-rows>${(list.length ? list : [{}]).map(row).join('')}</ul>
          <button type="button" class="btn ghost small" data-row-add>${icon('plus')}Tambah rutinitas</button>
          <div class="dialog-actions">
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn primary">Simpan</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const rows = form.querySelector('[data-rows]');
        form.addEventListener('click', (e) => {
          if (e.target.closest('[data-row-add]')) {
            rows.insertAdjacentHTML('beforeend', row());
            rows.lastElementChild.querySelector('input').focus();
            return;
          }
          const li = e.target.closest('.routine-row');
          if (!li) return;
          if (e.target.closest('[data-row-del]')) li.remove();
          if (e.target.closest('[data-row-up]') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
        });
        form.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.matches('.routine-row input')) {
            e.preventDefault();
            rows.insertAdjacentHTML('beforeend', row());
            rows.lastElementChild.querySelector('input').focus();
          }
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const next = [...rows.querySelectorAll('.routine-row')].map((li) => {
            const title = li.querySelector('input').value.trim();
            const low = title.toLowerCase();
            const link = /retur/.test(low) ? 'retur' : /delivery order|\bd\.?o\b/.test(low) ? 'do' : undefined;
            return { id: li.dataset.id || undefined, title, link };
          }).filter((x) => x.title);
          P.store.setWorkRoutine(next);
          P.ui.toast('Rutinitas kerja disimpan.', { tone: 'success' });
          close();
        });
      },
    });
  }

  // ----- Retur & Delivery Order -----

  function returRow(c, today) {
    const s = L.returStatus(c, today);
    const badge = s.done
      ? `Selesai ${D.formatShort(c.endDate)}${s.late ? ` · lewat ${s.late} hari` : ' · sesuai SLA'}`
      : s.late ? `Lewat SLA ${s.late} hari` : s.left === 0 ? `Hari terakhir (${s.day}/${c.sla})` : `Hari ke-${s.day}/${c.sla} · sisa ${s.left} hari`;
    return `
      <li class="sla-item${s.done ? ' is-done' : ''}" data-case="${esc(c.id)}" data-tone="${s.tone}">
        <button type="button" class="sla-check" data-case-done role="checkbox" aria-checked="${s.done}" aria-label="Tandai retur ${esc(c.title)} selesai">${icon('check')}</button>
        <button type="button" class="sla-main" data-case-open>
          <span class="sla-title">${esc(c.title)}</span>
          <span class="sla-meta">Mulai ${esc(dateShort(c.startDate, today))} · batas ${esc(dateShort(s.due, today))}${c.note ? ` · ${esc(c.note)}` : ''}</span>
          ${s.done ? '' : `<span class="sla-bar" aria-hidden="true"><span style="width:${Math.min(100, Math.round((s.day / c.sla) * 100))}%"></span></span>`}
        </button>
        <span class="sla-badge">${esc(badge)}</span>
      </li>`;
  }

  function doRow(c, today, now) {
    const s = L.doStatus(c, now);
    const due = clock(s.dueTs);
    const badge = s.done
      ? `Selesai ${clock(c.doneAt)}${s.late ? ` · terlambat ${dur(s.late)}` : ' · tepat waktu'}`
      : s.late ? `Terlambat ${dur(s.late)}` : `Sisa ${dur(s.left)}`;
    return `
      <li class="sla-item${s.done ? ' is-done' : ''}" data-case="${esc(c.id)}" data-tone="${s.tone}">
        <button type="button" class="sla-check" data-case-done role="checkbox" aria-checked="${s.done}" aria-label="Tandai DO ${esc(c.title)} selesai">${icon('check')}</button>
        <button type="button" class="sla-main" data-case-open>
          <span class="sla-title">${esc(c.title)}</span>
          <span class="sla-meta">${c.date !== today ? `${esc(dateShort(c.date, today))} · ` : ''}mulai ${esc(c.time)} · batas ${esc(due)}${c.note ? ` · ${esc(c.note)}` : ''}</span>
        </button>
        <span class="sla-badge">${esc(badge)}</span>
      </li>`;
  }

  /** Dua kartu: Retur (SLA hari) dan Delivery Order (SLA menit). */
  function slaSection(ctx) {
    const s = st().settings;
    const today = ctx.today;
    const now = ctx.now ? ctx.now.getTime() : Date.now();
    const cases = st().cases;
    const returs = L.openReturs(cases, today);
    const future = cases.filter((c) => c.type === 'retur' && !c.endDate && c.startDate > today);
    const returDone = cases.filter((c) => c.type === 'retur' && c.endDate && D.diffDays(c.endDate, today) <= 14)
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    const dos = L.openDOs(cases);
    const doDone = cases.filter((c) => c.type === 'do' && c.doneAt && D.todayKey(new Date(c.doneAt)) === ctx.date)
      .sort((a, b) => b.doneAt - a.doneAt);
    const returLate = returs.filter((c) => L.returStatus(c, today).late).length;
    const doLate = dos.filter((c) => L.doStatus(c, now).late).length;
    const remind = s.returReminder ? `🔔 Diingatkan setiap hari pukul ${esc(s.returRemindAt)} selama masih ada retur.` : '🔕 Pengingat retur dimatikan (Pengaturan → Kerja).';
    return `
      <div class="sla-grid" data-key="sla">
        <section class="sla-card" data-type="retur">
          <div class="sla-head">
            <h2><span aria-hidden="true">📦</span> Retur <span class="count">${returs.length} aktif${returLate ? ` · <span class="warn-text">${returLate} lewat SLA</span>` : ''}</span></h2>
            <button type="button" class="btn small secondary" data-work="retur-new">${icon('plus')}Retur</button>
          </div>
          <p class="sla-rule">SLA maksimal ${s.returSla} hari · ${remind}</p>
          ${returs.length || future.length
            ? `<ul class="sla-list">${[...returs, ...future].map((c) => returRow(c, today)).join('')}</ul>`
            : '<p class="sla-empty">Belum ada retur aktif. Tambahkan customer yang retur, lalu tandai selesai saat beres.</p>'}
          ${returDone.length ? `
            <details class="sla-done">
              <summary>Selesai 14 hari terakhir <span class="muted">${returDone.length}</span></summary>
              <ul class="sla-list">${returDone.map((c) => returRow(c, today)).join('')}</ul>
            </details>` : ''}
        </section>
        <section class="sla-card" data-type="do">
          <div class="sla-head">
            <h2><span aria-hidden="true">🚚</span> Delivery Order <span class="count">${dos.length} aktif${doLate ? ` · <span class="warn-text">${doLate} terlambat</span>` : ''}</span></h2>
            <button type="button" class="btn small secondary" data-work="do-new">${icon('plus')}DO</button>
          </div>
          <p class="sla-rule">SLA maksimal ${esc(dur(s.doSla))} sejak DO diterima · diingatkan 15 menit sebelum batas.</p>
          ${dos.length
            ? `<ul class="sla-list">${dos.map((c) => doRow(c, today, now)).join('')}</ul>`
            : '<p class="sla-empty">Tidak ada DO yang sedang berjalan.</p>'}
          ${doDone.length ? `
            <details class="sla-done">
              <summary>Selesai ${esc(dateShort(ctx.date, today).toLowerCase())} <span class="muted">${doDone.length}</span></summary>
              <ul class="sla-list">${doDone.map((c) => doRow(c, today, now)).join('')}</ul>
            </details>` : ''}
        </section>
      </div>`;
  }

  function nowTime() {
    const n = new Date();
    return fmt(Math.floor(D.minutesOfDay(n) / 5) * 5);
  }

  /** Minta izin notifikasi (dipanggil dari klik pengguna) lalu daftarkan push pengingat retur. */
  async function askNotify() {
    if (!st().settings.returReminder || !('Notification' in root)) return;
    if (root.Notification.permission === 'default') {
      try {
        await root.Notification.requestPermission();
      } catch {
        /* abaikan */
      }
    }
    if (root.Notification.permission === 'granted') P.reminder.ensurePush();
  }

  /**
   * Formulir Retur / Delivery Order.
   * @param {'retur'|'do'} type
   * @param {object|null} c data yang diubah
   */
  function openCase(type, c = null, { date } = {}) {
    const s = st().settings;
    const today = D.todayKey();
    const isRetur = type === 'retur';
    const sla = c ? c.sla : isRetur ? s.returSla : s.doSla;
    const startDate = c ? (isRetur ? c.startDate : c.date) : (date && date <= today ? date : today);
    const title = c ? (isRetur ? 'Ubah retur' : 'Ubah Delivery Order') : isRetur ? 'Retur baru' : 'Delivery Order baru';
    P.ui.openDialog({
      title,
      body: `
        <form class="form" novalidate>
          <div class="field">
            <label for="cs-title">${isRetur ? 'Customer' : 'No. DO / customer'}</label>
            <input id="cs-title" name="title" type="text" maxlength="120" required value="${esc(c ? c.title : '')}" placeholder="${isRetur ? 'Mis. Toko Sumber Rejeki' : 'Mis. DO-0925-001 · Toko Abadi'}" autofocus>
          </div>
          <div class="field">
            <label for="cs-note">Keterangan <span class="muted">(opsional)</span></label>
            <input id="cs-note" name="note" type="text" maxlength="200" value="${esc(c ? c.note : '')}" placeholder="${isRetur ? 'Mis. 3 dus rusak, no. retur R-112' : 'Mis. 2 mobil, tujuan Bekasi'}">
          </div>
          <div class="field-row">
            <div class="field compact">
              <label for="cs-start">${isRetur ? 'Tanggal mulai' : 'Tanggal'}</label>
              <input id="cs-start" name="start" type="date" required value="${esc(startDate)}">
            </div>
            ${isRetur ? `
              <div class="field compact">
                <label for="cs-end">Tanggal selesai</label>
                <input id="cs-end" name="end" type="date" value="${esc(c && c.endDate ? c.endDate : '')}">
              </div>` : `
              <div class="field compact">
                <label for="cs-time-h">Jam DO diterima</label>
                ${P.ui.timeSelect({ id: 'cs-time', name: 'time', value: c ? c.time : nowTime(), optional: false, label: 'Jam DO diterima' })}
              </div>`}
          </div>
          <p class="sla-preview" data-sla-preview></p>
          <p class="form-error" role="alert" hidden></p>
          <div class="dialog-actions">
            ${c ? `<button type="button" class="btn ghost danger-text" data-case-del>${icon('trash')}Hapus</button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn primary">${c ? 'Simpan' : isRetur ? 'Tambah retur' : 'Tambah DO'}</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const error = form.querySelector('.form-error');
        const preview = form.querySelector('[data-sla-preview]');
        const paint = () => {
          const start = form.start.value;
          if (!D.isKey(start)) {
            preview.textContent = '';
            return;
          }
          if (isRetur) {
            const due = L.returDue({ startDate: start, sla });
            preview.innerHTML = `Batas SLA (${sla} hari): <strong>${esc(D.formatLong(due))}</strong>. ${s.returReminder ? `Diingatkan setiap hari pukul ${esc(s.returRemindAt)} sampai ditandai selesai.` : ''}`;
          } else {
            const t = D.parseTime(form.time.value) || 0;
            const dueTs = D.fromKey(start).getTime() + (t + sla) * 60000;
            preview.innerHTML = `Batas SLA (${esc(dur(sla))}): <strong>pukul ${esc(clock(dueTs))}</strong>${D.todayKey(new Date(dueTs)) !== start ? ` (${esc(D.formatShort(D.todayKey(new Date(dueTs))))})` : ''}.`;
          }
        };
        paint();
        form.addEventListener('change', paint);
        form.addEventListener('input', paint);
        const del = form.querySelector('[data-case-del]');
        if (del) {
          del.addEventListener('click', () => {
            const removed = P.store.deleteCase(c.id);
            close();
            if (removed) P.ui.toast(`"${removed.title}" dihapus.`, { action: 'Urungkan', onAction: () => P.store.restoreCase(removed) });
          });
        }
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const data = { id: c ? c.id : undefined, type, title: form.title.value, note: form.note.value.trim() };
          if (isRetur) {
            data.startDate = form.start.value;
            data.endDate = form.end.value || null;
          } else {
            data.date = form.start.value;
            data.time = form.time.value;
          }
          if (!D.isKey(form.start.value)) {
            error.textContent = 'Pilih tanggal yang valid.';
            error.hidden = false;
            return;
          }
          let saved;
          try {
            saved = P.store.saveCase(data);
          } catch (err) {
            error.textContent = err.message;
            error.hidden = false;
            return;
          }
          close();
          if (!c) {
            P.ui.toast(isRetur
              ? `Retur ${saved.title} dicatat. Batas ${D.formatShort(L.returDue(saved))}${s.returReminder ? `, diingatkan tiap hari pukul ${s.returRemindAt}` : ''}.`
              : `DO ${saved.title} dicatat. Batas pukul ${clock(L.doStatus(saved, Date.now()).dueTs)}.`, { tone: 'success', duration: 6000 });
            if (isRetur) askNotify();
          } else {
            P.ui.toast('Perubahan disimpan.');
          }
        });
      },
    });
  }

  function toggleCase(id) {
    const before = P.store.findCase(id);
    if (!before) return;
    const wasDone = before.type === 'retur' ? Boolean(before.endDate) : Boolean(before.doneAt);
    const c = P.store.toggleCaseDone(id);
    P.ui.haptic(wasDone ? 6 : 12);
    if (!c || wasDone) return;
    if (c.type === 'retur') {
      const s = L.returStatus(c, D.todayKey());
      P.ui.toast(`Retur ${c.title} selesai${s.late ? `, lewat SLA ${s.late} hari` : ' sesuai SLA'}.`, { tone: s.late ? 'warn' : 'success' });
    } else {
      const s = L.doStatus(c, Date.now());
      P.ui.toast(`DO ${c.title} selesai${s.late ? `, terlambat ${dur(s.late)}` : ' tepat waktu'}.`, { tone: s.late ? 'warn' : 'success' });
    }
  }

  // ----- Laporan -----

  /** Bagian laporan kerja: rutinitas, retur, dan DO. */
  function reportSections(date, mode) {
    const s = st().settings;
    const today = D.todayKey();
    const out = [];
    if (mode === 'hari') {
      const note = P.store.workNoteFor(date);
      const routine = L.workWindow(s, date).isWorkday ? s.workRoutine : [];
      const lines = [
        ...routine.map((r) => `${note.done.includes(r.id) ? '✅' : '⬜'} ${r.title}`),
        ...note.items.map((i) => `${i.done ? '✅' : '⬜'} ${i.text}`),
      ];
      out.push({ title: '📋 Catatan kerja', lines });
    }
    const keys = mode === 'pekan' ? D.weekKeys(date) : [date];
    const returs = st().cases.filter((c) => c.type === 'retur');
    const doneR = returs.filter((c) => c.endDate && keys.includes(c.endDate));
    const openR = L.openReturs(st().cases, keys[keys.length - 1] < today ? keys[keys.length - 1] : today);
    const rLines = [
      ...doneR.map((c) => {
        const x = L.returStatus(c, today);
        return `✅ ${c.title}: selesai ${D.formatShort(c.endDate)} (${x.day} hari${x.late ? `, lewat SLA ${x.late} hari` : ''})`;
      }),
      ...openR.map((c) => {
        const x = L.returStatus(c, today);
        return `⏳ ${c.title}: ${x.late ? `lewat SLA ${x.late} hari` : `hari ke-${x.day}/${c.sla}`}, batas ${D.formatShort(x.due)}`;
      }),
    ];
    out.push({ title: `📦 Retur (SLA ${s.returSla} hari)`, lines: rLines });
    const dos = st().cases.filter((c) => c.type === 'do' && keys.includes(c.date));
    const now = Date.now();
    const dLines = dos.sort((a, b) => L.doStartTs(a) - L.doStartTs(b)).map((c) => {
      const x = L.doStatus(c, now);
      const when = mode === 'pekan' ? `${D.dayShort(c.date)} ` : '';
      if (x.done) return `✅ ${c.title}: ${when}${c.time} → selesai ${clock(c.doneAt)}${x.late ? ` (terlambat ${dur(x.late)})` : ' (tepat waktu)'}`;
      return `⏳ ${c.title}: ${when}${c.time}, batas ${clock(x.dueTs)}${x.late ? ` (terlambat ${dur(x.late)})` : ''}`;
    });
    if (dos.length) {
      const onTime = dos.filter((c) => c.doneAt && !L.doStatus(c, now).late).length;
      dLines.push(`_${onTime} dari ${dos.length} DO selesai tepat waktu_`);
    }
    out.push({ title: `🚚 Delivery Order (SLA ${dur(s.doSla)})`, lines: dLines });
    return out;
  }

  // ----- Pengingat -----

  function showNotification(title, body, tag) {
    if (!('Notification' in root) || root.Notification.permission !== 'granted') return;
    const opts = { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: './#kerja' } };
    const sw = root.navigator.serviceWorker;
    if (sw && sw.controller) {
      sw.ready.then((reg) => reg.showNotification(title, opts)).catch(() => {});
      return;
    }
    try {
      new root.Notification(title, opts);
    } catch {
      /* opsional */
    }
  }

  const doAlerts = new Set();

  /** Dipanggil tiap menit: pengingat retur harian & batas SLA Delivery Order. */
  function onMinute(now = new Date()) {
    const s = st().settings;
    const today = D.todayKey(now);
    const hhmm = fmt(D.minutesOfDay(now));

    if (s.returReminder && hhmm === s.returRemindAt) {
      const open = L.openReturs(st().cases, today);
      let fresh = true;
      try {
        fresh = root.localStorage.getItem(RETUR_LAST_KEY) !== today;
        if (fresh && open.length) root.localStorage.setItem(RETUR_LAST_KEY, today);
      } catch {
        /* tanpa localStorage tetap jalan */
      }
      if (open.length && fresh) {
        const text = `${open.length} retur perlu diurus: ${L.returSummary(open, today)}.`;
        P.ui.toast(`📦 ${text}`, { tone: 'warn', duration: 20000, action: 'Buka', onAction: () => P.app.go('kerja') });
        if (doc.hidden) showNotification(`Waktunya mengurus retur (${open.length})`, L.returSummary(open, today), 'pengingat-retur');
      }
    }

    for (const c of L.openDOs(st().cases)) {
      const x = L.doStatus(c, now.getTime());
      const stage = x.left === 15 ? 'soon' : x.left === 0 ? 'due' : null;
      if (!stage || doAlerts.has(`${c.id}:${stage}`)) continue;
      doAlerts.add(`${c.id}:${stage}`);
      const text = stage === 'soon'
        ? `DO ${c.title}: 15 menit lagi batas SLA (${clock(x.dueTs)}).`
        : `DO ${c.title} sudah mencapai batas SLA ${dur(c.sla)}.`;
      P.ui.toast(`🚚 ${text}`, { tone: 'warn', duration: 15000, action: 'Buka', onAction: () => P.app.go('kerja') });
      if (doc.hidden) showNotification('Delivery Order', text, `do-${c.id}`);
    }
  }

  /**
   * Ringkasan untuk service worker: saat notifikasi push datang pada jam pengingat retur,
   * service worker membaca daftar retur dari sini (push dikirim tanpa isi).
   */
  let digestTimer = null;
  function writeDigest() {
    // Ditulis paling lambat 0,8 detik setelah perubahan pertama (membaca status terbaru saat itu),
    // jadi perubahan beruntun tidak menunda penulisan tanpa batas.
    if (digestTimer) return;
    digestTimer = setTimeout(async () => {
      digestTimer = null;
      if (!root.caches) return;
      const s = st().settings;
      const today = D.todayKey();
      const open = L.openReturs(st().cases, today);
      const body = {
        returReminder: Boolean(s.returReminder),
        returAt: s.returRemindAt,
        count: open.length,
        summary: L.returSummary(open.slice(0, 5), today),
        updatedAt: Date.now(),
      };
      try {
        const cache = await root.caches.open(DIGEST_CACHE);
        await cache.put(DIGEST_URL, new root.Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
      } catch {
        /* opsional */
      }
    }, 800);
  }

  function init() {
    P.store.onCommit(writeDigest);
    writeDigest();
  }

  // ----- Klik & kirim di halaman Rencana Kerja -----

  /** @returns {boolean} */
  function handleClick(e, ctx) {
    const toggle = e.target.closest('[data-note-toggle]');
    if (toggle) {
      onNoteToggle(toggle.closest('[data-note]'), ctx.date);
      return true;
    }
    const del = e.target.closest('[data-note-del]');
    if (del) {
      const id = del.closest('[data-note]').dataset.note;
      const removed = P.store.deleteWorkNote(ctx.date, id);
      if (removed) P.ui.toast(`Catatan "${removed.item.text}" dihapus.`, { action: 'Urungkan', onAction: () => P.store.restoreWorkNote(ctx.date, removed) });
      return true;
    }
    const caseRow = e.target.closest('[data-case]');
    if (caseRow) {
      const c = P.store.findCase(caseRow.dataset.case);
      if (!c) return true;
      if (e.target.closest('[data-case-done]')) toggleCase(c.id);
      else if (e.target.closest('[data-case-open]')) openCase(c.type, c);
      return true;
    }
    const b = e.target.closest('[data-work]');
    if (!b) return false;
    switch (b.dataset.work) {
      case 'routine': openRoutine(); return true;
      case 'retur-new': openCase('retur', null, { date: ctx.date }); return true;
      case 'do-new': openCase('do', null, { date: ctx.date }); return true;
      default: return false;
    }
  }

  /** @returns {boolean} */
  function handleSubmit(e, ctx) {
    const form = e.target.closest('[data-note-add]');
    if (!form) return false;
    e.preventDefault();
    const input = form.querySelector('input');
    if (P.store.addWorkNote(ctx.date, input.value)) {
      input.value = '';
      input.focus();
    }
    return true;
  }

  P.ops = {
    notesCard, slaSection, openCase, openRoutine, reportSections, onMinute, init, handleClick, handleSubmit, writeDigest,
  };
})(typeof self !== 'undefined' ? self : this);
