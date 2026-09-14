'use strict';

/**
 * Server-rendered study-room status page.
 * Reads current state from Upstash on every request - no rebuild, no git push.
 * Reached via the rewrite in vercel.json.
 */

const store = require('./_store');

const TZ = 'America/Toronto';

const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const dayName = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US',
  { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' });

const todayInTz = () => {
  const p = new Intl.DateTimeFormat('en-CA',
    { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
};

function ago(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(mins)) return 'unknown';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function page(inner, opts) {
  const stale = opts && opts.stale;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Study rooms</title>
<link rel="stylesheet" href="/assets/rooms.css">
</head>
<body${stale ? ' class="stale"' : ''}>
<main>
${inner}
</main>
</body>
</html>
`;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!store.configured()) {
    res.status(200).send(page(
      `  <h1>Study rooms</h1>\n  <p class="empty">Storage isn't connected yet. Add an Upstash Redis store to this Vercel project.</p>`));
    return;
  }

  let state;
  try {
    state = await store.get();
  } catch (err) {
    res.status(200).send(page(
      `  <h1>Study rooms</h1>\n  <p class="empty">Couldn't reach the store. ${esc(err.message)}</p>`));
    return;
  }

  if (!state) {
    res.status(200).send(page(
      `  <h1>Study rooms</h1>\n  <p class="sub">Newnham K-building</p>\n  <p class="empty">Nothing reported yet. The booker hasn't checked in.</p>`));
    return;
  }

  const today = todayInTz();
  const rows = (state.rows || [])
    .filter((r) => r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const staleMins = state.at ? (Date.now() - new Date(state.at).getTime()) / 60000 : Infinity;
  const stale = staleMins > 24 * 60;

  const list = rows.length
    ? `  <ul>\n${rows.map((r) => r.status === 'booked'
        ? `    <li><span class="day">${esc(dayName(r.date))}</span><span class="room">${esc(r.room)}</span><span class="time">${esc(r.start)} - ${esc(r.end)}</span></li>`
        : `    <li class="none"><span class="day">${esc(dayName(r.date))}</span><span class="room">nothing free</span><span class="time">will retry</span></li>`
      ).join('\n')}\n  </ul>`
    : `  <p class="empty">No upcoming bookings.</p>`;

  const notes = (state.notes || []).length
    ? `\n  <div class="notes">\n${state.notes.map((n) => `    <p>${esc(n)}</p>`).join('\n')}\n  </div>`
    : '';

  const staleWarning = stale
    ? `\n  <p class="warn">The booker hasn't checked in for over a day - your Mac may be asleep or the session expired.</p>`
    : '';

  res.status(200).send(page(
`  <h1>Study rooms</h1>
  <p class="sub">Newnham K-building &middot; checked ${esc(ago(state.at))}</p>${staleWarning}
${list}${notes}
  <footer>Booked automatically around your class schedule.</footer>`, { stale }));
};
