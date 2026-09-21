'use strict';

/**
 * Turns a job URL into { title, company, location, text, source }.
 *
 * The big applicant-tracking systems all expose public JSON for their postings,
 * which is far more reliable than scraping HTML, so those are handled first.
 * Anything else falls back to schema.org JobPosting data (which most career
 * sites embed for Google Jobs), then to plain page text.
 *
 * LinkedIn/Indeed hide postings behind logins and bot walls; they fail with a
 * message that tells the user what to paste instead.
 */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const MIN_TEXT = 400;
const MAX_TEXT = 16000;

class JobError extends Error {}

async function get(url, { json = false, method = 'GET', body, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      method,
      body,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: json ? 'application/json' : 'text/html,application/xhtml+xml,*/*;q=0.8',
        'Accept-Language': 'en-CA,en;q=0.9',
        ...headers,
      },
    });
    if (!r.ok) throw new JobError(`The site returned ${r.status} for that link.`);
    return json ? r.json() : r.text();
  } catch (e) {
    if (e instanceof JobError) throw e;
    if (e.name === 'AbortError') throw new JobError('The job site took too long to respond.');
    throw new JobError(`Couldn't reach that site (${e.message}).`);
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------ html -> text

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', hellip: '…' };

function decode(s) {
  return String(s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function htmlToText(html) {
  return decode(String(html || '')
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|ul|ol)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const clip = (s) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n[...truncated]` : s);

function result(source, { title, company, location, text }) {
  const t = String(text || '').trim();
  if (t.length < MIN_TEXT) {
    throw new JobError('Found the page, but not enough of a job description on it to tailor to.');
  }
  return {
    source,
    title: (title || '').trim(),
    company: (company || '').trim(),
    location: (location || '').trim(),
    text: clip(t),
  };
}

const titleCase = (slug) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// ------------------------------------------------------------ ATS handlers

async function greenhouse(u) {
  // boards.greenhouse.io/<co>/jobs/<id>, job-boards.greenhouse.io/<co>/jobs/<id>,
  // or a company site with ?gh_jid=<id>&... (needs the board token, so try the path too)
  const m = u.pathname.match(/^\/(?:embed\/job_app\?for=)?([^/]+)\/jobs\/(\d+)/);
  const board = m ? m[1] : u.searchParams.get('for');
  const id = m ? m[2] : u.searchParams.get('token') || u.searchParams.get('gh_jid');
  if (!board || !id) return null;
  const j = await get(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`, { json: true });
  return result('Greenhouse', {
    title: j.title,
    company: j.company_name || titleCase(board),
    location: j.location && j.location.name,
    text: htmlToText(decode(j.content)),
  });
}

async function lever(u) {
  const [, co, id] = u.pathname.split('/');
  if (!co || !id) return null;
  const host = u.hostname.endsWith('.eu.lever.co') ? 'api.eu.lever.co' : 'api.lever.co';
  const j = await get(`https://${host}/v0/postings/${co}/${id}`, { json: true });
  const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n\n');
  return result('Lever', {
    title: j.text,
    company: titleCase(co),
    location: j.categories && j.categories.location,
    text: [j.descriptionPlain || htmlToText(j.description), lists, j.additionalPlain || htmlToText(j.additional)].filter(Boolean).join('\n\n'),
  });
}

async function ashby(u) {
  const [, org, id] = u.pathname.split('/');
  if (!org || !id) return null;
  const board = await get(`https://api.ashbyhq.com/posting-api/job-board/${org}?includeCompensation=true`, { json: true });
  const j = (board.jobs || []).find((x) => x.id === id || (x.jobUrl || '').includes(id));
  if (!j) throw new JobError('That Ashby posting is no longer listed - it may have closed.');
  return result('Ashby', {
    title: j.title,
    company: titleCase(org),
    location: j.location,
    text: j.descriptionPlain || htmlToText(j.descriptionHtml),
  });
}

async function workday(u) {
  // <tenant>.wd<N>.myworkdayjobs.com/<locale?>/<site>/job/<location>/<slug>_<req>
  const tenant = u.hostname.split('.')[0];
  const parts = u.pathname.split('/').filter(Boolean);
  const jobIdx = parts.indexOf('job');
  if (jobIdx < 1) return null;
  const site = parts[jobIdx - 1];
  const rest = parts.slice(jobIdx).join('/');
  const j = await get(`https://${u.hostname}/wday/cxs/${tenant}/${site}/${rest}`, { json: true });
  const info = j.jobPostingInfo || {};
  return result('Workday', {
    title: info.title,
    company: (j.hiringOrganization && j.hiringOrganization.name) || titleCase(tenant),
    location: info.location,
    text: htmlToText(info.jobDescription),
  });
}

async function smartrecruiters(u) {
  // jobs.smartrecruiters.com/<Company>/<id>-<slug>
  const [, co, idSlug] = u.pathname.split('/');
  const id = idSlug && idSlug.split('-')[0];
  if (!co || !id) return null;
  const j = await get(`https://api.smartrecruiters.com/v1/companies/${co}/postings/${id}`, { json: true });
  const sec = (j.jobAd && j.jobAd.sections) || {};
  return result('SmartRecruiters', {
    title: j.name,
    company: (j.company && j.company.name) || co,
    location: j.location && [j.location.city, j.location.region].filter(Boolean).join(', '),
    text: ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']
      .map((k) => sec[k] && `${sec[k].title}\n${htmlToText(sec[k].text)}`).filter(Boolean).join('\n\n'),
  });
}

// ------------------------------------------------------------ generic

function findJobPosting(node) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) { for (const n of node) { const f = findJobPosting(n); if (f) return f; } return null; }
  const t = node['@type'];
  if (t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'))) return node;
  if (node['@graph']) return findJobPosting(node['@graph']);
  return null;
}

async function generic(u) {
  const html = await get(u.toString());

  // schema.org JobPosting - what career sites publish for Google Jobs.
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const jp = findJobPosting(data);
    if (jp && jp.description) {
      const org = jp.hiringOrganization;
      const loc = jp.jobLocation && (Array.isArray(jp.jobLocation) ? jp.jobLocation[0] : jp.jobLocation);
      const addr = loc && loc.address;
      return result('Job page', {
        title: jp.title,
        company: (org && (org.name || org)) || '',
        location: addr && [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', '),
        text: htmlToText(decode(jp.description)),
      });
    }
  }

  // Last resort: the page's visible text.
  const ogTitle = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || [])[1];
  const siteName = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) || [])[1];
  const title = ogTitle || (html.match(/<title[^>]*>([^<]+)/i) || [])[1] || '';
  return result('Job page', { title: decode(title), company: decode(siteName || ''), text: htmlToText(html) });
}

