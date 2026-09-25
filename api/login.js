'use strict';

const { route, send, readJson, setSessionCookie } = require('./_lib/http');
const auth = require('./_lib/auth');

/** POST /api/login {email, password, device} → {token, user} */
module.exports = route({
  POST: async (req, res) => {
    const body = await readJson(req);
    const result = await auth.login(body, req);
    setSessionCookie(res, result.token, auth.SESSION_TTL);
    send(res, 200, result);
  },
});
