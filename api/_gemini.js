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

REWORDING IS THE POINT. Reordering alone is not enough. Work through every bullet and rewrite the ones where the posting describes the same work in different words, or where a detail already in the bullet deserves to lead because the posting asks for it. Expect to rewrite roughly half of them; if you rewrite fewer than three across the whole resume you have almost certainly been too cautious. Leave a bullet alone only when the posting genuinely offers no better framing for it.
Rewriting means re-framing facts that are already in that bullet - never adding new ones. Rules 1-5 above are absolute and still bind every rewritten bullet.

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
- notes: 1-2 sentences on what you emphasized, and any major requirement the resume does not cover.`;

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

const errMsg = (res) => (res.data.error && res.data.error.message) || String(res.text || '').slice(0, 200);

async function tailor(master, job, { key, model }) {
  if (!key) throw new GeminiError('GEMINI_API_KEY is not set in Vercel.');

  const user = [
    'MASTER_RESUME:',
    JSON.stringify(modelView(master), null, 1),
    '',
    `JOB_POSTING (source: ${job.source}; title: ${job.title || 'unknown'}; company: ${job.company || 'unknown'}; location: ${job.location || 'unknown'}):`,
    job.text,
  ].join('\n');

  const makeBody = (withSchema) => ({
    systemInstruction: { parts: [{ text: withSchema ? SYSTEM
      : `${SYSTEM}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(SCHEMA)}` }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
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
      return parsed;
    }
    if (models.every((m) => dead.has(m))) break;
    const wait = ROUND_WAITS_MS[round];
    if (wait === undefined || left() < wait + 20000) break;
    await sleep(wait);
  }

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
