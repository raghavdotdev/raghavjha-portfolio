'use strict';

/**
 * /tailor - paste a job link, get a tailored resume + cover letter as PDFs.
 *
 *   GET  -> the form
 *   POST -> fetch posting -> Gemini -> validate -> render PDFs -> store 24h -> result page
 *
 * Env:
 *   TAILOR_PASSWORD     required - the page's password
 *   GEMINI_API_KEY      required
 *   GEMINI_MODEL        optional, default gemini-3.8-flash
 *   RESUME_CONTACT      optional, e.g. "Toronto, ON • +1 (647) ... • you@mail.com"
 *   TAILOR_DAILY_LIMIT  optional, default 30 generations/day
 */

const crypto = require('crypto');
const store = require('./_store');
const master = require('./_resume');
const { fetchJob, JobError } = require('./_job');
const { tailor, GeminiError } = require('./_gemini');
const { mergeResume, checkCoverLetter } = require('./_validate');
const { renderResume, renderCoverLetter } = require('./_pdf');

const DOC_TTL = 24 * 3600;
const FAIL_LIMIT = 8;         // wrong passwords per IP per hour

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
<script src="/assets/tailor.js" defer></script>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

function formPage({ error = '', url = '' } = {}) {
  return page('Tailor', `  <h1>Tailor</h1>
  <p class="sub">Paste a job link. Get a tailored resume and cover letter.</p>
${error ? `  <p class="error" role="alert">${esc(error)}</p>\n` : ''}  <form method="post" action="/tailor" id="tailor-form">
    <label for="url">Job link</label>
    <input id="url" name="url" type="url" required autofocus placeholder="https://boards.greenhouse.io/…" value="${esc(url)}">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required autocomplete="current-password">
    <button type="submit" id="go">Tailor</button>
    <p class="status" id="status" aria-live="polite"></p>
  </form>
  <p class="hint">Works with Greenhouse, Lever, Ashby, Workday, SmartRecruiters and most company career pages. For LinkedIn or Indeed, use the "Apply on company site" link.</p>`);
}

function diffList(original, tailored) {
  const origText = new Map();
  for (const x of [...original.experience, ...original.projects]) for (const b of x.bullets) origText.set(b.id, b.text);
  const rows = [];
  for (const x of [...tailored.experience, ...tailored.projects]) {
    for (const b of x.bullets) {
      const o = origText.get(b.id);
      if (o && o !== b.text) rows.push(`      <li><del>${esc(o)}</del><ins>${esc(b.text)}</ins></li>`);
    }
  }
  return rows;
}

function resultPage({ id, role, company, notes, warnings, changes, fits, model }) {
  const w = [...warnings];
  if (!fits) w.unshift('The resume ran slightly past one page even at the smallest size. Open it and check the bottom.');
  return page(`Tailored - ${company || 'job'}`, `  <h1>Ready</h1>
  <p class="sub">${esc(role || 'Role')}${company ? ` at ${esc(company)}` : ''}</p>
  <div class="downloads">
    <a class="btn" href="/tailor/dl/${id}/resume">Resume PDF</a>
    <a class="btn secondary" href="/tailor/dl/${id}/cover">Cover letter PDF</a>
  </div>
  <p class="fine">Links expire in 24 hours.${model ? ` Written by ${esc(model)}.` : ''}</p>
${notes ? `  <section>\n    <h2>What it emphasized</h2>\n    <p>${esc(notes)}</p>\n  </section>\n` : ''}${w.length ? `  <section class="warn">\n    <h2>Check before sending</h2>\n    <ul>\n${w.map((x) => `      <li>${esc(x)}</li>`).join('\n')}\n    </ul>\n  </section>\n` : ''}  <section>
    <details>
      <summary>${changes.length ? `${changes.length} bullet${changes.length === 1 ? '' : 's'} reworded` : 'No bullets reworded - only reordered'}</summary>
${changes.length ? `      <ul class="diff">\n${changes.join('\n')}\n      </ul>` : ''}
    </details>
  </section>
  <p><a href="/tailor">Tailor another</a></p>`);
}

// ------------------------------------------------------------ helpers

