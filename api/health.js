'use strict';

const { route, send } = require('./_lib/http');
const { getStore } = require('./_lib/store');
const { isPrivate, authMode } = require('./_lib/auth');
const claude = require('./_lib/claude');

/** GET /api/health — apakah sinkronisasi tersedia di server ini. */
module.exports = route({
  GET: (req, res) => {
    const store = getStore();
    send(res, 200, { ok: true, sync: Boolean(store), storage: store ? store.kind : null, private: isPrivate(), auth: authMode(), coach: claude.available() });
  },
});
