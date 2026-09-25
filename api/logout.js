'use strict';

const { route, send, clearSessionCookie } = require('./_lib/http');
const auth = require('./_lib/auth');

/** POST /api/logout — hapus sesi perangkat ini. */
module.exports = route({
  POST: async (req, res) => {
    const ctx = await auth.authenticate(req);
    await auth.logout(ctx);
    clearSessionCookie(res);
    send(res, 200, { ok: true });
  },
});
