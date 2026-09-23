'use strict';

/**
 * One Gemini call: master resume + job posting in, tailored selections +
 * cover letter out (structured JSON). Contact details are never sent.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

class GeminiError extends Error {}

const SYSTEM = `You tailor Raghav Jha's resume and write his cover letter for one specific job posting.
You receive MASTER_RESUME (JSON) and JOB_POSTING (text).

ABSOLUTE RULES - breaking any of these makes the output unusable:
1. Truth only. Use only facts stated in MASTER_RESUME. Never add employers, roles, dates, degrees, certifications, tools, languages, frameworks, metrics, team sizes, users, or outcomes that are not already there. If the posting asks for something the resume doesn't show, leave it out - do not imply it.
2. Numbers are fixed. Keep every number exactly as written in the original bullet. Never introduce a number that isn't in that bullet.
3. Don't inflate ownership. Keep the original verb's level: "Contributed to" must not become "Led", "Built", "Architected" or "Owned"; "Co-developed" must not become "Developed"; "Participated in" must not become "Drove".
4. Each output bullet rewrites exactly one original bullet, referenced by its id, and must not borrow tools, numbers or outcomes from any other bullet.
5. Keep bullets tight: one sentence, at most ~20% longer than the original, same tense as the original.

WHAT YOU MAY DO:
- Reorder bullets within a role so the most relevant to this posting come first.
- Reword a bullet using the posting's vocabulary where it describes the SAME thing (posting says "third-party integrations", bullet says "third-party APIs").
- Drop at most one clearly irrelevant bullet per role; keep at least 2 bullets for any role that has 2 or more.
- Reorder projects by relevance to the posting.
- Reorder skills within each category so the most relevant to this posting come first. Keep every skill; never add one or move one between categories.

WHAT TAILORING ACTUALLY MEANS.
A resume is screened by looking for the posting's own words. So a rewrite only counts if it puts one of those words on the page. You will be given KEYWORDS THIS POSTING SCREENS ON - the terms the posting screens on, already checked against the resume. That list is the work. Go through it and change the bullets it points at.

A rewrite that swaps a word for a synonym of equal value is worthless. Do not do this:
  "Contributed to building a full-stack AI-powered fintech platform, spanning a Chrome extension, React/Next.js dashboard, and backend API."
  -> "Contributed to building end-to-end features for an AI-powered fintech platform, covering a Chrome extension, React/Next.js UI, and backend API."
That traded "full-stack" (a term this posting screens on) for "end-to-end features", and "dashboard" for "UI". It moved words around and lost ground. A good rewrite of the same bullet keeps "full-stack", keeps "React/Next.js", and spends its freedom on the part the posting actually asks for - naming the dashboard as the user interface, or the backend API as the API he designed.

So, for each bullet:
- Never delete a term from list A to make room for prose. Those words are why the bullet is there.
- Prefer the posting's noun for a thing the bullet already describes: "dashboard" -> "user interface" if that is what it was; "invoice classification" -> "document processing" if that is what it was.
- If the posting offers no better word for a bullet, leave that bullet exactly as written. An unchanged bullet is a fine outcome; a reshuffled one is not.

6. Never weaken ownership either. "Led" must not become "Contributed to", "Designed" must not become "Worked on", "Built" must not become "Helped build". Keep the original verb unless the posting uses a different word for the same level of ownership.
7. Keep the concrete nouns. If the original says "classification engine", "bank statement", "Chrome extension" or "Next.js", the rewrite still says it. Never trade a specific thing for a vaguer one.
Rewriting means re-framing facts already in that bullet - never adding new ones. Rules 1-7 are absolute and bind every rewritten bullet.

COVER LETTER:
- 3 or 4 short paragraphs, 220-320 words total, first person, plain professional Canadian English.
- Opening: the exact role and company, plus one concrete reason Raghav fits, taken from the resume. Never open with "I am writing to express my interest".
- Middle: 2-3 specific resume facts mapped to the posting's real requirements.
- Close: short and confident, open to a conversation.
- Mention company specifics only if they appear in the posting. Invent nothing about the company.
- If the posting requires something Raghav lacks, you may express genuine interest in learning it; never claim experience with it.
- Don't mention GPA. Don't restate the resume line by line. Avoid cliches: passionate, rockstar, ninja, hit the ground running, synergy, fast-paced environment, perfect fit, dream job.
- greeting: "Dear Hiring Team," unless the posting names the hiring manager.
- closing: "Sincerely,"

ALSO RETURN:
- company and role exactly as the posting names them.
- notes: 1-2 sentences naming which of the posting's keywords the resume now carries, and the biggest requirement it cannot cover.`;

const SCHEMA = {
  type: 'object',
  properties: {
    company: { type: 'string' },
    role: { type: 'string' },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          bullets: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } },
        },
        required: ['id', 'bullets'],
      },
    },
    projects: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          bullets: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, text: { type: 'string' } }, required: ['id', 'text'] } },
        },
        required: ['id', 'bullets'],
      },
    },
    skills: {
      type: 'array',
      items: { type: 'object', properties: { label: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } }, required: ['label', 'items'] },
    },
    coverLetter: {
      type: 'object',
      properties: {
        greeting: { type: 'string' },
        paragraphs: { type: 'array', items: { type: 'string' } },
        closing: { type: 'string' },
      },
      required: ['greeting', 'paragraphs', 'closing'],
    },
    notes: { type: 'string' },
  },
  required: ['company', 'role', 'experience', 'projects', 'skills', 'coverLetter', 'notes'],
};

/** What the model is allowed to see: everything except contact details and GPA. */
function modelView(master) {
  const strip = (items) => items.map(({ id, company, title, name, location, dates, bullets }) =>
    ({ id, company, title, name, location, dates, bullets }));
  return {
    name: master.signOff,
    education: {
      school: master.education.school,
      degree: master.education.degree,
      graduation: master.education.graduation,
      coursework: master.education.coursework,
    },
    experience: strip(master.experience),
    projects: strip(master.projects),
    skills: master.skills,
    activities: strip(master.activities),
  };
}

function parseJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch {
    const a = t.indexOf('{'); const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* fall through */ } }
  }
  throw new GeminiError('Gemini returned something that wasn\'t valid JSON. Try again.');
}

// Free-tier models, newest first. Flash-Lite runs on separate, far less
// contended capacity, so it's the fallback that usually answers when every
// Flash model is shedding free-tier load at once.
const FALLBACK_MODELS = [
  'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash',
  'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite',
];

// Vercel Hobby functions get 300s. Leave room to fetch the job and render PDFs.
const TOTAL_BUDGET_MS = 230000;
const PER_CALL_MS = 100000;
// Pause between full passes over the model list. Overload spikes usually clear in seconds.
const BACKOFF = Number(process.env.GEMINI_BACKOFF_SCALE || 1);
const ROUND_WAITS_MS = [8000, 20000, 30000].map((ms) => ms * BACKOFF);

const RETRYABLE = new Set([500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(model, key, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = {}; }
    return { status: r.status, data, text };
  } catch (e) {
    // Treat timeouts and network blips like a 503: worth trying the next model.
    return { status: e.name === 'AbortError' ? 504 : 502, data: {}, text: e.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Did the model hand back every bullet copied word-for-word? True only when
 * bullets came back at all - an empty answer is a different failure, and the
 * validator deals with that one.
 */
function copiedVerbatim(master, out) {
  const orig = new Map();
  for (const x of [...master.experience, ...master.projects]) for (const b of x.bullets) orig.set(b.id, b.text.trim());
  let seen = 0;
  let changed = 0;
  for (const group of [...(out.experience || []), ...(out.projects || [])]) {
    for (const b of (group && group.bullets) || []) {
      const o = b && orig.get(b.id);
      if (!o) continue;
      seen++;
      if (String(b.text || '').trim() !== o) changed++;
    }
  }
  return seen > 0 && changed === 0;
}

const NUDGE = `Your previous answer returned every bullet copied word-for-word from MASTER_RESUME. That is a failed response: reordering alone is not tailoring.
Do it again and actually rewrite. For at least four bullets, re-frame what is already in that bullet using the posting's own vocabulary and priorities - lead with the part this employer cares about, and use their words for it where they describe the same thing.
Rules 1-5 still bind you absolutely: no new numbers, no new tools, no upgraded ownership verbs, one original bullet per output bullet. Re-frame the existing facts; invent nothing.`;

const errMsg = (res) => (res.data.error && res.data.error.message) || String(res.text || '').slice(0, 200);

async function tailor(master, job, { key, model, brief = '' }) {
  if (!key) throw new GeminiError('GEMINI_API_KEY is not set in Vercel.');

  const user = [
    'MASTER_RESUME:',
    JSON.stringify(modelView(master), null, 1),
    '',
    `JOB_POSTING (source: ${job.source}; title: ${job.title || 'unknown'}; company: ${job.company || 'unknown'}; location: ${job.location || 'unknown'}):`,
    job.text,
    ...(brief ? ['', brief] : []),
  ].join('\n');

  let nudged = false;      // have we already told it off for copying?
  let bestLazy = null;     // a valid-but-unchanged answer, kept as a floor
  let extraTurns = [];
  let restart = false;     // one-shot: go round again immediately after a nudge

  const makeBody = (withSchema) => ({
    systemInstruction: { parts: [{ text: withSchema ? SYSTEM
      : `${SYSTEM}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(SCHEMA)}` }] },
    contents: [{ role: 'user', parts: [{ text: user }] }, ...extraTurns],
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      ...(withSchema ? { responseSchema: SCHEMA } : {}),
    },
  });

  // Configured model first, then the others.
  const models = [model, ...FALLBACK_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  const started = Date.now();
  const left = () => TOTAL_BUDGET_MS - (Date.now() - started);
  const noSchema = new Set();   // models that rejected responseSchema
  const dead = new Set();       // unknown model (404) or out of free quota (429) - skip from now on
  const lastStatus = new Map();
  let attempts = 0;

  // Several passes over every model, with a growing pause between passes.
  for (let round = 0; round <= ROUND_WAITS_MS.length; round++) {
    for (const m of models) {
      if (dead.has(m)) continue;
      if (left() < 15000) break;

      attempts++;
      let res = await call(m, key, makeBody(!noSchema.has(m)), Math.min(PER_CALL_MS, left()));
      if (res.status === 400 && !noSchema.has(m) && /schema/i.test(res.text)) {
        noSchema.add(m);
        res = await call(m, key, makeBody(false), Math.min(PER_CALL_MS, left()));
      }
      lastStatus.set(m, res.status);

      if (res.status === 401 || res.status === 403) {
        throw new GeminiError('Gemini rejected the API key. Check GEMINI_API_KEY in Vercel.');
      }
      if (res.status === 404 || res.status === 429) { dead.add(m); continue; }
      if (RETRYABLE.has(res.status)) continue;        // busy: try the next model straight away
      if (res.status >= 400) throw new GeminiError(`Gemini error ${res.status}: ${errMsg(res)}`);

      const cand = (res.data.candidates || [])[0];
      if (!cand) {
        const reason = res.data.promptFeedback && res.data.promptFeedback.blockReason;
        throw new GeminiError(reason ? `Gemini declined this posting (${reason}).` : 'Gemini returned no result. Try again.');
      }
      const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
      if (!text) { lastStatus.set(m, `empty (${cand.finishReason || '?'})`); continue; }

      const parsed = parseJson(text);
      Object.defineProperty(parsed, 'model', { value: m, enumerable: false });

      // Weaker models often just echo the bullets back. Call that out and retry
      // once from the top of the list; keep whichever attempt tailored more.
      if (copiedVerbatim(master, parsed)) {
        if (!nudged && left() > 45000) {
          nudged = true;
          bestLazy = parsed;
          extraTurns = [
            { role: 'model', parts: [{ text: JSON.stringify(parsed).slice(0, 4000) }] },
            { role: 'user', parts: [{ text: NUDGE }] },
          ];
          restart = true;
          break; // restart the model list, strongest first
        }
        if (bestLazy) return bestLazy;
      }
      return parsed;
    }
    if (models.every((m) => dead.has(m))) break;
    if (restart) { restart = false; round--; continue; } // the nudge retry gets a free pass, no backoff
    const wait = ROUND_WAITS_MS[round];
    if (wait === undefined || left() < wait + 20000) break;
    await sleep(wait);
  }

  if (bestLazy) return bestLazy;

  const secs = Math.round((Date.now() - started) / 1000);
  const statuses = [...lastStatus.values()];
  if (statuses.length && statuses.every((s) => s === 429)) {
    throw new GeminiError('Every free Gemini model is at its rate limit right now. Wait a minute and try again.');
  }
  if (statuses.some((s) => RETRYABLE.has(s))) {
    throw new GeminiError(`Google's free tier is overloaded on every model right now - ${attempts} attempts across ${models.length - dead.size} models over ${secs}s. Try again in a few minutes, or turn on billing for the key to get priority.`);
  }
  throw new GeminiError(`Gemini unavailable - ${[...lastStatus].map(([m, s]) => `${m} (${s})`).join(', ')}.`);
}

module.exports = { tailor, modelView, GeminiError, SCHEMA, FALLBACK_MODELS };
