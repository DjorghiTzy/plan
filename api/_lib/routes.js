/**
 * Saran rute lari di server: cadangan bila browser tidak bisa menghubungi layanan rute
 * OpenStreetMap secara langsung. Algoritmanya sama dengan di browser (js/core/loops.js).
 */
'use strict';

const L = require('../../js/core/loops.js');

const BASE = (process.env.ROUTING_URL || 'https://routing.openstreetmap.de/routed-foot').replace(/\/$/, '');
const BUDGET_MS = 22000; // di bawah batas waktu fungsi

let factory = null;

/** Hanya untuk uji & server dev lokal: ganti klien rute ({table, route}) dengan tiruan. */
function setRouterFactory(fn) {
  factory = fn;
}

function serverClient() {
  return L.osrmClient(BASE, {
    fetchFn: (url, opts) => fetch(url, opts),
    headers: { 'User-Agent': 'RencanaHarian/1.0 (saran rute lari, aplikasi pribadi)' },
    concurrency: 2,
    gapMs: 150,
  });
}

/**
 * @param {{lat: number, lng: number, km: number, seed?: number}} q
 * @returns {Promise<{target, tolerance, withinTolerance, method, routes}>}
 */
function suggest(q, { client = factory ? factory() : serverClient(), budgetMs = BUDGET_MS } = {}) {
  return L.suggest(q, client, { budgetMs });
}

module.exports = { suggest, setRouterFactory, serverClient, RouteError: L.RouteError, TOLERANCE_M: L.TOLERANCE_M, BASE };
