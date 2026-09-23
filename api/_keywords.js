'use strict';

/**
 * Pulls the words a posting actually screens on out of the posting, in code -
 * before the model ever sees it.
 *
 * Applicant tracking systems match literally: they look for the posting's own
 * spelling, not a synonym of it. So the useful unit of tailoring isn't "make
 * this bullet sound more relevant", it's "this posting says X, your resume
 * already shows X under another name, so say X". That is a lookup, not a
 * judgement call, which means it belongs here rather than in a prompt.
 *
 * What comes out:
 *   backed   - the posting's term, its exact spelling, and the bullet ids
 *              that already evidence it. These are the swaps the model is
 *              told to make.
 *   unbacked - the posting wants it, the resume can't show it. These are
 *              named explicitly so the model is told NOT to reach for them,
 *              and so the page can tell Raghav what the gap is.
 */

const { TERM_RES, ALIAS } = require('./_validate');

// ------------------------------------------------------------ text prep

// Requirements and responsibilities are what get screened; perks and EEO
// boilerplate are noise. Weight the sections that matter.
const HOT_SECTION = /\b(requirement|qualification|responsibilit|what you'?ll do|what you'?ll bring|who you are|about you|bonus|skills|must have|nice to have|you have|experience with|the role|about the role)\b/i;
const COLD_SECTION = /\b(benefit|perk|compensation|salary|equal opportunit|accommodation|diversity|we offer|our values|privacy|how to apply|vacation|401|health insurance)\b/i;

/** Split into lines, tagging each with whether it sits under a hot or cold heading. */
function weightedLines(text) {
  const out = [];
  let weight = 1;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // A short line with no sentence punctuation is probably a heading.
    const heading = line.length < 70 && !/[.;]$/.test(line);
    if (heading && HOT_SECTION.test(line)) weight = 2;
    else if (heading && COLD_SECTION.test(line)) weight = 0;
    out.push({ line, weight: COLD_SECTION.test(line) ? 0 : weight });
  }
  return out;
}

// ------------------------------------------------------------ phrases

const STOP = new Set(`a an the and or but if then than that this these those with without within of in on at to for from by as is are was were be been being have has had do does did will would can could should may might must our your their its it we you they he she them us i
work working works team teams role position job candidate candidates applicant company companies opportunity opportunities environment culture people person new strong excellent good great able ability years year experience experiences experienced skill skills knowledge understanding familiarity plus bonus preferred required requirement requirements qualification qualifications responsibility responsibilities other others more most well also across including include includes etc via using use used help helps helping ensure ensuring provide providing support supporting join looking seeking hire hiring apply application deep solid proven track record hands on handson day days week weeks month months time part level senior junior early career entry mid high low large small fast paced paced growth growing world class best right ideal successful success passionate excited love like want need needs get make makes made take takes taking give gives set sets put puts go goes come comes see sees know knows think thinks feel feels
who what when where why how which whom whose all any some each every both few many much several own same such no nor not only very just really quite about into through during before after above below up down out off over under again further once here there`
  .trim().split(/\s+/));
// Deliberately NOT stopped: product, customer, client, user, data, system,
// platform, service. Those are the nouns postings screen on.

// Phrases that match the shape but say nothing screenable.
const JUNK = /\b(years?|months?|degree|bachelor|master|equivalent|compensation|benefits|salary|remote|hybrid|onsite|office|visa|sponsorship|authorized|eligible|reference|resume|cover letter|interview|process|stage)\b/i;

