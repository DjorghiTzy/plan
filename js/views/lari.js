/**
 * Lari: catat lari harian (jarak, waktu, pace, jenis, rasa) dengan rekap bulanan
 * ala spreadsheet, grafik jarak harian, akumulasi vs target, per minggu, dan rekor pribadi.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const R = P.run;
  const HS = P.habitSheet;
  const { esc, icon } = P.ui;

  const kmText = (v, digits) => R.formatKm(v, digits);
  const typeLabel = (id) => (R.TYPES.find((t) => t.id === id) || R.TYPES[0]).label;
  const feelOf = (id) => R.FEELS.find((f) => f.id === id) || null;
  const mins = (sec) => Math.round(sec / 60);
  const durText = (sec) => (sec ? D.formatDuration(mins(sec)) : '–');
  const dayLabel = (key) => `${D.dayShort(key)}, ${D.formatShort(key)}`;
  const runsOn = (date) => P.store.state.runs.filter((r) => r.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const tipAttr = (data) => esc(JSON.stringify(data));

  // ----- Ringkasan atas -----

  function kpis(m, ctx) {
    const t = m.total;
    const current = m.ym === ctx.today.slice(0, 7);
    let pace = '';
    if (m.goal && current && m.ahead !== null) {
      pace = m.ahead >= 0 ? `<span class="rs-ok">${kmText(m.ahead, 1)} km di depan jalur</span>` : `kurang ${kmText(-m.ahead, 1)} km dari jalur`;
    }
    const streak = R.streak(ctx.state.runs, ctx.today);
    return `
      <div class="hs-kpis">
        <div class="hs-kpi">
          <p class="hs-kpi-label">Jarak bulan ini</p>
          <p class="hs-hero">${kmText(t.km, 1)}<span class="rs-unit"> km</span></p>
          ${m.goal ? `<div class="hs-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, m.pct)}" aria-label="Jarak terhadap target"><span style="width:${Math.min(100, m.pct)}%"></span></div>` : ''}
          <p class="hs-kpi-note">${m.goal ? `${m.pct}% dari target ${kmText(m.goal)} km${pace ? ` · ${pace}` : ''}` : 'Belum ada target bulanan'}
            <button type="button" class="link-btn rs-goal" data-run-goal>${icon('edit')}${m.goal ? 'Ubah' : 'Pasang target'}</button></p>
        </div>
        <div class="hs-kpi">
          <p class="hs-kpi-label">Jumlah lari</p>
          <p class="hs-kpi-value">${t.count} <span>lari</span></p>
          <p class="hs-kpi-note">${t.activeDays} hari aktif · streak ${streak} hari</p>
        </div>
        <div class="hs-kpi">
          <p class="hs-kpi-label">Pace rata-rata</p>
          <p class="hs-kpi-value">${R.formatPace(t.pace)} <span>/km</span></p>
          <p class="hs-kpi-note">total waktu ${durText(t.sec)}</p>
        </div>
        <div class="hs-kpi">
          <p class="hs-kpi-label">Terjauh bulan ini</p>
          <p class="hs-kpi-value">${m.longest ? `${kmText(m.longest.km)} <span>km</span>` : '–'}</p>
          <p class="hs-kpi-note">${m.longest ? esc(dayLabel(m.longest.date)) : 'belum ada lari'}</p>
        </div>
      </div>`;
  }

  // ----- Spreadsheet bulanan -----

  function dayTip(d, today) {
    if (!d.runs.length) return { title: dayLabel(d.key), value: '–', label: d.key > today ? 'belum tiba' : 'tidak lari' };
    const parts = [`${d.runs.length} lari`];
    if (d.sec) parts.push(durText(d.sec));
    if (d.pace) parts.push(`pace ${R.formatPace(d.pace)}`);
    return { title: dayLabel(d.key), value: `${kmText(d.km)} km`, label: parts.join(' · ') };
  }

  function barsRow(m, ctx, max) {
    const n = m.days.length;
    const top = m.daily.reduce((best, d, i) => (d.km > (best < 0 ? 0 : m.daily[best].km) ? i : best), -1);
    return `
      <tr class="hs-chart-row">
        <th class="hs-sticky hs-axis" scope="row">
          <span class="hs-axis-title">Jarak harian</span>
          <span class="hs-ticks" aria-hidden="true"><span style="top:0%">${kmText(max)} km</span><span style="top:50%">${kmText(max / 2)}</span><span style="top:100%">0</span></span>
        </th>
        <td colspan="${n}" class="hs-chart-cell">
          <div class="rs-bars" style="--n:${n}" aria-hidden="true">
            <span class="rs-grid" style="top:0%"></span><span class="rs-grid" style="top:50%"></span><span class="rs-grid" style="top:100%"></span>
            ${m.daily.map((d, i) => `
              <div class="rs-bar-col${d.key === ctx.today ? ' now' : ''}" data-rs-tip="${tipAttr(dayTip(d, ctx.today))}">
                ${d.km ? `<span class="rs-bar" style="height:${(d.km / max) * 100}%"></span>` : ''}
                ${i === top ? `<span class="rs-bar-val" style="bottom:${(d.km / max) * 100}%">${kmText(d.km, 1)}</span>` : ''}
              </div>`).join('')}
          </div>
        </td>
        <td class="hs-side"></td>
      </tr>`;
  }

  function sheet(m, ctx) {
    const n = m.days.length;
    const max = R.niceMax(m.maxDay);
    const weekStart = (i) => (i > 0 && i % 7 === 0 ? ' hs-wk' : '');
    const colCls = (k, i) => `${weekStart(i)}${k === ctx.today ? ' hs-now' : ''}${k === ctx.date ? ' hs-sel' : ''}`;
    const weekKm = (w) => (w.km ? `${kmText(w.km, 1)} km` : w.future ? '–' : '0 km');
    const avgFeel = (() => {
      const f = m.daily.flatMap((d) => d.runs).filter((r) => r.feel);
      return f.length ? feelOf(Math.round(f.reduce((a, r) => a + r.feel, 0) / f.length)) : null;
    })();

    const row = (label, cells, side) => `
      <tr>
        <th scope="row" class="hs-sticky rs-label">${label}</th>
        ${cells}
        <td class="rs-sum">${side}</td>
      </tr>`;

    const kmCells = m.daily.map((d, i) => `
      <td class="rs-td${colCls(d.key, i)}">
        <button type="button" class="rs-cell${d.km ? ' has' : ''}" data-run-day="${d.key}" ${d.future ? 'disabled' : ''}
          aria-label="${esc(D.formatLong(d.key))}: ${d.km ? `${kmText(d.km)} km, ubah` : 'catat lari'}">${d.km ? kmText(d.km, 1) : ''}</button>
      </td>`).join('');
    const minCells = m.daily.map((d, i) => `<td class="rs-td rs-v${colCls(d.key, i)}">${d.sec ? mins(d.sec) : ''}</td>`).join('');
    const paceCells = m.daily.map((d, i) => `<td class="rs-td rs-v rs-pace${colCls(d.key, i)}">${d.pace ? R.formatPace(d.pace) : ''}</td>`).join('');
    const feelCells = m.daily.map((d, i) => {
      const f = feelOf(d.feel);
      return `<td class="rs-td rs-feel${colCls(d.key, i)}"${f ? ` title="${esc(f.label)}"` : ''}>${f ? f.face : ''}</td>`;
    }).join('');

    return `
      <div class="hs-scroll" data-hs-scroll>
        <table class="hs-table rs-table" style="--days:${n}">
          <caption class="sr-only">Catatan lari ${esc(D.MONTHS[m.month - 1])} ${m.year}</caption>
          <colgroup><col class="hs-c-name">${'<col>'.repeat(n)}<col class="rs-c-sum"></colgroup>
          <thead>
            ${barsRow(m, ctx, max)}
            <tr class="hs-weeks">
              <th class="hs-sticky hs-corner" scope="col" rowspan="2"><span>Catatan</span></th>
              ${m.weeks.map((w) => `
                <th colspan="${w.size}" scope="colgroup" class="hs-week${w.index > 1 ? ' hs-wk' : ''}">
                  <span>${w.size >= 4 ? 'Minggu ' : 'M'}${w.index}</span><strong>${weekKm(w)}</strong>
                </th>`).join('')}
              <th scope="col" class="rs-sum rs-sum-head" rowspan="2">Bulan ini</th>
            </tr>
            <tr class="hs-daynames">
              ${m.days.map((k, i) => `
                <th scope="col" class="hs-day${colCls(k, i)}${D.dayIndex(k) === 0 ? ' is-sunday' : ''}" title="${esc(D.formatLong(k))}">
                  <span>${esc(D.dayShort(k))}</span><strong>${i + 1}</strong>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${row('Jarak (km)', kmCells, `<strong>${kmText(m.total.km, 1)} km</strong>`)}
            ${row('Waktu (mnt)', minCells, durText(m.total.sec))}
            ${row('Pace (/km)', paceCells, R.formatPace(m.total.pace))}
            ${row('Rasa', feelCells, avgFeel ? `<span title="${esc(avgFeel.label)}">${avgFeel.face}</span>` : '–')}
          </tbody>
        </table>
      </div>`;
  }

  // ----- Grafik: akumulasi vs target, per minggu -----

  function cumulativeChart(m) {
    const n = m.days.length;
    const lastIdx = m.cumulative.reduce((a, c, i) => (c.km !== null ? i : a), -1);
    const now = lastIdx >= 0 ? m.cumulative[lastIdx].km : 0;
    const max = R.niceMax(Math.max(m.goal || 0, now));
    const y = (v) => 100 - (v / max) * 100;
    const pts = m.cumulative.slice(0, lastIdx + 1).map((c, i) => [i + 0.5, y(c.km)]);
    const line = pts.length > 1 ? `M${pts.map(([a, b]) => `${a} ${b}`).join('L')}` : '';
    const area = pts.length > 1 ? `M${pts[0][0]} 100L${pts.map(([a, b]) => `${a} ${b}`).join('L')}L${pts[pts.length - 1][0]} 100Z` : '';
    // Garis target: jatah kumulatif di akhir setiap hari (sejajar titik akumulasi).
    const target = m.goal ? `M0.5 ${y(m.goal / n)}L${n - 0.5} ${y(m.goal)}` : '';
    const x = (i) => `${((i + 0.5) / n) * 100}%`;
    const data = m.cumulative.map((c, i) => [c.key, c.km, c.target, m.daily[i].km]);
    const ticks = [1, 8, 15, 22, 29].filter((d) => d <= n);
    return `
      <section class="panel rs-cum">
        <div class="panel-head">
          <h2>Akumulasi ${m.goal ? 'vs target' : 'bulan ini'}</h2>
          ${m.goal ? `<span class="rs-legend"><span class="rs-key"><i class="line"></i>Akumulasi</span><span class="rs-key"><i class="line target"></i>Target ${kmText(m.goal)} km</span></span>` : ''}
        </div>
        <div class="rs-cum-body">
          <span class="rs-yticks" aria-hidden="true"><span style="top:0%">${kmText(max)}</span><span style="top:50%">${kmText(max / 2)}</span><span style="top:100%">0 km</span></span>
          <div class="rs-plot" data-rs-plot data-points="${esc(JSON.stringify(data))}" data-max="${max}" tabindex="0" role="img"
            aria-label="Akumulasi jarak ${esc(D.MONTHS[m.month - 1])}: ${kmText(now, 1)} km${m.goal ? ` dari target ${kmText(m.goal)} km` : ''}. Gunakan panah kiri/kanan untuk melihat tiap hari.">
            <svg viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <path class="hs-grid" d="M0 0H${n}M0 50H${n}M0 100H${n}"/>
              ${target ? `<path class="rs-target" d="${target}"/>` : ''}
              <path class="hs-area" d="${area}"/>
              <path class="hs-line" d="${line}"/>
            </svg>
            ${lastIdx >= 0 ? `
              <span class="hs-end" style="left:${x(lastIdx)};top:${y(now)}%" aria-hidden="true"></span>
              <span class="hs-end-label${y(now) < 22 ? ' below' : ''}${lastIdx > n - 5 ? ' left' : ''}" style="left:${x(lastIdx)};top:${y(now)}%" aria-hidden="true">${kmText(now, 1)} km</span>` : ''}
            <span class="hs-cross" hidden aria-hidden="true"></span>
            <span class="hs-hover" hidden aria-hidden="true"></span>
          </div>
          <div class="rs-xticks" aria-hidden="true">${ticks.map((d) => `<span style="left:${x(d - 1)}">${d}</span>`).join('')}</div>
        </div>
      </section>`;
  }

  function weekly(m) {
    const max = R.niceMax(Math.max(...m.weeks.map((w) => w.km)));
    return `
      <section class="panel hs-weekly">
        <div class="panel-head"><h2>Per minggu</h2><span class="panel-note">km tiap minggu</span></div>
        <div class="hs-cols" role="list">
          ${m.weeks.map((w) => {
            const range = `${Number(w.from.slice(8))}–${Number(w.to.slice(8))}`;
            const tip = tipAttr({
              title: `Minggu ${w.index} · ${range} ${D.MONTHS_SHORT[m.month - 1]}`,
              value: `${kmText(w.km)} km`,
              label: w.count ? `${w.count} lari · ${durText(w.sec)}` : w.future ? 'belum tiba' : 'tidak ada lari',
            });
            const val = w.future && !w.km ? '–' : kmText(w.km, 1);
            return `
              <div class="hs-col" role="listitem" tabindex="0" data-hs-tip="${tip}" aria-label="Minggu ${w.index}: ${val} km">
                <div class="hs-col-plot">
                  <span class="hs-col-val">${val}</span>
                  ${w.km ? `<span class="hs-col-bar" style="height:max(2px, calc((100% - 22px) * ${w.km / max}))"></span>` : ''}
                </div>
                <span class="hs-col-x"><strong>M${w.index}</strong>${range}</span>
              </div>`;
          }).join('')}
        </div>
      </section>`;
  }

  // ----- Daftar & rekor -----

  function runItem(r) {
    const f = feelOf(r.feel);
    const p = R.pace(r.km, r.sec);
    const x = P.store.state.runExtras[r.id] || {};
    const chips = [
      x.hr ? `❤ ${x.hr} bpm` : '',
      x.cal ? `${x.cal} kkal` : '',
      Number.isFinite(x.elev) && x.elev > 0 ? `↑ ${x.elev} m` : '',
      x.source ? esc(x.source) : '',
    ].filter(Boolean);
    return `
      <li class="rs-item" data-run="${esc(r.id)}">
        <button type="button" class="rs-item-btn" data-run-open aria-label="Ubah lari ${esc(D.formatLong(r.date))}, ${kmText(r.km)} km">
          <span class="rs-date"><strong>${esc(D.dayShort(r.date))} ${Number(r.date.slice(8))}</strong><span>${r.time ? esc(r.time) : ''}</span></span>
          <span class="rs-main">
            <span class="rs-dist"><strong>${kmText(r.km)} km</strong><span class="rs-type">${esc(typeLabel(r.type))}</span>${f ? `<span class="rs-face" title="${esc(f.label)}">${f.face}</span>` : ''}</span>
            <span class="rs-meta">${r.sec ? `${R.formatClock(r.sec)} · pace ${R.formatPace(p)} /km · ${R.speed(r.km, r.sec).toLocaleString('id-ID')} km/jam` : 'waktu tidak dicatat'}</span>
            ${chips.length ? `<span class="rs-chips">${chips.map((c) => `<span>${c}</span>`).join('')}</span>` : ''}
            ${r.note ? `<span class="rs-note">${esc(r.note)}</span>` : ''}
          </span>
          <span class="rs-edit" aria-hidden="true">${icon('edit')}</span>
        </button>
      </li>`;
  }

  function runList(m) {
    const list = m.daily.flatMap((d) => d.runs).slice().reverse();
    return `
      <section class="panel rs-list">
        <div class="panel-head"><h2>Catatan lari</h2><span class="panel-note">${list.length} lari di ${esc(D.MONTHS[m.month - 1])}</span></div>
        ${list.length ? `<ul class="rs-items">${list.map(runItem).join('')}</ul>`
          : `<p class="muted">Belum ada lari di bulan ini. <button type="button" class="link-btn" data-run-new>${icon('plus')}Catat lari</button></p>`}
      </section>`;
  }

  function recordsPanel(ctx) {
    const rec = R.records(ctx.state.runs);
    const when = (r) => esc(`${D.dayShort(r.date)}, ${D.formatShort(r.date)} ${r.date.slice(0, 4)}`);
    const item = (label, value, note) => `<div class="rs-rec"><dt>${label}</dt><dd><strong>${value}</strong><span>${note}</span></dd></div>`;
    return `
      <section class="panel rs-records">
        <div class="panel-head"><h2>Rekor pribadi</h2><span class="panel-note">sepanjang waktu</span></div>
        <dl>
          ${item('Terjauh', rec.longest ? `${kmText(rec.longest.km)} km` : '–', rec.longest ? when(rec.longest) : '')}
          ${item('Pace tercepat', rec.fastest ? `${R.formatPace(rec.fastest.pace)} /km` : '–', rec.fastest ? `${kmText(rec.fastest.run.km)} km · ${when(rec.fastest.run)}` : 'lari ≥ 1 km dengan waktu')}
          ${item('5K tercepat', rec.best5k ? R.formatClock(rec.best5k.sec) : '–', rec.best5k ? `perkiraan dari pace · ${when(rec.best5k.run)}` : 'lari ≥ 5 km dengan waktu')}
          ${item('Total', `${kmText(rec.km, 1)} km`, `${rec.count} lari`)}
        </dl>
      </section>`;
  }

  // ----- Halaman -----

  function render(ctx) {
    const { state, today } = ctx;
    const coachMode = ctx.prefs.lariMode === 'coach';
    const routeMode = ctx.prefs.lariMode === 'rute';
    const ym = ctx.date.slice(0, 7);
    const m = R.runMonth(state.runs, ym, today, Number(state.settings.runGoal) || 0);
    const month = D.MONTHS[m.month - 1];
    let title = 'Catat lari harianmu';
    if (coachMode) title = 'Coach lari';
    else if (routeMode) title = 'Rute lari';
    else if (state.runs.length) title = m.total.count ? `${kmText(m.total.km, 1)} km di ${month}` : `Belum lari di ${month}`;
    const head = `
      <header class="view-head">
        <div>
          <p class="eyebrow">Lari</p>
          <h1>${esc(title)}</h1>
        </div>
        <div class="view-actions">
          <div class="segmented" role="group" aria-label="Tampilan lari">
            <button type="button" data-lari-mode="catatan" aria-pressed="${!coachMode && !routeMode}">${icon('chart')}Catatan</button>
            <button type="button" data-lari-mode="rute" aria-pressed="${routeMode}">${icon('route')}Rute</button>
            <button type="button" data-lari-mode="coach" aria-pressed="${coachMode}">${icon('sparkle')}Coach</button>
          </div>
          <button type="button" class="btn ghost" data-run-import title="Baca tangkapan layar Strava, Garmin, dll.">${icon('camera')}Impor screenshot</button>
          <button type="button" class="btn primary" data-run-new>${icon('plus')}Catat lari</button>
        </div>
      </header>`;

    if (coachMode) return `${head}${P.coachUI.render(ctx)}`;
    if (routeMode) return `${head}${P.routeUI.render(ctx)}`;

    if (!state.runs.length) {
      return `${head}
        <div class="empty big">
          <p class="empty-title">Belum ada catatan lari.</p>
          <p>Setiap selesai lari, catat jarak dan waktunya, atau impor tangkapan layar dari Strava. Pace, total per minggu dan bulan, grafik, serta rekor pribadimu dihitung otomatis.</p>
          <div class="empty-actions">
            <button type="button" class="btn primary" data-run-new>${icon('plus')}Catat lari hari ini</button>
            <button type="button" class="btn ghost" data-run-import>${icon('camera')}Impor screenshot Strava</button>
          </div>
        </div>`;
    }

    return `${head}
      <div class="hs rs" data-hs>
        ${kpis(m, ctx)}
        <section class="panel hs-sheet" data-key="rs-sheet">
          ${HS.monthBar(ym, today, 'Catatan lari bulanan')}
          ${sheet(m, ctx)}
          <p class="hint">Ketuk angka di baris Jarak untuk mengubah, atau kotak kosong untuk mencatat lari di tanggal itu.</p>
        </section>
        <div class="rs-charts">${cumulativeChart(m)}${weekly(m)}</div>
        <div class="rs-bottom">${runList(m)}${recordsPanel(ctx)}</div>
        <div class="tip hs-tip" role="tooltip" hidden></div>
      </div>`;
  }

  // ----- Dialog: catat / ubah lari -----

  function openRunEditor(run = null, defaults = {}) {
    const today = D.todayKey();
    const r = run || {
      date: defaults.date && defaults.date <= today ? defaults.date : today,
      time: defaults.time || '',
      km: defaults.km || 0,
      sec: defaults.sec || 0,
      type: defaults.type || 'santai',
      feel: 0,
      note: defaults.note || '',
      taskId: defaults.taskId || null,
    };
    // Detail tambahan (HR, kalori, elevasi) & ringkasan coach dari impor tangkapan layar.
    const x = run ? P.store.runExtra(run.id) : { ...(defaults.extra || {}) };
    const hasDetail = ['hr', 'hrMax', 'cal', 'elev', 'cadence'].some((k) => x[k] !== undefined && x[k] !== null);
    const numField = (id, name, label, value, suffix, max) => `
      <div class="field compact">
        <label for="${id}">${label}</label>
        <div class="with-suffix"><input id="${id}" name="${name}" type="number" inputmode="numeric" min="0" max="${max}" value="${value === undefined || value === null ? '' : value}"><span>${suffix}</span></div>
      </div>`;
    const h = Math.floor(r.sec / 3600);
    const mi = Math.floor((r.sec % 3600) / 60);
    const se = r.sec % 60;
    const before = R.records(P.store.state.runs);
    P.ui.openDialog({
      title: run ? 'Ubah catatan lari' : 'Catat lari',
      body: `
        <form class="form run-form" novalidate>
          ${x.summary ? `
            <div class="run-summary">
              <p class="run-summary-head">${icon('sparkle')}Ringkasan coach${x.source ? ` · dari ${esc(x.source)}` : ''}${x.title ? ` · ${esc(x.title)}` : ''}</p>
              <p>${esc(P.coach.tidyText(x.summary))}</p>
            </div>` : ''}
          <div class="field-row">
            <div class="field compact">
              <label for="run-date">Tanggal</label>
              <input id="run-date" name="date" type="date" max="${today}" value="${esc(r.date)}" required>
            </div>
            <div class="field compact">
              <label for="run-time-h">Jam mulai <span class="muted">(opsional)</span></label>
              ${P.ui.timeSelect({ id: 'run-time', name: 'time', value: r.time, optional: true, label: 'Jam mulai' })}
            </div>
          </div>
          <div class="field-row">
            <div class="field compact">
              <label for="run-km">Jarak</label>
              <div class="with-suffix"><input id="run-km" name="km" type="text" inputmode="decimal" autocomplete="off" placeholder="5,0" value="${r.km ? kmText(r.km) : ''}" required autofocus><span>km</span></div>
            </div>
            <div class="field compact">
              <label for="run-m">Waktu</label>
              <div class="run-dur">
                <input id="run-h" name="h" type="number" inputmode="numeric" min="0" max="23" placeholder="0" value="${h || ''}" aria-label="Jam"><span>j</span>
                <input id="run-m" name="m" type="number" inputmode="numeric" min="0" max="59" placeholder="00" value="${r.sec ? mi : ''}" aria-label="Menit"><span>m</span>
                <input id="run-s" name="s" type="number" inputmode="numeric" min="0" max="59" placeholder="00" value="${r.sec ? se : ''}" aria-label="Detik"><span>d</span>
              </div>
            </div>
          </div>
          <p class="run-preview" data-run-preview aria-live="polite"></p>
          <fieldset class="field">
            <legend>Jenis lari</legend>
            <div class="run-chips">
              ${R.TYPES.map((t) => `<label class="run-chip"><input type="radio" name="type" value="${t.id}" ${t.id === r.type ? 'checked' : ''}><span>${esc(t.label)}</span></label>`).join('')}
            </div>
          </fieldset>
          <fieldset class="field">
            <legend>Rasanya <span class="muted">(opsional)</span></legend>
            <div class="run-feels">
              ${R.FEELS.map((f) => `<label class="run-feel" title="${esc(f.label)}"><input type="radio" name="feel" value="${f.id}" ${f.id === r.feel ? 'checked' : ''}><span aria-hidden="true">${f.face}</span><small>${esc(f.label)}</small></label>`).join('')}
            </div>
          </fieldset>
          <div class="field">
            <label for="run-note">Catatan <span class="muted">(opsional)</span></label>
            <input id="run-note" name="note" type="text" maxlength="200" value="${esc(r.note || '')}" placeholder="Mis. rute GBK, cuaca panas">
          </div>
          <details class="run-more"${hasDetail ? ' open' : ''}>
            <summary>Detail tambahan <span class="muted">(detak jantung, kalori, elevasi)</span></summary>
            <div class="field-row">
              ${numField('run-hr', 'hr', 'HR rata-rata', x.hr, 'bpm', 250)}
              ${numField('run-hrmax', 'hrMax', 'HR maks', x.hrMax, 'bpm', 250)}
            </div>
            <div class="field-row">
              ${numField('run-cal', 'cal', 'Kalori', x.cal, 'kkal', 20000)}
              ${numField('run-elev', 'elev', 'Elevasi naik', x.elev, 'm', 9000)}
              ${numField('run-cad', 'cadence', 'Kadens', x.cadence, 'spm', 260)}
            </div>
          </details>
          <p class="form-error" role="alert" hidden></p>
          <div class="dialog-actions">
            ${run ? `<button type="button" class="btn ghost danger-text" data-run-del>${icon('trash')}Hapus</button>` : ''}
            <span class="spacer"></span>
            <button type="button" class="btn ghost" data-close>Batal</button>
            <button type="submit" class="btn primary">${run ? 'Simpan' : 'Simpan lari'}</button>
          </div>
        </form>`,
      onMount(el, close) {
        const form = el.querySelector('form');
        const error = form.querySelector('.form-error');
        const preview = form.querySelector('[data-run-preview]');
        const num = (name) => Math.max(0, Math.floor(Number(form.elements[name].value) || 0));
        const secOf = () => num('h') * 3600 + Math.min(59, num('m')) * 60 + Math.min(59, num('s'));
        const update = () => {
          const km = R.parseKm(form.elements.km.value);
          const sec = secOf();
          if (km && sec) preview.innerHTML = `Pace <strong>${R.formatPace(R.pace(km, sec))} /km</strong> · ${R.speed(km, sec).toLocaleString('id-ID')} km/jam`;
          else preview.textContent = 'Isi jarak dan waktu untuk menghitung pace.';
        };
        update();
        form.addEventListener('input', update);
        form.addEventListener('click', (e) => {
          if (!e.target.closest('[data-run-del]')) return;
          close();
          const removed = P.store.deleteRun(run.id);
          if (removed) P.ui.toast(`Lari ${kmText(removed.km)} km dihapus.`, { action: 'Urungkan', onAction: () => P.store.restoreRun(removed) });
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const fail = (msg, field) => {
            error.textContent = msg;
            error.hidden = false;
            if (field) form.elements[field].focus();
          };
          const km = R.parseKm(fd.get('km'));
          if (!km) return fail('Isi jarak lari dalam km, mis. 5,2.', 'km');
          if (num('m') > 59 || num('s') > 59) return fail('Menit dan detik maksimal 59.', num('m') > 59 ? 'm' : 's');
          let saved;
          try {
            saved = P.store.saveRun({
              id: run ? run.id : undefined,
              date: String(fd.get('date') || ''),
              time: String(fd.get('time') || ''),
              km,
              sec: secOf(),
              type: String(fd.get('type') || 'santai'),
              feel: Number(fd.get('feel') || 0),
              note: String(fd.get('note') || '').trim(),
              taskId: r.taskId || null,
              extra: {
                ...x,
                hr: fd.get('hr'),
                hrMax: fd.get('hrMax'),
                cal: fd.get('cal'),
                elev: fd.get('elev'),
                cadence: fd.get('cadence'),
              },
            });
          } catch (err) {
            return fail(err.message);
          }
          close();
          const after = R.records(P.store.state.runs);
          const p = R.pace(saved.km, saved.sec);
          const newLongest = before.longest && after.longest && after.longest.id === saved.id && saved.km > before.longest.km;
          const newFastest = before.fastest && after.fastest && after.fastest.run.id === saved.id && after.fastest.pace < before.fastest.pace;
          if (!run && (newLongest || newFastest)) {
            P.ui.confetti(null, { count: 90 });
            P.ui.toast(newLongest ? `Rekor baru: lari terjauh ${kmText(saved.km)} km!` : `Rekor baru: pace tercepat ${R.formatPace(p)} /km!`, { tone: 'success' });
          } else {
            P.ui.toast(`Lari ${kmText(saved.km)} km tersimpan${p ? ` · pace ${R.formatPace(p)} /km` : ''}.`, { tone: 'success' });
          }
          if (typeof defaults.onSaved === 'function') defaults.onSaved(saved);
          if (!defaults.stay && P.app && saved.date.slice(0, 7) !== P.app.selected().slice(0, 7) && root.location.hash === '#lari') P.app.setDate(saved.date);
        });
      },
    });
  }

  function openGoal() {
    const goal = Number(P.store.state.settings.runGoal) || 0;
    P.ui.openDialog({
      title: 'Target lari bulanan',
      size: 'small',
      body: `
        <form class="form" novalidate>
          <div class="field">
            <label for="run-goal">Target per bulan</label>
            <div class="with-suffix"><input id="run-goal" name="goal" type="number" inputmode="decimal" min="0" max="2000" step="1" value="${goal || ''}" placeholder="50" autofocus><span>km</span></div>
          </div>
          <p class="hint">Kosongkan atau isi 0 bila tidak memakai target.</p>
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
          const v = Math.round(Math.max(0, Math.min(2000, Number(String(form.elements.goal.value).replace(',', '.')) || 0)));
          P.store.setSettings({ runGoal: v });
          close();
        });
      },
    });
  }

  /** Tugas lari yang baru dicentang: tawarkan untuk mencatat jarak & waktunya. */
  function offerFromTask(task) {
    if (!task || !task.done || !P.smart || P.smart.kindOf(task) !== 'lari') return;
    if (P.store.state.runs.some((r) => r.taskId === task.id)) return;
    const s = D.parseTime(task.start);
    const e = D.parseTime(task.end);
    const sec = s !== null && e !== null && e > s ? (e - s) * 60 : 0;
    P.ui.toast('Selesai lari? Catat jarak dan waktunya.', {
      action: 'Catat',
      duration: 9000,
      onAction: () => openRunEditor(null, { date: task.date, time: task.start || '', sec, taskId: task.id }),
    });
  }

  // ----- Interaksi -----

  function mount(el, ctx) {
    HS.mount(el, ctx); // tooltip kolom per minggu & gulir ke tanggal terpilih
    const host = () => el.querySelector('[data-hs]');
    const tipEl = () => el.querySelector('.hs-tip');
    let plotIdx = -1;

    P.coachUI.mount(el, ctx);
    P.routeUI.mount(el, ctx);
    el.addEventListener('click', (e) => {
      const mode = e.target.closest('[data-lari-mode]');
      if (mode) return ctx.setPref('lariMode', mode.dataset.lariMode);
      if (e.target.closest('[data-run-import]')) return P.coachUI.importScreenshot({ toChat: ctx.prefs.lariMode === 'coach' });
      if (HS.handleClick(e, ctx)) return;
      if (e.target.closest('[data-run-new]')) return openRunEditor(null, { date: ctx.date });
      if (e.target.closest('[data-run-goal]')) return openGoal();
      const day = e.target.closest('[data-run-day]');
      if (day) {
        const list = runsOn(day.dataset.runDay);
        return openRunEditor(list.length ? list[list.length - 1] : null, { date: day.dataset.runDay });
      }
      const item = e.target.closest('[data-run]');
      if (item) openRunEditor(P.store.findRun(item.dataset.run));
    });

    // Tooltip batang jarak harian
    el.addEventListener('pointerover', (e) => {
      const col = e.target.closest('[data-rs-tip]');
      if (!col) return;
      let data;
      try {
        data = JSON.parse(col.dataset.rsTip);
      } catch {
        return;
      }
      const bar = col.querySelector('.rs-bar') || col;
      const b = bar.getBoundingClientRect();
      HS.showTip(host(), tipEl(), data, { x: b.left + b.width / 2, y: bar === col ? b.bottom - 10 : b.top });
    });
    el.addEventListener('pointerout', (e) => {
      const col = e.target.closest('[data-rs-tip]');
      if (col && !col.contains(e.relatedTarget) && tipEl()) tipEl().hidden = true;
      const plot = e.target.closest('[data-rs-plot]');
      if (plot && !plot.contains(e.relatedTarget)) hidePlot(plot);
    });

    // Crosshair grafik akumulasi
    const pointsOf = (plot) => {
      try {
        return JSON.parse(plot.dataset.points);
      } catch {
        return [];
      }
    };
    function hidePlot(plot) {
      plotIdx = -1;
      plot.querySelector('.hs-cross').hidden = true;
      plot.querySelector('.hs-hover').hidden = true;
      if (tipEl()) tipEl().hidden = true;
    }
    function showPlot(plot, i) {
      const pts = pointsOf(plot);
      if (!pts.length) return;
      plotIdx = Math.max(0, Math.min(pts.length - 1, i));
      const [key, cum, target, dayKm] = pts[plotIdx];
      const max = Number(plot.dataset.max) || 1;
      const x = ((plotIdx + 0.5) / pts.length) * 100;
      const cross = plot.querySelector('.hs-cross');
      const dot = plot.querySelector('.hs-hover');
      cross.style.left = `${x}%`;
      cross.hidden = false;
      dot.hidden = cum === null;
      const yPct = cum === null ? 50 : 100 - (cum / max) * 100;
      if (cum !== null) {
        dot.style.left = `${x}%`;
        dot.style.top = `${yPct}%`;
      }
      const rows = [{ value: cum === null ? '–' : `${kmText(cum, 1)} km`, label: cum === null ? 'belum tiba' : `akumulasi${dayKm ? ` (+${kmText(dayKm, 1)} km hari itu)` : ''}` }];
      if (target !== null) rows.push({ value: `${kmText(target, 1)} km`, label: 'target', key: 'target' });
      const b = plot.getBoundingClientRect();
      HS.showTip(host(), tipEl(), { title: dayLabel(key), rows }, { x: b.left + (b.width * x) / 100, y: b.top + (b.height * yPct) / 100 });
    }
    el.addEventListener('pointermove', (e) => {
      const plot = e.target.closest('[data-rs-plot]');
      if (!plot) return;
      const b = plot.getBoundingClientRect();
      const i = Math.floor(((e.clientX - b.left) / b.width) * pointsOf(plot).length);
      if (i !== plotIdx) showPlot(plot, i);
    });
    el.addEventListener('focusin', (e) => {
      const plot = e.target.closest('[data-rs-plot]');
      if (!plot) return;
      const pts = pointsOf(plot);
      const idx = pts.findIndex((p) => p[0] === ctx.date);
      showPlot(plot, idx >= 0 ? idx : pts.length - 1);
    });
    el.addEventListener('focusout', (e) => {
      const plot = e.target.closest('[data-rs-plot]');
      if (plot) hidePlot(plot);
    });
    el.addEventListener('keydown', (e) => {
      const plot = e.target.closest('[data-rs-plot]');
      if (!plot || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      showPlot(plot, (plotIdx < 0 ? 0 : plotIdx) + (e.key === 'ArrowLeft' ? -1 : 1));
    });
  }

  P.lari = { openRunEditor, offerFromTask };
  (P.views = P.views || {}).lari = {
    title: 'Lari',
    render,
    mount,
    newDefaults: (ctx) => ({ date: ctx.date }),
  };
})(typeof self !== 'undefined' ? self : this);
