/** Pengaturan: profil, tampilan, target, pomodoro, pengingat, dan data. */
(function (root) {
  'use strict';
  const P = root.Planner;
  const { esc, icon } = P.ui;

  const SHORTCUTS = [
    ['N', 'Tugas baru'],
    ['/', 'Tambah cepat di Beranda'],
    ['T', 'Kembali ke hari ini'],
    ['← / →', 'Hari sebelumnya / berikutnya'],
    ['1 – 8', 'Pindah halaman'],
    ['Spasi', 'Mulai / jeda timer (di halaman Fokus)'],
    ['Ctrl + K', 'Cari tugas'],
    ['?', 'Tampilkan pintasan'],
  ];

  function numberField(id, label, value, min, max, suffix) {
    return `
      <div class="field compact">
        <label for="${id}">${esc(label)}</label>
        <div class="with-suffix">
          <input id="${id}" type="number" inputmode="numeric" min="${min}" max="${max}" value="${value}" data-setting="${id.replace('set-', '')}">
          <span>${esc(suffix)}</span>
        </div>
      </div>`;
  }

  function hourOptions(value, from, to) {
    let out = '';
    for (let h = from; h <= to; h += 1) out += `<option value="${h}" ${h === value ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`;
    return out;
  }

  function render(ctx) {
    const s = ctx.state.settings;
    const notifSupported = 'Notification' in root;
    const perm = notifSupported ? root.Notification.permission : 'unsupported';
    const counts = ctx.state;

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">Pengaturan</p>
          <h1>Sesuaikan dengan ritme harianmu</h1>
        </div>
      </header>

      <div class="settings">
        <section class="panel">
          <h2>Profil & tampilan</h2>
          <div class="field">
            <label for="set-name">Nama panggilan</label>
            <input id="set-name" type="text" maxlength="30" value="${esc(s.name)}" placeholder="Dipakai di sapaan Beranda" data-setting="name">
          </div>
          <fieldset class="field">
            <legend>Tema</legend>
            <div class="segmented" role="radiogroup">
              ${[['system', 'Ikuti perangkat'], ['light', 'Terang'], ['dark', 'Gelap']].map(([v, l]) => `
                <button type="button" role="radio" data-theme-choice="${v}" aria-checked="${s.theme === v}" aria-pressed="${s.theme === v}">${esc(l)}</button>`).join('')}
            </div>
          </fieldset>
        </section>

        <section class="panel">
          <h2>Target & linimasa</h2>
          <div class="field-row">
            ${numberField('set-waterGoal', 'Target air minum', s.waterGoal, 1, 16, 'gelas')}
          </div>
          <div class="field-row">
            <div class="field compact">
              <label for="set-dayStart">Linimasa mulai</label>
              <select id="set-dayStart" data-setting="dayStart">${hourOptions(s.dayStart, 0, 12)}</select>
            </div>
            <div class="field compact">
              <label for="set-dayEnd">Linimasa selesai</label>
              <select id="set-dayEnd" data-setting="dayEnd">${hourOptions(s.dayEnd, 13, 24)}</select>
            </div>
          </div>
        </section>

        <section class="panel">
          <h2>Pomodoro</h2>
          <div class="field-row">
            ${numberField('set-focusMin', 'Fokus', s.focusMin, 5, 120, 'menit')}
            ${numberField('set-shortMin', 'Istirahat pendek', s.shortMin, 1, 30, 'menit')}
          </div>
          <div class="field-row">
            ${numberField('set-longMin', 'Istirahat panjang', s.longMin, 5, 60, 'menit')}
            ${numberField('set-longEvery', 'Istirahat panjang setiap', s.longEvery, 2, 8, 'sesi')}
          </div>
        </section>

        <section class="panel">
          <h2>Waktu sholat</h2>
          <label class="switch-row">
            <input id="set-prayerEnabled" type="checkbox" data-setting="prayerEnabled" ${s.prayerEnabled ? 'checked' : ''}>
            <span>Tampilkan jadwal sholat di Beranda dan linimasa, serta ingatkan saat waktunya tiba</span>
          </label>
          <div class="field">
            <label for="set-prayerCity">Kota</label>
            <select id="set-prayerCity" data-setting="prayerCity" ${s.prayerEnabled ? '' : 'disabled'}>
              ${['WIB', 'WITA', 'WIT'].map((z) => `<optgroup label="${z}">${P.prayer.CITIES.filter((c) => c.zone === z).map((c) => `<option value="${c.id}" ${c.id === s.prayerCity ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('')}
            </select>
          </div>
          <p class="hint">Dihitung di perangkat dengan kriteria Kementerian Agama (Subuh 20°, Isya 18°, ihtiyath 2 menit). Hasil dapat selisih 1–2 menit dari jadwal resmi.</p>
        </section>

        <section class="panel">
          <h2>Pengingat</h2>
          <label class="switch-row">
            <input id="set-reminders" type="checkbox" data-setting="reminders" ${s.reminders ? 'checked' : ''}>
            <span>Beri tahu saat tugas berjam akan dimulai (selama aplikasi terbuka)</span>
          </label>
          <label class="switch-row">
            <input id="set-sound" type="checkbox" data-setting="sound" ${s.sound ? 'checked' : ''}>
            <span>Bunyikan nada saat sesi Pomodoro selesai</span>
          </label>
          ${notifSupported && perm === 'default' ? `<button type="button" class="btn ghost small" data-act="notif">${icon('bell')}Izinkan notifikasi browser</button>` : ''}
          <p class="hint">${perm === 'granted' ? 'Notifikasi browser aktif.' : perm === 'denied' ? 'Notifikasi browser diblokir. Pengingat tetap muncul di dalam aplikasi.' : notifSupported ? 'Tanpa izin notifikasi, pengingat tetap muncul di dalam aplikasi.' : 'Browser ini tidak mendukung notifikasi; pengingat muncul di dalam aplikasi.'}</p>
        </section>

        <section class="panel wide">
          <h2>Data</h2>
          <p class="muted">Semua data tersimpan di browser ini saja (${counts.tasks.length} tugas, ${counts.habits.length} kebiasaan, ${Object.keys(counts.journal).length} catatan jurnal). Buat cadangan sebelum ganti perangkat atau membersihkan data browser.</p>
          ${P.store.storageOk ? '' : '<p class="form-error">Penyimpanan browser tidak tersedia, jadi perubahan akan hilang saat halaman ditutup. Ekspor data untuk menyimpannya.</p>'}
          <div class="button-row">
            <button type="button" class="btn secondary" data-act="export">${icon('download')}Unduh cadangan (.json)</button>
            <button type="button" class="btn ghost" data-act="copy">${icon('copy')}Salin sebagai teks</button>
            <label class="btn ghost file-btn">${icon('upload')}Pulihkan dari berkas
              <input id="import-file" type="file" accept="application/json,.json" data-act="import">
            </label>
          </div>
          <div class="button-row">
            <button type="button" class="btn ghost" data-act="sample">Muat contoh data</button>
            <button type="button" class="btn ghost danger-text" data-act="clear">${icon('trash')}Hapus semua data</button>
          </div>
        </section>

        <section class="panel wide">
          <h2>Pintasan keyboard</h2>
          <dl class="shortcuts">
            ${SHORTCUTS.map(([k, v]) => `<div><dt><kbd>${esc(k)}</kbd></dt><dd>${esc(v)}</dd></div>`).join('')}
          </dl>
        </section>
      </div>`;
  }

  function mount(el) {
    const store = P.store;

    el.addEventListener('change', async (e) => {
      const input = e.target;
      if (input.dataset.act === 'import') {
        const file = input.files && input.files[0];
        if (!file) return;
        const ok = await P.ui.confirmDialog({
          title: 'Pulihkan dari cadangan?',
          message: `Data yang ada sekarang akan diganti dengan isi "${file.name}".`,
          confirmText: 'Pulihkan',
        });
        if (!ok) {
          input.value = '';
          return;
        }
        try {
          store.importData(await file.text());
          P.app.applyTheme();
          P.ui.toast('Data berhasil dipulihkan.', { tone: 'success' });
        } catch (err) {
          P.ui.toast(err.message, { tone: 'warn' });
        }
        return;
      }
      const key = input.dataset.setting;
      if (!key) return;
      let value;
      if (input.type === 'checkbox') value = input.checked;
      else if (input.tagName === 'SELECT' && input.dataset.setting === 'prayerCity') value = input.value;
      else if (input.type === 'number' || input.tagName === 'SELECT') {
        value = Number(input.value);
        const min = Number(input.min || 0);
        const max = Number(input.max || 999);
        if (!Number.isFinite(value)) return;
        value = Math.round(Math.max(min, Math.min(max, value)));
      } else value = input.value.trim();
      store.setSettings({ [key]: value });
    });

    el.addEventListener('click', async (e) => {
      const theme = e.target.closest('[data-theme-choice]');
      if (theme) {
        store.setSettings({ theme: theme.dataset.themeChoice });
        P.app.applyTheme();
        return;
      }
      const act = e.target.closest('button[data-act]');
      if (!act) return;
      switch (act.dataset.act) {
        case 'export':
          P.ui.download(`rencana-harian-${P.date.todayKey()}.json`, store.exportData());
          P.ui.toast('Cadangan diunduh.');
          break;
        case 'copy':
          if (await P.ui.copyText(store.exportData())) P.ui.toast('Data disalin ke papan klip.');
          else P.ui.toast('Browser menolak akses papan klip. Gunakan tombol unduh.', { tone: 'warn' });
          break;
        case 'notif':
          try {
            await root.Notification.requestPermission();
          } catch {
            /* diabaikan */
          }
          P.app.refresh();
          break;
        case 'sample': {
          const ok = await P.ui.confirmDialog({
            title: 'Muat contoh data?',
            message: 'Data yang ada sekarang akan diganti dengan contoh data. Unduh cadangan dulu bila perlu.',
            confirmText: 'Muat contoh',
          });
          if (ok) store.loadSample();
          break;
        }
        case 'clear': {
          const ok = await P.ui.confirmDialog({
            title: 'Hapus semua data?',
            message: 'Semua tugas, kebiasaan, jurnal, dan sesi fokus akan dihapus permanen dari browser ini.',
            confirmText: 'Hapus semua',
            danger: true,
          });
          if (ok) {
            store.clearAll();
            P.ui.toast('Semua data dihapus.');
          }
          break;
        }
        default:
      }
    });
  }

  (P.views = P.views || {}).pengaturan = { title: 'Pengaturan', render, mount, SHORTCUTS };
})(typeof self !== 'undefined' ? self : this);
