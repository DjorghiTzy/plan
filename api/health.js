'use strict';

const { route, send } = require('./_lib/http');
const { getStore } = require('./_lib/store');

/** GET /api/health — apakah sinkronisasi tersedia di server ini. */
module.exports = route({
  GET: (req, res) => {
    const store = getStore();
    send(res, 200, { ok: true, sync: Boolean(store), storage: store ? store.kind : null });
  },
});
