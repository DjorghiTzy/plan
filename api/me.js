'use strict';

const { route, send } = require('./_lib/http');
const auth = require('./_lib/auth');

/** GET /api/me → {user} */
module.exports = route({
  GET: async (req, res) => {
    const ctx = await auth.authenticate(req);
    send(res, 200, { user: auth.publicUser(ctx.user) });
  },
});
