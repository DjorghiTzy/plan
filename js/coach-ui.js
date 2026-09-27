/**
 * Coach Lari (tampilan): percakapan dengan coach AI yang membaca data lari & kesehatan,
 * impor tangkapan layar Strava/Garmin/dll. menjadi catatan lari, profil kesehatan, dan riwayat sesi.
 * Permintaan ke AI lewat /api/coach (server) — kunci API tidak pernah ada di browser.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const C = P.coach;
  const R = P.run;
  const { esc, icon } = P.ui;
  const doc = root.document;

  const CURRENT_KEY = 'rencana-harian/coach-current';
  const PROMPTS = [
    'Evaluasi lari minggu ini',
    'Kapan sebaiknya aku lari besok, dan berapa jauh?',
    'Buat rencana latihan 4 minggu sesuai targetku',
    'Apakah detak jantungku terlalu tinggi saat lari?',
    'Apa yang harus kuperbaiki dari pola lariku?',
  ];

  let available = null; // null = belum dicek; true/false dari /api/health
  let remaining = null;
  let draft = '';
  let controller = null;
  let paintQueued = false;
  /** Status jawaban yang sedang mengalir / impor yang sedang dibaca. */
  const live = { chatId: null, text: '', pending: false, importing: false, error: null };

  let currentId = null;
  try {
    currentId = root.localStorage.getItem(CURRENT_KEY);
  } catch {
    /* opsional */
  }
  function setCurrent(id) {
    currentId = id;
    try {
      if (id) root.localStorage.setItem(CURRENT_KEY, id);
      else root.localStorage.removeItem(CURRENT_KEY);
    } catch {
      /* opsional */
    }
  }

  const st = () => P.store.state;
  const loggedIn = () => P.sync.info().loggedIn;
  const current = () => (currentId && P.store.findCoachChat(currentId)) || null;
  const nowHHMM = () => D.formatTime(D.minutesOfDay(new Date()));
  const refresh = () => P.app && P.app.refresh();

  // ----- Markdown sederhana & aman (teks di-escape dulu, tanpa tautan/HTML mentah) -----

  function inline(text) {
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
      .replace(/(^|[\s(])_([^_\s][^_]*)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
  }

  function md(src) {
    const lines = esc(C.tidyText(src)).split('\n');
    const out = [];
    let i = 0;
    const para = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join('<br>'))}</p>`);
      para.length = 0;
    };
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();
      if (!t) {
        flushPara();
        i += 1;
      } else if (t.startsWith('```')) {
        flushPara();
        const code = [];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
        i += 1;
        out.push(`<pre>${code.join('\n')}</pre>`);
      } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
        flushPara();
        out.push('<hr>');
        i += 1;
      } else if (/^#{1,6}\s/.test(t)) {
        flushPara();
        out.push(`<h4>${inline(t.replace(/^#{1,6}\s+/, ''))}</h4>`);
        i += 1;
      } else if (/^\|.*\|$/.test(t)) {
        flushPara();
        const rows = [];
        while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) rows.push(lines[i++].trim());
        const cells = (r) => r.slice(1, -1).split('|').map((c) => inline(c.trim()));
        const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
        const [first, ...rest] = body;
        out.push(`<div class="coach-table"><table><thead><tr>${cells(first).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      } else if (/^([-*•])\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
        flushPara();
        const ordered = /^\d+[.)]\s+/.test(t);
        const items = [];
        while (i < lines.length) {
          const u = lines[i].trim();
          if (ordered ? /^\d+[.)]\s+/.test(u) : /^([-*•])\s+/.test(u)) items.push(u.replace(ordered ? /^\d+[.)]\s+/ : /^([-*•])\s+/, ''));
          else if (u && items.length && /^\s{2,}/.test(lines[i])) items[items.length - 1] += `<br>${u}`;
          else break;
          i += 1;
        }
        const tag = ordered ? 'ol' : 'ul';
        out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
      } else {
        para.push(t);
        i += 1;
      }
    }
    flushPara();
    return out.join('');
  }

  // ----- Data untuk coach -----

  function prayersFor(date) {
    const s = st().settings;
    if (!s.prayerEnabled || !P.prayer) return null;
    const city = P.prayer.findCity(s.prayerCity);
    return P.prayer.times(date, city).map((p) => ({ name: p.name || p.id, time: D.formatTime(p.minutes) }));
  }

  function context() {
    const today = D.todayKey();
    const s = st().settings;
    const prayers = s.prayerEnabled ? { city: P.prayer.findCity(s.prayerCity).name, today: prayersFor(today), tomorrow: prayersFor(D.addDays(today, 1)) } : null;
    return C.buildContext(st(), { today, prayers });
  }

  /** Pesan impor dikirim ke AI sebagai teks data (gambar tidak dikirim ulang). */
  function toApi(m) {
    if (m.kind === 'import') {
      return { role: 'user', content: `Aku mengimpor tangkapan layar aktivitas${m.data && m.data.source_app ? ` dari ${m.data.source_app}` : ''}. Data yang terbaca: ${JSON.stringify(m.data || {})}` };
    }
    return { role: m.role, content: m.text };
  }

  // ----- Tampilan -----

  function importCard(m) {
    const x = m.data || {};
    const parts = [];
    if (x.distance_km) parts.push(`${R.formatKm(x.distance_km)} km`);
    const sec = x.moving_time_sec || x.elapsed_time_sec;
    if (sec) parts.push(R.formatClock(sec));
    if (x.avg_pace_sec_per_km) parts.push(`${R.formatPace(x.avg_pace_sec_per_km)} /km`);
    if (x.avg_heart_rate) parts.push(`❤ ${x.avg_heart_rate} bpm`);
    if (x.calories) parts.push(`${x.calories} kkal`);
    const saved = m.runId && P.store.findRun(m.runId);
    return `
      <div class="coach-import">
        <p class="coach-import-head">${icon('camera')}${esc(x.source_app || 'Tangkapan layar')}${x.title ? ` · ${esc(x.title)}` : ''}${x.date ? ` · ${esc(D.formatShort(x.date))}` : ''}</p>
        <p class="coach-import-stats">${parts.map(esc).join(' · ') || 'Data tidak lengkap'}</p>
        ${saved
          ? `<p class="coach-import-saved">${icon('check')}Tersimpan di catatan lari</p>`
          : `<button type="button" class="btn small secondary" data-coach-save-import="${m.t}">${icon('plus')}Simpan ke catatan lari</button>`}
      </div>`;
  }

  function bubble(m) {
    if (m.kind === 'import') return `<div class="coach-msg user import">${importCard(m)}</div>`;
    const who = m.role === 'user' ? 'user' : 'coach';
    return `<div class="coach-msg ${who}">${who === 'coach' ? `<span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span>` : ''}<div class="coach-md">${who === 'coach' ? md(m.text) : `<p>${esc(m.text).replace(/\n/g, '<br>')}</p>`}</div></div>`;
  }

  function liveBubble(chat) {
    if (!(live.pending || live.error || live.importing) || live.chatId !== (chat ? chat.id : null)) return '';
    if (live.importing) {
      return `<div class="coach-msg coach" data-coach-live><span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span><div class="coach-md"><p class="coach-typing">Membaca tangkapan layar<span></span></p></div></div>`;
    }
    if (live.error && !live.pending) {
      return `
        <div class="coach-msg coach error" data-coach-live>
          <span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span>
          <div class="coach-md"><p>${esc(live.error)}</p><button type="button" class="btn small ghost" data-coach-retry>${icon('refresh')}Coba lagi</button></div>
        </div>`;
    }
    return `
      <div class="coach-msg coach" data-coach-live>
        <span class="coach-avatar" aria-hidden="true">${icon('sparkle')}</span>
        <div class="coach-md">${live.text ? md(live.text) : '<p class="coach-typing">Coach sedang menganalisis datamu<span></span></p>'}</div>
      </div>`;
  }

  function banner() {
    if (!loggedIn()) {
      return `
        <div class="coach-banner">
          <p><strong>Masuk dulu untuk memakai coach.</strong> Permintaan ke AI lewat server aplikasimu supaya kunci API tetap aman.</p>
          <button type="button" class="btn small primary" data-coach-login>Masuk</button>
        </div>`;
    }
    if (available === false) {
      return `
        <div class="coach-banner warn">
          <p><strong>Coach belum aktif di server.</strong> Buka Vercel → proyek <em>plan</em> → Settings → Environment Variables, tambahkan <code>GEMINI_API_KEY</code> (gratis dari aistudio.google.com → Get API key), lalu Redeploy.</p>
        </div>`;
    }
    return '';
  }

  function profileCard() {
    const p = C.cleanProfile(st().settings.coachProfile);
    const max = C.maxHrOf(p);
    const zones = C.hrZones(p);
    const row = (label, value) => (value ? `<div><dt>${label}</dt><dd>${value}</dd></div>` : '');
    const filled = Object.values(p).some((v) => v !== null && v !== '');
    return `
      <section class="panel coach-profile">
        <div class="panel-head"><h2>Profil kesehatan</h2><button type="button" class="link-btn" data-coach-profile>${icon('edit')}${filled ? 'Ubah' : 'Isi'}</button></div>
        ${filled ? `
          <dl class="coach-dl">
            ${row('Usia', p.age ? `${p.age} th${p.sex ? ` · ${esc(p.sex)}` : ''}` : '')}
            ${row('Tinggi · berat', p.heightCm || p.weightKg ? `${p.heightCm ? `${p.heightCm} cm` : '–'} · ${p.weightKg ? `${p.weightKg} kg` : '–'}` : '')}
            ${row('HR istirahat', p.restingHr ? `${p.restingHr} bpm` : '')}
            ${row('HR maks', max ? `${max.value} bpm${p.maxHr ? '' : ' <span class="muted">(perkiraan)</span>'}` : '')}
            ${row('Target', esc(p.goal))}
            ${row('Kondisi', esc(p.health))}
            ${row('Waktu luang', esc(p.availability))}
          </dl>
          ${zones ? `<p class="coach-zones">${zones.zones.map((z) => `<span title="${esc(z.zone)}">${esc(z.zone.split(' ')[0])} ${z.from}–${z.to}</span>`).join('')}</p>` : ''}`
          : '<p class="muted">Isi usia, berat, detak jantung, target, dan kondisi kesehatan (mis. cedera) supaya saran coach lebih tepat.</p>'}
      </section>`;
  }

  function sessionsCard(chat) {
    const list = [...st().coachChats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12);
    return `
      <section class="panel coach-sessions">
        <div class="panel-head"><h2>Sesi</h2><button type="button" class="link-btn" data-coach-new>${icon('plus')}Baru</button></div>
        ${list.length ? `<ul>${list.map((c) => `
          <li class="${chat && c.id === chat.id ? 'on' : ''}">
            <button type="button" class="coach-session" data-coach-open="${esc(c.id)}"><span>${esc(c.title)}</span><small>${esc(D.formatShort(D.todayKey(new Date(c.updatedAt))))} · ${c.messages.length} pesan</small></button>
            <button type="button" class="icon-btn" data-coach-del="${esc(c.id)}" aria-label="Hapus sesi ${esc(c.title)}" title="Hapus">${icon('trash')}</button>
          </li>`).join('')}</ul>` : '<p class="muted">Belum ada sesi. Mulai dengan pertanyaan di samping.</p>'}
      </section>`;
  }

  function render() {
    const chat = current();
    const msgs = chat ? chat.messages : [];
    const busy = live.pending || live.importing;
    const off = !loggedIn() || available === false;
    return `
      <div class="coach" data-coach>
        ${banner()}
        <div class="coach-grid">
          <section class="panel coach-chat" data-key="coach-chat">
            <div class="coach-head">
              <div>
                <h2>${esc(chat ? chat.title : 'Tanya coach lari')}</h2>
                <p class="muted">Menganalisis catatan lari, profil kesehatan, kebiasaan, dan jadwalmu</p>
              </div>
              ${chat ? `<button type="button" class="btn ghost small" data-coach-new>${icon('plus')}Sesi baru</button>` : ''}
            </div>
            <div class="coach-log" data-coach-log>
              ${msgs.length ? msgs.map(bubble).join('') : `
                <div class="coach-intro">
                  <span class="coach-avatar big" aria-hidden="true">${icon('sparkle')}</span>
                  <p><strong>Halo! Aku coach larimu.</strong> Kirim tangkapan layar dari Strava untuk kurangkum, atau tanya apa saja soal latihan: kapan sebaiknya lari, berapa jauh, pace dan detak jantung, sampai rencana menuju targetmu.</p>
                </div>`}
              ${liveBubble(chat)}
            </div>
            ${msgs.length ? '' : `<div class="coach-prompts">${PROMPTS.map((q) => `<button type="button" class="coach-chip" data-coach-prompt="${esc(q)}" ${off || busy ? 'disabled' : ''}>${esc(q)}</button>`).join('')}</div>`}
            <form class="coach-input" data-coach-form autocomplete="off">
              <button type="button" class="icon-btn" data-coach-attach title="Impor tangkapan layar Strava" aria-label="Impor tangkapan layar" ${off || busy ? 'disabled' : ''}>${icon('camera')}</button>
              <textarea name="q" rows="1" maxlength="4000" placeholder="Tanya coach… mis. Kapan sebaiknya aku lari besok?" aria-label="Pertanyaan untuk coach" data-coach-q ${off ? 'disabled' : ''}>${esc(draft)}</textarea>
              ${live.pending
                ? `<button type="button" class="btn secondary coach-send" data-coach-stop aria-label="Hentikan jawaban" title="Hentikan">${icon('stop')}</button>`
                : `<button type="submit" class="btn primary coach-send" aria-label="Kirim" title="Kirim (Enter)" ${off || busy ? 'disabled' : ''}>${icon('send')}</button>`}
            </form>
            <p class="coach-foot">${remaining !== null ? `Sisa ${remaining} permintaan hari ini · ` : ''}Coach AI bisa keliru dan bukan pengganti dokter.</p>
          </section>
          <aside class="coach-side">
            ${profileCard()}
            ${sessionsCard(chat)}
            <p class="hint coach-privacy">Saat bertanya, aplikasi mengirim ringkasan profil, catatan lari, kebiasaan, air minum, suasana hati, dan jadwalmu ke Gemini (Google) lewat servermu. Tangkapan layar hanya dikirim saat diimpor dan tidak disimpan di aplikasi. Di paket gratis, Google dapat memakai data yang dikirim untuk meningkatkan layanannya.</p>
          </aside>
        </div>
      </div>`;
  }

  // ----- Aliran jawaban -----

  function scrollLog(force = false) {
    const log = doc.querySelector('[data-coach-log]');
    if (!log) return;
    const near = log.scrollHeight - log.scrollTop - log.clientHeight < 120;
    if (force || near) log.scrollTop = log.scrollHeight;
  }

  function paintLive() {
    if (paintQueued) return;
    paintQueued = true;
    root.requestAnimationFrame(() => {
      paintQueued = false;
      const box = doc.querySelector('[data-coach-live] .coach-md');
      if (box && live.text) box.innerHTML = md(live.text);
      scrollLog();
    });
  }

  function needAccess() {
    if (!loggedIn()) {
      P.ui.toast('Masuk dulu untuk memakai coach.', { action: 'Masuk', onAction: () => P.account.openAccount() });
      return true;
    }
    if (available === false) {
      P.ui.toast('Coach belum aktif. Pasang GEMINI_API_KEY di Vercel.', { tone: 'warn' });
      return true;
    }
    return false;
  }

  async function stream(chat) {
    live.chatId = chat.id;
    live.text = '';
    live.error = null;
    live.pending = true;
    refresh();
    root.requestAnimationFrame(() => scrollLog(true));
    controller = typeof AbortController === 'function' ? new AbortController() : null;
    let stopped = false;
    try {
      await P.sync.apiStream('coach', {
        signal: controller && controller.signal,
        body: {
          action: 'chat',
          today: D.todayKey(),
          now: nowHHMM(),
          context: context(),
          messages: chat.messages.map(toApi),
        },
        onEvent(e) {
          if (e.t === 'start' && Number.isFinite(e.remaining)) remaining = e.remaining;
          else if (e.t === 'text') {
            live.text += e.v;
            paintLive();
          } else if (e.t === 'error') live.error = e.message;
        },
      });
    } catch (err) {
      if (err && err.name === 'AbortError') stopped = true;
      else live.error = err.message || 'Coach sedang tidak bisa dihubungi.';
      if (err && err.code === 'coach_off') available = false;
    }
    controller = null;
    live.pending = false;
    const text = live.text.trim();
    if (text) {
      const fresh = P.store.findCoachChat(chat.id) || chat;
      const note = live.error ? `\n\n_(Jawaban terputus: ${live.error})_` : stopped ? '\n\n_(Dihentikan)_' : '';
      live.text = '';
      live.error = null;
      P.store.saveCoachChat({ ...fresh, messages: [...fresh.messages, { role: 'assistant', text: C.tidyText(text) + note, t: Date.now() }] });
    } else if (stopped) {
      live.error = null;
    }
    refresh();
    root.requestAnimationFrame(() => scrollLog(true));
  }

  function ask(text) {
    const q = String(text || '').trim();
    if (!q || live.pending || live.importing || needAccess()) return;
    const existing = current();
    const chat = existing || { id: `cc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: C.chatTitle(q), createdAt: Date.now(), messages: [] };
    const saved = P.store.saveCoachChat({ ...chat, messages: [...chat.messages, { role: 'user', text: q, t: Date.now() }] });
    setCurrent(saved.id);
    draft = '';
    stream(saved);
  }

  // ----- Impor tangkapan layar -----

  function pickImage() {
    return new Promise((resolve) => {
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.addEventListener('change', () => resolve(input.files && input.files[0] ? input.files[0] : null), { once: true });
      input.click();
    });
  }

  /** Perkecil gambar (maks. 1600 px) lalu jadikan JPEG base64 agar hemat kuota & cepat dikirim. */
  async function toJpeg(file) {
    const url = root.URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const im = new root.Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('Gambar tidak bisa dibuka.'));
        im.src = url;
      });
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = doc.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const g = canvas.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return { mediaType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
    } finally {
      root.URL.revokeObjectURL(url);
    }
  }

  /** Data hasil baca yang disimpan di pesan impor (ringkas, tanpa ringkasan panjang). */
  function compact(x) {
    const keep = ['source_app', 'activity_type', 'title', 'date', 'start_time', 'distance_km', 'moving_time_sec', 'elapsed_time_sec',
      'avg_pace_sec_per_km', 'avg_heart_rate', 'max_heart_rate', 'calories', 'elevation_gain_m', 'avg_cadence_spm', 'location', 'splits', 'notes'];
    const out = {};
    for (const k of keep) if (x[k] !== null && x[k] !== undefined && !(Array.isArray(x[k]) && !x[k].length)) out[k] = x[k];
    if (Array.isArray(out.splits)) out.splits = out.splits.slice(0, 30);
    return out;
  }

  function openDraft(x, chatId, t) {
    const draftRun = C.draftFromExtract(x, D.todayKey());
    P.lari.openRunEditor(null, {
      ...draftRun,
      stay: Boolean(chatId), // di Coach: tetap di percakapan, jangan pindah bulan
      onSaved(saved) {
        if (!chatId) return;
        const chat = P.store.findCoachChat(chatId);
        if (!chat) return;
        P.store.saveCoachChat({ ...chat, messages: chat.messages.map((m) => (m.kind === 'import' && m.t === t ? { ...m, runId: saved.id } : m)) });
      },
    });
  }

  /**
   * Pilih gambar → coach membaca datanya → dialog Catat lari terisi (dengan ringkasan coach).
   * @param {{toChat?: boolean}} opts toChat: catat juga di sesi chat coach yang sedang dibuka
   */
  async function importScreenshot({ toChat = false } = {}) {
    if (live.pending || live.importing || needAccess()) return;
    const file = await pickImage();
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      P.ui.toast('Pilih berkas gambar (tangkapan layar).', { tone: 'warn' });
      return;
    }
    let image;
    try {
      image = await toJpeg(file);
    } catch (err) {
      P.ui.toast(err.message, { tone: 'warn' });
      return;
    }
    let chat = toChat ? current() : null;
    if (toChat && !chat) {
      chat = P.store.saveCoachChat({ id: `cc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, title: 'Impor tangkapan layar', createdAt: Date.now(), messages: [] });
      setCurrent(chat.id);
    }
    live.chatId = chat ? chat.id : null;
    live.importing = true;
    live.error = null;
    refresh();
    let res;
    try {
      res = await P.ui.withBusy(null, () => P.sync.api('coach', {
        method: 'POST',
        timeout: 90000,
        body: { action: 'extract', image, today: D.todayKey(), context: context() },
      }));
    } catch (err) {
      live.importing = false;
      if (err && err.code === 'coach_off') available = false;
      refresh();
      P.ui.toast(err.message || 'Gagal membaca tangkapan layar.', { tone: 'warn', duration: 7000 });
      return;
    }
    live.importing = false;
    if (Number.isFinite(res.remaining)) remaining = res.remaining;
    const x = res.run || {};
    if (!x.is_activity_screenshot || !(x.distance_km > 0)) {
      refresh();
      P.ui.toast('Coach tidak menemukan data lari di gambar itu. Coba tangkapan layar ringkasan aktivitas.', { tone: 'warn', duration: 7000 });
      return;
    }
    let t = null;
    if (chat) {
      t = Date.now();
      const fresh = P.store.findCoachChat(chat.id) || chat;
      P.store.saveCoachChat({
        ...fresh,
        title: fresh.messages.length ? fresh.title : C.chatTitle(`${x.title || 'Lari'} ${x.distance_km ? `${R.formatKm(x.distance_km)} km` : ''}`),
        messages: [
          ...fresh.messages,
          { role: 'user', kind: 'import', text: `Impor tangkapan layar ${x.source_app || ''}`.trim(), data: compact(x), t },
          { role: 'assistant', text: x.summary ? C.tidyText(x.summary) : 'Data terbaca.', t: t + 1 },
        ],
      });
    }
    refresh();
    root.requestAnimationFrame(() => scrollLog(true));
    openDraft(x, chat ? chat.id : null, t);
  }

  // ----- Profil -----

  function openProfile() {
    const p = C.cleanProfile(st().settings.coachProfile);
    const v = (x) => (x === null || x === undefined ? '' : x);
    const numF = (name, label, suffix, min, max, step = 1) => `
      <div class="field compact">
        <label for="cp-${name}">${label}</label>
        <div class="with-suffix"><input id="cp-${name}" name="${name}" type="number" inputmode="decimal" min="${min}" max="${max}" step="${step}" value="${v(p[name])}"><span>${suffix}</span></div>
      </div>`;
    P.ui.openDialog({
      title: 'Profil kesehatan',
      body: `
        <form class="form" novalidate>
          <p class="dialog-text">Dipakai coach untuk menghitung zona detak jantung dan menyesuaikan saran. Semua opsional.</p>
          <div class="field-row">
            ${numF('age', 'Usia', 'th', 10, 100)}
            <div class="field compact">
              <label for="cp-sex">Jenis kelamin</label>
              <select id="cp-sex" name="sex"><option value="">–</option><option value="pria" ${p.sex === 'pria' ? 'selected' : ''}>Pria</option><option value="wanita" ${p.sex === 'wanita' ? 'selected' : ''}>Wanita</option></select>
            </div>
          </div>
          <div class="field-row">${numF('heightCm', 'Tinggi', 'cm', 100, 230)}${numF('weightKg', 'Berat', 'kg', 25, 250, 0.1)}</div>
          <div class="field-row">${numF('restingHr', 'HR istirahat', 'bpm', 30, 120)}${numF('maxHr', 'HR maks', 'bpm', 120, 230)}</div>
          <p class="hint">HR istirahat: hitung denyut nadi 1 menit saat bangun tidur. HR maks kosongkan bila belum tahu (diperkirakan dari usia).</p>
          <div class="field">
            <label for="cp-goal">Target lari</label>
            <input id="cp-goal" name="goal" type="text" maxlength="200" value="${esc(p.goal)}" placeholder="Mis. 10K di bawah 60 menit bulan Desember">
          </div>
          <div class="field">
            <label for="cp-health">Kondisi kesehatan / cedera</label>
            <textarea id="cp-health" name="health" rows="3" maxlength="500" placeholder="Mis. lutut kiri kadang nyeri, asma ringan, tidur rata-rata 6 jam">${esc(p.health)}</textarea>
          </div>
          <div class="field">
            <label for="cp-availability">Waktu luang untuk lari</label>
            <input id="cp-availability" name="availability" type="text" maxlength="200" value="${esc(p.availability)}" placeholder="Mis. pagi setelah Subuh, akhir pekan lebih lama">
          </div>
          <div class="dialog-actions">
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn primary">Simpan</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const data = {};
          for (const [k, val] of fd.entries()) data[k] = String(val).trim();
          P.store.setCoachProfile(data);
          P.ui.toast('Profil kesehatan disimpan.', { tone: 'success' });
          close();
        });
      },
    });
  }

  // ----- Interaksi -----

  async function checkAvailable() {
    if (available !== null) return;
    try {
      const res = await root.fetch('api/health', { cache: 'no-store' });
      const data = await res.json();
      available = Boolean(data.coach);
    } catch {
      available = null;
    }
    refresh();
  }

  function mount(el) {
    checkAvailable();
    root.requestAnimationFrame(() => scrollLog(true));

    el.addEventListener('input', (e) => {
      const q = e.target.closest('[data-coach-q]');
      if (!q) return;
      draft = q.value;
      q.style.height = 'auto';
      q.style.height = `${Math.min(q.scrollHeight, 180)}px`;
    });
    el.addEventListener('keydown', (e) => {
      const q = e.target.closest('[data-coach-q]');
      if (q && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        ask(q.value);
      }
    });
    el.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-coach-form]');
      if (!form) return;
      e.preventDefault();
      ask(form.querySelector('[data-coach-q]').value);
    });
    el.addEventListener('click', async (e) => {
      const t = e.target;
      const prompt = t.closest('[data-coach-prompt]');
      if (prompt) return ask(prompt.dataset.coachPrompt);
      if (t.closest('[data-coach-attach]')) return importScreenshot({ toChat: true });
      if (t.closest('[data-coach-stop]')) {
        if (controller) controller.abort();
        return undefined;
      }
      if (t.closest('[data-coach-retry]')) {
        const chat = current();
        if (chat && !needAccess()) stream(chat);
        return undefined;
      }
      if (t.closest('[data-coach-login]')) return P.account.openAccount();
      if (t.closest('[data-coach-profile]')) return openProfile();
      if (t.closest('[data-coach-new]')) {
        if (live.pending) return undefined;
        setCurrent(null);
        live.error = null;
        refresh();
        const q = doc.querySelector('[data-coach-q]');
        if (q) q.focus();
        return undefined;
      }
      const open = t.closest('[data-coach-open]');
      if (open) {
        if (live.pending) return undefined;
        setCurrent(open.dataset.coachOpen);
        live.error = null;
        refresh();
        root.requestAnimationFrame(() => scrollLog(true));
        return undefined;
      }
      const del = t.closest('[data-coach-del]');
      if (del) {
        const removed = P.store.deleteCoachChat(del.dataset.coachDel);
        if (removed && removed.id === currentId) setCurrent(null);
        if (removed) P.ui.toast(`Sesi "${removed.title}" dihapus.`, { action: 'Urungkan', onAction: () => P.store.restoreCoachChat(removed) });
        return undefined;
      }
      const save = t.closest('[data-coach-save-import]');
      if (save) {
        const chat = current();
        const m = chat && chat.messages.find((x) => x.kind === 'import' && String(x.t) === save.dataset.coachSaveImport);
        if (m) {
          const summary = chat.messages[chat.messages.indexOf(m) + 1];
          openDraft({ ...m.data, is_activity_screenshot: true, summary: summary && summary.role === 'assistant' ? summary.text : null }, chat.id, m.t);
        }
      }
      return undefined;
    });
  }

  P.coachUI = { render, mount, importScreenshot, openProfile, md, _live: live };
})(typeof self !== 'undefined' ? self : this);
