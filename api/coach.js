'use strict';

const { route, send, readJson, HttpError } = require('./_lib/http');
const auth = require('./_lib/auth');
const gemini = require('./_lib/gemini');
const coach = require('./_lib/coach');

// Batas permintaan per akun per hari (UTC) agar biaya API tetap terkendali.
const DAILY_LIMIT = Math.max(1, Number(process.env.COACH_DAILY_LIMIT) || 40);
const MAX_BODY = 4.5 * 1024 * 1024; // batas isi permintaan Vercel
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toHttp(err) {
  if (err instanceof HttpError) return err;
  console.error(err);
  const d = gemini.describeError(err);
  return new HttpError(d.status, d.message, d.code);
}

async function guard(req) {
  const ctx = await auth.authenticate(req);
  if (!gemini.available()) {
    throw new HttpError(503, 'Coach belum aktif. Pasang GEMINI_API_KEY di Environment Variables Vercel lalu Redeploy.', 'coach_off');
  }
  const body = await readJson(req, { maxBytes: MAX_BODY });
  const serverDay = new Date().toISOString().slice(0, 10);
  const used = await ctx.store.hit(`coach:q:${ctx.user.id}:${serverDay}`, 2 * 86400);
  if (used > DAILY_LIMIT) {
    throw new HttpError(429, `Batas harian coach tercapai (${DAILY_LIMIT} permintaan). Coba lagi besok.`, 'coach_quota');
  }
  return {
    body,
    today: DATE_RE.test(body.today) ? body.today : serverDay,
    now: TIME_RE.test(body.now) ? body.now : '',
    remaining: DAILY_LIMIT - used,
  };
}

/**
 * GET  /api/coach                                   → {available, model, dailyLimit}
 * POST /api/coach {action: "extract", image, context, today} → {run, remaining}
 * POST /api/coach {action: "routes", routes, target, context, today, now} → {advice: {recommended, summary, notes}, remaining}
 * POST /api/coach {action: "chat", messages, context, today, now}
 *      → aliran NDJSON: {"t":"start"} {"t":"text","v":"…"} … {"t":"done"} | {"t":"error","message"}
 */
module.exports = route({
  GET: async (req, res) => {
    await auth.authenticate(req);
    send(res, 200, { available: gemini.available(), model: gemini.MODEL, dailyLimit: DAILY_LIMIT });
  },
  POST: async (req, res) => {
    const { body, today, now, remaining } = await guard(req);

    if (body.action === 'extract') {
      let run;
      try {
        run = await coach.extract({ image: body.image, context: body.context, today });
      } catch (err) {
        throw toHttp(err);
      }
      send(res, 200, { run, remaining });
      return;
    }

    if (body.action === 'chat') {
      let started = false;
      const write = (obj) => res.write(`${JSON.stringify(obj)}\n`);
      try {
        const { stopReason } = await coach.chat({ messages: body.messages, context: body.context, today, now }, {
          onStart() {
            started = true;
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Accel-Buffering', 'no');
            write({ t: 'start', remaining });
          },
          onText: (text) => write({ t: 'text', v: text }),
        });
        if (stopReason === 'refusal') write({ t: 'error', message: 'Coach tidak bisa menjawab pertanyaan ini. Coba tanyakan dengan cara lain.' });
        else write({ t: 'done', stop: stopReason });
        res.end();
      } catch (err) {
        if (!started) throw toHttp(err);
        console.error(err);
        write({ t: 'error', message: gemini.describeError(err).message });
        res.end();
      }
      return;
    }

    if (body.action === 'routes') {
      let advice;
      try {
        advice = await coach.routeAdvice({ routes: body.routes, target: body.target, context: body.context, today, now });
      } catch (err) {
        throw toHttp(err);
      }
      send(res, 200, { advice, remaining });
      return;
    }

    throw new HttpError(400, 'Aksi coach tidak dikenal.', 'bad_action');
  },
});
