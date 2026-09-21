'use strict';

/**
 * /applications - job application tracker built from Gmail.
 *
 * Status is computed on every page load from stored events, so the
 * "ghosts in N days" countdown stays accurate between collector runs.
 *
 * Env:
 *   APPS_SECRET        required - shared with the Apps Script; also signs the login cookie
 *   APPS_PASSWORD      optional - page password (falls back to TAILOR_PASSWORD)
 *   APPS_GHOST_DAYS    optional - days of silence before "ghosted" (default 30)
 */

const crypto = require('crypto');
const store = require('./_store');
const { buildApplications } = require('./_apps_classify');

const COOKIE = 'apps_session';
const COOKIE_DAYS = 30;
const FAIL_LIMIT = 8;
const STATUSES = ['applied', 'assessment', 'interview', 'offer', 'rejected', 'ghosted'];

// ------------------------------------------------------------ html

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/assets/tailor.css">
<link rel="stylesheet" href="/assets/apps.css">
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

const loginPage = (error = '') => page('Applications', `  <h1>Applications</h1>
  <p class="sub">Private.</p>
${error ? `  <p class="error" role="alert">${esc(error)}</p>\n` : ''}  <form method="post" action="/applications">
    <input type="hidden" name="action" value="login">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required autofocus autocomplete="current-password">
    <button type="submit">Open</button>
  </form>`);

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' });
const ago = (d) => (d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);

const LABEL = {
  offer: 'Offer', interview: 'Interviewing', assessment: 'Assessment', applied: 'Waiting',
  rejected: 'Rejected', ghosted: 'No reply - treat as rejected',
};

function row(a, ghostDays) {
  const roleLine = a.role ? `<span class="role">${esc(a.role)}</span>` : '';
  let meta = `Applied ${fmtDate(a.appliedAt)} · last update ${ago(a.daysSince)}`;
  let extra = '';
  if (a.status === 'applied' || a.status === 'assessment') {
    extra = `\n        <div class="clock"><progress max="${ghostDays}" value="${Math.min(a.daysSince, ghostDays)}"></progress><span>${a.ghostIn === 0 ? 'ghosts today' : `ghosts in ${a.ghostIn}d`}</span></div>`;
  }
  if (a.status === 'ghosted' && a.stage !== 'applied') meta += ` · got to ${LABEL[a.stage].toLowerCase()}`;
  if (a.overridden) meta += ' · set by you';

  const opts = ['auto', ...STATUSES, 'hidden'].map((s) =>
    `<option value="${s}"${(a.overridden ? a.override : 'auto') === s ? ' selected' : ''}>${s === 'auto' ? 'Automatic' : s === 'hidden' ? 'Hide (not a job)' : LABEL[s]}</option>`).join('');

  return `      <li class="app ${esc(a.status)}">
        <div class="head"><span class="company">${esc(a.company)}</span>${roleLine}</div>
        <div class="meta">${esc(meta)}</div>${extra}
        <details>
          <summary>Emails &amp; fix</summary>
          <ol class="events">
${a.events.slice().reverse().map((e) => `            <li><span class="t ${esc(e.type)}">${esc(e.type)}</span> ${esc(fmtDate(e.date))} - ${esc(e.subject)}</li>`).join('\n')}
          </ol>
          <form method="post" action="/applications" class="fix">
            <input type="hidden" name="action" value="override">
            <input type="hidden" name="id" value="${esc(a.id)}">
            <select name="status" aria-label="Status for ${esc(a.company)}">${opts}</select>
            <button type="submit" class="small">Save</button>
          </form>
        </details>
      </li>`;
}

function trackerPage(apps, meta, ghostDays, hidden) {
  const groups = [
    ['offer', 'Offers'], ['interview', 'Interviewing'], ['assessment', 'Assessments'],
    ['applied', 'Waiting'], ['rejected', 'Rejected'], ['ghosted', `No reply in ${ghostDays}+ days`],
  ];
  const count = (s) => apps.filter((a) => a.status === s).length;
  const heard = apps.filter((a) => a.stage !== 'applied' || a.status === 'rejected').length;
  const rate = apps.length ? Math.round((heard / apps.length) * 100) : 0;

  const staleDays = meta && meta.at ? Math.floor((Date.now() - new Date(meta.at)) / 86400e3) : null;
  const banner = !meta
    ? '  <p class="error">Nothing received yet. Run <code>syncApplications</code> once in the Apps Script to do the first import.</p>\n'
    : staleDays >= 2
      ? `  <p class="error">Last Gmail sync was ${staleDays} days ago. Check the Apps Script trigger is still installed.</p>\n`
      : '';

  const sections = groups.map(([status, title]) => {
    const list = apps.filter((a) => a.status === status);
    if (!list.length) return '';
    const open = ['offer', 'interview', 'assessment', 'applied'].includes(status);
    return `  <section class="group ${status}">
    <details${open ? ' open' : ''}>
      <summary><h2>${esc(title)} <span class="n">${list.length}</span></h2></summary>
      <ul class="apps">
${list.map((a) => row(a, ghostDays)).join('\n')}
      </ul>
    </details>
  </section>`;
  }).filter(Boolean).join('\n');

  const hiddenSection = hidden.length ? `  <section class="group hidden-apps">
    <details>
      <summary><h2>Hidden <span class="n">${hidden.length}</span></h2></summary>
      <ul class="apps">
${hidden.map((a) => row(a, ghostDays)).join('\n')}
      </ul>
    </details>
  </section>` : '';

  return page('Applications', `  <h1>Applications</h1>
  <p class="sub">${meta ? `Synced from Gmail ${esc(ago(staleDays))}` : 'Not synced yet'} · no reply in ${ghostDays} days counts as a no</p>
${banner}  <div class="stats">
    <div><b>${apps.length}</b><span>applied</span></div>
    <div><b>${count('applied') + count('assessment')}</b><span>waiting</span></div>
    <div><b>${count('interview') + count('offer')}</b><span>active</span></div>
    <div><b>${rate}%</b><span>heard back</span></div>
  </div>
${sections || '  <p class="empty">No applications found yet.</p>'}
${hiddenSection}
  <form method="post" action="/applications" class="logout"><input type="hidden" name="action" value="logout"><button type="submit" class="link">Sign out</button></form>`);
}

