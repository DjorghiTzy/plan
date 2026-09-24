'use strict';

const { route, send, readJson, clearSessionCookie } = require('./_lib/http');
const auth = require('./_lib/auth');

/** DELETE /api/account {password} — hapus akun beserta seluruh datanya. */
module.exports = route({
  DELETE: async (req, res) => {
    const ctx = await auth.authenticate(req);
    const body = await readJson(req);
    await auth.deleteAccount(ctx, body.password);
    clearSessionCookie(res);
    send(res, 200, { ok: true });
  },
});
