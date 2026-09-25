/**
 * DOM morphing kecil: memperbarui DOM yang ada agar sama dengan HTML baru,
 * alih-alih menggantinya. Elemen yang tetap ada tidak dibuat ulang, sehingga
 * transisi CSS (progres, centang, grafik) berjalan mulus, fokus & posisi gulir
 * terjaga, dan elemen yang masuk/keluar bisa dianimasikan.
 */
(function (root) {
  'use strict';
  const P = root.Planner;

  const KEY_ATTRS = ['data-id', 'id', 'data-key', 'data-fk', 'data-day', 'data-date'];
  const TRANSIENT = ['flash', 'dragging', 'drop-over', 'is-leaving', 'settling', 'page-enter'];
  const reduced = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function keyOf(node) {
    if (node.nodeType !== 1) return null;
    for (const a of KEY_ATTRS) {
      const v = node.getAttribute(a);
      if (v) return `${node.nodeName}|${a}|${v}`;
    }
    return null;
  }

  const firstClass = (node) => (node.nodeType === 1 ? (node.getAttribute('class') || '').split(' ')[0] : '');
  const leaving = (node) => node.nodeType === 1 && node.classList.contains('is-leaving');

  function syncAttributes(from, to) {
    for (const { name } of [...from.attributes]) {
      if (to.hasAttribute(name)) continue;
      if (name === 'open' && from.nodeName === 'DETAILS') continue; // biarkan pilihan buka/tutup pengguna
      if (name === 'style' && from.hasAttribute('data-keep-style')) continue;
      from.removeAttribute(name);
    }
    for (const { name, value } of [...to.attributes]) {
      if (name === 'class') {
        const keep = TRANSIENT.filter((c) => from.classList.contains(c));
        const next = keep.length ? `${value} ${keep.join(' ')}` : value;
        if (from.getAttribute('class') !== next) from.setAttribute('class', next);
      } else if (from.getAttribute(name) !== value) {
        from.setAttribute(name, value);
      }
    }
  }

  function syncFormState(from, to) {
    const active = root.document.activeElement;
    if (from.nodeName === 'INPUT') {
      if (from.type === 'checkbox' || from.type === 'radio') {
        from.checked = to.hasAttribute('checked');
      } else if (from.type !== 'file' && from !== active) {
        const v = to.getAttribute('value') || '';
        if (from.value !== v) from.value = v;
      }
    } else if (from.nodeName === 'TEXTAREA') {
      if (from !== active && from.value !== to.value) from.value = to.value;
    } else if (from.nodeName === 'OPTION') {
      from.selected = to.hasAttribute('selected');
    }
  }

  /** Kontrol formulir di dalam subpohon yang tidak berubah tetap diselaraskan dengan atributnya. */
  function syncFormTree(from, to) {
    if (!from.querySelector('input, textarea, option')) return;
    const a = from.querySelectorAll('input, textarea, option');
    const b = to.querySelectorAll('input, textarea, option');
    for (let i = 0; i < a.length && i < b.length; i += 1) syncFormState(a[i], b[i]);
  }

  function morphNode(from, to, opts) {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
      from.replaceWith(to);
      return to;
    }
    if (from.nodeType === 3 || from.nodeType === 8) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return from;
    }
    // Jalur cepat: subpohon identik (dibandingkan secara native) tidak perlu ditelusuri.
    // Ini bagian terbesar halaman pada setiap klik, jadi render ulang tetap ringan.
    if (from.isEqualNode(to)) {
      if (from.nodeName === 'INPUT' || from.nodeName === 'TEXTAREA' || from.nodeName === 'OPTION') syncFormState(from, to);
      else syncFormTree(from, to);
      return from;
    }
    syncAttributes(from, to);
    syncFormState(from, to);
    if (from.nodeName !== 'TEXTAREA') morphChildren(from, to, opts);
    if (from.nodeName === 'SELECT') {
      const sel = to.querySelector('option[selected]');
      if (sel) from.value = sel.value;
    }
    return from;
  }

  function animateIn(node) {
    if (node.nodeType !== 1 || !node.hasAttribute('data-id') || typeof node.animate !== 'function') return;
    node.animate(
      [{ opacity: 0, transform: 'translateY(-6px) scale(0.98)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  function removeNode(node, opts) {
    const animate = opts.animate && node.nodeType === 1 && node.hasAttribute('data-id') && typeof node.animate === 'function';
    if (!animate) {
      node.remove();
      return;
    }
    node.classList.add('is-leaving');
    const style = root.getComputedStyle(node);
    const frames = style.position === 'absolute'
      ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }]
      : [
        { opacity: 1, height: `${node.offsetHeight}px` },
        { opacity: 0, height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', marginBottom: '0px' },
      ];
    node.style.overflow = 'hidden';
    const anim = node.animate(frames, { duration: 220, easing: 'cubic-bezier(.4,0,.2,1)' });
    anim.onfinish = () => {
      if (node.classList.contains('is-leaving')) node.remove();
    };
  }

  function morphChildren(fromParent, toParent, opts) {
    const fromKids = [...fromParent.childNodes];
    const toKids = [...toParent.childNodes];
    const keyed = new Map();
    for (const k of fromKids) {
      const key = keyOf(k);
      if (key && !keyed.has(key)) keyed.set(key, k);
    }
    const used = new Set();
    let cursor = fromParent.firstChild;

    for (const next of toKids) {
      const key = keyOf(next);
      let match = null;
      if (key) {
        match = keyed.get(key) || null;
        if (match && used.has(match)) match = null;
        if (match && leaving(match)) {
          // Kembali sebelum animasi keluar selesai (mis. Urungkan): batalkan.
          match.classList.remove('is-leaving');
          match.getAnimations().forEach((a) => a.cancel());
          match.style.overflow = '';
        }
      } else {
        const fc = firstClass(next);
        for (let n = cursor; n; n = n.nextSibling) {
          if (!used.has(n) && !keyOf(n) && !leaving(n) && n.nodeName === next.nodeName && firstClass(n) === fc) {
            match = n;
            break;
          }
        }
      }

      if (match) {
        used.add(match);
        if (match !== cursor) fromParent.insertBefore(match, cursor);
        const result = morphNode(match, next, opts);
        cursor = result.nextSibling;
      } else {
        fromParent.insertBefore(next, cursor);
        if (opts.animate) animateIn(next);
        cursor = next.nextSibling;
      }
    }

    for (const old of fromKids) {
      if (!used.has(old) && old.parentNode === fromParent && !leaving(old)) removeNode(old, opts);
    }
  }

  /**
   * @param {Element} target elemen yang sudah ada di halaman
   * @param {Element} source elemen baru (belum dipasang) dengan isi terbaru
   * @param {{animate?: boolean}} opts animate = animasikan elemen ber-data-id yang masuk/keluar
   */
  function morph(target, source, opts = {}) {
    const o = { animate: Boolean(opts.animate) && !reduced() };
    syncAttributes(target, source);
    morphChildren(target, source, o);
    return target;
  }

  P.morph = { morph, keyOf };
})(typeof self !== 'undefined' ? self : this);