const words = (s) => String(s).toLowerCase().match(/[a-z][a-z0-9+#./-]*/g) || [];

/**
 * Repeated 2-3 word noun-ish phrases: "document processing", "api integration",
 * "distributed systems". A phrase has to survive on its own merits - both ends
 * carry meaning, and it shows up more than once, or once under a hot heading.
 */
function phrasesIn(lines) {
  const seen = new Map();
  for (const { line, weight } of lines) {
    if (!weight) continue;
    // Clauses, so a phrase can't straddle a comma or a full stop.
    for (const clause of line.split(/[,.;:()[\]{}|/]|\s+[-–—]\s+/)) {
      const w = words(clause);
      for (let n = 3; n >= 2; n--) {
        for (let i = 0; i + n <= w.length; i++) {
          const gram = w.slice(i, i + n);
          // Every word has to carry weight - "apis and data" is not a keyword.
          if (gram.some((x) => STOP.has(x) || x.length < 3)) continue;
          const phrase = gram.join(' ');
          if (JUNK.test(phrase)) continue;
          // A keyword ends in a noun. "deliver polished" is half a sentence.
          if (/(?:ed|ly)$/.test(gram[gram.length - 1]) && !/(?:speed|feed)$/.test(gram[gram.length - 1])) continue;
          const prev = seen.get(phrase) || { phrase, count: 0, weight: 0 };
          prev.count++;
          prev.weight += weight;
          seen.set(phrase, prev);
        }
      }
    }
  }
  // A 3-gram absorbs its own 2-grams, so drop 2-grams that only ever appeared inside one.
  const kept = [...seen.values()].filter((p) => p.count > 1 || p.weight >= 2);
  const longer = kept.filter((p) => p.phrase.split(' ').length === 3);
  return kept.filter((p) => !(p.phrase.split(' ').length === 2
    && longer.some((l) => l.phrase.includes(p.phrase) && l.count >= p.count)));
}

// ------------------------------------------------------------ vocabulary terms

/** Known hard-skill terms, with the spelling the posting actually used. */
function termsIn(lines) {
  const hits = new Map();
  for (const { line, weight } of lines) {
    if (!weight) continue;
    for (const { canon, re } of TERM_RES) {
      const m = line.match(new RegExp(re.source, 'i'));
      if (!m) continue;
      const prev = hits.get(canon) || { phrase: canon, surface: m[0], count: 0, weight: 0, canon };
      if (m[0].length > prev.surface.length) prev.surface = m[0];
      prev.count++;
      prev.weight += weight;
      hits.set(canon, prev);
    }
  }
  return [...hits.values()];
}

// ------------------------------------------------------------ evidence

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').trim();

/** Every bullet in the resume, flattened, with its id. */
function bulletsOf(master) {
  const out = [];
  for (const group of [...master.experience, ...master.projects, ...(master.activities || [])]) {
    for (const b of group.bullets || []) out.push({ id: b.id, text: b.text, group: group.id });
  }
  return out;
}

/**
 * Does the resume already show this? A vocabulary term matches on its own
 * regex (so "Node.js" finds "node"); a phrase matches when a single bullet
 * carries all of its content words, which is exactly the case worth
 * rewording - the substance is there under different words.
 */
function evidenceFor(kw, bullets, skillText) {
  const ids = [];
  if (kw.canon) {
    const re = TERM_RES.filter((t) => t.canon === kw.canon);
    for (const b of bullets) if (re.some((t) => t.re.test(b.text))) ids.push(b.id);
    const inSkills = re.some((t) => t.re.test(skillText));
    return { ids, inSkills, exact: true };
  }
  // A phrase is evidenced when its words appear close together in one bullet.
  // Scattered across a long sentence they're usually about different things -
  // "Designed ... a statement processing system" is not "system design".
  const parts = kw.phrase.split(' ');
  for (const b of bullets) {
    const toks = norm(b.text).split(' ');
    const at = parts.map((p) => {
      const hits = [];
      toks.forEach((t, i) => { if (t.startsWith(p) || p.startsWith(t) && t.length > 3) hits.push(i); });
      return hits;
    });
    if (at.some((h) => !h.length)) continue;
    const span = Math.max(...at.map((h) => Math.max(...h))) - Math.min(...at.map((h) => Math.min(...h)));
    if (span <= 5) ids.push(b.id);
  }
  return { ids, inSkills: false, exact: false };
}

// ------------------------------------------------------------ public

const MAX_BACKED = 16;
const MAX_FORBIDDEN = 10;
const MAX_CANDIDATES = 12;

/**
 * @param {string} jobText  the posting, as fetched
 * @param {object} master   the master resume
 */
function extractKeywords(jobText, master, { company = '' } = {}) {
  const lines = weightedLines(jobText);
  // Stripe hiring for Stripe is not a missing skill. Drop the employer's own
  // name (and the words in it) from the keyword pool entirely.
  const own = new Set(words(company).filter((w) => w.length > 2));
  const bullets = bulletsOf(master);
  const skillText = (master.skills || []).flatMap((s) => s.items).join(' , ');

  const ranked = [...termsIn(lines), ...phrasesIn(lines)]
    .map((k) => ({ ...k, score: (k.weight || k.count) + (k.canon ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.phrase.localeCompare(b.phrase));

  const backed = [];      // resume can show it - make sure the posting's word is on the page
  const forbidden = [];   // a named tool or framework the resume cannot show - never claim it
  const candidates = [];  // posting leans on it, no lexical match - the model judges

  for (const kw of ranked) {
    if ((kw.canon || kw.phrase).split(/[\s-]+/).some((w) => own.has(w))) continue;
    const ev = evidenceFor(kw, bullets, skillText);
    const entry = {
      term: kw.surface || kw.phrase,
      canon: kw.canon || kw.phrase,
      score: kw.score,
      bulletIds: ev.ids.slice(0, 4),
      inSkills: ev.inSkills,
      exact: ev.exact,
    };
    if (ev.ids.length || ev.inSkills) {
      if (backed.length < MAX_BACKED) backed.push(entry);
    } else if (kw.canon) {
      // A named tool either appears on the resume or it doesn't. No latitude.
      if (forbidden.length < MAX_FORBIDDEN) forbidden.push(entry);
    } else if (kw.score >= 3 && candidates.length < MAX_CANDIDATES) {
      // A phrase the posting leans on with no lexical match. The resume may
      // still describe this work under different words - that judgement is
      // the model's, and it's where the real tailoring happens.
      candidates.push(entry);
    }
  }

  // "full stack" is already in A; "full stack product" and "stack product
  // development" in B are the same advice three times. Keep the first.
  const kept = [];
  const overlaps = (a, b) => a.includes(b) || b.includes(a);
  for (const c of candidates) {
    if (backed.some((k) => overlaps(k.canon, c.canon))) continue;
    if (kept.some((k) => overlaps(k.canon, c.canon))) continue;
    kept.push(c);
  }

  return { backed, forbidden, candidates: kept };
}

/**
 * The part of the prompt that does the actual work: for each term the posting
 * screens on, its exact spelling and the bullets that already earn it.
 */
function keywordBrief({ backed, forbidden, candidates }) {
  if (!backed.length && !forbidden.length && !candidates.length) return '';
  const lines = [
    'KEYWORDS THIS POSTING SCREENS ON',
    'Extracted from the posting in code and checked against MASTER_RESUME. Screening is literal: a reviewer looks for the posting\'s own spelling, not a synonym of it. Getting these words onto the page - where they are true - is the job.',
  ];

  if (backed.length) {
    lines.push('', 'A. EARNED. The resume can show each of these.');
    for (const k of backed) {
      if (!k.bulletIds.length) { lines.push(`- "${k.term}" - in the skills list. Fine as is.`); continue; }
      lines.push(k.exact
        ? `- "${k.term}" - bullets ${k.bulletIds.join(', ')} already use this word. Keep it there; do not paraphrase it away.`
        : `- "${k.term}" - bullets ${k.bulletIds.join(', ')} describe this. Rewrite them to use the posting's exact spelling.`);
    }
  }

  if (candidates.length) {
    lines.push('', 'B. SCREENED, NOT YET MATCHED. The posting leans on these and no bullet uses the words.',
      'For each one, look for a bullet that is genuinely about the same work under different words. If you find one, rewrite it to use the posting\'s phrase. If nothing on the resume is really that work, skip it and say nothing - this list is not a list of things to claim.',
      candidates.map((k) => `"${k.term}"`).join(', '));
  }

  if (forbidden.length) {
    lines.push('', 'C. NAMED TOOLS THE RESUME DOES NOT HAVE.',
      'These are not judgement calls - the resume does not show them, so they cannot appear in any bullet, skill or cover-letter sentence as experience. Mention the most important one or two in notes as a gap.',
      forbidden.map((k) => `"${k.term}"`).join(', '));
  }

  lines.push('', 'Work list A top to bottom before anything else, then list B. A bullet that could carry one of these words and does not is a miss.');
  return lines.join('\n');
}

/** Which earned keywords does the finished resume actually carry? */
function coverage(backed, tailored) {
  const text = [
    ...[...tailored.experience, ...tailored.projects, ...(tailored.activities || [])]
      .flatMap((g) => (g.bullets || []).map((b) => b.text)),
    ...(tailored.skills || []).flatMap((s) => s.items),
  ].join('\n');
  const n = norm(text);
  return backed.map((k) => {
    const hit = k.exact
      ? TERM_RES.some((t) => t.canon === (ALIAS.get(k.canon) || k.canon) && t.re.test(text))
      : k.canon.split(' ').every((p) => n.includes(p));
    return { ...k, present: hit };
  });
}

module.exports = { extractKeywords, keywordBrief, coverage, phrasesIn, weightedLines };
