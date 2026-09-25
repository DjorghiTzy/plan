'use strict';

const { route, send, readJson, bearer } = require('./_lib/http');
const { getStore } = require('./_lib/store');
const auth = require('./_lib/auth');
const push = require('./_lib/push');

/**
 * Notifikasi pengingat per jam.
 * GET    /api/push                    → {available, publicKey, lastTick}
 * POST   /api/push {subscription, from, to, tz}  → simpan/perbarui langganan perangkat ini
 * POST   /api/push {test: true}       → kirim satu notifikasi tes ke semua perangkat akun ini
 * DELETE /api/push {endpoint}         → berhenti berlangganan
 */
module.exports = route({
  GET: async (req, res) => {
    const store = getStore();
    if (!store) {
      send(res, 200, { available: false });
      return;
    }
    const [keys, lastTick] = await Promise.all([push.vapidKeys(store), push.lastTick(store)]);
    let devices = null;
    if (bearer(req)) {
      try {
        const ctx = await auth.authenticate(req);
        devices = (await store.smembers(push.KEYS.user(ctx.user.id))).length;
      } catch {
        /* sesi tidak valid: info umum tetap dikirim */
      }
    }
    send(res, 200, { available: true, publicKey: keys.publicKey, lastTick, devices });
  },
  POST: async (req, res) => {
    const ctx = await auth.authenticate(req);
    const body = await readJson(req);
    if (body.test) {
      await auth.limit(ctx.store, 'push-test', ctx.user.id, 10, 3600);
      const result = await push.tick(ctx.store, { userId: ctx.user.id, force: true });
      send(res, 200, result);
      return;
    }
    await auth.limit(ctx.store, 'push-sub', ctx.user.id, 60, 3600);
    const rec = await push.saveSubscription(ctx.store, ctx.user.id, body);
    send(res, 200, { ok: true, id: rec.id, from: rec.from, to: rec.to, tz: rec.tz });
  },
  DELETE: async (req, res) => {
    const ctx = await auth.authenticate(req);
    const body = await readJson(req);
    const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
    const removed = endpoint ? await push.removeSubscription(ctx.store, push.subId(endpoint), ctx.user.id) : false;
    send(res, 200, { ok: true, removed });
  },
});