// ------------------------------------------------------------ entry

async function fetchJob(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { throw new JobError("That doesn't look like a link."); }
  if (!/^https?:$/.test(u.protocol)) throw new JobError('Link must start with http:// or https://');

  const host = u.hostname.toLowerCase();

  if (/(^|\.)linkedin\.com$/.test(host)) {
    throw new JobError('LinkedIn blocks automated reading. Open the posting, click "Apply" (or "Apply on company website") and paste that link instead.');
  }
  if (/(^|\.)indeed\.(com|ca)$/.test(host) || /(^|\.)glassdoor\./.test(host)) {
    throw new JobError(`${host.includes('indeed') ? 'Indeed' : 'Glassdoor'} blocks automated reading. Paste the company's own careers-page link for this job instead.`);
  }

  let job = null;
  if (/greenhouse\.io$/.test(host) || u.searchParams.has('gh_jid')) job = await greenhouse(u).catch((e) => { if (u.searchParams.has('gh_jid')) return null; throw e; });
  else if (/(^|\.)lever\.co$/.test(host)) job = await lever(u);
  else if (host === 'jobs.ashbyhq.com') job = await ashby(u);
  else if (/\.myworkdayjobs\.com$/.test(host)) job = await workday(u);
  else if (host === 'jobs.smartrecruiters.com') job = await smartrecruiters(u);

  return job || generic(u);
}

module.exports = { fetchJob, JobError, htmlToText };
