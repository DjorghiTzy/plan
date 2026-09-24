'use strict';

const { route, send, readJson } = require('./_lib/http');
const auth = require('./_lib/auth');

/** POST /api/register {email, password, name, device} → {token, user} */
module.exports = route({
  POST: async (req, res) => {
    const body = await readJson(req);
    send(res, 201, await auth.register(body, req));
  },
});
