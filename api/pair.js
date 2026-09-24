'use strict';

const { route, send, readJson, bearer } = require('./_lib/http');
const auth = require('./_lib/auth');

/**
 * POST /api/pair
 *  - dengan sesi (Authorization): buat kode 8 karakter untuk menghubungkan perangkat lain
 *  - tanpa sesi, body {code}: tukar kode menjadi sesi baru di perangkat ini
 */
module.exports = route({
  POST: async (req, res) => {
    const body = await readJson(req);
    if (body.code) {
      send(res, 200, await auth.claimPairCode(body, req));
      return;
    }
    if (!bearer(req)) {
      send(res, 400, { error: 'Masukkan kode dari perangkat lain.', code: 'bad_code' });
      return;
    }
    const ctx = await auth.authenticate(req);
    send(res, 201, await auth.createPairCode(ctx));
  },
});
