'use strict';

/**
 * Rules-only job-application email classifier.
 *
 * classifyMessage(msg)  -> one email -> { type, company, role } or null
 * buildApplications(msgs, now, ghostDays) -> grouped applications with status
 *
 * No AI: everything here is keyword and sender patterns. When it misreads a
 * company's email, add a pattern here and push - the Apps Script in Gmail
 * never needs to change.
 */

// ------------------------------------------------------------ vocab

// Order matters: first match wins. Offer beats rejection beats interview...
// because rejection mails often *also* say "thank you for applying".
const TYPES = [
  ['offer', [
    /\bpleased to (?:extend|offer)\b/i, /\bextend(?:ing)? (?:you )?an offer\b/i, /\boffer letter\b/i,
    /\boffer of employment\b/i, /\bverbal offer\b/i, /\bcongratulations[^.]{0,80}\boffer\b/i,
  ]],
  ['rejected', [
    /\bunfortunately\b/i, /\bnot (?:be )?(?:moving|move) forward\b/i, /\bwill not be (?:moving|proceeding|progressing)\b/i,
    /\b(?:decided|chosen|elected) to (?:move|proceed|go) forward with (?:other|another|different)\b/i,
    /\bpursue other candidates\b/i, /\bother candidates (?:whose|who)\b/i, /\bno longer (?:under consideration|being considered)\b/i,
    /\bposition has (?:been|now been) filled\b/i, /\bregret to inform\b/i, /\bnot (?:been )?selected\b/i,
    /\bdecided not to (?:proceed|move|advance|progress)\b/i, /\bnot to (?:proceed|move forward)\b/i,
    /\bwon'?t be (?:moving|proceeding)\b/i, /\bnot able to offer you\b/i, /\bunable to offer you\b/i,
    /\bnot (?:a|the right) (?:match|fit) (?:at this time|for this role)\b/i, /\bclosed (?:this|the) (?:position|role|requisition)\b/i,
  ]],
  ['interview', [
    /\b(?:schedule|book|set up|arrange) (?:an? |your |the )?(?:\w+ )?(?:interview|call|chat|conversation|screen)\b/i,
    /\binvite you to (?:an? )?(?:\w+ )?(?:interview|call|chat)\b/i, /\binterview (?:invitation|invite|request|confirmation)\b/i,
    /\b(?:phone|recruiter|technical|virtual|onsite|on-site|final) (?:screen|interview)\b/i,
    /\bnext (?:step|round)s? (?:in|of) (?:our|the) (?:interview|hiring|recruiting) process\b/i,
    /\b(?:like|love|excited) to (?:move forward|proceed|advance) with your (?:application|candidacy)\b/i,
    /\bshare (?:your|some) availability\b/i, /\bcalendly\.com\b/i, /\bgoodtime\.io\b/i,
  ]],
  ['assessment', [
    /\bhackerrank\b/i, /\bcodesignal\b/i, /\bcodility\b/i, /\bhirevue\b/i, /\bkarat\b/i, /\bcoderpad\b/i,
    /\b(?:online|coding|technical|skills?) (?:assessment|challenge|test)\b/i, /\btake[- ]home\b/i,
  ]],
  ['applied', [
    /\bthank(?:s| you) for (?:your )?appl(?:ying|ication)\b/i, /\bapplication (?:has been |was )?(?:received|submitted|sent)\b/i,
    /\b(?:we(?:'ve| have)?|have) received your application\b/i, /\breceived your (?:job )?application\b/i,
    /\byour application (?:was sent|has been sent) to\b/i, /\bthank you for your interest in\b/i,
    /\bconfirm(?:ing)? (?:that )?we(?:'ve| have) received\b/i, /\bapplication confirmation\b/i,
  ]],
];

// A message must look like it's about a job, not a credit card or an apartment.
const JOB_CONTEXT = /\b(?:position|role|job|candida(?:te|cy)|recruit(?:er|ing|ment)?|hiring|interview|career|talent|opportunit(?:y|ies)|internship|new grad|engineer|developer|requisition)\b/i;

// Newsletters and alerts that talk about jobs but aren't about *your* application.
const NOISE = [
  /\bjob alert\b/i, /\bjobs? (?:you may|you might|for you|recommended)\b/i, /\bnew jobs?\b/i, /\brecommended jobs?\b/i,
  /\bjobs? matching\b/i, /\bsimilar jobs\b/i, /\bis hiring\b/i, /\bapply now\b/i, /\bweekly digest\b/i,
  /\bunsubscribe from (?:job|these) alerts\b/i, /\bcomplete your (?:profile|application)\b(?![^.]*\bthank)/i,
  /\bhas viewed your (?:profile)\b/i, /\bwebinar\b/i,
];

// Sender domains that are job platforms, not the employer.
const ATS_DOMAINS = [
  'greenhouse.io', 'greenhouse-mail.io', 'lever.co', 'hire.lever.co', 'myworkday.com', 'myworkdayjobs.com', 'workday.com',
  'ashbyhq.com', 'smartrecruiters.com', 'icims.com', 'talent.icims.com', 'jobvite.com', 'taleo.net', 'successfactors.com',
  'successfactors.eu', 'workablemail.com', 'workable.com', 'rippling.com', 'bamboohr.com', 'jazzhr.com', 'applytojob.com',
  'recruitee.com', 'teamtailor.com', 'breezy.hr', 'dover.com', 'gem.com', 'paradox.ai', 'oraclecloud.com', 'eightfold.ai',
  'phenom.com', 'avature.net', 'pinpointhq.com', 'wellfound.com', 'angel.co', 'ycombinator.com', 'workatastartup.com',
  'linkedin.com', 'indeed.com', 'indeedemail.com', 'glassdoor.com', 'ziprecruiter.com', 'handshake.com', 'joinhandshake.com',
  'hackerrank.com', 'hackerrankforwork.com', 'codesignal.com', 'hirevue.com', 'karat.io', 'goodtime.io', 'calendly.com',
];
const FREEMAIL = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'proton.me', 'protonmail.com'];

// Words to strip from a sender display name to get the company: "Stripe Recruiting" -> "Stripe".
const NAME_NOISE = /\b(?:recruiting|recruitment|recruiter|careers?|talent(?: acquisition)?(?: team)?|hiring(?: team)?|jobs?|hr|people(?: team| ops)?|university(?: recruiting)?|campus(?: recruiting)?|team|notifications?|no-?reply|do-?not-?reply|via [\w .]+|applications?|the)\b/gi;
const GENERIC_NAMES = /^(?:greenhouse|lever|workday|ashby|smartrecruiters|icims|jobvite|taleo|workable|rippling|linkedin|indeed|glassdoor|handshake|hackerrank|codesignal|hirevue|noreply|no reply|donotreply|do not reply|notifications?|careers?|recruiting|talent|hiring|jobs?|mail|info|support|admin)?$/i;

// ------------------------------------------------------------ helpers

function parseFrom(from) {
  const s = String(from || '');
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : s).trim().toLowerCase();
  const name = (m ? m[1] : '').trim();
  const domain = (email.split('@')[1] || '').replace(/^mail\.|^email\.|^e\.|^em\.|^info\./, '');
  return { name, email, domain, local: email.split('@')[0] || '' };
}

const endsWithAny = (domain, list) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

function cleanCompany(raw) {
  if (!raw) return '';
  let c = String(raw)
    .replace(/[’']s\b(?= (?:team|recruiting|careers))/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”:,-]+|[\s"'“”!.,:;)(-]+$/g, '')
    .replace(/^the\s+/i, '')
    .replace(/\s+(?:team|family|careers?|recruiting)$/i, '')
    .trim();
  // Cut at phrases that usually follow the name.
  c = c.split(/\s+(?:and|for|as|we|our|is|has|was|who|to|about|today|recently|through|via|on|in the|position|role|job|team\b)\s+/i)[0];
  c = c.replace(/[!.,:;]+$/, '').trim();
  if (c.length < 2 || c.length > 40) return '';
  if (/^(?:us|you|your|this|the|a|an|our|we|it|them|joining|working|interest|applying|hi|hello|dear)$/i.test(c)) return '';
  if (GENERIC_NAMES.test(c)) return '';
  if (/^[a-z]/.test(c) && !/[A-Z]/.test(c)) c = c.replace(/\b\w/g, (x) => x.toUpperCase()); // "okta" -> "Okta"
  return c;
}

const companyKey = (c) => String(c || '').toLowerCase()
  .replace(/\b(?:inc|llc|ltd|limited|corp|corporation|co|plc|gmbh|technologies|technology|labs|group|holdings|canada|usa)\b\.?/g, '')
  .replace(/[^a-z0-9]/g, '');

function cleanRole(raw) {
  if (!raw) return '';
  let r = String(raw).replace(/\s+/g, ' ')
    .replace(/^[\s"'“”:,-]+|[\s"'“”!.,:;-]+$/g, '')
    .replace(/^(?:the|our|a|an)\s+/i, '')
    .replace(/\s*\(\s*(?:req(?:uisition)?|job(?: id)?|id)?\s*#?\s*[A-Z]{0,4}[-_]?\d+[\w-]*\s*\)\s*$/i, '') // "(R2)", "(Req #1234)"
    .replace(/\s*[-–]\s*(?:req(?:uisition)?\s*#?|job id|id)?\s*[A-Z]{0,4}[-_]?\d{3,}[\w-]*\s*$/i, '')    // "- R12345"
    .replace(/\s+(?:position|role|opening|job)$/i, '')
    .trim();
  // "Fortinet and the Security Analyst Intern" -> the part after "and the" is the role.
  const andThe = r.split(/\s+and the\s+/i);
  if (andThe.length > 1) r = andThe[andThe.length - 1];
  r = r.split(/\s+(?:and|which|that|we|will|so|has|is|at|with|here)\s+/i)[0].replace(/\s+(?:position|role|opening|job)$/i, '').trim();
  if (r.length < 3 || r.length > 90) return '';
  if (!/[a-z]/i.test(r)) return '';
  if (/^(?:us|you|this|it|them|position|role|job|opportunity|application)$/i.test(r)) return '';
  return r;
}

const roleKey = (r) => String(r || '').toLowerCase().replace(/\b(?:sr|senior|jr|junior|i|ii|iii|intern(?:ship)?|new grad(?:uate)?|20\d\d)\b/g, '').replace(/[^a-z0-9]/g, '');

// ------------------------------------------------------------ extraction

// Tried in order against "subject \n body". Group 1 = company.
const COMPANY_PATTERNS = [
  /your application (?:was|has been) sent to ([^\n.!,]{2,50})/i,
  /application (?:has been |was )?(?:submitted|delivered) to ([^\n.!,]{2,50}?)(?:[!.,\n]| for | -|$)/i,
  /thank(?:s| you) for (?:your )?appl(?:ying|ication) (?:to|at|with) ([^\n.!,]{2,50}?)(?:[!.,\n]| for | -|$)/i,
  /thank(?:s| you) for (?:your )?appl(?:ying|ication) for [^\n]{3,90}? (?:at|with) ([^\n.!,]{2,50}?)(?:[!.,\n]| -|$)/i,
  /thank(?:s| you) for (?:your )?interest in (?:joining |working (?:at|with) |a (?:career|role|position) (?:at|with) )?([^\n.!,]{2,50}?)(?:[!.,\n]| and | -| as |$)/i,
  /your (?:recent )?application (?:to|with|at) ([^\n.!,]{2,50}?)(?:[!.,\n]| for | -|$)/i,
  /(?:position|role|opportunity|opening) (?:at|with) ([^\n.!,]{2,50}?)(?:[!.,\n]| and | -| has |$)/i,
  /application (?:to|with|at) ([^\n.!,]{2,50}?)(?:[!.,\n]| for | -|$)/i,
  /(?:team|recruiting team|hiring team|talent team) at ([^\n.!,]{2,40})/i,
  /interest in ([A-Z][^\n.!,]{1,40}?)(?:[!.,\n]| and | -|$)/,
];

// Group 1 = role.
const R = '([^\\n.!?;]{3,90}?)'; // a role never crosses a sentence end
const ROLE_PATTERNS = [
  new RegExp(`appl(?:ying|ication|ied) for (?:the |our )?(?:position of )?${R} (?:position |role |opening )?(?:at|with) `, 'gi'),
  new RegExp(`appl(?:ying|ication|ied) (?:for|to) (?:the|our) ${R} (?:position|role|opening)\\b`, 'gi'),
  // Skip "for applying..." / "for your..." so the engine moves on to the real "for the X role".
  new RegExp(`(?:for|in) (?:the |our )?(?!appl|your\\b|us\\b|this\\b)${R} (?:position|role|opening)\\b`, 'gi'),
  new RegExp(`appl(?:ying|ication|ied) for (?:the |our )?(?:position of )?${R}(?: position| role| opening)?(?:[.!\\n]|$| and | at | with )`, 'gi'),
  new RegExp(`(?:position|role|job title|requisition)\\s*:\\s*${R}(?:[.!\\n]|$)`, 'gi'),
  new RegExp(`application (?:received|submitted|confirmation)\\s*[-–:|]\\s*${R}(?:[.!\\n]|$)`, 'gi'),
  new RegExp(`received your application for (?:the |our )?${R}(?: position| role)?(?: and |[.!\\n]|$)`, 'gi'),
];

function extractCompany(subject, body, from) {
  const text = `${subject}\n${body}`;
  for (const re of COMPANY_PATTERNS) {
    const m = text.match(re);
    const c = m && cleanCompany(m[1]);
    if (c) return c;
  }
  const f = parseFrom(from);
  const brand = (f.domain.split('.').slice(-2)[0] || '').replace(/-mail$|mail$|forwork$/, '');
  let fromName = cleanCompany(String(f.name).replace(NAME_NOISE, ' ').replace(/[@|•·]/g, ' '));
  if (fromName && endsWithAny(f.domain, ATS_DOMAINS) && brand && fromName.toLowerCase().replace(/\s+/g, '').includes(brand)) fromName = '';
  if (fromName) return fromName;
  if (f.domain && !endsWithAny(f.domain, ATS_DOMAINS) && !endsWithAny(f.domain, FREEMAIL)) {
    return cleanCompany(f.domain.split('.').slice(-2)[0]);
  }
  // Workday / iCIMS style: the tenant is the local part (okta@myworkday.com).
  if (/myworkday|icims|taleo|successfactors/.test(f.domain) && !/no-?reply|donotreply|notification/.test(f.local)) {
    return cleanCompany(f.local.replace(/[._-]+/g, ' '));
  }
  return '';
}

function extractRole(subject, body) {
  for (const src of [subject, body]) {
    for (const re of ROLE_PATTERNS) {
      for (const m of String(src).matchAll(re)) {
        const r = cleanRole(m[1]);
        if (r && !/thank|application|interest|appl(?:y|ying|ied)\b|unfortunately|candidates/i.test(r)) return r;
      }
    }
  }
  return '';
}

// ------------------------------------------------------------ classify

/**
 * @param {{id,threadId,date,from,subject,body}} msg
 * @returns {{id,threadId,date,type,company,role,subject}|null}
 */
function classifyMessage(msg) {
  const subject = String(msg.subject || '');
  const body = String(msg.body || '').slice(0, 6000);
  const text = `${subject}\n${body}`;

  if (NOISE.some((re) => re.test(subject)) || (NOISE.some((re) => re.test(text)) && !/\byour application\b/i.test(text))) return null;
  const sender = parseFrom(msg.from);
  const fromAts = endsWithAny(sender.domain, ATS_DOMAINS);
  // Real rejections often never say "position" or "role" - but they come from a hiring platform.
  if (!JOB_CONTEXT.test(text) && !(fromAts && /\bapplication\b/i.test(text))) return null;

  let type = null;
  for (const [t, patterns] of TYPES) {
    if (patterns.some((re) => re.test(text))) { type = t; break; }
  }
  if (!type) return null;

  // "Unfortunately" alone is too weak in a confirmation that also says "unfortunately
  // we can't reply to everyone". Require the rejection to not be a plain confirmation line.
  if (type === 'rejected' && /\bunfortunately,? (?:due to|because of) (?:the )?(?:high |large )?volume\b/i.test(text)
      && !TYPES[1][1].slice(1).some((re) => re.test(text))) {
    type = 'applied';
  }

  const company = extractCompany(subject, body, msg.from);
  if (!company) return null; // can't file it anywhere useful

  return {
    id: msg.id,
    threadId: msg.threadId,
    date: new Date(msg.date).toISOString(),
    type,
    company,
    role: extractRole(subject, body),
    subject: subject.slice(0, 140),
  };
}

// ------------------------------------------------------------ grouping + status

const RANK = { applied: 1, assessment: 2, interview: 3, rejected: 4, offer: 5 };
const TERMINAL = new Set(['rejected', 'offer']);

function sameRole(a, b) {
  const x = roleKey(a); const y = roleKey(b);
  return x && y && (x === y || x.includes(y) || y.includes(x));
}

/**
 * Group classified events into applications and decide each one's status.
 * An application is ghosted when it's still open and nothing has arrived
 * for `ghostDays` since the last real update.
 */
function buildApplications(events, now = new Date(), ghostDays = 30) {
  const byCompany = new Map();
  const sorted = [...events].filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));

  for (const ev of sorted) {
    const ck = companyKey(ev.company);
    if (!ck) continue;
    if (!byCompany.has(ck)) byCompany.set(ck, { company: ev.company, apps: [] });
    const group = byCompany.get(ck);
    // Prefer the shortest clean spelling for display ("Stripe" over "Stripe Inc").
    if (ev.company.length < group.company.length) group.company = ev.company;

    let app = null;
    if (ev.role) app = group.apps.find((a) => a.roles.some((r) => sameRole(r, ev.role)));
    if (!app && ev.type !== 'applied') {
      // A reply with no role goes to the most recent still-open application.
      const open = group.apps.filter((a) => !TERMINAL.has(a.stage));
      app = open[open.length - 1] || group.apps[group.apps.length - 1] || null;
    }
    if (!app && ev.type === 'applied') {
      // Two confirmations within a few days (e.g. LinkedIn + the company's ATS) are one
      // application - unless both name a role and the roles differ.
      app = group.apps.find((a) => Math.abs(new Date(ev.date) - new Date(a.appliedAt)) < 3 * 86400e3
        && (!ev.role || !a.roles.length)) || null;
    }
    if (!app) {
      app = { roles: [], events: [], appliedAt: ev.date, stage: 'applied' };
      group.apps.push(app);
    }
    if (ev.role && !app.roles.some((r) => sameRole(r, ev.role))) app.roles.push(ev.role);
    if (!app.events.some((e) => e.id === ev.id)) app.events.push(ev);
    if (RANK[ev.type] >= RANK[app.stage] || !TERMINAL.has(app.stage)) {
      // Later events move the stage forward; a terminal stage only yields to offer.
      if (!TERMINAL.has(app.stage) || ev.type === 'offer') app.stage = ev.type;
    }
  }

  const out = [];
  for (const [ck, g] of byCompany) {
    for (const a of g.apps) {
      const last = a.events[a.events.length - 1];
      const lastAt = new Date(last.date);
      const days = Math.floor((now - lastAt) / 86400e3);
      let status = a.stage;
      if (!TERMINAL.has(a.stage) && days >= ghostDays) status = 'ghosted';
      const role = a.roles[0] || '';
      out.push({
        id: `${ck}:${roleKey(role) || new Date(a.appliedAt).toISOString().slice(0, 10)}`,
        company: g.company,
        role,
        status,
        stage: a.stage,
        appliedAt: a.appliedAt,
        lastAt: last.date,
        daysSince: days,
        ghostIn: TERMINAL.has(a.stage) || status === 'ghosted' ? null : Math.max(0, ghostDays - days),
        events: a.events.map((e) => ({ date: e.date, type: e.type, subject: e.subject })),
      });
    }
  }
  return out.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

module.exports = {
  classifyMessage, buildApplications, extractCompany, extractRole, cleanCompany, companyKey, parseFrom,
};
