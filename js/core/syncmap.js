/**
 * Pemetaan status aplikasi ⇄ entri sinkronisasi.
 * Setiap tugas, kebiasaan, catatan jurnal, dsb. menjadi satu entri berkunci
 * (mis. "task:t-abc", "journal:2026-09-24") sehingga perubahan dari dua perangkat
 * pada data yang berbeda tidak saling menimpa.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else (root.Planner = root.Planner || {}).syncmap = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY_RE = /^[a-zA-Z]{2,20}(:[\w.:-]{1,160})?$/;

  // Pengaturan yang khusus perangkat (tidak ikut disinkronkan).
  const LOCAL_SETTINGS = new Set(['isSample']);

  const LISTS = [
    ['task', 'tasks'],
    ['series', 'series'],
    ['habit', 'habits'],
    ['focus', 'focusSessions'],
    ['template', 'templates'],
  ];
  const MAPS = [
    ['habitLog', 'habitLog'],
    ['water', 'water'],
    ['journal', 'journal'],
    ['weekNote', 'weekNotes'],
  ];

  /** @returns {Object<string, *>} kunci → nilai */
  function flatten(state) {
    const out = {};
    const put = (k, v) => {
      if (KEY_RE.test(k) && v !== undefined) out[k] = v;
    };
    for (const [field, value] of Object.entries(state.settings || {})) {
      if (!LOCAL_SETTINGS.has(field)) put(`settings:${field}`, value);
    }
    if (state.timer) put('timer', state.timer);
    for (const [prefix, field] of LISTS) {
      for (const item of state[field] || []) put(`${prefix}:${item.id}`, item);
    }
    for (const [prefix, field] of MAPS) {
      for (const [k, v] of Object.entries(state[field] || {})) put(`${prefix}:${k}`, v);
    }
    return out;
  }

  /** Terapkan satu entri ke status (mengubah `state` langsung). */
  function applyEntry(state, key, entry) {
    const idx = key.indexOf(':');
    const prefix = idx < 0 ? key : key.slice(0, idx);
    const rest = idx < 0 ? '' : key.slice(idx + 1);
    const del = entry.d === true || entry.v === null || entry.v === undefined;

    if (prefix === 'settings') {
      if (LOCAL_SETTINGS.has(rest)) return;
      if (del) delete state.settings[rest];
      else state.settings[rest] = entry.v;
      return;
    }
    if (prefix === 'timer') {
      if (!del) state.timer = entry.v;
      return;
    }
    const list = LISTS.find(([p]) => p === prefix);
    if (list) {
      const arr = state[list[1]] || (state[list[1]] = []);
      const i = arr.findIndex((x) => String(x.id) === rest);
      if (del) {
        if (i >= 0) arr.splice(i, 1);
      } else if (i >= 0) {
        arr[i] = entry.v;
      } else {
        arr.push(entry.v);
      }
      return;
    }
    const map = MAPS.find(([p]) => p === prefix);
    if (map) {
      const obj = state[map[1]] || (state[map[1]] = {});
      if (del) delete obj[rest];
      else obj[rest] = entry.v;
    }
  }

  /**
   * Bandingkan status sekarang dengan bayangan (JSON terakhir yang sudah sinkron).
   * @returns {{changed: string[], removed: string[], json: Object<string,string>}}
   */
  function diff(flat, shadow) {
    const changed = [];
    const removed = [];
    const json = {};
    for (const [k, v] of Object.entries(flat)) {
      const s = JSON.stringify(v);
      json[k] = s;
      if (shadow[k] !== s) changed.push(k);
    }
    for (const k of Object.keys(shadow)) if (!(k in flat)) removed.push(k);
    return { changed, removed, json };
  }

  return { KEY_RE, flatten, applyEntry, diff };
});
