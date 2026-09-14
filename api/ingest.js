'use strict';

/**
 * The booker POSTs its current state here after each run.
 *
 *   POST /api/ingest
 *   Authorization: Bearer <ROOMS_INGEST_SECRET>
 *   { "rows": [{date, status, room?, start?, end?}], "notes": [] }
 */

const store = require('./_store');

const json = (res, code, body) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(code).send(JSON.stringify(body));
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

  const secret = process.env.ROOMS_INGEST_SECRET;
  if (!secret) return json(res, 500, { error: 'ROOMS_INGEST_SECRET not set' });

  const auth = req.headers.authorization || '';
  if (auth !== `Bearer ${secret}`) return json(res, 401, { error: 'unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !Array.isArray(body.rows)) return json(res, 400, { error: 'expected { rows: [...] }' });

  const rows = body.rows
    .filter((r) => r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .slice(0, 60)
    .map((r) => ({
      date: r.date,
      status: r.status === 'booked' ? 'booked' : 'none',
      room: typeof r.room === 'string' ? r.room.slice(0, 20) : undefined,
      start: typeof r.start === 'string' ? r.start.slice(0, 12) : undefined,
      end: typeof r.end === 'string' ? r.end.slice(0, 12) : undefined,
    }));

  const notes = Array.isArray(body.notes)
    ? body.notes.filter((n) => typeof n === 'string').slice(0, 3).map((n) => n.slice(0, 200))
    : [];

  try {
    await store.set({ at: new Date().toISOString(), rows, notes });
  } catch (err) {
    return json(res, 502, { error: err.message });
  }

  return json(res, 200, { ok: true, rows: rows.length });
};
