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
- Leave a bullet exactly as written if it is already the best version. That is often the right call.

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

// Free-tier Flash models, newest first. When one is overloaded (503) or out
// of free quota (429), the next usually isn't - each has its own capacity.
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

// Vercel Hobby functions get 300s. Leave room to fetch the job and render PDFs.
const TOTAL_BUDGET_MS = 230000;
const PER_CALL_MS = 100000;

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
      temperature: 0.4,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      ...(withSchema ? { responseSchema: SCHEMA } : {}),
    },
  });

  // Configured model first, then the others.
  const models = [model, ...FALLBACK_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
  const started = Date.now();
  const tried = [];
  let lastRes = null;

  for (const m of models) {
    let withSchema = true;
    // Up to 2 tries per model for transient overloads, with a short backoff.
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = TOTAL_BUDGET_MS - (Date.now() - started);
      if (left < 15000) break;

      let res = await call(m, key, makeBody(withSchema), Math.min(PER_CALL_MS, left));
      if (res.status === 400 && withSchema && /schema/i.test(res.text)) {
        withSchema = false;
        res = await call(m, key, makeBody(false), Math.min(PER_CALL_MS, TOTAL_BUDGET_MS - (Date.now() - started)));
      }
      lastRes = res;

      if (res.status === 401 || res.status === 403) {
        throw new GeminiError('Gemini rejected the API key. Check GEMINI_API_KEY in Vercel.');
      }
      if (res.status === 404 || res.status === 429) break;             // unknown model / out of quota: next model
      if (RETRYABLE.has(res.status)) {                                    // overloaded: back off, maybe retry
        if (attempt === 0) await sleep(2500);
        continue;
      }
      if (res.status >= 400) throw new GeminiError(`Gemini error ${res.status}: ${errMsg(res)}`);

      const cand = (res.data.candidates || [])[0];
      if (!cand) {
        const reason = res.data.promptFeedback && res.data.promptFeedback.blockReason;
        throw new GeminiError(reason ? `Gemini declined this posting (${reason}).` : 'Gemini returned no result. Try again.');
      }
      const text = ((cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
      if (!text) { lastRes = { status: 0, data: {}, text: cand.finishReason || 'empty' }; break; }

      const parsed = parseJson(text);
      Object.defineProperty(parsed, 'model', { value: m, enumerable: false });
      return parsed;
    }
    tried.push(`${m} (${lastRes ? lastRes.status || lastRes.text : '?'})`);
    if (TOTAL_BUDGET_MS - (Date.now() - started) < 15000) break;
  }

  if (lastRes && lastRes.status === 429) {
    throw new GeminiError('Every free Gemini model is at its rate limit right now. Wait a minute and try again.');
  }
  throw new GeminiError(`Gemini is overloaded right now - tried ${tried.join(', ')}. Try again in a few minutes.`);
}

module.exports = { tailor, modelView, GeminiError, SCHEMA, FALLBACK_MODELS };
