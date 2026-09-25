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

  function clock(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  }

  /** Baris status pengingat per jam: izin, push (aplikasi tertutup), penjadwal server. */
  function hourlyStatus(s) {
    const R = P.reminder;
    const sup = R.support();
    const perm = R.permission();
    const info = R.info;
    const sync = P.sync.info();
    const rows = [];
    const row = (ok, text) => rows.push(`<li data-ok="${ok}">${ok === 'yes' ? icon('check') : ok === 'no' ? icon('x') : icon('clock')}<span>${text}</span></li>`);

    if (!sup.notif) row('no', 'Browser ini tidak mendukung notifikasi. Pengingat muncul di dalam aplikasi saat terbuka.');
    else if (perm === 'granted') row('yes', 'Notifikasi browser diizinkan.');
    else if (perm === 'denied') row('no', 'Notifikasi diblokir. Buka pengaturan situs di browser (ikon gembok di bilah alamat) lalu izinkan notifikasi.');
    else row('wait', 'Notifikasi belum diizinkan. Nyalakan pengingat untuk memintanya.');

    if (!s.hourly) {
      row('wait', 'Pengingat per jam sedang mati.');
    } else if (sup.ios && !sup.standalone) {
      row('wait', 'Di iPhone/iPad: buka menu Bagikan → <strong>Tambah ke Layar Utama</strong>, lalu buka aplikasi dari sana agar notifikasi saat tertutup bisa aktif.');
    } else if (!sup.push) {
      row('wait', 'Browser ini tidak mendukung notifikasi saat aplikasi tertutup; pengingat berjalan selama aplikasi terbuka.');
    } else if (!sync.loggedIn) {
      row('wait', 'Masuk ke akun agar pengingat tetap datang saat aplikasi tertutup. Saat ini hanya selama aplikasi terbuka.');
    } else if (info.subscribed) {
      row('yes', 'Perangkat ini menerima pengingat walau aplikasi tertutup.');
    } else if (info.error) {
      row('no', `Gagal mengaktifkan notifikasi saat tertutup: ${esc(info.error)}`);
    } else if (perm === 'granted') {
      row('wait', 'Menyiapkan notifikasi saat aplikasi tertutup…');
    }

    if (s.hourly && sync.loggedIn) {
      const tick = info.server && info.server.lastTick;
      if (tick && Date.now() - tick < 2 * 3600 * 1000) row('yes', `Penjadwal per jam di server aktif (terakhir ${clock(tick)}).`);
      else if (info.server && info.server.available === false) row('no', 'Server belum siap (Upstash Redis belum terhubung).');
      else row('wait', `Penjadwal per jam di server ${tick ? `terakhir berjalan ${clock(tick)}` : 'belum pernah berjalan'}. Atur sekali lewat panduan “Pengingat per jam” di README (mis. cron-job.org memanggil <code>/api/remind</code> tiap jam).`);
    }
    return `<ul class="status-list">${rows.join('')}</ul>`;
  }

  function workSummary(s) {
    const w = P.logic.workWindow(s, P.date.todayKey());
    const f = P.date.formatTime;
    return `<strong>${f(w.start)}–${f(w.end)}</strong> · ${esc(P.work.daysLabel(s.workDays))}${w.rest ? ` · istirahat ${f(w.rest[0])}–${f(w.rest[1])}` : ' · tanpa jam istirahat tetap'}`;
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
        ${P.account.settingsPanel()}
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
          <h2>Jam kerja</h2>
          <p class="muted">${workSummary(s)}</p>
          <p class="hint">Dipakai Rencana Kerja untuk beban kerja, atur otomatis, pita jam kerja di linimasa, dan laporan kerja. ${ctx.state.projects.length} proyek tersimpan.</p>
          <div class="button-row">
            <button type="button" class="btn secondary" data-act="work-hours">${icon('briefcase')}Atur jam kerja</button>
            <button type="button" class="btn ghost" data-act="work-open">${icon('arrow')}Buka Rencana Kerja</button>
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

        <section class="panel">
          <h2>Pengingat per jam</h2>
          <p class="muted">Diingatkan setiap jam untuk mengisi rencana: catat yang sudah dikerjakan, centang yang selesai, dan susun jam berikutnya.</p>
          <label class="switch-row">
            <input id="set-hourly" type="checkbox" data-hourly ${s.hourly ? 'checked' : ''}>
            <span>Ingatkan saya <strong>setiap 1 jam</strong></span>
          </label>
          <div class="field-row">
            <div class="field compact">
              <label for="set-hourlyFrom">Dari jam</label>
              <select id="set-hourlyFrom" data-setting="hourlyFrom">${hourOptions(s.hourlyFrom, 0, 23)}</select>
            </div>
            <div class="field compact">
              <label for="set-hourlyTo">Sampai jam</label>
              <select id="set-hourlyTo" data-setting="hourlyTo">${hourOptions(s.hourlyTo, 0, 23)}</select>
            </div>
          </div>
          ${hourlyStatus(s)}
          <div class="button-row">
            <button type="button" class="btn ghost small" data-act="hourly-test" ${s.hourly ? '' : 'disabled'}>${icon('bell')}Kirim notifikasi tes</button>
          </div>
        </section>

        <section class="panel">
          <h2>Template rutinitas</h2>
          <p class="muted">${counts.templates.length} template milikmu · ${P.templatesUI.suggestions().length} saran siap pakai. Nama, kegiatan, dan jamnya bisa diubah kapan saja.</p>
          <div class="button-row">
            <button type="button" class="btn secondary" data-act="templates">${icon('layers')}Kelola template</button>
            <button type="button" class="btn ghost" data-act="tpl-new">${icon('plus')}Buat template</button>
          </div>
        </section>

        <section class="panel wide">
          <h2>Data</h2>
          <p class="muted">${P.sync.info().loggedIn ? 'Data tersimpan di akunmu dan tersinkron ke semua perangkat' : 'Semua data tersimpan di browser ini saja'} (${counts.tasks.length} tugas, ${counts.series.length} tugas berulang, ${counts.projects.length} proyek, ${counts.habits.length} kebiasaan, ${Object.keys(counts.journal).length} catatan jurnal). Buat cadangan sebelum ganti perangkat atau membersihkan data browser.</p>
          ${P.store.storageOk ? '' : '<p class="form-error">Penyimpanan browser tidak tersedia, jadi perubahan akan hilang saat halaman ditutup. Ekspor data untuk menyimpannya.</p>'}
          <div class="button-row">
            <button type="button" class="btn secondary" data-act="export">${icon('download')}Unduh cadangan (.json)</button>
            <button type="button" class="btn ghost" data-act="copy">${icon('copy')}Salin sebagai teks</button>
            <label class="btn ghost file-btn">${icon('upload')}Pulihkan dari berkas
              <input id="import-file" type="file" accept="application/json,.json" data-act="import">
            </label>
          </div>
          <div class="button-row">
            <button type="button" class="btn ghost danger-text" data-act="clear">${icon('trash')}Kosongkan semua rencana & rutinitas</button>
          </div>
          <p class="hint">Template dan pengaturan tidak ikut terhapus.</p>
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
    // Status penjadwal server untuk panel pengingat per jam.
    if (store.state.settings.hourly) P.reminder.refreshServer().then((changed) => changed && P.app.refresh());

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
      if ('hourly' in input.dataset) {
        if (input.checked) await P.reminder.enable();
        else await P.reminder.disable();
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
      // Jam aktif berubah: beri tahu server agar notifikasi push ikut menyesuaikan.
      if (key === 'hourlyFrom' || key === 'hourlyTo') P.reminder.ensurePush();
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
        case 'hourly-test':
          await P.reminder.test();
          break;
        case 'templates':
          P.templatesUI.open(P.app.selected());
          break;
        case 'work-hours':
          P.work.openWorkHours();
          break;
        case 'work-open':
          P.app.setSpace('kerja');
          break;
        case 'tpl-new':
          P.templatesUI.openEditor(null, { kind: 'new', onDone: () => P.templatesUI.open(P.app.selected()) });
          break;
        case 'clear': {
          const where = P.sync.info().loggedIn ? 'dari akunmu dan semua perangkat yang terhubung' : 'dari browser ini';
          const ok = await P.ui.confirmDialog({
            title: 'Kosongkan semua rencana?',
            message: `Semua tugas, tugas berulang (rutinitas), proyek, kebiasaan, jurnal, air minum, dan sesi fokus akan dihapus permanen ${where}. Template dan pengaturan (termasuk jam kerja) tetap disimpan.`,
            confirmText: 'Kosongkan',
            danger: true,
          });
          if (ok) {
            store.clearAll();
            P.ui.toast('Semua rencana & rutinitas dikosongkan. Template tetap ada.', { tone: 'success' });
          }
          break;
        }
        default:
      }
    });
  }

  (P.views = P.views || {}).pengaturan = { title: 'Pengaturan', render, mount, SHORTCUTS };
})(typeof self !== 'undefined' ? self : this);
