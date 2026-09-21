'use strict';

/**
 * POST /api/apps-ingest - the Gmail Apps Script sends candidate emails here.
 *
 *   Authorization: Bearer <APPS_SECRET>
 *   { "messages": [{ id, threadId, date, from, subject, body }], "scanned": <n> }
 *
 * Emails are classified here (rules in _apps_classify.js) and only the
 * resulting events - date, type, company, role, subject - are stored.
 * Email bodies are never persisted.
 */

const store = require('./_store');
const { classifyMessage } = require('./_apps_classify');

const MAX_EVENTS = 3000;

const json = (res, code, body) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(body));
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

  const secret = process.env.APPS_SECRET;
  if (!secret) return json(res, 500, { error: 'APPS_SECRET not set in Vercel' });
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) return json(res, 401, { error: 'unauthorized' });
  if (!store.configured()) return json(res, 500, { error: 'store not configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const messages = body && Array.isArray(body.messages) ? body.messages : null;
  if (!messages) return json(res, 400, { error: 'expected { messages: [...] }' });

  const fresh = [];
  for (const m of messages.slice(0, 1500)) {
    if (!m || !m.id || !m.date) continue;
    try {
      const ev = classifyMessage(m);
      if (ev) fresh.push(ev);
    } catch { /* one odd email shouldn't sink the batch */ }
  }

  try {
    // Merge with what we already know, so history survives even if the
    // collector's search window changes. New classification wins (rules improve).
    const prevRaw = await store.command(['GET', 'apps:events']);
    const prev = prevRaw ? JSON.parse(prevRaw) : [];
    const byId = new Map(prev.map((e) => [e.id, e]));
    const seenNow = new Set(messages.map((m) => m && m.id).filter(Boolean));
    // Emails re-sent this run but no longer classified (a rule got stricter) are dropped.
    for (const id of seenNow) byId.delete(id);
    for (const e of fresh) byId.set(e.id, e);
    const events = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_EVENTS);

    await store.command(['SET', 'apps:events', JSON.stringify(events)]);
    await store.command(['SET', 'apps:meta', JSON.stringify({
      at: new Date().toISOString(),
      scanned: Number(body.scanned) || messages.length,
      received: messages.length,
      matched: fresh.length,
      total: events.length,
    })]);
    return json(res, 200, { ok: true, received: messages.length, matched: fresh.length, totalEvents: events.length });
  } catch (e) {
    return json(res, 502, { error: e.message });
  }
};