function checkPassword(given) {
  const want = process.env.TAILOR_PASSWORD || '';
  if (!want) return false;
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();

async function incrWithTtl(key, ttl) {
  const n = Number(await store.command(['INCR', key]));
  if (n === 1) await store.command(['EXPIRE', key, ttl]);
  return n;
}

function contactLine() {
  const raw = process.env.RESUME_CONTACT || master.defaultContact;
  return raw.split(/\s*[•|·]\s*/).filter(Boolean).join('  •  ');
}

const torontoDate = () => new Date().toLocaleDateString('en-US', { timeZone: 'America/Toronto', month: 'long', day: 'numeric', year: 'numeric' });

const fileSlug = (s) => String(s || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

function send(res, status, html) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(html);
}

// ------------------------------------------------------------ handler

module.exports = async (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') return send(res, 200, formPage());
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, formPage({ error: 'Method not allowed.' })); }

  let body = req.body || {};
  if (typeof body === 'string') body = Object.fromEntries(new URLSearchParams(body));
  const url = String(body.url || '').trim();

  if (!process.env.TAILOR_PASSWORD) return send(res, 500, formPage({ url, error: 'TAILOR_PASSWORD is not set in Vercel.' }));
  if (!store.configured()) return send(res, 500, formPage({ url, error: 'Storage (Upstash) is not connected to this project.' }));

  // --- auth, with a per-IP lockout
  const ip = clientIp(req);
  const failKey = `tailor:fail:${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`;
  try {
    const fails = Number(await store.command(['GET', failKey])) || 0;
    if (fails >= FAIL_LIMIT) return send(res, 429, formPage({ url, error: 'Too many wrong passwords. Try again in an hour.' }));
    if (!checkPassword(body.password)) {
      await incrWithTtl(failKey, 3600);
      return send(res, 401, formPage({ url, error: 'Wrong password.' }));
    }
  } catch (e) {
    return send(res, 500, formPage({ url, error: `Storage error: ${e.message}` }));
  }

  // --- daily cap protects the free-tier quota
  const limit = Number(process.env.TAILOR_DAILY_LIMIT) || 30;
  const day = new Date().toISOString().slice(0, 10);
  const used = await incrWithTtl(`tailor:day:${day}`, 2 * 86400).catch(() => 0);
  if (used > limit) return send(res, 429, formPage({ url, error: `Daily limit of ${limit} reached. Resets at midnight UTC.` }));

  try {
    const job = await fetchJob(url);
    const out = await tailor(master, job, {
      key: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    });

    const company = String(out.company || job.company || '').trim();
    const role = String(out.role || job.title || '').trim();

    const { resume, warnings } = mergeResume(master, out);
    const cl = checkCoverLetter(master, out.coverLetter, job.text, company);
    if (!cl.ok) throw new GeminiError(cl.warnings[0]);
    warnings.push(...cl.warnings);

    const contact = contactLine();
    const [rPdf, cPdf] = await Promise.all([
      renderResume(resume, contact),
      renderCoverLetter({
        name: master.name, signOff: master.signOff, contact, date: torontoDate(),
        company, role, ...cl.letter,
      }),
    ]);
    if (!cPdf.fits) warnings.push('The cover letter ran past one page; it was cut off at the bottom. Try again for a shorter one.');

    const id = crypto.randomBytes(16).toString('hex');
    const slug = fileSlug(company);
    await store.command(['SET', `tailor:doc:${id}`, JSON.stringify({
      r: Buffer.from(rPdf.bytes).toString('base64'),
      c: Buffer.from(cPdf.bytes).toString('base64'),
      rn: `Raghav_Jha_Resume${slug ? `_${slug}` : ''}.pdf`,
      cn: `Raghav_Jha_Cover_Letter${slug ? `_${slug}` : ''}.pdf`,
    }), 'EX', DOC_TTL]);

    return send(res, 200, resultPage({
      id, role, company,
      notes: String(out.notes || '').trim(),
      warnings,
      changes: diffList(master, resume),
      fits: rPdf.fits,
      model: out.model,
    }));
  } catch (e) {
    const known = e instanceof JobError || e instanceof GeminiError;
    if (!known) console.error('tailor failed', e);
    return send(res, known ? 422 : 500, formPage({ url, error: known ? e.message : `Something broke: ${e.message}` }));
  }
};
