/**
 * Menu aplikasi: layar peluncur berisi ikon semua fitur (seperti layar utama ponsel)
 * dengan status hidup di tiap ikon, pencarian aplikasi & aksi, dok favorit,
 * atur urutan dengan seret (atau Alt + panah), dan aksi cepat (tekan lama / klik kanan).
 * Urutan ikon & isi dok disimpan di pengaturan (ikut sinkron antar perangkat).
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const A = P.apps;
  const D = P.date;
  const { esc, icon } = P.ui;
  const doc = root.document;

  const DEFAULT_DOCK = ['beranda', 'kerja', 'pribadi', 'fokus', 'musik'];
  const LONG_PRESS_MS = 420;
  const DRAG_PX = 6;

  const media = (q) => Boolean(root.matchMedia && root.matchMedia(q).matches);
  const reduced = () => media('(prefers-reduced-motion: reduce)');
  const fine = () => media('(hover: hover) and (pointer: fine)');
  const st = () => P.store.state;

  // ----- Ikon berwarna (48×48, bentuk datar bertumpuk) -----

  let themeSpin = false; // ikon Tema berputar sekali setelah tema diganti

  const svg = (inner, cls = '') => `<svg class="ln-svg ${cls}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">${inner}</svg>`;
  const MUL = 'style="mix-blend-mode:multiply"';

  const GLYPHS = {
    beranda: () => svg(`
      <rect x="9.5" y="19" width="29" height="23.5" rx="4" fill="var(--c1)"/>
      <path d="M24 5.5 4.6 21.4c-1 .8-.4 2.4.9 2.4h37c1.3 0 1.9-1.6.9-2.4z" fill="var(--c2)" ${MUL}/>
      <circle cx="24" cy="16.5" r="2.7" fill="#fff"/>
      <rect x="19.5" y="29" width="9" height="13.5" rx="2.2" fill="var(--c3)"/>`),
    kerja: () => svg(`
      <path d="M17 15v-3.4A3.6 3.6 0 0 1 20.6 8h6.8a3.6 3.6 0 0 1 3.6 3.6V15" fill="none" stroke="var(--c3)" stroke-width="3.4"/>
      <rect x="5" y="14" width="38" height="28" rx="6.5" fill="var(--c1)"/>
      <path d="M5 20.5A6.5 6.5 0 0 1 11.5 14h25a6.5 6.5 0 0 1 6.5 6.5V27H5z" fill="var(--c2)" opacity=".9"/>
      <rect x="20" y="23.5" width="8" height="7.5" rx="2.2" fill="#fff"/>`),
    pribadi: () => svg(`
      <circle cx="32.5" cy="15.5" r="10.5" fill="var(--c2)"/>
      <path d="M24 41.5S6.5 31.3 6.5 19.4A8.9 8.9 0 0 1 24 15.2a8.9 8.9 0 0 1 17.5 4.2C41.5 31.3 24 41.5 24 41.5z" fill="var(--c1)" ${MUL}/>
      <ellipse cx="15" cy="19.5" rx="3" ry="2.2" fill="#fff" opacity=".8" transform="rotate(-35 15 19.5)"/>`),
    pekan: () => svg(`
      <rect x="5" y="8" width="38" height="34" rx="6.5" fill="var(--c2)"/>
      <path d="M5 14.5A6.5 6.5 0 0 1 11.5 8h25a6.5 6.5 0 0 1 6.5 6.5v2.5H5z" fill="var(--c1)"/>
      <rect x="7.4" y="25" width="4.4" height="12" rx="2.2" fill="var(--c3)"/>
      <rect x="14.6" y="29" width="4.4" height="8" rx="2.2" fill="var(--c1)"/>
      <rect x="21.8" y="22" width="4.4" height="15" rx="2.2" fill="var(--c3)"/>
      <rect x="29" y="31" width="4.4" height="6" rx="2.2" fill="var(--c1)"/>
      <rect x="36.2" y="26" width="4.4" height="11" rx="2.2" fill="var(--c3)"/>`),
    kalender: (x) => {
      const [, , d] = x.t.split('-').map(Number);
      const dow = D.DAYS_SHORT[D.dayIndex(x.t)].toUpperCase();
      return svg(`
        <rect x="6" y="7" width="36" height="36" rx="8" fill="var(--c2)"/>
        <path d="M6 15a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v1.5H6z" fill="var(--c1)"/>
        <rect x="14" y="3.5" width="3.2" height="7" rx="1.6" fill="var(--c3)"/>
        <rect x="30.8" y="3.5" width="3.2" height="7" rx="1.6" fill="var(--c3)"/>
        <text x="24" y="14.2" text-anchor="middle" class="ln-cal-dow">${esc(dow)}</text>
        <text x="24" y="36.6" text-anchor="middle" class="ln-cal-day">${d}</text>`);
    },
    kebiasaan: (x) => {
      const len = 2 * Math.PI * 16;
      const frac = x.habits.n ? x.habits.done / x.habits.n : 0.72;
      const on = Math.max(0.001, Math.min(1, frac)) * len;
      return svg(`
        <circle cx="24" cy="24" r="16" fill="none" stroke="var(--c2)" stroke-width="6.5"/>
        <circle class="ln-arc" cx="24" cy="24" r="16" fill="none" stroke="var(--c1)" stroke-width="6.5" stroke-linecap="round" stroke-dasharray="${on.toFixed(1)} ${len.toFixed(1)}" transform="rotate(-90 24 24)"/>
        <path d="m16.8 24.4 5 5 9.6-10.2" fill="none" stroke="var(--c3)" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>`);
    },
    fokus: () => svg(`
      <circle cx="24" cy="27.5" r="16" fill="var(--c1)"/>
      <ellipse cx="16.5" cy="21" rx="4.2" ry="2.5" fill="#fff" opacity=".35" transform="rotate(-38 16.5 21)"/>
      <rect x="22.8" y="5.5" width="2.4" height="7" rx="1.2" fill="var(--c2)"/>
      <path d="M24 10.5c1.4 2.6 3.8 3.8 7.6 3.5-2.2 2.6-4.8 3.6-7.6 3.4-2.8.2-5.4-.8-7.6-3.4 3.8.3 6.2-.9 7.6-3.5z" fill="var(--c2)"/>
      <g class="ln-hand"><path d="M24 27.5v-8" stroke="var(--c3)" stroke-width="3" stroke-linecap="round"/></g>
      <path d="M24 27.5l5.2 3" stroke="var(--c3)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="24" cy="27.5" r="2.2" fill="var(--c3)"/>`),
    jurnal: () => svg(`
      <rect x="9" y="5" width="30" height="37" rx="5" fill="var(--c1)"/>
      <rect x="9" y="5" width="7.5" height="37" rx="3.5" fill="var(--c3)" opacity=".5"/>
      <rect x="20.5" y="11.5" width="14" height="9" rx="2.4" fill="var(--c2)"/>
      <path d="M21.5 28h12M21.5 33.5h8" stroke="var(--c2)" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M30.5 38.5v8.2l2.8-2.2 2.8 2.2v-8.2z" fill="#ef4444"/>`),
    lari: () => svg(`
      <path d="M5.5 33V19.8c0-1.9 1.9-3.1 3.6-2.4L15 20l5.4-6.4 5.2 2c.9 4.7 4.2 8.3 8.8 9.8l6.3 2.1c2.6.9 4 3 4 5.5z" fill="var(--c1)"/>
      <path d="M9 28.5c7 .6 14-1.4 20-5.8" stroke="var(--c2)" stroke-width="3.4" stroke-linecap="round" fill="none"/>
      <path d="m19.6 19.3 4.2 1.7M21.8 16.3l4.2 1.7" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/>
      <rect x="4" y="32" width="41" height="8.5" rx="4.2" fill="var(--c3)"/>
      <rect x="4" y="32" width="41" height="3.4" rx="1.7" fill="#fff" opacity=".92"/>`),
    rute: () => svg(`
      <path d="M4 14.5 15.5 10l17 4.5L44 10v24l-11.5 4.5-17-4.5L4 38.5z" fill="var(--c2)"/>
      <path d="M15.5 10v24M32.5 14.5v24" stroke="var(--c3)" stroke-width="1.4" opacity=".3"/>
      <path d="M8.5 32.5c4-2 5.2-8.2 10.2-8.2s6.3 5.2 11.3 3" fill="none" stroke="var(--c3)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray=".5 4.6"/>
      <path d="M34 31s-8.2-7.6-8.2-13.8a8.2 8.2 0 0 1 16.4 0C42.2 23.4 34 31 34 31z" fill="var(--c1)"/>
      <circle cx="34" cy="17.2" r="3.2" fill="#fff"/>`),
    coach: () => svg(`
      <path d="M18 7h19a7 7 0 0 1 7 7v8.5a7 7 0 0 1-7 7h-.5v5.2l-6-5.2H18a7 7 0 0 1-7-7V14a7 7 0 0 1 7-7z" fill="var(--c2)"/>
      <path d="M11 16.5h17.5a7 7 0 0 1 7 7V31a7 7 0 0 1-7 7H19l-7.2 5.6V38H11a7 7 0 0 1-7-7v-7.5a7 7 0 0 1 7-7z" fill="var(--c1)" ${MUL}/>
      <circle cx="12.6" cy="27.3" r="2.1" fill="#fff"/><circle cx="19.8" cy="27.3" r="2.1" fill="#fff"/><circle cx="27" cy="27.3" r="2.1" fill="#fff"/>
      <path class="ln-spark" d="M39.5 2.5l1.5 4.2 4.2 1.5-4.2 1.5-1.5 4.2-1.5-4.2-4.2-1.5 4.2-1.5z" fill="var(--c3)"/>`),
    musik: () => svg(`
      <g class="ln-disc">
        <circle cx="29.5" cy="21.5" r="15" fill="var(--c2)"/>
        <circle cx="29.5" cy="21.5" r="10" fill="none" stroke="#fff" stroke-width="1.2" opacity=".6"/>
        <circle cx="29.5" cy="21.5" r="4.2" fill="#fff"/>
        <circle cx="29.5" cy="21.5" r="1.6" fill="var(--c3)"/>
        <path d="M22 11.5a13 13 0 0 1 7.5-3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8" fill="none"/>
      </g>
      <path d="M18.5 37.5V16.8l13-3V34" fill="none" stroke="var(--c1)" stroke-width="3.6" stroke-linejoin="round"/>
      <path d="M18.5 16.8l13-3v5.4l-13 3z" fill="var(--c1)"/>
      <ellipse cx="13.4" cy="37.8" rx="5.6" ry="4.5" fill="var(--c1)"/>
      <ellipse cx="26.4" cy="34.3" rx="5.6" ry="4.5" fill="var(--c1)"/>`),
    statistik: () => svg(`
      <rect x="6.5" y="27" width="7.4" height="15" rx="2.6" fill="var(--c2)"/>
      <rect x="16.6" y="19" width="7.4" height="23" rx="2.6" fill="var(--c1)"/>
      <rect x="26.7" y="23.5" width="7.4" height="18.5" rx="2.6" fill="var(--c2)"/>
      <rect x="36.8" y="13" width="7.4" height="29" rx="2.6" fill="var(--c1)"/>
      <path d="M9 19.5 20 11l10.5 5.2L41.5 6" fill="none" stroke="var(--c3)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="41.5" cy="6" r="3.1" fill="var(--c3)"/>`),
    cari: () => svg(`
      <path d="m30.5 30.5 10.5 10.5" stroke="var(--c3)" stroke-width="7" stroke-linecap="round"/>
      <circle cx="21" cy="21" r="13" fill="var(--c2)" stroke="var(--c1)" stroke-width="5"/>
      <path d="M14.2 18.5a7.8 7.8 0 0 1 5.6-5" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>`),
    baru: () => svg(`
      <rect x="12" y="12" width="31" height="31" rx="10" fill="var(--c2)"/>
      <rect x="5" y="5" width="31" height="31" rx="10" fill="var(--c1)"/>
      <path d="M20.5 13v15M13 20.5h15" stroke="var(--c3)" stroke-width="4.2" stroke-linecap="round"/>`),
    tema: (x) => svg(`
      <g class="ln-tema${x.dark ? ' is-dark' : ''}${themeSpin ? ' spin' : ''}">
        <path d="M24 2.5v4M24 41.5v4M8.8 8.8l2.8 2.8M8.8 39.2l2.8-2.8M2.5 24h4" stroke="var(--c1)" stroke-width="3" stroke-linecap="round"/>
        <path d="M39.2 8.8l-2.8 2.8M39.2 39.2l-2.8-2.8M45.5 24h-4" stroke="var(--c3)" stroke-width="3" stroke-linecap="round"/>
        <circle cx="24" cy="24" r="13.5" fill="var(--c1)"/>
        <path d="M24 10.5a13.5 13.5 0 0 1 0 27z" fill="var(--c3)"/>
        <circle cx="29.5" cy="19" r="1.5" fill="#fff"/><circle cx="32.5" cy="27" r="1.1" fill="#fff"/><circle cx="27.5" cy="31" r=".9" fill="#fff"/>
      </g>`),
    pengaturan: () => svg(`
      <rect x="5" y="7" width="38" height="34" rx="8.5" fill="var(--c2)"/>
      <path d="M12 16h24M12 24h24M12 32h24" stroke="var(--c1)" stroke-width="3" stroke-linecap="round" opacity=".55"/>
      <circle class="ln-knob k1" cx="29" cy="16" r="4.4" fill="var(--c3)"/>
      <circle class="ln-knob k2" cx="18" cy="24" r="4.4" fill="#fff" stroke="var(--c1)" stroke-width="2.4"/>
      <circle class="ln-knob k3" cx="32" cy="32" r="4.4" fill="var(--c1)"/>`),
  };

  // ----- Daftar aplikasi -----

  const APPS = [
    { id: 'beranda', label: 'Beranda', page: 'beranda', colors: ['#12a071', '#ffc53d', '#0b5d43'], keywords: ['home', 'utama', 'hari ini', 'ringkasan', 'dashboard'] },
    { id: 'kerja', label: 'Rencana Kerja', page: 'kerja', colors: ['#2f6fed', '#8cc8ff', '#1b3a8f'], keywords: ['kantor', 'tugas', 'pekerjaan', 'work', 'retur', 'delivery order'] },
    { id: 'pribadi', label: 'Rencana Pribadi', page: 'pribadi', colors: ['#f0386b', '#ffb44d', '#8a1538'], keywords: ['tugas', 'personal', 'sholat', 'ibadah'] },
    { id: 'pekan', label: 'Pekan', page: 'pekan', colors: ['#10a89b', '#bdf3ea', '#0b5f58'], keywords: ['minggu', 'mingguan', 'week', 'agenda'] },
    { id: 'kalender', label: 'Kalender', colors: ['#f43f5e', '#ffe4e8', '#8c1432'], keywords: ['tanggal', 'bulan', 'calendar', 'pilih tanggal'] },
    { id: 'kebiasaan', label: 'Kebiasaan', page: 'kebiasaan', colors: ['#8b5cf6', '#e4dcff', '#4c1d95'], keywords: ['habit', 'rutin', 'streak', 'tracker'] },
    { id: 'fokus', label: 'Fokus', page: 'fokus', colors: ['#f2493f', '#2fbf71', '#ffffff'], keywords: ['pomodoro', 'timer', 'konsentrasi', 'waktu'] },
    { id: 'jurnal', label: 'Jurnal', page: 'jurnal', colors: ['#f59e0b', '#fff3cf', '#9a4a07'], keywords: ['catatan', 'syukur', 'mood', 'diary', 'refleksi'] },
    { id: 'lari', label: 'Lari', page: 'lari', colors: ['#fb7a24', '#ffd2a8', '#6f2a0c'], keywords: ['run', 'olahraga', 'km', 'strava', 'jogging'] },
    { id: 'rute', label: 'Rute Lari', page: 'rute', colors: ['#e11d48', '#a3ebbd', '#177a44'], keywords: ['peta', 'map', 'jalur', 'gambar rute', 'lokasi'] },
    { id: 'coach', label: 'Coach', page: 'coach', colors: ['#6366f1', '#bcc4ff', '#fbbf24'], keywords: ['ai', 'pelatih', 'chat', 'cuaca', 'bmkg', 'saran'] },
    { id: 'musik', label: 'Musik', colors: ['#c026d3', '#f5c9fb', '#6b1170'], keywords: ['lagu', 'putar', 'audio', 'mp3', 'ncs'] },
    { id: 'statistik', label: 'Statistik', page: 'statistik', colors: ['#0ea5e9', '#b3e5fc', '#f59e0b'], keywords: ['grafik', 'laporan', 'progres', 'chart', 'analisis'] },
    { id: 'cari', label: 'Cari', colors: ['#06b6d4', '#cbf7fd', '#145b6e'], keywords: ['search', 'temukan', 'perintah'] },
    { id: 'baru', label: 'Tugas Baru', colors: ['#22c55e', '#c3f7d4', '#ffffff'], keywords: ['tambah', 'buat', 'new', 'rencana baru'] },
    { id: 'tema', label: 'Tema', colors: ['#fbbf24', '#fde68a', '#4338ca'], keywords: ['gelap', 'terang', 'dark', 'light', 'mode malam'] },
    { id: 'pengaturan', label: 'Pengaturan', page: 'pengaturan', colors: ['#64748b', '#dfe6ee', '#f97316'], keywords: ['setting', 'sinkron', 'akun', 'pengingat', 'ekspor', 'pintasan'] },
  ];
  const IDS = APPS.map((a) => a.id);
  const byId = Object.fromEntries(APPS.map((a) => [a.id, a]));
  const colorStyle = (a) => `--c1:${a.colors[0]};--c2:${a.colors[1]};--c3:${a.colors[2]}`;
  // Fase goyang tiap ikon di mode atur (tetap walau urutan berubah).
  const phase = (id) => [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 11, 7);

  // ----- Status hidup -----

  function isDark() {
    const t = st().settings.theme;
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return media('(prefers-color-scheme: dark)');
  }

  /** Ringkasan data yang dipakai semua ikon (dihitung sekali per penggambaran). */
  function snapshot() {
    const s = st();
    const t = D.todayKey();
    const now = new Date();
    const nowMin = D.minutesOfDay(now);
    const x = { t, now, dark: isDark(), total: 0, done: 0, open: { kerja: 0, pribadi: 0 }, next: null, week: 0 };
    const week = new Set(D.weekKeys(t));
    for (const task of s.tasks) {
      if (week.has(task.date)) x.week += 1;
      if (task.date !== t) continue;
      x.total += 1;
      if (task.done) {
        x.done += 1;
        continue;
      }
      x.open[P.logic.areaOf(task)] += 1;
      const m = task.start ? D.parseTime(task.start) : null;
      if (m != null && m >= nowMin && (!x.next || m < x.next.m)) x.next = { m, task };
    }
    const active = s.habits.filter((h) => !h.archived);
    const doneIds = new Set(s.habitLog[t] || []);
    x.habits = { n: active.length, done: active.filter((h) => doneIds.has(h.id)).length };
    x.timer = { status: s.timer.status, mode: s.timer.mode, text: P.timer.format(P.timer.remainingMs()) };
    const ms = P.music ? P.music.state() : {};
    const track = ms.id && P.musicLib ? P.musicLib.find(ms.id) : null;
    x.music = { playing: Boolean(ms.playing), title: track ? track.title : '', count: P.musicLib ? P.musicLib.tracks().length : 0 };
    const j = s.journal[t];
    x.journal = Boolean(j && (j.mood || String(j.notes || '').trim() || String(j.better || '').trim()
      || (Array.isArray(j.gratitude) && j.gratitude.some((g) => String(g || '').trim()))));
    const month = P.run.runMonth(s.runs, t.slice(0, 7), t, s.settings.runGoal);
    x.run = { km: month.total.km, goal: Number(s.settings.runGoal) || 0 };
    x.routes = s.savedRoutes.length;
    x.chats = s.coachChats.length;
    const last7 = new Set(D.lastNDays(t, 7));
    let t7 = 0;
    let d7 = 0;
    for (const task of s.tasks) {
      if (!last7.has(task.date)) continue;
      t7 += 1;
      if (task.done) d7 += 1;
    }
    x.rate7 = t7 ? Math.round((d7 / t7) * 100) : null;
    return x;
  }

  const km = (v) => P.run.formatKm(v, 1);

  /** {sub, badge, meter (0–1), live} untuk satu ikon. */
  function info(id, x) {
    switch (id) {
      case 'beranda':
        return x.total
          ? { sub: `${x.done}/${x.total} selesai`, meter: x.done / x.total }
          : { sub: 'Belum ada rencana' };
      case 'kerja':
      case 'pribadi': {
        const n = x.open[id];
        return { sub: n ? `${n} belum selesai` : 'Semua beres', badge: n || null };
      }
      case 'pekan': return { sub: x.week ? `${x.week} tugas pekan ini` : 'Pekan masih kosong' };
      case 'kalender': {
        const sel = P.app.selected();
        return { sub: sel === x.t ? 'Hari ini' : `Dipilih ${D.formatShort(sel)}` };
      }
      case 'kebiasaan':
        return x.habits.n
          ? { sub: `${x.habits.done}/${x.habits.n} hari ini`, meter: x.habits.done / x.habits.n, badge: x.habits.n - x.habits.done || null }
          : { sub: 'Mulai kebiasaan' };
      case 'fokus':
        if (x.timer.status === 'running') return { sub: `${x.timer.text} · ${P.timer.MODES[x.timer.mode].short}`, live: true };
        if (x.timer.status === 'paused') return { sub: `Dijeda ${x.timer.text}` };
        return { sub: `${st().settings.focusMin} menit` };
      case 'jurnal': return x.journal ? { sub: 'Sudah ditulis', done: true } : { sub: 'Belum ditulis' };
      case 'lari':
        return x.run.goal
          ? { sub: `${km(x.run.km)}/${km(x.run.goal)} km`, meter: Math.min(1, x.run.km / x.run.goal) }
          : { sub: `${km(x.run.km)} km bulan ini` };
      case 'rute': return { sub: x.routes ? `${x.routes} rute tersimpan` : 'Cari & gambar rute' };
      case 'coach': return { sub: x.chats ? `${x.chats} sesi chat` : 'Tanya apa saja' };
      case 'musik':
        return x.music.playing ? { sub: x.music.title || 'Sedang diputar', live: true } : { sub: `${x.music.count} lagu` };
      case 'statistik': return { sub: x.rate7 == null ? 'Grafik & tren' : `${x.rate7}% selesai (7 hari)` };
      case 'cari': return { sub: fine() ? 'Ctrl + K' : 'Tugas & perintah' };
      case 'baru': return { sub: fine() ? 'Tombol N' : 'Tambah rencana' };
      case 'tema': return { sub: x.dark ? 'Gelap' : 'Terang' };
      case 'pengaturan': return { sub: 'Akun, sinkron, pengingat' };
      default: return { sub: '' };
    }
  }

  // ----- Aksi cepat -----

  function newTask(area) {
    const defaults = { date: P.app.selected() };
    if (area) Object.assign(defaults, { area, category: area === 'kerja' ? 'kerja' : 'pribadi' });
    P.components.openTaskEditor({ defaults });
  }

  /**
   * Aksi cepat per aplikasi. `page` = pindah ke halaman aplikasi itu; selain itu aksi
   * dijalankan di atas Menu (dialog, timer, musik) sehingga tidak ada halaman lain yang terbuka.
   */
  function actionsFor(id, x) {
    switch (id) {
      case 'beranda': return [{ label: 'Tambah cepat', icon: 'plus', page: 'beranda', focus: '#quick-add' }];
      case 'kerja': return [{ label: 'Tugas kerja baru', icon: 'plus', run: () => newTask('kerja') }];
      case 'pribadi': return [{ label: 'Tugas pribadi baru', icon: 'plus', run: () => newTask('pribadi') }];
      case 'kalender': return [{ label: 'Ke hari ini', icon: 'calendar', run: () => P.app.setDate(x.t) }];
      case 'fokus': {
        const running = x.timer.status === 'running';
        const list = [{ label: running ? 'Jeda timer' : x.timer.status === 'paused' ? 'Lanjutkan timer' : 'Mulai fokus', icon: running ? 'pause' : 'play', run: () => P.timer.toggle() }];
        if (x.timer.status !== 'idle') list.push({ label: 'Atur ulang timer', icon: 'reset', run: () => P.timer.reset() });
        return list;
      }
      case 'jurnal': return [{ label: 'Tulis jurnal hari ini', icon: 'edit', page: 'jurnal', date: x.t }];
      case 'lari': return [
        { label: 'Catat lari', icon: 'plus', run: () => P.lari.openRunEditor(null, { date: P.app.selected() }) },
        { label: 'Impor screenshot lari', icon: 'camera', run: () => P.coachUI.importScreenshot() },
      ];
      case 'coach': return [{ label: 'Tanya coach', icon: 'send', page: 'coach', focus: '[data-coach-form] textarea' }];
      case 'musik': return [
        { label: x.music.playing ? 'Jeda musik' : 'Putar musik', icon: x.music.playing ? 'pause' : 'play', run: () => P.music.toggle() },
        { label: 'Lagu berikutnya', icon: 'skip', run: () => P.music.next() },
      ];
      case 'statistik': return [
        { label: 'Statistik 7 hari', icon: 'chart', page: 'statistik', pref: ['statsRange', 7] },
        { label: 'Statistik 30 hari', icon: 'chart', page: 'statistik', pref: ['statsRange', 30] },
      ];
      case 'pengaturan': return [{ label: 'Pintasan keyboard', icon: 'command', run: () => P.app.openShortcuts() }];
      default: return [];
    }
  }

  // ----- Status menu -----

  let el = null;
  let grid = null;
  let dockEl = null;
  let input = null;
  let isOpen = false;
  let editing = false;
  let query = '';
  let lastFocus = null;
  let origin = { x: 0, y: 0 };
  let ticker = 0;
  let unsub = null;
  let expectPop = false;
  let closeTimer = 0;
  let menu = null; // {id, el}
  let press = null; // tekan/seret yang sedang berlangsung
  let drag = null;

  function layout() {
    return A.cleanLayout(st().settings.launcher, IDS, { dock: DEFAULT_DOCK });
  }

  function saveLayout(next) {
    P.store.setSettings({ launcher: { order: next.order.slice(), dock: next.dock.slice() } });
  }

  function announce(msg) {
    const live = el && el.querySelector('[data-ln-live]');
    if (live) live.textContent = msg;
  }

  // ----- Kerangka -----

  function build() {
    el = doc.createElement('div');
    el.className = 'launcher';
    el.hidden = true;
    el.dataset.state = 'closed';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Menu aplikasi');
    el.tabIndex = -1;
    el.innerHTML = `
      <div class="ln-bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i></div>
      <div class="ln-spot" aria-hidden="true"></div>
      <div class="ln-scroll" data-ln-scroll>
        <div class="ln-inner">
          <header class="ln-head">
            <div class="ln-hello">
              <p class="ln-greet" data-ln-greet></p>
              <p class="ln-clock" data-ln-clock></p>
              <p class="ln-date" data-ln-date></p>
            </div>
            <div class="ln-tools">
              <button type="button" class="ln-tool" data-ln-reset hidden aria-label="Kembalikan urutan & dok bawaan" title="Kembalikan urutan & dok bawaan">${icon('reset')}<span>Atur ulang</span></button>
              <button type="button" class="ln-tool" data-ln-edit aria-pressed="false"></button>
              <button type="button" class="ln-tool round" data-ln-close aria-label="Tutup menu aplikasi" title="Tutup (Esc)">${icon('x')}</button>
            </div>
          </header>
          <p class="ln-edit-note" data-ln-note hidden></p>
          <label class="ln-search">
            ${icon('search')}
            <span class="sr-only">Cari aplikasi atau aksi</span>
            <input type="search" data-ln-q autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="Cari aplikasi, aksi, atau tugas…">
            <kbd class="ln-kbd" aria-hidden="true">Esc</kbd>
          </label>
          <div class="ln-chips" data-ln-chips></div>
          <div class="ln-grid" data-ln-grid role="list" aria-label="Aplikasi"></div>
          <div class="ln-results" data-ln-results hidden></div>
        </div>
      </div>
      <p class="ln-hint" data-ln-hint hidden></p>
      <nav class="ln-dock" aria-label="Dok favorit"><div class="ln-dock-in" data-ln-dock></div></nav>
      <p class="sr-only" aria-live="polite" data-ln-live></p>`;
    doc.body.appendChild(el);
    grid = el.querySelector('[data-ln-grid]');
    dockEl = el.querySelector('[data-ln-dock]');
    input = el.querySelector('[data-ln-q]');
    bind();
  }

  function tileHtml(a, x, lay) {
    const i = info(a.id, x);
    const docked = lay.dock.includes(a.id);
    const label = `${a.label}. ${i.sub}${i.badge ? `, ${i.badge} menunggu` : ''}`;
    return `
      <div class="ln-cell" role="listitem" data-cell="${a.id}" data-key="${a.id}" style="${colorStyle(a)};--j:${phase(a.id)}">
        <button type="button" class="ln-tile${i.live ? ' is-live' : ''}${i.done ? ' is-done' : ''}" data-app="${a.id}" data-fk="ln-${a.id}" aria-label="${esc(label)}">
          <span class="ln-card" aria-hidden="true">
            <span class="ln-glyph">${GLYPHS[a.id](x)}</span>
            <span class="ln-shine"></span>
            ${i.meter != null ? `<span class="ln-meter"><i style="--p:${Math.max(0, Math.min(1, i.meter)).toFixed(3)}"></i></span>` : ''}
            ${i.badge ? `<span class="ln-badge">${i.badge > 99 ? '99+' : i.badge}</span>` : ''}
            ${i.done ? `<span class="ln-check">${icon('check')}</span>` : ''}
            ${a.id === 'musik' ? '<span class="ln-eq"><i></i><i></i><i></i></span>' : ''}
          </span>
          <span class="ln-name" data-ln-name>${nameHtml(a.label)}</span>
          <span class="ln-sub">${esc(i.sub)}</span>
        </button>
        <button type="button" class="ln-pin${docked ? ' on' : ''}" data-ln-pin="${a.id}" tabindex="-1" aria-label="${docked ? `Lepas ${esc(a.label)} dari dok` : `Sematkan ${esc(a.label)} ke dok`}" title="${docked ? 'Lepas dari dok' : 'Sematkan ke dok'}">${icon('star')}</button>
      </div>`;
  }

  function nameHtml(label) {
    const r = A.matchRange(label, query);
    if (!r) return esc(label);
    return `${esc(label.slice(0, r[0]))}<mark>${esc(label.slice(r[0], r[1]))}</mark>${esc(label.slice(r[1]))}`;
  }

  /**
   * Perbarui isi `box` dengan HTML baru lewat morph: elemen yang sama dipertahankan
   * (animasi, fokus & ikon yang sedang ditekan tidak terputus), hanya yang berubah diganti.
   */
  function patch(box, html) {
    if (!box.firstElementChild) {
      box.innerHTML = html;
      return;
    }
    const next = box.cloneNode(false);
    next.innerHTML = html;
    P.morph.morph(box, next);
  }

  /** Gambar ikon (saat dibuka / data berubah / mencari). */
  function paintGrid(x = snapshot()) {
    const lay = layout();
    patch(grid, visibleApps(lay).map((a) => tileHtml(a, x, lay)).join(''));
    paintResults(x);
  }

  /** Aplikasi yang tampil: semua (urutan tersimpan) atau hasil pencarian. */
  function visibleApps(lay = layout()) {
    const ordered = lay.order.map((id) => byId[id]);
    return query ? A.search(ordered, query) : ordered;
  }

  function paintDock(x = snapshot()) {
    const lay = layout();
    const current = P.app.current();
    patch(dockEl, lay.dock.length ? lay.dock.map((id) => {
      const a = byId[id];
      const i = info(id, x);
      const here = a.page && a.page === current;
      const run = here || i.live;
      return `
        <div class="ln-dcell" data-dcell="${id}" data-key="d-${id}" style="${colorStyle(a)}">
          <button type="button" class="ln-dtile${i.live ? ' is-live' : ''}" data-app="${id}" data-dock-app aria-label="${esc(`${a.label}. ${i.sub}`)}">
            <span class="ln-card" aria-hidden="true"><span class="ln-glyph">${GLYPHS[id](x)}</span><span class="ln-shine"></span>${i.badge ? `<span class="ln-badge">${i.badge > 99 ? '99+' : i.badge}</span>` : ''}</span>
            <span class="ln-tip" aria-hidden="true">${esc(a.label)}</span>
            ${run ? '<span class="ln-run" aria-hidden="true"></span>' : ''}
          </button>
          <button type="button" class="ln-unpin" data-ln-unpin="${id}" tabindex="-1" aria-label="Lepas ${esc(a.label)} dari dok" title="Lepas dari dok">${icon('x')}</button>
        </div>`;
    }).join('') : '<p class="ln-dock-empty">Seret ikon ke sini atau ketuk ☆ saat mengatur untuk menyematkan</p>');
  }

  function paintChips(x) {
    const chips = [];
    const open = x.open.kerja + x.open.pribadi;
    if (x.total) chips.push({ app: 'beranda', text: open ? `${open} tugas tersisa hari ini` : 'Semua tugas hari ini selesai' });
    if (x.next) chips.push({ app: 'kerja', task: x.next.task, text: `${D.formatTime(x.next.m)} · ${x.next.task.title}` });
    if (x.timer.status === 'running') chips.push({ app: 'fokus', text: `${P.timer.MODES[x.timer.mode].short} ${x.timer.text}`, live: true });
    if (x.music.playing) chips.push({ app: 'musik', text: x.music.title || 'Musik diputar', live: true });
    if (x.habits.n) chips.push({ app: 'kebiasaan', text: `Kebiasaan ${x.habits.done}/${x.habits.n}` });
    const box = el.querySelector('[data-ln-chips]');
    box.innerHTML = chips.slice(0, 4).map((c, i) => `
      <button type="button" class="ln-chip${c.live ? ' is-live' : ''}" data-chip="${i}" data-chip-app="${c.app}"${c.task ? ` data-chip-task="${esc(c.task.id)}"` : ''} style="${colorStyle(byId[c.app])}">
        <span class="ln-dot" aria-hidden="true"></span><span>${esc(c.text)}</span>
      </button>`).join('');
    box.hidden = !chips.length;
  }

  function paintHead(x = snapshot()) {
    el.querySelector('[data-ln-greet]').textContent = D.greeting(x.now);
    el.querySelector('[data-ln-clock]').textContent = D.formatTime(D.minutesOfDay(x.now));
    el.querySelector('[data-ln-date]').textContent = D.formatLong(x.t);
    const edit = el.querySelector('[data-ln-edit]');
    edit.innerHTML = editing ? `${icon('check')}<span>Selesai</span>` : `${icon('grid')}<span>Atur</span>`;
    edit.setAttribute('aria-pressed', String(editing));
    edit.title = editing ? 'Selesai mengatur' : 'Atur urutan ikon & dok';
    el.querySelector('[data-ln-reset]').hidden = !editing;
    const note = el.querySelector('[data-ln-note]');
    note.hidden = !editing;
    note.textContent = fine()
      ? 'Seret ikon untuk mengatur urutan, atau pilih ikon lalu tekan Alt + panah. Ketuk ☆ untuk menyematkan ke dok.'
      : 'Seret ikon untuk mengatur urutan. Ketuk ☆ untuk menyematkan ke dok, × untuk melepas.';
    paintChips(x);
  }

  function paintResults(x) {
    const box = el.querySelector('[data-ln-results]');
    if (!query) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    const lay = layout();
    const acts = [];
    for (const id of lay.order) {
      const a = byId[id];
      actionsFor(id, x).forEach((act, k) => {
        const s = A.score({ label: act.label, keywords: [a.label, ...a.keywords] }, query);
        if (s) acts.push({ a, act, k, s });
      });
    }
    acts.sort((p, q) => q.s - p.s);
    const tiles = grid.querySelectorAll('.ln-cell').length;
    const top = acts.slice(0, 6);
    box.hidden = false;
    box.innerHTML = `
      ${!tiles && !top.length ? `<p class="ln-none">Tidak ada aplikasi bernama “${esc(query)}”.</p>` : ''}
      ${top.length ? '<p class="ln-rhead">Aksi cepat</p>' : ''}
      <div class="ln-acts">
        ${top.map((r) => `
          <button type="button" class="ln-act" data-act-app="${r.a.id}" data-act="${r.k}" style="${colorStyle(r.a)}">
            <span class="ln-act-ic">${icon(r.act.icon)}</span>
            <span class="ln-act-text"><b>${esc(r.act.label)}</b><small>${esc(r.a.label)}</small></span>
            ${icon('right')}
          </button>`).join('')}
        <button type="button" class="ln-act ghost" data-ln-find>
          <span class="ln-act-ic">${icon('search')}</span>
          <span class="ln-act-text"><b>Cari tugas “${esc(query)}”</b><small>Di semua tanggal</small></span>
          ${icon('right')}
        </button>
      </div>`;
  }

  /** Perbarui teks yang berubah tiap detik (jam, timer, lagu) tanpa menggambar ulang ikon. */
  function tick() {
    if (!isOpen) return;
    const now = new Date();
    const clock = el.querySelector('[data-ln-clock]');
    const text = D.formatTime(D.minutesOfDay(now));
    if (clock.textContent !== text) paintHead();
    if (st().timer.status === 'running' && !drag) {
      const x = snapshot();
      const tile = grid.querySelector('[data-app="fokus"] .ln-sub');
      if (tile) tile.textContent = info('fokus', x).sub;
      const chip = el.querySelector('[data-chip-app="fokus"] span:last-child');
      if (chip) chip.textContent = `${P.timer.MODES[x.timer.mode].short} ${x.timer.text}`;
    }
  }

  /** Data berubah (tugas dicentang, lagu diputar, sinkron, dll.) saat menu terbuka. */
  let refreshQueued = false;
  let refreshLater = false;
  function refresh() {
    if (!isOpen || refreshQueued) return;
    refreshQueued = true;
    root.requestAnimationFrame(() => {
      refreshQueued = false;
      if (!isOpen) return;
      // Jangan ganti ikon yang sedang ditekan/diseret; gambar ulang setelah dilepas.
      if (drag || press) {
        refreshLater = true;
        return;
      }
      const x = snapshot();
      paintGrid(x);
      paintDock(x);
      paintHead(x);
      if (menu) paintMenu(menu.id, x);
    });
  }

  // ----- Buka & tutup -----

  function pointFrom(from) {
    if (from && from.getBoundingClientRect) {
      const r = from.getBoundingClientRect();
      if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return { x: root.innerWidth / 2, y: root.innerHeight * 0.35 };
  }

  function setInert(on) {
    doc.querySelectorAll('.shell, #tabbar, .skip-link').forEach((n) => {
      if (on) n.setAttribute('inert', '');
      else n.removeAttribute('inert');
    });
  }

  function open(from) {
    if (!el) build();
    if (isOpen) return;
    clearTimeout(closeTimer);
    isOpen = true;
    editing = false;
    query = '';
    input.value = '';
    el.classList.remove('editing', 'menu-open');
    lastFocus = doc.activeElement;
    origin = pointFrom(from);
    const w = root.innerWidth;
    const h = root.innerHeight;
    el.style.setProperty('--ox', `${origin.x}px`);
    el.style.setProperty('--oy', `${origin.y}px`);
    el.style.setProperty('--or', `${Math.ceil(Math.hypot(Math.max(origin.x, w - origin.x), Math.max(origin.y, h - origin.y)) + 24)}px`);
    const x = snapshot();
    paintHead(x);
    paintGrid(x);
    paintDock(x);
    el.hidden = false;
    el.dataset.state = 'enter';
    doc.documentElement.classList.add('ln-open');
    setInert(true);
    el.querySelector('[data-ln-scroll]').scrollTop = 0;
    // Ikon muncul bergelombang dari titik asal (tombol yang ditekan).
    const fast = reduced();
    grid.querySelectorAll('.ln-cell').forEach((cell) => {
      const r = cell.getBoundingClientRect();
      const d = fast ? 0 : A.waveDelay(r.left + r.width / 2 - origin.x, r.top + r.height / 2 - origin.y) + 60;
      cell.style.setProperty('--d', `${d}ms`);
    });
    el.classList.add('ln-entering');
    setTimeout(() => el && el.classList.remove('ln-entering'), 1300);
    el.getBoundingClientRect();
    el.dataset.state = 'open';
    try {
      root.history.pushState({ launcher: true }, '', root.location.href);
    } catch {
      /* bingkai tertentu menolak pushState */
    }
    (fine() ? input : el).focus({ preventScroll: true });
    showHint();
    ticker = setInterval(tick, 1000);
    unsub = P.store.subscribe(refresh);
    if (P.music && P.music._audio) {
      ['play', 'pause', 'loadstart'].forEach((ev) => P.music._audio.addEventListener(ev, refresh));
    }
    if (P.music && P.music.relayout) P.music.relayout();
    syncButtons();
  }

  /** Petunjuk singkat di atas dok, hanya beberapa kali pertama menu dibuka. */
  const HINT_KEY = 'rencana-harian/launcher-hint';
  let hintTimer = 0;
  function showHint() {
    const hint = el.querySelector('[data-ln-hint]');
    let seen = 0;
    try {
      seen = Number(root.localStorage.getItem(HINT_KEY)) || 0;
      root.localStorage.setItem(HINT_KEY, String(seen + 1));
    } catch {
      /* petunjuk bersifat opsional */
    }
    clearTimeout(hintTimer);
    hint.classList.remove('on');
    hint.hidden = seen >= 4;
    if (hint.hidden) return;
    hint.textContent = fine()
      ? 'Klik kanan ikon untuk aksi cepat · seret untuk mengatur · ketik untuk mencari'
      : 'Tekan lama ikon untuk aksi cepat · tahan lalu seret untuk mengatur';
    hintTimer = setTimeout(() => {
      if (isOpen && !editing && !menu) hint.classList.add('on');
      hintTimer = setTimeout(hideHint, 6000);
    }, reduced() ? 0 : 900);
  }

  function hideHint() {
    clearTimeout(hintTimer);
    const hint = el && el.querySelector('[data-ln-hint]');
    if (hint) hint.classList.remove('on');
  }

  /**
   * Tutup menu. `how`: 'back' (kembali ke tombol asal), 'zoom' (masuk ke aplikasi),
   * `history`: false bila penutupan berasal dari tombol Kembali browser.
   */
  function close({ how = 'back', history = true, tile = null } = {}) {
    if (!isOpen) return;
    isOpen = false;
    closeMenu();
    endDrag(true);
    hideHint();
    clearInterval(ticker);
    if (unsub) unsub();
    unsub = null;
    if (P.music && P.music._audio) {
      ['play', 'pause', 'loadstart'].forEach((ev) => P.music._audio.removeEventListener(ev, refresh));
    }
    if (tile) tile.classList.add('is-launching');
    el.dataset.state = how === 'zoom' ? 'zoom' : 'leave';
    doc.documentElement.classList.remove('ln-open');
    setInert(false);
    if (P.music && P.music.relayout) P.music.relayout();
    if (history) {
      expectPop = true;
      try {
        if (root.history.state && root.history.state.launcher) root.history.back();
        else expectPop = false;
      } catch {
        expectPop = false;
      }
    }
    const done = () => {
      if (isOpen) return;
      el.hidden = true;
      el.dataset.state = 'closed';
      grid.querySelectorAll('.is-launching').forEach((n) => n.classList.remove('is-launching'));
    };
    closeTimer = setTimeout(done, reduced() ? 10 : how === 'zoom' ? 360 : 420);
    if (how !== 'zoom' && lastFocus && lastFocus.isConnected && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
    syncButtons();
  }

  function toggle(from) {
    if (isOpen) close();
    else open(from);
  }

  /** Tombol Kembali browser saat menu terbuka: tutup menu, jangan pindah halaman. */
  function handlePop() {
    if (expectPop) {
      expectPop = false;
      return true;
    }
    if (isOpen) {
      close({ history: false });
      return true;
    }
    return false;
  }

  function syncButtons() {
    doc.querySelectorAll('[data-launcher-open]').forEach((b) => {
      b.setAttribute('aria-expanded', String(isOpen));
      b.classList.toggle('is-open', isOpen);
    });
  }

  // ----- Menjalankan aplikasi & aksi -----

  function focusLater(sel) {
    let tries = 0;
    const attempt = () => {
      const node = doc.querySelector(sel);
      if (node && node.offsetParent !== null) {
        node.focus();
        return;
      }
      tries += 1;
      if (tries < 12) setTimeout(attempt, 120);
    };
    setTimeout(attempt, 160);
  }

  /** Pindah halaman tanpa menambah riwayat (entri menu diganti halaman tujuan). */
  function goPage(page, { date, pref, focus } = {}) {
    if (date) P.app.setDate(date);
    try {
      if (root.history.state && root.history.state.launcher) root.history.replaceState(null, '', `#${page}`);
      else if (root.location.hash !== `#${page}`) root.history.pushState(null, '', `#${page}`);
    } catch {
      /* abaikan */
    }
    P.app.go(page, { push: false });
    if (pref) P.app.setPref(pref[0], pref[1]);
    if (focus) focusLater(focus);
  }

  function launch(id, from) {
    const a = byId[id];
    if (!a) return;
    if (editing) return;
    P.ui.haptic && P.ui.haptic(8);
    if (id === 'tema') {
      toggleThemeFrom(from);
      return;
    }
    const tile = from && from.closest ? from.closest('.ln-tile, .ln-dtile') : null;
    if (a.page) {
      close({ how: 'zoom', history: false, tile });
      goPage(a.page);
      return;
    }
    // Aplikasi berbentuk jendela dibuka di atas Menu, bukan di atas halaman lain.
    closeMenu();
    const run = {
      kalender: () => P.app.openCalendar(),
      musik: () => P.music.open(),
      cari: () => P.components.openSearch(),
      baru: () => newTask(),
    }[id];
    if (run) run();
  }

  function runAction(id, k) {
    const act = actionsFor(id, snapshot())[k];
    if (!act) return;
    closeMenu();
    if (act.page) {
      close({ how: 'zoom', history: false, tile: grid.querySelector(`[data-app="${id}"]`) });
      goPage(act.page, act);
      return;
    }
    act.run();
    setTimeout(refresh, 60);
  }

  /** Ganti tema dengan lingkaran yang melebar dari ikon Tema; menu tetap terbuka. */
  function toggleThemeFrom(from) {
    const tile = from && from.closest ? from.closest('.ln-tile, .ln-dtile') : null;
    themeSpin = !reduced();
    P.app.toggleTheme(tile || from);
    setTimeout(() => { themeSpin = false; }, 1000);
    refresh();
  }

  // ----- Menu aksi cepat -----

  function paintMenu(id, x = snapshot()) {
    const a = byId[id];
    const i = info(id, x);
    const docked = layout().dock.includes(id);
    const acts = actionsFor(id, x);
    menu.el.style.cssText = colorStyle(a);
    menu.el.innerHTML = `
      <div class="ln-mhead">
        <span class="ln-card mini" aria-hidden="true"><span class="ln-glyph">${GLYPHS[id](x)}</span></span>
        <span class="ln-mtitle"><b>${esc(a.label)}</b><small>${esc(i.sub)}</small></span>
      </div>
      <button type="button" class="ln-mitem strong" role="menuitem" data-m-open>${icon('arrow')}<span>${a.page || id !== 'tema' ? 'Buka' : 'Ganti tema'}</span></button>
      ${acts.map((act, k) => `<button type="button" class="ln-mitem" role="menuitem" data-m-act="${k}">${icon(act.icon)}<span>${esc(act.label)}</span></button>`).join('')}
      <hr>
      <button type="button" class="ln-mitem" role="menuitem" data-m-dock>${icon(docked ? 'x' : 'star')}<span>${docked ? 'Lepas dari dok' : 'Sematkan ke dok'}</span></button>
      <button type="button" class="ln-mitem" role="menuitem" data-m-edit>${icon('grid')}<span>Atur ikon</span></button>`;
    placeMenu();
  }

  function placeMenu() {
    if (!menu) return;
    const target = grid.querySelector(`[data-app="${menu.id}"]`) || dockEl.querySelector(`[data-app="${menu.id}"]`);
    const m = menu.el;
    const w = m.offsetWidth;
    const h = m.offsetHeight;
    const vw = root.innerWidth;
    const vh = root.innerHeight;
    let left = vw / 2 - w / 2;
    let top = vh / 2 - h / 2;
    let ox = '50%';
    let oy = '0%';
    if (target) {
      const r = target.querySelector('.ln-card').getBoundingClientRect();
      left = Math.min(vw - w - 12, Math.max(12, r.left + r.width / 2 - w / 2));
      const below = r.bottom + 10;
      if (below + h < vh - 12) {
        top = below;
        oy = '0%';
      } else {
        top = Math.max(12, r.top - h - 10);
        oy = '100%';
      }
      ox = `${Math.round(r.left + r.width / 2 - left)}px`;
    }
    m.style.left = `${Math.round(left)}px`;
    m.style.top = `${Math.round(top)}px`;
    m.style.transformOrigin = `${ox} ${oy}`;
  }

  function openMenu(id) {
    if (!isOpen || !byId[id]) return;
    closeMenu();
    const m = doc.createElement('div');
    m.className = 'ln-menu';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', `Aksi ${byId[id].label}`);
    el.appendChild(m);
    menu = { id, el: m };
    hideHint();
    paintMenu(id);
    el.classList.add('menu-open');
    grid.querySelectorAll('.ln-cell').forEach((c) => c.classList.toggle('is-target', c.dataset.cell === id));
    dockEl.querySelectorAll('.ln-dcell').forEach((c) => c.classList.toggle('is-target', c.dataset.dcell === id));
    root.requestAnimationFrame(() => m.classList.add('on'));
    const first = m.querySelector('[role="menuitem"]');
    if (first) first.focus({ preventScroll: true });
    announce(`Aksi cepat ${byId[id].label}`);
  }

  function closeMenu({ refocus = false } = {}) {
    if (!menu) return;
    const { id, el: m } = menu;
    menu = null;
    el.classList.remove('menu-open');
    el.querySelectorAll('.is-target').forEach((c) => c.classList.remove('is-target'));
    m.classList.remove('on');
    m.classList.add('off');
    setTimeout(() => m.remove(), 200);
    if (refocus) {
      const t = grid.querySelector(`[data-app="${id}"]`);
      if (t) t.focus({ preventScroll: true });
    }
  }

  function onMenuClick(e) {
    if (!menu) return;
    const id = menu.id;
    if (e.target.closest('[data-m-open]')) {
      const tile = grid.querySelector(`[data-app="${id}"]`);
      closeMenu();
      launch(id, tile);
      return;
    }
    const act = e.target.closest('[data-m-act]');
    if (act) {
      runAction(id, Number(act.dataset.mAct));
      return;
    }
    if (e.target.closest('[data-m-dock]')) {
      closeMenu({ refocus: true });
      setDock(id, null);
      return;
    }
    if (e.target.closest('[data-m-edit]')) {
      closeMenu();
      setEditing(true);
      const t = grid.querySelector(`[data-app="${id}"]`);
      if (t) t.focus({ preventScroll: true });
    }
  }

  // ----- Dok & urutan -----

  function setDock(id, on) {
    const lay = layout();
    const r = A.toggleDock(lay.dock, id, on);
    if (r.full) {
      P.ui.toast(`Dok penuh (maks. ${A.DOCK_MAX}). Lepas satu ikon dulu.`, { tone: 'warn' });
      const box = dockEl.closest('.ln-dock');
      box.classList.remove('shake');
      box.getBoundingClientRect();
      box.classList.add('shake');
      return;
    }
    if (!r.changed) return;
    saveLayout({ order: lay.order, dock: r.dock });
    const added = r.dock.includes(id);
    announce(added ? `${byId[id].label} disematkan ke dok` : `${byId[id].label} dilepas dari dok`);
    // Gambar langsung (tanpa menunggu store) supaya animasi masuk dok terasa seketika.
    const x = snapshot();
    paintDock(x);
    const cell = grid.querySelector(`[data-cell="${id}"] .ln-pin`);
    if (cell) {
      cell.classList.toggle('on', added);
      cell.setAttribute('aria-label', added ? `Lepas ${byId[id].label} dari dok` : `Sematkan ${byId[id].label} ke dok`);
    }
    if (added) {
      const d = dockEl.querySelector(`[data-dcell="${id}"]`);
      if (d) d.classList.add('is-new');
    }
  }

  function setEditing(on) {
    editing = Boolean(on);
    closeMenu();
    magnify(null);
    hideHint();
    el.classList.toggle('editing', editing);
    if (editing && query) {
      query = '';
      input.value = '';
      paintGrid();
    }
    input.disabled = editing;
    paintHead();
    announce(editing ? 'Mode atur ikon. Seret untuk memindah.' : 'Selesai mengatur ikon');
  }

  /** Posisi tata letak (tanpa transformasi) semua sel untuk animasi FLIP. */
  function positions(scope) {
    const map = new Map();
    scope.querySelectorAll('.ln-cell, .ln-dcell').forEach((c) => map.set(c, { x: c.offsetLeft, y: c.offsetTop }));
    return map;
  }

  function flip(before, scope) {
    if (reduced()) return;
    scope.querySelectorAll('.ln-cell, .ln-dcell').forEach((c) => {
      const old = before.get(c);
      if (!old) {
        c.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.34, 1.4, 0.64, 1)' });
        return;
      }
      const dx = old.x - c.offsetLeft;
      const dy = old.y - c.offsetTop;
      if (!dx && !dy) return;
      c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    });
  }

  function currentOrder() {
    return [...grid.querySelectorAll('.ln-cell')].map((c) => c.dataset.cell);
  }

  function commitOrder() {
    const lay = layout();
    const order = A.normalizeOrder(currentOrder(), IDS);
    if (order.join() === lay.order.join()) return;
    saveLayout({ order, dock: lay.dock });
  }

  /** Alt + panah saat mengatur: pindahkan ikon yang sedang dipilih. */
  function moveByKey(tile, key) {
    const cells = [...grid.querySelectorAll('.ln-cell')];
    const cell = tile.closest('.ln-cell');
    const from = cells.indexOf(cell);
    const to = A.gridStep(from, key, columns(), cells.length);
    if (to === from || to < 0) return;
    const before = positions(grid);
    const ref = cells[to];
    if (to > from) ref.after(cell);
    else ref.before(cell);
    flip(before, grid);
    tile.focus({ preventScroll: true });
    commitOrder();
    announce(`${byId[cell.dataset.cell].label} dipindah ke posisi ${to + 1}`);
  }

  function columns() {
    const cells = grid.querySelectorAll('.ln-cell');
    if (!cells.length) return 1;
    const top = cells[0].offsetTop;
    let n = 0;
    for (const c of cells) {
      if (c.offsetTop !== top) break;
      n += 1;
    }
    return Math.max(1, n);
  }

  // ----- Seret untuk mengatur -----

  function beginDrag(p) {
    const cell = p.cell.isConnected ? p.cell : grid.querySelector(`[data-cell="${p.cell.dataset.cell}"]`);
    if (!cell) return;
    const r = cell.getBoundingClientRect();
    const ghost = cell.cloneNode(true);
    ghost.classList.add('ln-ghost');
    ghost.removeAttribute('data-cell');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.width = `${r.width}px`;
    ghost.style.height = `${r.height}px`;
    ghost.style.left = `${r.left}px`;
    ghost.style.top = `${r.top}px`;
    el.appendChild(ghost);
    cell.classList.add('is-placeholder');
    el.classList.add('dragging');
    drag = { id: cell.dataset.cell, cell, ghost, grabX: p.x - r.left, grabY: p.y - r.top, x: p.x, y: p.y, overDock: false, next: cell.nextElementSibling };
    moveDrag(p.x, p.y);
    P.ui.haptic && P.ui.haptic(12);
    autoScroll();
  }

  function moveDrag(x, y) {
    drag.x = x;
    drag.y = y;
    const gx = x - drag.grabX;
    const gy = y - drag.grabY;
    drag.ghost.style.transform = `translate(${gx - parseFloat(drag.ghost.style.left)}px, ${gy - parseFloat(drag.ghost.style.top)}px) scale(1.1)`;
    // Di atas dok?
    const dr = dockEl.closest('.ln-dock').getBoundingClientRect();
    const overDock = y > dr.top - 24 && x > dr.left - 24 && x < dr.right + 24;
    if (overDock !== drag.overDock) {
      drag.overDock = overDock;
      dockEl.closest('.ln-dock').classList.toggle('is-drop', overDock);
    }
    if (overDock) return;
    // Cari sel di bawah jari/penunjuk (pakai posisi tata letak, bukan yang sedang beranimasi).
    const gr = grid.getBoundingClientRect();
    const lx = x - gr.left;
    const ly = y - gr.top;
    const cells = [...grid.querySelectorAll('.ln-cell')];
    const hit = cells.find((c) => c !== drag.cell && lx >= c.offsetLeft && lx <= c.offsetLeft + c.offsetWidth && ly >= c.offsetTop && ly <= c.offsetTop + c.offsetHeight);
    if (!hit) return;
    const from = cells.indexOf(drag.cell);
    const to = cells.indexOf(hit);
    const before = positions(grid);
    if (to > from) hit.after(drag.cell);
    else hit.before(drag.cell);
    flip(before, grid);
  }

  /** Gulir otomatis saat ikon diseret ke tepi atas/bawah layar. */
  function autoScroll() {
    if (!drag) return;
    const sc = el.querySelector('[data-ln-scroll]');
    const edge = 70;
    const vh = root.innerHeight;
    let v = 0;
    if (drag.y < edge) v = -Math.ceil((edge - drag.y) / 6);
    else if (drag.y > vh - edge - 90) v = Math.ceil((drag.y - (vh - edge - 90)) / 6);
    if (v) {
      sc.scrollTop += v;
      moveDrag(drag.x, drag.y);
    }
    drag.raf = root.requestAnimationFrame(autoScroll);
  }

  function endDrag(cancel = false) {
    if (!drag) return;
    const d = drag;
    drag = null;
    root.cancelAnimationFrame(d.raf);
    el.classList.remove('dragging');
    const dockBox = dockEl.closest('.ln-dock');
    dockBox.classList.remove('is-drop');
    const finish = () => {
      d.ghost.remove();
      d.cell.classList.remove('is-placeholder');
    };
    // Dilepas di dok atau dibatalkan: ikon kembali ke tempat asalnya di grid.
    if (cancel || d.overDock) {
      const before = positions(grid);
      if (d.next && d.next.parentNode === grid) grid.insertBefore(d.cell, d.next);
      else grid.appendChild(d.cell);
      flip(before, grid);
    }
    if (!cancel && d.overDock) {
      setDock(d.id, true);
      d.ghost.classList.add('into-dock');
      setTimeout(finish, reduced() ? 0 : 260);
      return;
    }
    if (!cancel) commitOrder();
    if (reduced() || cancel) {
      finish();
      return;
    }
    // Ikon "mendarat" di tempat barunya.
    const r = d.cell.getBoundingClientRect();
    d.ghost.style.transition = 'transform 0.28s cubic-bezier(0.34, 1.4, 0.64, 1)';
    d.ghost.style.transform = `translate(${r.left - parseFloat(d.ghost.style.left)}px, ${r.top - parseFloat(d.ghost.style.top)}px) scale(1)`;
    setTimeout(finish, 280);
  }

  // ----- Tekan, tekan lama, klik kanan -----

  function onPointerDown(e) {
    if (e.button !== 0 || !isOpen || islandDismiss) return;
    const tile = e.target.closest('.ln-tile');
    const dtile = e.target.closest('.ln-dtile');
    if (!tile && !dtile) return;
    if (menu) return;
    press = {
      id: (tile || dtile).dataset.app,
      cell: tile ? tile.closest('.ln-cell') : null,
      dock: Boolean(dtile),
      x: e.clientX,
      y: e.clientY,
      type: e.pointerType,
      pid: e.pointerId,
      long: false,
      moved: false,
      timer: 0,
    };
    if (e.pointerType !== 'mouse') {
      press.timer = setTimeout(() => {
        if (!press || press.moved) return;
        press.long = true;
        P.ui.haptic && P.ui.haptic(15);
        if (editing && press.cell) return; // di mode atur, tekan lama langsung siap diseret
        openMenu(press.id);
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(e) {
    if (drag && press && e.pointerId === press.pid) {
      e.preventDefault();
      moveDrag(e.clientX, e.clientY);
      return;
    }
    if (!press || e.pointerId !== press.pid) return;
    const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
    if (dist < DRAG_PX) return;
    const canDrag = press.cell && !query && (press.type === 'mouse' || editing || press.long);
    if (canDrag) {
      clearTimeout(press.timer);
      press.moved = true;
      if (menu) closeMenu();
      if (!editing && press.type !== 'mouse') setEditing(true);
      beginDrag({ cell: press.cell, x: e.clientX, y: e.clientY });
      if (!drag) press = null;
      return;
    }
    if (!press.long) {
      clearTimeout(press.timer);
      press = null; // gulir biasa
    }
  }

  function onPointerUp(e) {
    if (!press || e.pointerId !== press.pid) return;
    clearTimeout(press.timer);
    const p = press;
    press = null;
    if (drag) {
      endDrag(e.type === 'pointercancel');
      suppressClick();
    } else if (p.long) suppressClick();
    if (refreshLater) {
      refreshLater = false;
      setTimeout(refresh, 320);
    }
  }

  let suppress = false;
  let islandDismiss = false;
  function suppressClick() {
    suppress = true;
    setTimeout(() => { suppress = false; }, 350);
  }

  // Seret dengan jari: cegah halaman ikut bergulir.
  function onTouchMove(e) {
    if (drag || (press && press.long)) e.preventDefault();
  }

  // ----- Kejadian -----

  function bind() {
    // Ketukan untuk menutup pemutar musik yang terbuka di atas Menu hanya menutupnya,
    // tidak ikut membuka ikon yang kebetulan ada di bawah jari.
    el.addEventListener('pointerdown', () => {
      islandDismiss = Boolean(doc.querySelector('.island[data-view="open"]'));
    }, true);
    el.addEventListener('click', (e) => {
      if (islandDismiss) {
        islandDismiss = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Klik yang menyusul seret/tekan lama di ikon bukan "buka aplikasi".
      if (suppress && e.target.closest('.ln-grid, .ln-dock')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (menu && menu.el.contains(e.target)) return onMenuClick(e);
      if (menu) {
        closeMenu({ refocus: true });
        return;
      }
      if (e.target.closest('[data-ln-close]')) return close();
      if (e.target.closest('[data-ln-edit]')) return setEditing(!editing);
      if (e.target.closest('[data-ln-reset]')) {
        saveLayout({ order: IDS.slice(), dock: DEFAULT_DOCK.slice() });
        const before = positions(grid);
        paintGrid();
        paintDock();
        flip(before, grid);
        announce('Urutan ikon & dok dikembalikan ke bawaan');
        return;
      }
      const pin = e.target.closest('[data-ln-pin]');
      if (pin) return setDock(pin.dataset.lnPin, null);
      const unpin = e.target.closest('[data-ln-unpin]');
      if (unpin) return setDock(unpin.dataset.lnUnpin, false);
      const chip = e.target.closest('[data-chip-app]');
      if (chip) {
        if (chip.dataset.chipTask) {
          const t = P.store.findTask(chip.dataset.chipTask);
          // Pindah halaman menutup Menu (lihat P.app.go); Kembali → halaman sebelum Menu.
          if (t) P.app.reveal(t.id, t.date);
          return;
        }
        return launch(chip.dataset.chipApp, chip);
      }
      const act = e.target.closest('[data-act-app]');
      if (act) return runAction(act.dataset.actApp, Number(act.dataset.act));
      if (e.target.closest('[data-ln-find]')) return P.components.openSearch(query);
      const tile = e.target.closest('[data-app]');
      if (tile) {
        if (editing) {
          const cell = tile.closest('.ln-cell, .ln-dcell');
          cell.classList.add('nudge');
          setTimeout(() => cell.classList.remove('nudge'), 300);
          return;
        }
        launch(tile.dataset.app, tile);
      }
    });

    el.addEventListener('contextmenu', (e) => {
      const t = e.target.closest('[data-app]');
      if (!t) return;
      e.preventDefault();
      if (editing || drag) return;
      if (press && press.long) return; // tekan lama di layar sentuh sudah membuka menu
      if (press) clearTimeout(press.timer);
      if (menu && menu.id === t.dataset.app) return;
      openMenu(t.dataset.app);
    });

    el.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove, { passive: false });
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    input.addEventListener('input', () => {
      hideHint();
      const before = positions(grid);
      query = input.value.trim();
      paintGrid();
      flip(before, grid);
    });

    // Di tingkat dokumen: tetap bekerja walau fokus sempat jatuh ke <body>.
    doc.addEventListener('keydown', onKey, true);

    // Kilau & kemiringan 3D mengikuti penunjuk (hanya mouse/trackpad).
    let raf = 0;
    let last = null;
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || reduced()) return;
      last = e;
      if (raf) return;
      raf = root.requestAnimationFrame(() => {
        raf = 0;
        const ev = last;
        el.style.setProperty('--mx', `${ev.clientX}px`);
        el.style.setProperty('--my', `${ev.clientY}px`);
        if (drag) return;
        const tile = ev.target.closest && ev.target.closest('.ln-tile, .ln-dtile');
        el.querySelectorAll('.ln-card.tilt').forEach((c) => {
          if (!tile || !tile.contains(c)) {
            c.classList.remove('tilt');
            c.style.removeProperty('--rx');
            c.style.removeProperty('--ry');
          }
        });
        if (tile) {
          const card = tile.querySelector('.ln-card');
          const r = card.getBoundingClientRect();
          const px = (ev.clientX - r.left) / r.width;
          const py = (ev.clientY - r.top) / r.height;
          card.classList.add('tilt');
          card.style.setProperty('--rx', `${((0.5 - py) * 16).toFixed(2)}deg`);
          card.style.setProperty('--ry', `${((px - 0.5) * 16).toFixed(2)}deg`);
          card.style.setProperty('--sx', `${(px * 100).toFixed(1)}%`);
          card.style.setProperty('--sy', `${(py * 100).toFixed(1)}%`);
        }
        magnify(ev);
      });
    });
    el.addEventListener('pointerleave', () => {
      el.querySelectorAll('.ln-card.tilt').forEach((c) => c.classList.remove('tilt'));
      magnify(null);
    });
    root.addEventListener('resize', () => {
      if (menu) placeMenu();
    });
  }

  /** Dok membesar di dekat penunjuk (seperti dok macOS). */
  function magnify(ev) {
    const items = dockEl.querySelectorAll('.ln-dcell');
    // Saat mengatur/menyeret, dok diam supaya tombol × tidak bergeser dari bawah kursor.
    if (!ev || !fine() || editing || drag) {
      items.forEach((c) => c.style.removeProperty('--m'));
      return;
    }
    const dr = dockEl.getBoundingClientRect();
    const near = ev.clientY > dr.top - 60 && ev.clientY < dr.bottom + 10;
    items.forEach((c) => {
      if (!near) {
        c.style.removeProperty('--m');
        return;
      }
      const r = c.getBoundingClientRect();
      const d = Math.abs(ev.clientX - (r.left + r.width / 2));
      const m = Math.max(0, 1 - d / 150);
      c.style.setProperty('--m', (m * m * (3 - 2 * m)).toFixed(3));
    });
  }

  function focusables() {
    const island = doc.querySelector('.island[data-view="open"]');
    const nodes = [...el.querySelectorAll('button, input, [tabindex="0"]'), ...(island ? island.querySelectorAll('button, input') : [])];
    return nodes.filter((n) => !n.disabled && n.tabIndex !== -1 && n.offsetParent !== null && !(menu && !menu.el.contains(n)));
  }

  function onKey(e) {
    if (!isOpen || doc.querySelector('dialog[open]')) return;
    const k = e.key;
    if (k === 'Escape') {
      // Pemutar musik terbuka di atas Menu: Esc mengecilkan pemutar dulu (ditangani music.js).
      if (doc.querySelector('.island[data-view="open"]')) return;
      e.preventDefault();
      e.stopPropagation();
      if (menu) return closeMenu({ refocus: true });
      if (drag) return endDrag(true);
      if (editing) return setEditing(false);
      if (query) {
        input.value = '';
        input.dispatchEvent(new root.Event('input'));
        input.focus();
        return;
      }
      return close();
    }
    if (k === 'Tab') {
      // Fokus tetap di dalam menu.
      const list = focusables();
      if (!list.length) return;
      const i = list.indexOf(doc.activeElement);
      const next = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i === list.length - 1 ? 0 : i + 1);
      e.preventDefault();
      list[next].focus();
      return;
    }
    if (menu) {
      const items = [...menu.el.querySelectorAll('[role="menuitem"]')];
      const i = items.indexOf(doc.activeElement);
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        const n = k === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        items[n].focus();
      }
      return;
    }
    const a = doc.activeElement;
    const tile = a && a.classList && a.classList.contains('ln-tile') ? a : null;
    if (tile && (k === 'ContextMenu' || (k === 'F10' && e.shiftKey))) {
      e.preventDefault();
      openMenu(tile.dataset.app);
      return;
    }
    if (tile && editing && e.altKey && /^Arrow/.test(k)) {
      e.preventDefault();
      moveByKey(tile, k);
      return;
    }
    if (a === input) {
      if (k === 'ArrowDown') {
        e.preventDefault();
        const first = grid.querySelector('.ln-tile') || el.querySelector('.ln-act');
        if (first) first.focus();
      } else if (k === 'Enter') {
        e.preventDefault();
        const first = grid.querySelector('.ln-tile');
        if (first) launch(first.dataset.app, first);
        else if (query) {
          const act = el.querySelector('.ln-act');
          if (act) act.click();
        }
      }
      return;
    }
    if (tile && /^(Arrow|Home$|End$)/.test(k) && !e.altKey) {
      const tiles = [...grid.querySelectorAll('.ln-tile')];
      const i = tiles.indexOf(tile);
      if (k === 'ArrowUp' && i < columns() && !editing) {
        e.preventDefault();
        input.focus();
        return;
      }
      const n = A.gridStep(i, k, columns(), tiles.length);
      if (n >= 0 && n !== i) {
        e.preventDefault();
        tiles[n].focus();
      }
      return;
    }
    // Ketik di mana saja → langsung mencari.
    if (!editing && k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && k !== ' ' && a !== input) {
      input.focus();
    }
  }

  function init() {
    doc.addEventListener('click', (e) => {
      const b = e.target.closest('[data-launcher-open]');
      if (!b) return;
      e.preventDefault();
      toggle(b);
    });
    doc.querySelectorAll('[data-launcher-open]').forEach((b) => {
      b.setAttribute('aria-haspopup', 'dialog');
      b.setAttribute('aria-expanded', 'false');
    });
  }

  /** Ikon berwarna sebuah aplikasi untuk bilah atas (aplikasi yang sedang dibuka). */
  function glyph(id) {
    const a = byId[id];
    return a ? `<span class="app-glyph" style="${colorStyle(a)}" aria-hidden="true">${GLYPHS[id](snapshot())}</span>` : '';
  }

  P.launcher = { init, open, close, toggle, handlePop, glyph, isOpen: () => isOpen, APPS, _info: info, _snapshot: snapshot };
})(typeof self !== 'undefined' ? self : this);
