/**
 * Statistik: ringkasan 7 atau 30 hari yang berakhir di tanggal terpilih.
 * Grafik dibuat dengan HTML/CSS (dan SVG untuk garis) agar tetap tajam dan
 * responsif; setiap grafik punya tooltip dan tabel data sebagai padanannya.
 */
(function (root) {
  'use strict';
  const P = root.Planner;
  const D = P.date;
  const L = P.logic;
  const { esc, moodFace } = P.ui;

  /** Batas atas "bulat" dan tick-nya: 0, 2, 4, 6 … */
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

  function xLabel(key, i, n) {
    if (n <= 7) return `<span>${esc(D.dayShort(key))}</span><strong>${Number(key.slice(8))}</strong>`;
    const show = i === n - 1 || (n - 1 - i) % 5 === 0;
    return show ? `<strong>${Number(key.slice(8))}</strong>` : '';
  }

  function yAxis(scale) {
    return `
      <div class="grid" aria-hidden="true">
        ${scale.ticks.map((t) => `<div class="gridline" style="bottom:${(t / scale.max) * 100}%"><span>${t.toLocaleString('id-ID')}</span></div>`).join('')}
      </div>`;
  }

  function taskChart(days) {
    const scale = niceScale(Math.max(...days.map((d) => d.total), 1));
    const n = days.length;
    return `
      <div class="chart col-chart" style="--n:${n}">
        <div class="plot">
          ${yAxis(scale)}
          <div class="cols">
            ${days.map((d) => `
              <div class="col" tabindex="0" ${tipAttr(D.formatLong(d.key), [
                ['done', 'Selesai', `${d.done}`],
                ['rest', 'Belum selesai', `${d.total - d.done}`],
              ])} aria-label="${esc(`${D.formatLong(d.key)}: ${d.done} dari ${d.total} selesai`)}">
                <div class="stack" style="height:${(d.total / scale.max) * 100}%">
                  ${d.total - d.done ? `<span class="seg rest" style="flex:${d.total - d.done}"></span>` : ''}
                  ${d.done ? `<span class="seg done" style="flex:${d.done}"></span>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
        <div class="xaxis">${days.map((d, i) => `<div>${xLabel(d.key, i, n)}</div>`).join('')}</div>
      </div>`;
  }

  function focusChart(days) {
    const scale = niceScale(Math.max(...days.map((d) => d.focus), 25));
    const n = days.length;
    const best = days.reduce((a, b) => (b.focus > a.focus ? b : a), days[0]);
    return `
      <div class="chart col-chart" style="--n:${n}">
        <div class="plot">
          ${yAxis(scale)}
          <div class="cols">
            ${days.map((d) => `
              <div class="col" tabindex="0" ${tipAttr(D.formatLong(d.key), [['focus', 'Menit fokus', D.formatDuration(d.focus)]])} aria-label="${esc(`${D.formatLong(d.key)}: ${D.formatDuration(d.focus)} fokus`)}">
                <div class="stack" style="height:${(d.focus / scale.max) * 100}%">
                  ${d.focus ? '<span class="seg focus" style="flex:1"></span>' : ''}
                  ${d === best && d.focus ? `<em class="cap">${d.focus}</em>` : ''}
                </div>
              </div>`).join('')}
          </div>
        </div>
        <div class="xaxis">${days.map((d, i) => `<div>${xLabel(d.key, i, n)}</div>`).join('')}</div>
      </div>`;
  }

  function moodChart(days) {
    const n = days.length;
    const pts = days.map((d, i) => (d.mood ? { x: ((i + 0.5) / n) * 100, y: 100 - ((d.mood - 1) / 4) * 100, d } : null));
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
    const lines = runs.filter((r) => r.length > 1)
      .map((r) => `<polyline points="${r.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}"/>`).join('');
    const last = [...pts].reverse().find(Boolean);

    return `
      <div class="chart mood-chart" style="--n:${n}">
        <div class="plot">
          <div class="grid" aria-hidden="true">
            ${L.MOODS.map((m) => `<div class="gridline" style="bottom:${((m.value - 1) / 4) * 100}%"><span class="face" data-level="${m.value}" title="${esc(m.label)}">${moodFace(m.value)}</span></div>`).join('')}
          </div>
          <svg class="line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
          ${pts.filter(Boolean).map((p) => `<span class="pt${p === last ? ' last' : ''}" style="left:${p.x}%;top:${p.y}%"></span>`).join('')}
          <div class="slots">
            ${days.map((d) => {
              const label = d.mood ? L.MOODS[d.mood - 1].label : 'Tidak dicatat';
              return `<div class="mslot" tabindex="0" ${tipAttr(D.formatLong(d.key), [['mood', 'Suasana hati', label]])} aria-label="${esc(`${D.formatLong(d.key)}: ${label}`)}"></div>`;
            }).join('')}
          </div>
        </div>
        <div class="xaxis">${days.map((d, i) => `<div>${xLabel(d.key, i, n)}</div>`).join('')}</div>
      </div>`;
  }

  function categoryBars(tasks) {
    const counts = L.categoryCounts(tasks);
    const rows = L.CATEGORIES.filter((c) => counts[c.id].total);
    if (!rows.length) return '<p class="muted">Belum ada tugas pada rentang ini.</p>';
    const max = Math.max(...rows.map((c) => counts[c.id].total));
    return `
      <ul class="hbars">
        ${rows.map((c) => {
          const k = counts[c.id];
          return `
            <li tabindex="0" ${tipAttr(c.label, [['cat', 'Selesai', `${k.done} dari ${k.total}`]])}>
              <span class="hbar-label">${esc(c.label)}</span>
              <span class="hbar-track"><span class="hbar-fill" data-cat="${c.id}" style="width:${(k.total / max) * 100}%"></span></span>
              <span class="hbar-value"><strong>${k.total}</strong> tugas · ${k.total ? Math.round((k.done / k.total) * 100) : 0}% selesai</span>
            </li>`;
        }).join('')}
      </ul>`;
  }

  function habitBars(state, endKey, n) {
    const habits = state.habits.filter((h) => !h.archived);
    if (!habits.length) return '<p class="muted">Belum ada kebiasaan yang dilacak.</p>';
    return `
      <ul class="hbars">
        ${habits.map((h) => {
          const rate = L.habitRate(state.habitLog, h, endKey, n);
          return `
            <li tabindex="0" ${tipAttr(h.name, [['habit', 'Tercentang', `${rate}% hari`]])}>
              <span class="hbar-label">${esc(h.name)}</span>
              <span class="hbar-track"><span class="hbar-fill" data-cat="${esc(h.color)}" style="width:${rate}%"></span></span>
              <span class="hbar-value"><strong>${rate}%</strong> · streak ${L.currentStreak(state.habitLog, h.id, endKey, D.todayKey())} hari</span>
            </li>`;
        }).join('')}
      </ul>`;
  }

  function render(ctx) {
    const { state, date } = ctx;
    const n = ctx.prefs.statsRange === 30 ? 30 : 7;
    const keys = D.lastNDays(date, n);
    const days = L.summarizeDays(state, keys);
    const rangeTasks = state.tasks.filter((t) => keys.includes(t.date));
    const prog = L.progress(rangeTasks);
    const focus = days.reduce((s, d) => s + d.focus, 0);
    const moods = days.filter((d) => d.mood);
    const moodAvg = moods.length ? moods.reduce((s, d) => s + d.mood, 0) / moods.length : null;
    const waterDays = days.filter((d) => d.water);
    const waterAvg = waterDays.length ? waterDays.reduce((s, d) => s + d.water, 0) / waterDays.length : 0;
    const habits = state.habits.filter((h) => !h.archived);
    const habitAvg = habits.length
      ? Math.round(habits.reduce((s, h) => s + L.habitRate(state.habitLog, h, date, n), 0) / habits.length)
      : null;
    const fmt1 = (v) => v.toLocaleString('id-ID', { maximumFractionDigits: 1 });

    const tiles = [
      { label: 'Tugas selesai', value: `${prog.done}`, sub: `dari ${prog.total} rencana · ${prog.pct}%` },
      { label: 'Waktu fokus', value: D.formatDuration(focus), sub: `rata-rata ${D.formatDuration(focus / n)} per hari` },
      { label: 'Air minum', value: `${fmt1(waterAvg)} gelas`, sub: `rata-rata per hari · target ${state.settings.waterGoal}` },
      { label: 'Suasana hati', value: moodAvg ? L.MOODS[Math.round(moodAvg) - 1].label : '–', sub: moodAvg ? `rata-rata ${fmt1(moodAvg)} dari 5` : 'belum ada catatan' },
      { label: 'Kebiasaan', value: habitAvg == null ? '–' : `${habitAvg}%`, sub: 'hari tercentang, rata-rata' },
    ];

    return `
      <header class="view-head">
        <div>
          <p class="eyebrow">Statistik</p>
          <h1>${n} hari sampai ${esc(D.formatMedium(date))}</h1>
        </div>
        <div class="segmented" role="group" aria-label="Rentang waktu">
          <button type="button" data-range="7" aria-pressed="${n === 7}">7 hari</button>
          <button type="button" data-range="30" aria-pressed="${n === 30}">30 hari</button>
        </div>
      </header>

      <dl class="tiles">
        ${tiles.map((t) => `<div class="tile"><dt>${esc(t.label)}</dt><dd>${esc(t.value)}</dd><p>${esc(t.sub)}</p></div>`).join('')}
      </dl>

      <div class="charts">
        <section class="panel chart-panel wide">
          <div class="panel-head">
            <h2>Tugas per hari</h2>
            <ul class="legend">
              <li><span class="key done"></span>Selesai</li>
              <li><span class="key rest"></span>Belum selesai</li>
            </ul>
          </div>
          ${taskChart(days)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Menit fokus per hari</h2></div>
          ${focusChart(days)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Suasana hati</h2></div>
          ${moodChart(days)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Tugas per kategori</h2></div>
          ${categoryBars(rangeTasks)}
        </section>
        <section class="panel chart-panel">
          <div class="panel-head"><h2>Konsistensi kebiasaan</h2></div>
          ${habitBars(state, date, n)}
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

    const show = (target) => {
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
      const box = target.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let left = box.left - host.left + box.width / 2 - tw / 2;
      left = Math.max(0, Math.min(left, host.width - tw));
      let top = box.top - host.top - th - 8;
      if (target.classList.contains('col') || target.classList.contains('mslot')) {
        const stack = target.querySelector('.stack');
        const anchor = stack && stack.offsetHeight ? stack.getBoundingClientRect().top : box.top + box.height / 2;
        top = anchor - host.top - th - 8;
      }
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, top)}px`;
    };
    const hide = () => { tip.hidden = true; };

    el.addEventListener('pointerover', (e) => {
      const t = e.target.closest('[data-tip]');
      if (t) show(t);
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
    el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-range]');
      if (r) ctx.setPref('statsRange', Number(r.dataset.range));
    });
  }

  (P.views = P.views || {}).statistik = { title: 'Statistik', render, mount };
})(typeof self !== 'undefined' ? self : this);
