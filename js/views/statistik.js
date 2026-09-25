/**
 * Statistik: sorotan otomatis, kartu angka + sparkline, tugas per hari,
 * peta aktivitas 20 pekan, komposisi kategori (donat), kurva suasana hati,
 * jam produktif, hari terbaik, dan konsistensi kebiasaan.
 * Grafik dibuat dengan HTML/CSS + SVG agar tajam, responsif, dan beranimasi.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon, moodFace } = P.ui;

  const HEAT_WEEKS = 20;

  // ----- Pembantu -----

  function niceScale(max, target = 4) {
    if (max <= 0) return { max: 1, ticks: [0, 1] };
    const raw = max / target;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
    return { max: top, ticks };
  }

  const tipAttr = (title, rows) => `data-tip="${esc(JSON.stringify({ title, rows }))}"`;
  const fmt1 = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });

  function yAxis(scale, suffix = '') {
    return `
      <div class="grid" aria-hidden="true">
        ${scale.ticks.map((t) => `<div class="gridline" style="bottom:${(t / scale.max) * 100}%"><span>${t.toLocaleString('id-ID')}${suffix}</span></div>`).join('')}
      </div>`;
  }

  /** Label sumbu-x: hari (7), tanggal tiap 5 hari (30), atau awal pekan (90). */
  function xLabel(item, i, n, weekly) {
    if (weekly) {
      const show = i === n - 1 || (n - 1 - i) % 3 === 0;
      return show ? `<strong>${esc(D.formatShort(item.key))}</strong>` : '';
    }
    if (n <= 7) return `<span>${esc(D.dayShort(item.key))}</span><strong>${Number(item.key.slice(8))}</strong>`;
    const show = i === n - 1 || (n - 1 - i) % 5 === 0;
    return show ? `<strong>${Number(item.key.slice(8))}</strong>` : '';
  }

  const periodLabel = (item, weekly) => (weekly
    ? `Pekan ${D.formatShort(item.key)} – ${D.formatShort(D.addDays(item.key, 6))}`
    : D.formatLong(item.key));

  // ----- Kartu angka -----

  function sparkline(values) {
    const pts = values.map((v, i) => (v == null ? null : { i, v }));
    const valid = pts.filter(Boolean);
    if (valid.length < 2) return '';
    const max = Math.max(...valid.map((p) => p.v), 1);
    const min = Math.min(...valid.map((p) => p.v), 0);
    const span = max - min || 1;
    const x = (i) => (values.length === 1 ? 50 : (i / (values.length - 1)) * 100);
    const y = (v) => 92 - ((v - min) / span) * 84;
    const line = valid.map((p) => `${x(p.i).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ');
    const area = `0,100 ${line} 100,100`;
    const last = valid[valid.length - 1];
    return `
      <div class="spark" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="${area}" class="spark-area"/>
          <polyline points="${line}" class="spark-line"/>
        </svg>
        <span class="spark-dot" style="left:${x(last.i)}%;top:${y(last.v)}%"></span>
      </div>`;
  }

  function deltaChip(value, invert = false) {
    if (value === null || value === undefined) return '';
    if (value === 0) return '<span class="delta flat">= sama</span>';
    const up = value > 0;
    const good = invert ? !up : up;
    return `<span class="delta ${good ? 'good' : 'bad'}" title="Dibanding periode sebelumnya">${up ? '▲' : '▼'} ${Math.abs(value)}%</span>`;
  }

  function tiles(ctx, days, prevDays, series, n) {
    const { state, date } = ctx;
    const sum = (arr, k) => arr.reduce((s, d) => s + d[k], 0);
    const done = sum(days, 'done');
    const total = sum(days, 'total');
    const focus = sum(days, 'focus');
    const waterDays = days.filter((d) => d.water);
    const water = waterDays.length ? sum(waterDays, 'water') / waterDays.length : 0;
    const prevWaterDays = prevDays.filter((d) => d.water);
    const prevWater = prevWaterDays.length ? sum(prevWaterDays, 'water') / prevWaterDays.length : 0;
    const moods = days.filter((d) => d.mood);
    const mood = moods.length ? moods.reduce((s, d) => s + d.mood, 0) / moods.length : null;
    const habits = state.habits.filter((h) => !h.archived);
    const rate = (end) => (habits.length
      ? Math.round(habits.reduce((s, h) => s + L.habitRate(state.habitLog, h, end, n), 0) / habits.length) : null);
    const habitRate = rate(date);
    const prevHabitRate = rate(D.addDays(date, -n));

    const list = [
      {
        label: 'Tugas selesai', value: `<span data-count="${done}">${done}</span>`,
        sub: `dari ${total} rencana · ${total ? Math.round((done / total) * 100) : 0}%`,
        delta: L.delta(done, sum(prevDays, 'done')), spark: series.map((d) => d.done),
      },
      {
        label: 'Waktu fokus', value: esc(D.formatDuration(focus)),
        sub: `rata-rata ${esc(D.formatDuration(focus / n))} per hari`,
        delta: L.delta(focus, sum(prevDays, 'focus')), spark: series.map((d) => d.focus),
      },
      {
        label: 'Air minum', value: `<span data-count="${fmt1(water).replace(',', '.')}" data-decimals="1" data-suffix=" gelas">${fmt1(water)} gelas</span>`,
        sub: `rata-rata per hari · target ${state.settings.waterGoal}`,
        delta: L.delta(Math.round(water * 10), Math.round(prevWater * 10)), spark: series.map((d) => (d.water || null)),
      },
      {
        label: 'Suasana hati', value: mood ? esc(L.MOODS[Math.round(mood) - 1].label) : '–',
        sub: mood ? `rata-rata ${fmt1(mood)} dari 5` : 'belum ada catatan',
        delta: null, spark: series.map((d) => d.mood),
      },
      {
        label: 'Kebiasaan', value: habitRate == null ? '–' : `<span data-count="${habitRate}" data-suffix="%">${habitRate}%</span>`,
        sub: 'hari tercentang, rata-rata',
        delta: habitRate == null ? null : L.delta(habitRate, prevHabitRate), spark: series.map((d) => d.habitsDone),
      },
    ];
    return `
      <dl class="tiles">
        ${list.map((t) => `
          <div class="tile">
            <dt>${esc(t.label)}</dt>
            <dd>${t.value}</dd>
            <p>${t.sub} ${deltaChip(t.delta)}</p>
            ${sparkline(t.spark)}
          </div>`).join('')}
      </dl>`;
  }

  function insightsCard(list) {
    if (!list.length) return '';
    const ICON = { day: 'calendar', hour: 'clock', category: 'layers', streak: 'flame', warn: 'bell' };
    return `
      <section class="panel insights">
        <div class="panel-head"><h2>${icon('sparkle', 'inline')} Sorotan periode ini</h2></div>
        <ul>
          ${list.map((x, i) => `<li data-kind="${x.kind}" style="--i:${i}">${icon(ICON[x.kind] || 'sparkle')}<span>${esc(x.text)}</span></li>`).join('')}
        </ul>
      </section>`;
  }

  // ----- Tugas per hari/pekan -----

  function taskChart(series, weekly) {
    const scale = niceScale(Math.max(...series.map((d) => d.total), 1));
    const n = series.length;
    return `
      <div class="chart col-chart" style="--n:${n}">
        <div class="plot">
          ${yAxis(scale)}
          <div class="cols">
            ${series.map((d, i) => `
              <div class="col" tabindex="0" ${tipAttr(periodLabel(d, weekly), [
                ['done', 'Selesai', `${d.done}`],
                ['rest', 'Belum selesai', `${d.total - d.done}`],
              ])} aria-label="${esc(`${periodLabel(d, weekly)}: ${d.done} dari ${d.total} selesai`)}">
                <div class="stack" style="height:${(d.total / scale.max) * 100}%;--i:${i}">
                  ${d.total - d.done ? `<span class="seg rest" style="flex:${d.total - d.done}"></span>` : ''}
                  ${d.done ? `<span class="seg done" style="flex:${d.done}"></span>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
        <div class="xaxis">${series.map((d, i) => `<div>${xLabel(d, i, n, weekly)}</div>`).join('')}</div>
      </div>`;
  }

  // ----- Peta aktivitas -----

  function heatmapCard(ctx) {
    const cols = L.heatmap(ctx.state.tasks, ctx.date, HEAT_WEEKS, ctx.today);
    const cells = cols.flatMap((c) => c.cells).filter((c) => !c.future);
    const total = cells.reduce((s, c) => s + c.done, 0);
    const best = cells.reduce((a, b) => (b.done > a.done ? b : a), cells[0]);
    const active = cells.filter((c) => c.done > 0).length;
    let lastMonth = '';
    const months = cols.map((c, i) => {
      const m = D.MONTHS_SHORT[Number(c.week.slice(5, 7)) - 1];
      const show = m !== lastMonth;
      lastMonth = m;
      return `<span style="grid-column:${i + 2}">${show ? esc(m) : ''}</span>`;
    }).join('');
    return `
      <section class="panel chart-panel wide">
        <div class="panel-head">
          <h2>Peta aktivitas · ${HEAT_WEEKS} pekan</h2>
          <span class="panel-note"><strong>${total}</strong> tugas selesai · aktif ${active} hari${best && best.done ? ` · terbanyak ${esc(D.formatShort(best.key))} (${best.done})` : ''}</span>
        </div>
        <div class="heat-scroll">
          <div class="heat" style="--weeks:${HEAT_WEEKS}" role="img" aria-label="${esc(`Peta aktivitas ${HEAT_WEEKS} pekan: ${total} tugas selesai dalam ${active} hari aktif`)}">
            <div class="heat-months">${months}</div>
            <div class="heat-days" aria-hidden="true"><span>Sen</span><span></span><span>Rab</span><span></span><span>Jum</span><span></span><span>Min</span></div>
            ${cols.map((c, ci) => `
              <div class="heat-col" style="--c:${ci}">
                ${c.cells.map((cell) => `<span class="heat-cell${cell.future ? ' future' : ''}${cell.key === ctx.date ? ' is-selected' : ''}" data-level="h${cell.level}" ${cell.future ? '' : tipAttr(D.formatLong(cell.key), [['done', 'Selesai', `${cell.done} dari ${cell.total}`]])}></span>`).join('')}
              </div>`).join('')}
          </div>
        </div>
        <div class="heat-legend" aria-hidden="true">
          <span>Sedikit</span>${[0, 1, 2, 3, 4].map((l) => `<span class="heat-cell" data-level="h${l}"></span>`).join('')}<span>Banyak</span>
        </div>
      </section>`;
  }

  // ----- Donat kategori -----

  function donut(tasks) {
    const counts = L.categoryCounts(tasks);
    const rows = L.CATEGORIES.filter((c) => counts[c.id].total);
    const total = rows.reduce((s, c) => s + counts[c.id].total, 0);
    if (!total) return '<p class="muted">Belum ada tugas pada rentang ini.</p>';
    const R = 46;
    const C = 2 * Math.PI * R;
    const gap = rows.length > 1 ? 1.6 : 0;
    let offset = 0;
    const segs = rows.map((c, i) => {
      const len = (counts[c.id].total / total) * C;
      const seg = `<circle class="donut-seg" data-seg="${c.id}" data-cat="${c.id}" cx="60" cy="60" r="${R}"
        stroke-dasharray="${Math.max(0.5, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" style="--i:${i}"/>`;
      offset += len;
      return seg;
    }).join('');
    return `
      <div class="donut-wrap">
        <div class="donut">
          <svg viewBox="0 0 120 120" role="img" aria-label="${esc(rows.map((c) => `${c.label} ${counts[c.id].total}`).join(', '))}">
            <circle class="donut-track" cx="60" cy="60" r="${R}"/>
            <g transform="rotate(-90 60 60)">${segs}</g>
          </svg>
          <div class="donut-center" data-donut-center data-total="${total}">
            <strong>${total}</strong><span>tugas</span>
          </div>
        </div>
        <ul class="donut-legend">
          ${rows.map((c) => {
            const k = counts[c.id];
            const share = Math.round((k.total / total) * 100);
            return `
              <li data-seg="${c.id}" data-cat="${c.id}" data-count-label="${esc(c.label)}" data-count-value="${k.total}" data-share="${share}" tabindex="0">
                <span class="swatch-dot" aria-hidden="true"></span>
                <span class="lg-label">${esc(c.label)}</span>
                <span class="lg-value"><strong>${k.total}</strong> · ${share}%</span>
                <span class="lg-done">${k.total ? Math.round((k.done / k.total) * 100) : 0}% selesai</span>
              </li>`;
          }).join('')}
        </ul>
      </div>`;
  }

  // ----- Kerja vs pribadi -----

  function balanceCard(state, keys) {
    const b = L.areaBalance(state.tasks, keys);
    if (!b.kerja.total && !b.pribadi.total) return '<p class="muted">Belum ada tugas pada rentang ini.</p>';
    const byTime = b.kerja.minutes + b.pribadi.minutes > 0;
    const val = (a) => (byTime ? b[a].minutes : b[a].total);
    const sum = val('kerja') + val('pribadi');
    const workShare = Math.round((val('kerja') / sum) * 100);
    const rows = L.AREAS.map((a) => {
      const r = b[a.id];
      const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
      return `
        <li data-cat="${a.id}">
          <span class="hbar-label"><span class="swatch-dot" aria-hidden="true"></span>${a.emoji} Rencana ${esc(a.label)}</span>
          <span class="hbar-value">${byTime ? `<strong>${esc(D.formatDuration(r.minutes))}</strong> · ` : ''}${r.total} tugas · ${pct}% selesai</span>
        </li>`;
    }).join('');
    return `
      <p class="chart-sub"><strong>${workShare}%</strong> ${byTime ? 'waktu terjadwal' : 'tugas'} untuk kerja, <strong>${100 - workShare}%</strong> untuk pribadi</p>
      <div class="balance-bar" role="img" aria-label="${esc(`Kerja ${workShare}%, pribadi ${100 - workShare}%`)}">
        ${val('kerja') ? `<span data-cat="kerja" style="flex:${val('kerja')}"></span>` : ''}
        ${val('pribadi') ? `<span data-cat="pribadi" style="flex:${val('pribadi')}"></span>` : ''}
      </div>
      <ul class="hbars balance-rows">${rows}</ul>`;
  }

  // ----- Jenis kegiatan (dikenali dari judul) -----

  function kindsCard(tasks) {
    const rows = P.smart.kindCounts(tasks).slice(0, 8);
    if (!rows.length) return '<p class="muted">Belum ada kegiatan yang dikenali pada rentang ini.</p>';
    const max = rows[0].total;
    return `
      <ul class="hbars kind-rows">
        ${rows.map((r) => `
          <li data-cat="${esc(r.kind.category)}" tabindex="0" title="${esc(`${r.kind.group} · ${r.kind.label}`)}">
            <span class="hbar-label"><span aria-hidden="true">${r.kind.emoji}</span> ${esc(r.kind.label)} <span class="muted">${esc(r.kind.group)}</span></span>
            <span class="hbar-value"><strong>${r.total}×</strong> · ${Math.round((r.done / r.total) * 100)}% selesai</span>
            <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(4, Math.round((r.total / max) * 100))}%"></span></span>
          </li>`).join('')}
      </ul>`;
  }

  // ----- Kurva suasana hati -----

  /** Jalur halus Catmull-Rom → Bézier melalui titik-titik (dalam satuan viewBox). */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C${c1x.toFixed(2)},${Math.min(100, Math.max(0, c1y)).toFixed(2)} ${c2x.toFixed(2)},${Math.min(100, Math.max(0, c2y)).toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
    }
    return d;
  }

  function moodChart(series, weekly) {
    const n = series.length;
    const pts = series.map((d, i) => (d.mood ? { x: ((i + 0.5) / n) * 100, y: 100 - ((d.mood - 1) / 4) * 100, d } : null));
    const runs = [];
    let run = [];
    for (const p of pts) {
      if (p) run.push(p);
      else if (run.length) {
        runs.push(run);
        run = [];
      }
    }
    if (run.length) runs.push(run);
    const lines = runs.filter((r) => r.length > 1).map((r) => {
      const d = smoothPath(r);
      const area = `${d} L${r[r.length - 1].x.toFixed(2)},100 L${r[0].x.toFixed(2)},100 Z`;
      return `<path class="mood-area" d="${area}"/><path class="mood-line" d="${d}"/>`;
    }).join('');
    const last = [...pts].reverse().find(Boolean);
    const gid = 'moodfill';

    return `
      <div class="chart mood-chart" style="--n:${n}">
        <div class="plot">
          <div class="grid" aria-hidden="true">
            ${L.MOODS.map((m) => `<div class="gridline" style="bottom:${((m.value - 1) / 4) * 100}%"><span class="face" data-level="${m.value}" title="${esc(m.label)}">${moodFace(m.value)}</span></div>`).join('')}
          </div>
          <svg class="line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
              <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
            </linearGradient></defs>
            <g class="mood-draw" style="--fill:url(#${gid})">${lines}</g>
          </svg>
          ${pts.filter(Boolean).map((p, i) => `<span class="pt${p === last ? ' last' : ''}" data-level="${Math.round(p.d.mood)}" style="left:${p.x}%;top:${p.y}%;--i:${i}"></span>`).join('')}
          <div class="slots">
            ${series.map((d) => {
              const label = d.mood ? L.MOODS[Math.round(d.mood) - 1].label : 'Tidak dicatat';
              const extra = weekly && d.mood ? ` (${fmt1(d.mood)})` : '';
              return `<div class="mslot" tabindex="0" ${tipAttr(periodLabel(d, weekly), [['mood', 'Suasana hati', label + extra]])} aria-label="${esc(`${periodLabel(d, weekly)}: ${label}`)}"></div>`;
            }).join('')}
          </div>
        </div>
        <div class="xaxis">${series.map((d, i) => `<div>${xLabel(d, i, n, weekly)}</div>`).join('')}</div>
      </div>`;
  }

  // ----- Jam produktif & hari terbaik -----

  function hourChart(hours) {
    const max = Math.max(...hours);
    if (!max) return '<p class="muted">Centang beberapa tugas dulu; grafik ini membaca jam saat tugas ditandai selesai.</p>';
    const scale = niceScale(max, 3);
    const peak = hours.indexOf(max);
    return `
      <p class="chart-sub">Puncak pukul <strong>${String(peak).padStart(2, '0')}.00–${String((peak + 1) % 24).padStart(2, '0')}.00</strong></p>
      <div class="chart col-chart hours" style="--n:24">
        <div class="plot">
          ${yAxis(scale)}
          <div class="cols">
            ${hours.map((v, h) => `
              <div class="col" tabindex="0" ${tipAttr(`Pukul ${String(h).padStart(2, '0')}.00–${String((h + 1) % 24).padStart(2, '0')}.00`, [['done', 'Tugas selesai', `${v}`]])} aria-label="Pukul ${h}: ${v} tugas selesai">
                <div class="stack" style="height:${(v / scale.max) * 100}%;--i:${h}">
                  ${v ? `<span class="seg ${h === peak ? 'done' : 'muted'}" style="flex:1"></span>` : ''}
                  ${h === peak ? `<em class="cap">${v}</em>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
        <div class="xaxis">${hours.map((_, h) => `<div>${h % 3 === 0 ? `<strong>${String(h).padStart(2, '0')}</strong>` : ''}</div>`).join('')}</div>
      </div>`;
  }

  function weekdayChart(rates) {
    if (!rates.some((r) => r.total)) return '<p class="muted">Belum ada tugas pada rentang ini.</p>';
    const best = rates.filter((r) => r.total).reduce((a, b) => (b.pct > a.pct ? b : a));
    return `
      <p class="chart-sub">Paling tuntas: <strong>${esc(D.DAYS[best.day])}</strong></p>
      <div class="chart col-chart weekdays" style="--n:7">
        <div class="plot">
          ${yAxis({ max: 100, ticks: [0, 50, 100] }, '%')}
          <div class="cols">
            ${rates.map((r, i) => `
              <div class="col" tabindex="0" ${tipAttr(D.DAYS[r.day], [['done', 'Selesai', `${r.pct}% (${r.done} dari ${r.total})`]])} aria-label="${esc(`${D.DAYS[r.day]}: ${r.pct}% selesai`)}">
                <div class="stack" style="height:${r.pct}%;--i:${i}">
                  ${r.pct ? `<span class="seg ${r === best ? 'done' : 'muted'}" style="flex:1"></span>` : ''}
                  ${r === best ? `<em class="cap">${r.pct}%</em>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
        <div class="xaxis">${rates.map((r) => `<div><strong class="${r.day === 0 ? 'is-sunday' : ''}">${esc(D.DAYS_SHORT[r.day])}</strong></div>`).join('')}</div>
      </div>`;
  }

  // ----- Kebiasaan -----

  function habitStrips(state, endKey, today, n) {
    const habits = state.habits.filter((h) => !h.archived);
    if (!habits.length) return '<p class="muted">Belum ada kebiasaan yang dilacak.</p>';
    const days = D.lastNDays(endKey, Math.min(n, 30));
    return `
      <ul class="strips">
        ${habits.map((h) => {
          const rate = L.habitRate(state.habitLog, h, endKey, n);
          const streak = L.currentStreak(state.habitLog, h.id, endKey, today);
          return `
            <li data-color="${esc(h.color)}">
              <div class="strip-head">
                <span class="strip-name">${esc(h.name)}</span>
                <span class="strip-meta"><strong>${rate}%</strong>${streak ? ` · ${icon('flame', 'inline')} ${streak} hari` : ''}</span>
              </div>
              <div class="strip" style="--n:${days.length}">
                ${days.map((k, i) => {
                  const on = L.habitDoneOn(state.habitLog, h.id, k);
                  const before = h.createdOn && k < h.createdOn;
                  return `<span class="strip-cell${on ? ' on' : ''}${before ? ' before' : ''}" style="--i:${i}" ${tipAttr(D.formatLong(k), [['habit', h.name, on ? 'Tercentang' : 'Belum']])}></span>`;
                }).join('')}
              </div>
            </li>`;
        }).join('')}
      </ul>`;
  }

  // ----- Halaman -----

  function render(ctx) {
    const { state, date, today } = ctx;
    const n = [7, 30, 90].includes(ctx.prefs.statsRange) ? ctx.prefs.statsRange : 7;
    const keys = D.lastNDays(date, n);
    const prevKeys = D.lastNDays(D.addDays(date, -n), n);
    const days = L.summarizeDays(state, keys);
    const prevDays = L.summarizeDays(state, prevKeys);
    const weekly = n === 90;
    const series = weekly ? L.aggregateWeeks(days) : days;
    const rangeTasks = state.tasks.filter((t) => keys.includes(t.date));
    const habits = state.habits.filter((h) => !h.archived);

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">Statistik</p>
          <h1>${n} hari sampai ${esc(D.formatMedium(date))}</h1>
        </div>
        <div class="segmented" role="group" aria-label="Rentang waktu">
          ${[7, 30, 90].map((r) => `<button type="button" data-range="${r}" aria-pressed="${n === r}">${r} hari</button>`).join('')}
        </div>
      </header>

      ${insightsCard(L.insights(state, keys))}
      ${tiles(ctx, days, prevDays, series, n)}

      <div class="charts">
        <section class="panel chart-panel wide">
          <div class="panel-head">
            <h2>Tugas per ${weekly ? 'pekan' : 'hari'}</h2>
            <ul class="legend">
              <li><span class="key done"></span>Selesai</li>
              <li><span class="key rest"></span>Belum selesai</li>
            </ul>
          </div>
          ${taskChart(series, weekly)}
        </section>
        ${heatmapCard(ctx)}
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Komposisi kategori</h2></div>
          ${donut(rangeTasks)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Kerja vs pribadi</h2></div>
          ${balanceCard(state, keys)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Kegiatan terbanyak</h2><span class="panel-note">dikenali dari judul</span></div>
          ${kindsCard(rangeTasks)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Suasana hati${weekly ? ' (rata-rata pekanan)' : ''}</h2></div>
          ${moodChart(series, weekly)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Jam kamu menuntaskan tugas</h2></div>
          ${hourChart(L.hourHistogram(state.tasks, keys))}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Hari terbaik dalam pekan</h2></div>
          ${weekdayChart(L.weekdayRates(state.tasks, keys))}
        </section>
        <section class="panel chart-panel wide">
          <div class="panel-head">
            <h2>Konsistensi kebiasaan</h2>
            <span class="panel-note">${Math.min(n, 30)} hari terakhir</span>
          </div>
          ${habitStrips(state, date, today, n)}
        </section>
      </div>

      <details class="table-view">
        <summary>Lihat data sebagai tabel</summary>
        <div class="table-wrap">
          <table>
            <thead><tr><th scope="col">Tanggal</th><th scope="col">Rencana</th><th scope="col">Selesai</th><th scope="col">Fokus</th><th scope="col">Air</th><th scope="col">Kebiasaan</th><th scope="col">Suasana hati</th></tr></thead>
            <tbody>
              ${[...days].reverse().map((d) => `
                <tr>
                  <th scope="row">${esc(D.dayShort(d.key))}, ${esc(D.formatShort(d.key))}</th>
                  <td>${d.total}</td><td>${d.done}</td><td>${d.focus} mnt</td><td>${d.water} gelas</td>
                  <td>${d.habitsDone}/${habits.length}</td><td>${d.mood ? esc(L.MOODS[d.mood - 1].label) : '–'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </details>
      <div class="tip" role="tooltip" hidden></div>`;
  }

  function mount(el, ctx) {
    const tip = el.querySelector('.tip');

    const show = (target, evt) => {
      let data;
      try {
        data = JSON.parse(target.dataset.tip);
      } catch {
        return;
      }
      tip.replaceChildren();
      const title = root.document.createElement('p');
      title.className = 'tip-title';
      title.textContent = data.title;
      tip.appendChild(title);
      for (const [key, label, value] of data.rows) {
        const row = root.document.createElement('p');
        row.className = 'tip-row';
        const k = root.document.createElement('span');
        k.className = `tip-key ${key}`;
        const v = root.document.createElement('strong');
        v.textContent = value;
        const l = root.document.createElement('span');
        l.textContent = label;
        row.append(k, v, l);
        tip.appendChild(row);
      }
      tip.hidden = false;
      const host = el.getBoundingClientRect();
      const box = target.getBoundingClientRect();
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let anchorX = box.left + box.width / 2;
      let anchorY = box.top;
      const stack = target.querySelector('.stack');
      if (stack && stack.offsetHeight) anchorY = stack.getBoundingClientRect().top;
      else if (target.classList.contains('mslot') && evt && evt.clientY) anchorY = evt.clientY - 12;
      if (target.classList.contains('heat-cell') || target.classList.contains('strip-cell')) anchorY = box.top - 4;
      anchorX -= host.left;
      anchorY -= host.top;
      const left = Math.max(0, Math.min(anchorX - tw / 2, host.width - tw));
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, anchorY - th - 8)}px`;
    };
    const hide = () => { tip.hidden = true; };

    el.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-tip]');
      if (t) show(t, e);
    });
    el.addEventListener('pointerout', (e) => {
      const t = e.target.closest('[data-tip]');
      if (t && !t.contains(e.relatedTarget)) hide();
    });
    el.addEventListener('focusin', (e) => {
      const t = e.target.closest('[data-tip]');
      if (t) show(t);
    });
    el.addEventListener('focusout', hide);

    // Donat: sorot segmen dan tampilkan nilainya di tengah.
    const focusSeg = (id) => {
      const center = el.querySelector('[data-donut-center]');
      if (!center) return;
      el.querySelectorAll('.donut-seg, .donut-legend li').forEach((s) => s.classList.toggle('dim', Boolean(id) && s.dataset.seg !== id));
      el.querySelectorAll('.donut-seg').forEach((s) => s.classList.toggle('on', s.dataset.seg === id));
      const li = id && el.querySelector(`.donut-legend li[data-seg="${id}"]`);
      center.innerHTML = li
        ? `<strong>${esc(li.dataset.countValue)}</strong><span>${esc(li.dataset.countLabel)} · ${esc(li.dataset.share)}%</span>`
        : `<strong>${esc(center.dataset.total)}</strong><span>tugas</span>`;
    };
    el.addEventListener('pointerover', (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg) focusSeg(seg.dataset.seg);
    });
    el.addEventListener('pointerout', (e) => {
      const seg = e.target.closest('[data-seg]');
      if (seg && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('[data-seg]'))) focusSeg(null);
    });
    el.addEventListener('focusin', (e) => {
      const seg = e.target.closest('.donut-legend [data-seg]');
      if (seg) focusSeg(seg.dataset.seg);
    });

    el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-range]');
      if (r) ctx.setPref('statsRange', Number(r.dataset.range));
    });
  }

  (P.views = P.views || {}).statistik = { title: 'Statistik', render, mount };
})(typeof self !== 'undefined' ? self : this);
