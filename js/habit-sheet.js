/**
 * Pelacak kebiasaan bulanan ala spreadsheet: centang per hari dalam satu bulan
 * (dikelompokkan per minggu 1–7, 8–14, …), grafik progres harian, target/selesai
 * per kebiasaan, dan ringkasan bulan (progres, hari sempurna, per minggu, peringkat).
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, icon } = P.ui;

  const pad = (n) => String(n).padStart(2, '0');
  const monthOf = (key) => key.slice(0, 7);
  const pctText = (v) => (v === null ? '–' : `${v}%`);
  const dayLabel = (key) => `${D.dayShort(key)}, ${D.formatShort(key)}`;

  function shiftMonth(ym, delta) {
    const [y, m] = ym.split('-').map(Number);
    const t = y * 12 + (m - 1) + delta;
    return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
  }

  /** Tanggal tujuan saat pindah bulan: hari ini bila bulannya sama, selain itu tanggal yang sama (dibatasi akhir bulan). */
  function dateInMonth(ym, date, today) {
    if (monthOf(today) === ym) return today;
    const [y, m] = ym.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${ym}-${pad(Math.min(Number(date.slice(8)), last))}`;
  }

  // ----- Grafik progres harian (satu seri, sejajar dengan kolom tanggal) -----

  function plot(model) {
    const n = model.days.length;
    let line = '';
    let area = '';
    let seg = [];
    const flush = () => {
      if (seg.length > 1) {
        const path = seg.map(([x, y]) => `${x} ${y}`).join('L');
        line += `M${path}`;
        area += `M${seg[0][0]} 100L${path}L${seg[seg.length - 1][0]} 100Z`;
      }
      seg = [];
    };
    model.daily.forEach((d, i) => {
      if (d.pct === null) flush();
      else seg.push([i + 0.5, 100 - d.pct]);
    });
    flush();

    let lastIdx = -1;
    model.daily.forEach((d, i) => { if (d.pct !== null) lastIdx = i; });
    const last = lastIdx >= 0 ? model.daily[lastIdx] : null;
    const x = (i) => `${((i + 0.5) / n) * 100}%`;
    const points = JSON.stringify(model.daily.map((d) => [d.key, d.pct, d.done, d.total]));
    const endLabel = last ? `
      <span class="hs-end" style="left:${x(lastIdx)};top:${100 - last.pct}%" aria-hidden="true"></span>
      <span class="hs-end-label${last.pct > 78 ? ' below' : ''}${lastIdx > n - 4 ? ' left' : ''}" style="left:${x(lastIdx)};top:${100 - last.pct}%" aria-hidden="true">${last.pct}%</span>` : '';

    return `
      <div class="hs-plot" data-hs-plot data-points="${esc(points)}" tabindex="0" role="img"
        aria-label="Grafik progres harian ${esc(D.MONTHS[model.month - 1])}${last ? `, terakhir ${last.pct}% pada ${esc(D.formatShort(last.key))}` : ''}. Gunakan panah kiri/kanan untuk melihat tiap hari; angka lengkap ada di baris Selesai hari itu.">
        <svg viewBox="0 0 ${n} 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path class="hs-grid" d="M0 0H${n}M0 50H${n}M0 100H${n}"/>
          <path class="hs-area" d="${area}"/>
          <path class="hs-line" d="${line}"/>
        </svg>
        ${endLabel}
        <span class="hs-cross" hidden aria-hidden="true"></span>
        <span class="hs-hover" hidden aria-hidden="true"></span>
      </div>`;
  }

  // ----- Tabel bulan -----

  function table(model, ctx) {
    const n = model.days.length;
    const weekStart = (i) => (i > 0 && i % 7 === 0 ? ' hs-wk' : '');
    const colCls = (k, i) => `${weekStart(i)}${k === ctx.today ? ' hs-now' : ''}${k === ctx.date ? ' hs-sel' : ''}`;

    const head = `
      <tr class="hs-chart-row">
        <th class="hs-sticky hs-axis" scope="row">
          <span class="hs-axis-title">Progres harian</span>
          <span class="hs-ticks" aria-hidden="true"><span style="top:0%">100%</span><span style="top:50%">50%</span><span style="top:100%">0%</span></span>
        </th>
        <td colspan="${n}" class="hs-chart-cell">${plot(model)}</td>
        <td colspan="3" class="hs-side"></td>
      </tr>
      <tr class="hs-weeks">
        <th class="hs-sticky hs-corner" scope="col" rowspan="2"><span>Kebiasaan</span></th>
        ${model.weeks.map((w) => `
          <th colspan="${w.size}" scope="colgroup" class="hs-week${w.index > 1 ? ' hs-wk' : ''}">
            <span>${w.size >= 4 ? 'Minggu ' : 'M'}${w.index}</span><strong>${pctText(w.pct)}</strong>
          </th>`).join('')}
        <th scope="col" class="hs-num" rowspan="2">Target</th>
        <th scope="col" class="hs-num" rowspan="2">Selesai</th>
        <th scope="col" class="hs-prog" rowspan="2">Progres</th>
      </tr>
      <tr class="hs-daynames">
        ${model.days.map((k, i) => `
          <th scope="col" class="hs-day${colCls(k, i)}${D.dayIndex(k) === 0 ? ' is-sunday' : ''}" title="${esc(D.formatLong(k))}">
            <span>${esc(D.dayShort(k))}</span><strong>${i + 1}</strong>
          </th>`).join('')}
      </tr>`;

    const body = model.rows.map((r, ri) => `
      <tr data-color="${esc(r.habit.color)}">
        <th scope="row" class="hs-sticky hs-name" title="${esc(r.habit.name)}">
          <span class="hs-no">${ri + 1}</span><span class="hdot" aria-hidden="true"></span><span class="hs-hname">${esc(r.habit.name)}</span>
        </th>
        ${r.cells.map((c, i) => `
          <td class="hs-cell${colCls(c.key, i)}">
            <button type="button" class="hs-box${c.on ? ' on' : ''}${c.before ? ' before' : ''}" data-toggle="${esc(r.habit.id)}" data-day="${c.key}"
              role="checkbox" aria-checked="${c.on}" aria-label="${esc(r.habit.name)}, ${esc(D.formatLong(c.key))}" ${c.future ? 'disabled' : ''}>${icon('check')}</button>
          </td>`).join('')}
        <td class="hs-num">${r.target}</td>
        <td class="hs-num"><strong>${r.done}</strong></td>
        <td class="hs-prog">
          <span class="meter" aria-hidden="true"><span style="width:${r.pct || 0}%"></span></span><span class="hs-pct">${pctText(r.pct)}</span>
        </td>
      </tr>`).join('');

    const foot = `
      <tr class="hs-daily">
        <th scope="row" class="hs-sticky" title="Persentase kebiasaan yang tercentang tiap hari">Selesai (%)</th>
        ${model.daily.map((d, i) => `<td class="hs-dpct${colCls(d.key, i)}${d.pct === 100 ? ' full' : ''}" title="${d.pct === null ? '' : `${esc(dayLabel(d.key))}: ${d.done} dari ${d.total}`}">${d.pct === null ? '' : d.pct}</td>`).join('')}
        <td class="hs-num">${model.total.target}</td>
        <td class="hs-num"><strong>${model.total.done}</strong></td>
        <td class="hs-prog"><span class="meter total" aria-hidden="true"><span style="width:${model.total.pct || 0}%"></span></span><span class="hs-pct">${pctText(model.total.pct)}</span></td>
      </tr>`;

    return `
      <div class="hs-scroll" data-hs-scroll>
        <table class="hs-table" style="--days:${n}">
          <caption class="sr-only">Pelacak kebiasaan ${esc(D.MONTHS[model.month - 1])} ${model.year}</caption>
          <colgroup><col class="hs-c-name">${'<col>'.repeat(n)}<col class="hs-c-num"><col class="hs-c-num"><col class="hs-c-prog"></colgroup>
          <thead>${head}</thead>
          <tbody>${body}</tbody>
          <tfoot>${foot}</tfoot>
        </table>
      </div>`;
  }

  // ----- Ringkasan bulan -----

  function weekChart(model) {
    const tip = (w) => esc(JSON.stringify({
      title: `Minggu ${w.index} · ${Number(w.from.slice(8))}–${Number(w.to.slice(8))} ${D.MONTHS_SHORT[model.month - 1]}`,
      value: pctText(w.pct),
      label: w.total ? `${w.done} dari ${w.total} centang` : 'belum ada hari yang dihitung',
    }));
    return `
      <section class="panel hs-weekly">
        <div class="panel-head"><h2>Per minggu</h2><span class="panel-note">% centang tiap minggu</span></div>
        <div class="hs-cols" role="list">
          ${model.weeks.map((w) => `
            <div class="hs-col" role="listitem" tabindex="0" data-hs-tip="${tip(w)}" aria-label="Minggu ${w.index}: ${pctText(w.pct)}">
              <div class="hs-col-plot">
                <span class="hs-col-val">${pctText(w.pct)}</span>
                ${w.pct === null ? '' : `<span class="hs-col-bar" style="height:max(2px, calc((100% - 22px) * ${w.pct / 100}))"></span>`}
              </div>
              <span class="hs-col-x"><strong>M${w.index}</strong>${Number(w.from.slice(8))}–${Number(w.to.slice(8))}</span>
            </div>`).join('')}
        </div>
      </section>`;
  }

  function ranking(model) {
    const list = model.top;
    return `
      <section class="panel hs-rank">
        <div class="panel-head"><h2>Peringkat kebiasaan</h2><span class="panel-note">bulan ini</span></div>
        ${list.length ? `<ol class="hs-rank-list">
          ${list.map((r, i) => `
            <li data-color="${esc(r.habit.color)}">
              <span class="hs-rank-no">${i + 1}</span>
              <span class="hdot" aria-hidden="true"></span>
              <span class="hs-rank-name">${esc(r.habit.name)}</span>
              <span class="meter" aria-hidden="true"><span style="width:${r.pct}%"></span></span>
              <strong class="hs-rank-pct">${r.pct}%</strong>
            </li>`).join('')}
        </ol>` : '<p class="muted">Belum ada hari yang dihitung di bulan ini.</p>'}
      </section>`;
  }

  function summary(model) {
    const t = model.total;
    return `
      <div class="hs-summary">
        <div class="hs-kpis">
          <div class="hs-kpi">
            <p class="hs-kpi-label">Progres bulan ini</p>
            <p class="hs-hero">${pctText(t.pct)}</p>
            <div class="hs-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${t.pct || 0}" aria-label="Progres bulan ini"><span style="width:${t.pct || 0}%"></span></div>
            <p class="hs-kpi-note">${t.done} dari ${t.target} centang</p>
          </div>
          <div class="hs-kpi">
            <p class="hs-kpi-label">Hari sempurna</p>
            <p class="hs-kpi-value">${model.perfect} <span>hari</span></p>
            <p class="hs-kpi-note">semua kebiasaan tercentang</p>
          </div>
          <div class="hs-kpi">
            <p class="hs-kpi-label">Streak terpanjang</p>
            <p class="hs-kpi-value">${model.streak.days} <span>hari</span></p>
            <p class="hs-kpi-note">${model.streak.habit ? esc(model.streak.habit.name) : 'belum ada'}</p>
          </div>
        </div>
        ${weekChart(model)}
        ${ranking(model)}
      </div>`;
  }

  function render(ctx) {
    const ym = monthOf(ctx.date);
    const model = L.habitMonth(ctx.state.habitLog, ctx.state.habits, ym, ctx.today);
    const year = model.year;
    return `
      <div class="hs" data-hs>
        <section class="panel hs-sheet" data-key="hs-sheet">
          <div class="hs-top">
            <div class="hs-title">
              <p class="eyebrow">${icon('flame')}Pelacak bulanan</p>
              <h2 class="hs-month">${esc(D.MONTHS[model.month - 1])} <span>${year}</span></h2>
            </div>
            <div class="hs-monthnav">
              <button type="button" class="icon-btn" data-hmonth="-1" aria-label="Bulan sebelumnya" title="Bulan sebelumnya">${icon('left')}</button>
              <div class="hs-tabs" role="group" aria-label="Pilih bulan ${year}">
                ${D.MONTHS_SHORT.map((name, i) => {
                  const key = `${year}-${pad(i + 1)}`;
                  return `<button type="button" class="hs-tab${key === monthOf(ctx.today) ? ' is-now' : ''}" data-hmonth-to="${key}" aria-pressed="${key === ym}">${esc(name)}</button>`;
                }).join('')}
              </div>
              <button type="button" class="icon-btn" data-hmonth="1" aria-label="Bulan berikutnya" title="Bulan berikutnya">${icon('right')}</button>
            </div>
          </div>
          ${model.rows.length ? table(model, ctx) : '<p class="muted hs-none">Kebiasaanmu dibuat setelah bulan ini, jadi belum ada yang dilacak.</p>'}
          <p class="hint">Ketuk kotak untuk mencentang. Persentase dihitung dari hari yang sudah lewat; kotak redup = sebelum kebiasaan dibuat dan tidak dihitung kecuali dicentang.</p>
        </section>
        ${model.rows.length ? summary(model) : ''}
        <div class="tip hs-tip" role="tooltip" hidden></div>
      </div>`;
  }

  // ----- Interaksi: pindah bulan, crosshair grafik, tooltip kolom -----

  function showTip(host, tip, { title, value, label }, anchor) {
    tip.replaceChildren();
    const doc = root.document;
    const t = doc.createElement('p');
    t.className = 'tip-title';
    t.textContent = title;
    const row = doc.createElement('p');
    row.className = 'tip-row';
    const key = doc.createElement('span');
    key.className = 'tip-key';
    const v = doc.createElement('strong');
    v.textContent = value;
    const l = doc.createElement('span');
    l.textContent = label;
    row.append(key, v, l);
    tip.append(t, row);
    tip.hidden = false;
    const box = host.getBoundingClientRect();
    const left = Math.max(0, Math.min(anchor.x - box.left - tip.offsetWidth / 2, box.width - tip.offsetWidth));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, anchor.y - box.top - tip.offsetHeight - 10)}px`;
  }

  /** Di layar sempit: gulir tabel ke tanggal yang dipilih dan tab bulan ke bulan yang dibuka. */
  function reveal(el) {
    const scroller = el.querySelector('[data-hs-scroll]');
    const sel = scroller && scroller.querySelector('th.hs-sel');
    if (scroller && sel && scroller.scrollWidth > scroller.clientWidth) {
      const sticky = scroller.querySelector('.hs-corner').offsetWidth;
      scroller.scrollLeft = Math.max(0, sel.offsetLeft - sticky - (scroller.clientWidth - sticky) / 2 + sel.offsetWidth / 2);
    }
    const tabs = el.querySelector('.hs-tabs');
    const on = tabs && tabs.querySelector('[aria-pressed="true"]');
    if (on && tabs.scrollWidth > tabs.clientWidth) tabs.scrollLeft = on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
  }

  function mount(el, ctx) {
    const host = () => el.querySelector('[data-hs]');
    const tipEl = () => el.querySelector('.hs-tip');
    let plotIdx = -1;
    reveal(el);

    const pointsOf = (plotEl) => {
      try {
        return JSON.parse(plotEl.dataset.points);
      } catch {
        return [];
      }
    };
    function hidePlot(plotEl) {
      plotIdx = -1;
      if (!plotEl) return;
      plotEl.querySelector('.hs-cross').hidden = true;
      plotEl.querySelector('.hs-hover').hidden = true;
      const tip = tipEl();
      if (tip) tip.hidden = true;
    }
    function showPlot(plotEl, i) {
      const pts = pointsOf(plotEl);
      if (!pts.length) return;
      plotIdx = Math.max(0, Math.min(pts.length - 1, i));
      const [key, pct, done, total] = pts[plotIdx];
      const x = ((plotIdx + 0.5) / pts.length) * 100;
      const cross = plotEl.querySelector('.hs-cross');
      const dot = plotEl.querySelector('.hs-hover');
      cross.style.left = `${x}%`;
      cross.hidden = false;
      dot.hidden = pct === null;
      if (pct !== null) {
        dot.style.left = `${x}%`;
        dot.style.top = `${100 - pct}%`;
      }
      const box = plotEl.getBoundingClientRect();
      showTip(host(), tipEl(), {
        title: dayLabel(key),
        value: pct === null ? '–' : `${pct}%`,
        label: pct === null ? (key > ctx.today ? 'belum tiba' : 'tidak ada kebiasaan') : `${done} dari ${total} kebiasaan`,
      }, { x: box.left + (box.width * x) / 100, y: pct === null ? box.top + box.height / 2 : box.top + (box.height * (100 - pct)) / 100 });
    }

    el.addEventListener('pointermove', (e) => {
      const plotEl = e.target.closest('[data-hs-plot]');
      if (!plotEl) return;
      const box = plotEl.getBoundingClientRect();
      const n = pointsOf(plotEl).length;
      const i = Math.floor(((e.clientX - box.left) / box.width) * n);
      if (i !== plotIdx) showPlot(plotEl, i);
    });
    el.addEventListener('pointerout', (e) => {
      const plotEl = e.target.closest('[data-hs-plot]');
      if (plotEl && !plotEl.contains(e.relatedTarget)) hidePlot(plotEl);
      const col = e.target.closest('[data-hs-tip]');
      if (col && !col.contains(e.relatedTarget) && tipEl()) tipEl().hidden = true;
    });
    el.addEventListener('focusin', (e) => {
      const plotEl = e.target.closest('[data-hs-plot]');
      if (plotEl) {
        const pts = pointsOf(plotEl);
        const idx = pts.findIndex((p) => p[0] === ctx.date);
        showPlot(plotEl, idx >= 0 ? idx : pts.length - 1);
      }
      const col = e.target.closest('[data-hs-tip]');
      if (col) showCol(col);
    });
    el.addEventListener('focusout', (e) => {
      const plotEl = e.target.closest('[data-hs-plot]');
      if (plotEl) hidePlot(plotEl);
      if (e.target.closest('[data-hs-tip]') && tipEl()) tipEl().hidden = true;
    });
    el.addEventListener('keydown', (e) => {
      const plotEl = e.target.closest('[data-hs-plot]');
      if (!plotEl || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault(); // jangan ikut mengganti tanggal
      showPlot(plotEl, (plotIdx < 0 ? 0 : plotIdx) + (e.key === 'ArrowLeft' ? -1 : 1));
    });

    function showCol(col) {
      let data;
      try {
        data = JSON.parse(col.dataset.hsTip);
      } catch {
        return;
      }
      const bar = col.querySelector('.hs-col-bar') || col.querySelector('.hs-col-val');
      const b = bar.getBoundingClientRect();
      showTip(host(), tipEl(), data, { x: b.left + b.width / 2, y: b.top - 16 });
    }
    el.addEventListener('pointerover', (e) => {
      const col = e.target.closest('[data-hs-tip]');
      if (col) showCol(col);
    });
  }

  /** @returns {boolean} */
  function handleClick(e, ctx) {
    const shift = e.target.closest('[data-hmonth]');
    if (shift) {
      P.app.setDate(dateInMonth(shiftMonth(monthOf(ctx.date), Number(shift.dataset.hmonth)), ctx.date, ctx.today));
      return true;
    }
    const to = e.target.closest('[data-hmonth-to]');
    if (to) {
      if (to.dataset.hmonthTo !== monthOf(ctx.date)) P.app.setDate(dateInMonth(to.dataset.hmonthTo, ctx.date, ctx.today));
      return true;
    }
    return false;
  }

  P.habitSheet = { render, mount, reveal, handleClick, shiftMonth, dateInMonth };
})(typeof self !== 'undefined' ? self : this);
