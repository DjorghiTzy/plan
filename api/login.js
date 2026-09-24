'use strict';

const { route, send, readJson } = require('./_lib/http');
const auth = require('./_lib/auth');

/** POST /api/login {email, password, device} → {token, user} */
module.exports = route({
  POST: async (req, res) => {
    const body = await readJson(req);
    send(res, 200, await auth.login(body, req));
  },
});
