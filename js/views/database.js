/**
 * Database: data aplikasi terbagi per fungsi (Kerja, Pribadi, Olahraga, Kebiasaan & Kesehatan,
 * Jurnal, Fokus, Pengaturan & Template) ditambah pustaka Musik. Tiap database bisa dilihat
 * isinya, diekspor, diimpor (digabung), atau dikosongkan (bisa diurungkan).
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const DB = P.databases;
  const { esc, icon } = P.ui;

  const tint = (db) => `--c1:${db.colors[0]};--c2:${db.colors[1]};--c3:${db.colors[2]}`;

  function bytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0).replace('.', ',')} KB`;
    return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  /** Kunci yang belum terkirim, dikelompokkan per database. */
  function pendingByDb(state) {
    const out = Object.fromEntries(DB.IDS.map((id) => [id, 0]));
    const keys = P.sync.pendingKeys ? P.sync.pendingKeys() : [];
    if (!keys.length) return out;
    const flat = P.syncmap.flatten(state);
    for (const k of keys) out[k in flat ? DB.dbOf(k, flat[k]) : DB.family(k)[0]] += 1;
    return out;
  }

  function syncChip(info, pending) {
    if (!info.loggedIn) return `<span class="dbc-sync local" title="Belum masuk akun: hanya di perangkat ini">${icon('cloudOff')}Di perangkat</span>`;
    if (pending) return `<span class="dbc-sync wait">${icon('refresh')}${pending} menunggu</span>`;
    return `<span class="dbc-sync ok">${icon('cloudCheck')}Tersinkron</span>`;
  }

  function card(db, part, size, pending, info) {
    const counts = DB.counts(db.id, part);
    const total = counts.filter((c) => c.field !== 'settings').reduce((n, c) => n + c.count, 0);
    const canClear = db.id !== 'umum';
    return `
      <article class="panel dbc" data-db="${db.id}" style="${tint(db)}">
        <header class="dbc-head">
          <span class="dbc-ic" aria-hidden="true">${icon(db.icon)}</span>
          <div class="dbc-title">
            <h2>${esc(db.name)}</h2>
            <p>${esc(db.desc)}</p>
          </div>
        </header>
        <dl class="dbc-stats">
          ${counts.map((c) => `<div${c.count ? '' : ' class="zero"'}><dt>${esc(c.label)}</dt><dd>${c.count}</dd></div>`).join('')}
        </dl>
        <footer class="dbc-foot">
          <div class="dbc-meta">
            <span class="dbc-size">${icon('database', 'inline')} ${total} data · ${bytes(size)}</span>
            ${syncChip(info, pending)}
          </div>
          <div class="dbc-actions">
            <button type="button" class="btn small ghost" data-db-view="${db.id}">${icon('search')}Lihat isi</button>
            <button type="button" class="btn small ghost" data-db-export="${db.id}">${icon('download')}Ekspor</button>
            <label class="btn small ghost file-btn">${icon('upload')}Impor
              <input type="file" accept="application/json,.json" data-db-import="${db.id}" aria-label="Impor ke ${esc(db.name)}">
            </label>
            ${canClear ? `<button type="button" class="icon-btn dbc-clear" data-db-clear="${db.id}" title="Kosongkan ${esc(db.name)}" aria-label="Kosongkan ${esc(db.name)}">${icon('trash')}</button>` : ''}
          </div>
        </footer>
      </article>`;
  }

  /** Pustaka musik: database tersendiri (perangkat + akun), dikelola di aplikasi Musik. */
  function musicCard(info) {
    const lib = P.musicLib;
    const tracks = lib ? lib.tracks() : [];
    const mine = tracks.filter((t) => !t.builtin && (t.onDevice || t.inCloud));
    const cloud = tracks.filter((t) => t.inCloud).length;
    const usage = lib ? lib.usage() : {};
    return `
      <article class="panel dbc" data-db="musik" style="--c1:#c026d3;--c2:#f5c9fb;--c3:#6b1170">
        <header class="dbc-head">
          <span class="dbc-ic" aria-hidden="true">${icon('music')}</span>
          <div class="dbc-title">
            <h2>Database Musik</h2>
            <p>Lagu yang kamu impor: tersimpan di perangkat ini dan di akun (dibagi per potongan).</p>
          </div>
        </header>
        <dl class="dbc-stats">
          <div><dt>semua lagu</dt><dd>${tracks.length}</dd></div>
          <div${mine.length ? '' : ' class="zero"'}><dt>lagu impor</dt><dd>${mine.length}</dd></div>
          <div${cloud ? '' : ' class="zero"'}><dt>di akun</dt><dd>${cloud}</dd></div>
        </dl>
        <footer class="dbc-foot">
          <div class="dbc-meta">
            <span class="dbc-size">${icon('database', 'inline')} ${usage.limit ? `${bytes(usage.used || 0)} dari ${bytes(usage.limit)} di akun` : 'Terpisah dari data rencana'}</span>
            ${info.loggedIn ? `<span class="dbc-sync ok">${icon('cloudCheck')}Akun</span>` : `<span class="dbc-sync local">${icon('cloudOff')}Di perangkat</span>`}
          </div>
          <div class="dbc-actions">
            <button type="button" class="btn small ghost" data-db-music>${icon('music')}Buka Musik</button>
          </div>
        </footer>
      </article>`;
  }

  function render(ctx) {
    const { state } = ctx;
    const parts = DB.split(state);
    const sizes = P.store.dbSizes();
    const info = P.sync.info();
    const pending = pendingByDb(state);
    // Pengaturan tidak dihitung sebagai "data" (isinya banyak kunci kecil).
    const total = DB.IDS.reduce((n, id) => n + DB.counts(id, parts[id]).filter((c) => c.field !== 'settings').reduce((m, c) => m + c.count, 0), 0);
    const where = info.loggedIn
      ? `Tiap database tersimpan terpisah di perangkat ini dan di akunmu${info.user && info.user.email ? ` (${esc(info.user.email)})` : ''}.`
      : 'Tiap database tersimpan terpisah di perangkat ini. Masuk akun agar ikut tersimpan di server.';
    return `
      ${P.ui.pageHead({
        app: 'database',
        context: 'Per fungsi',
        title: `${total} data di ${DB.IDS.length + 1} database`,
        meta: `<span>${where}</span>`,
        actions: `<button type="button" class="btn ghost" data-db-all>${icon('download')}Cadangan semua</button>`,
      })}
      <div class="dbc-grid">
        ${DB.DBS.map((db) => card(db, parts[db.id], sizes[db.id] || 0, pending[db.id], info)).join('')}
        ${musicCard(info)}
      </div>
      <p class="hint">Ekspor menyimpan satu database sebagai berkas .json. Impor menggabungkan isi berkas ke database itu tanpa menghapus data yang ada. Cadangan lengkap (semua database) bisa juga diimpor per database: hanya bagian database itu yang diambil.</p>`;
  }

  // ----- Lihat isi -----

  /** Satu baris ringkas untuk satu data: [judul, keterangan]. */
  function describe(field, key, item) {
    const v = item && typeof item === 'object' ? item : {};
    const when = (d) => (typeof d === 'string' && D.isKey(d) ? D.formatShort(d) : '');
    switch (field) {
      case 'tasks': return [v.title || '(tanpa judul)', [when(v.date), v.start ? `${v.start}${v.end ? `–${v.end}` : ''}` : '', v.done ? 'selesai' : ''].filter(Boolean).join(' · ')];
      case 'series': return [v.title || '(tanpa judul)', 'tugas berulang'];
      case 'projects': return [v.name || v.title || key, v.status || ''];
      case 'cases': return [`${v.type === 'do' ? 'Delivery Order' : 'Retur'}: ${v.title || ''}`, [when(v.startDate), v.endDate || v.doneAt ? 'selesai' : 'berjalan'].filter(Boolean).join(' · ')];
      case 'runs': return [`${P.run.formatKm(Number(v.km) || 0, 2)} km`, [when(v.date), v.sec ? P.run.formatClock(v.sec) : ''].filter(Boolean).join(' · ')];
      case 'coachChats':
      case 'coachTrash': return [v.title || 'Sesi coach', `${(v.messages || []).length} pesan`];
      case 'savedRoutes': return [v.name || 'Rute', v.km ? `${P.run.formatKm(Number(v.km), 1)} km` : ''];
      case 'habits': return [v.name || key, v.archived ? 'diarsipkan' : ''];
      case 'focusSessions': return [`${v.minutes || 0} menit fokus`, when(v.date)];
      case 'templates': return [v.name || key, `${(v.tasks || []).length} tugas`];
      case 'settings': return [key, typeof item === 'object' ? JSON.stringify(item).slice(0, 60) : String(item)];
      default: {
        const date = when(key) || key;
        if (Array.isArray(item)) return [date, `${item.length} isian`];
        if (item && typeof item === 'object') return [date, Object.keys(item).slice(0, 4).join(', ')];
        return [date, String(item)];
      }
    }
  }

  function rows(field, value) {
    const list = Array.isArray(value)
      ? value.map((x) => [x && x.id, x])
      : Object.entries(value || {}).sort((a, b) => String(b[0]).localeCompare(String(a[0])));
    return list.map(([key, item]) => {
      const [title, sub] = describe(field, String(key), item);
      return { title: String(title), sub: String(sub || '') };
    });
  }

  function openViewer(id) {
    const db = DB.byId[id];
    const part = DB.split(P.store.state)[id];
    const groups = db.fields.map(([field, label]) => ({ field, label, rows: rows(field, part[field]) }));
    const LIMIT = 200;
    const list = (q) => groups.map((g) => {
      const match = q ? g.rows.filter((r) => `${r.title} ${r.sub}`.toLowerCase().includes(q)) : g.rows;
      if (!match.length) return q ? '' : `<section class="dbv-group"><h3>${esc(g.label)} <span>0</span></h3><p class="muted">Kosong.</p></section>`;
      return `
        <section class="dbv-group">
          <h3>${esc(g.label)} <span>${match.length}</span></h3>
          <ul class="dbv-list">
            ${match.slice(0, LIMIT).map((r) => `<li><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</li>`).join('')}
          </ul>
          ${match.length > LIMIT ? `<p class="muted">… dan ${match.length - LIMIT} lainnya. Ekspor untuk melihat semuanya.</p>` : ''}
        </section>`;
    }).join('') || '<p class="muted">Tidak ada yang cocok.</p>';
    P.ui.openDialog({
      title: db.name,
      body: `
        <div class="dbv" style="${tint(db)}">
          <label class="dbv-search"><span class="sr-only">Cari di ${esc(db.name)}</span>${icon('search')}
            <input type="text" placeholder="Cari di ${esc(db.name)}…" data-dbv-q autocomplete="off">
          </label>
          <div class="dbv-body" data-dbv-body>${list('')}</div>
        </div>`,
      onMount(el) {
        const q = el.querySelector('[data-dbv-q]');
        const body = el.querySelector('[data-dbv-body]');
        q.addEventListener('input', () => { body.innerHTML = list(q.value.trim().toLowerCase()); });
      },
    });
  }

  // ----- Aksi -----

  function mount(el) {
    el.addEventListener('click', async (e) => {
      const t = e.target;
      const view = t.closest('[data-db-view]');
      if (view) return openViewer(view.dataset.dbView);
      const exp = t.closest('[data-db-export]');
      if (exp) {
        const id = exp.dataset.dbExport;
        P.ui.download(`rencana-harian-${id}-${D.todayKey()}.json`, P.store.exportDb(id));
        P.ui.toast(`${DB.byId[id].name} diekspor.`, { tone: 'success' });
        return undefined;
      }
      if (t.closest('[data-db-all]')) {
        P.ui.download(`rencana-harian-${D.todayKey()}.json`, P.store.exportData());
        P.ui.toast('Cadangan semua database diunduh.', { tone: 'success' });
        return undefined;
      }
      if (t.closest('[data-db-music]')) return P.launcher.runApp('musik', t.closest('button'));
      const clear = t.closest('[data-db-clear]');
      if (clear) {
        const id = clear.dataset.dbClear;
        const db = DB.byId[id];
        const ok = await P.ui.confirmDialog({
          title: `Kosongkan ${db.name}?`,
          message: `Semua isi ${db.name} di perangkat ini${P.sync.info().loggedIn ? ' dan di akunmu' : ''} akan dihapus. Database lain tidak tersentuh. Masih bisa diurungkan sesaat setelahnya.`,
          confirmText: 'Kosongkan',
          danger: true,
        });
        if (!ok) return undefined;
        const before = P.store.clearDb(id);
        P.ui.toast(`${db.name} dikosongkan.`, { action: 'Urungkan', onAction: () => P.store.restoreDb(id, before), duration: 8000 });
      }
      return undefined;
    });
    el.addEventListener('change', async (e) => {
      const input = e.target.closest('[data-db-import]');
      if (!input) return;
      const file = input.files && input.files[0];
      if (!file) return;
      const id = input.dataset.dbImport;
      try {
        const n = P.store.importDb(id, await file.text());
        if (id === 'umum') P.app.applyTheme();
        P.ui.toast(n ? `${n} data masuk ke ${DB.byId[id].name}.` : `Tidak ada data ${DB.byId[id].name} di berkas itu.`, { tone: n ? 'success' : 'warn' });
      } catch (err) {
        P.ui.toast(err.message, { tone: 'warn' });
      } finally {
        input.value = '';
      }
    });
    // Status sinkron per database ikut diperbarui.
    return P.sync.onStatus(() => P.app.refreshIfIdle && P.app.refreshIfIdle());
  }

  (P.views = P.views || {}).database = { title: 'Database', render, mount };
})(typeof self !== 'undefined' ? self : this);