// ------------------------------------------------------------ auth

const password = () => process.env.APPS_PASSWORD || process.env.TAILOR_PASSWORD || '';

function sign(exp) {
  return crypto.createHmac('sha256', process.env.APPS_SECRET).update(`apps:${exp}`).digest('base64url');
}

function authed(req) {
  const raw = String(req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  if (!raw) return false;
  const [exp, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function checkPassword(given) {
  const want = password();
  if (!want) return false;
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();

// ------------------------------------------------------------ responses

function html(res, status, body, headers = {}) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(body);
}

function redirect(res, cookie) {
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.setHeader('Location', '/applications');
  res.setHeader('Cache-Control', 'no-store');
  res.status(303).send('');
}

// ------------------------------------------------------------ handler

module.exports = async (req, res) => {
  if (!process.env.APPS_SECRET) return html(res, 500, loginPage('APPS_SECRET is not set in Vercel.'));
  if (!password()) return html(res, 500, loginPage('Set APPS_PASSWORD (or TAILOR_PASSWORD) in Vercel.'));
  if (!store.configured()) return html(res, 500, loginPage('Storage (Upstash) is not connected.'));

  let body = req.body || {};
  if (typeof body === 'string') body = Object.fromEntries(new URLSearchParams(body));

  if (req.method === 'POST' && body.action === 'login') {
    const failKey = `apps:fail:${crypto.createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 16)}`;
    const fails = Number(await store.command(['GET', failKey])) || 0;
    if (fails >= FAIL_LIMIT) return html(res, 429, loginPage('Too many wrong passwords. Try again in an hour.'));
    if (!checkPassword(body.password)) {
      const n = Number(await store.command(['INCR', failKey]));
      if (n === 1) await store.command(['EXPIRE', failKey, 3600]);
      return html(res, 401, loginPage('Wrong password.'));
    }
    const exp = Date.now() + COOKIE_DAYS * 86400e3;
    return redirect(res, `${COOKIE}=${exp}.${sign(exp)}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`);
  }

  if (!authed(req)) return html(res, req.method === 'GET' ? 200 : 401, loginPage());

  if (req.method === 'POST' && body.action === 'logout') {
    return redirect(res, `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
  }

  if (req.method === 'POST' && body.action === 'override') {
    const id = String(body.id || '').slice(0, 200);
    const status = String(body.status || '');
    if (id && status === 'auto') await store.command(['HDEL', 'apps:overrides', id]);
    else if (id && (STATUSES.includes(status) || status === 'hidden')) await store.command(['HSET', 'apps:overrides', id, status]);
    return redirect(res);
  }

  // GET: render
  const ghostDays = Number(process.env.APPS_GHOST_DAYS) || 30;
  const [eventsRaw, metaRaw, ovFlat] = await Promise.all([
    store.command(['GET', 'apps:events']),
    store.command(['GET', 'apps:meta']),
    store.command(['HGETALL', 'apps:overrides']),
  ]);
  const events = eventsRaw ? JSON.parse(eventsRaw) : [];
  const meta = metaRaw ? JSON.parse(metaRaw) : null;
  const overrides = {};
  for (let i = 0; Array.isArray(ovFlat) && i < ovFlat.length; i += 2) overrides[ovFlat[i]] = ovFlat[i + 1];

  const all = buildApplications(events, new Date(), ghostDays).map((a) => {
    const o = overrides[a.id];
    return o ? { ...a, status: o === 'hidden' ? a.status : o, override: o, overridden: true } : a;
  });
  const visible = all.filter((a) => a.override !== 'hidden');
  const hidden = all.filter((a) => a.override === 'hidden');

  return html(res, 200, trackerPage(visible, meta, ghostDays, hidden));
};
