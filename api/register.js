'use strict';

const { route, send, readJson, setSessionCookie } = require('./_lib/http');
const auth = require('./_lib/auth');

/** POST /api/register {email, password, name, device} → {token, user} */
module.exports = route({
  POST: async (req, res) => {
    const body = await readJson(req);
    const result = await auth.register(body, req);
    setSessionCookie(res, result.token, auth.SESSION_TTL);
    send(res, 201, result);
  },
});
