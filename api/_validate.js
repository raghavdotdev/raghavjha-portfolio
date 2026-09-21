'use strict';

/**
 * Merges the model's output with the master resume and enforces, in code,
 * that tailoring never invents anything.
 *
 * Structure is never taken from the model: companies, titles, dates and
 * locations always come from the master. The model only supplies bullet
 * order/wording, project order and skill order. Every rewritten bullet is
 * checked against the ONE original it claims to rewrite; if it fails any
 * check, the original text is used instead and a warning is recorded.
 */

// ------------------------------------------------------------ numbers

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, fifty: 50, hundred: 100, thousand: 1000,
};

function numbersIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(String(Number(m[0].replace(/,/g, ''))));
  for (const m of String(text).toLowerCase().matchAll(/\b[a-z]+\b/g)) {
    if (NUMBER_WORDS[m[0]] !== undefined) out.add(String(NUMBER_WORDS[m[0]]));
  }
  return out;
}

// ------------------------------------------------------------ tech terms

// Terms whose appearance is a factual claim. Aliases collapse to one key.
const TECH = [
  ['javascript', 'js'], ['typescript', 'ts'], ['python'], ['java'], ['php'], ['c++'], ['c#'], ['golang'], ['ruby'], ['kotlin'], ['scala'], ['rust'], ['swift'], ['elixir'], ['haskell'],
  ['react', 'react.js', 'reactjs'], ['next.js', 'nextjs'], ['vue', 'vue.js'], ['angular'], ['svelte', 'sveltekit'], ['tailwind', 'tailwind css'], ['bootstrap'], ['redux'], ['html'], ['css'],
  ['node', 'node.js', 'nodejs'], ['express', 'express.js'], ['fastapi'], ['flask'], ['django'], ['spring boot', 'spring'], ['laravel'], ['rails', 'ruby on rails'], ['.net', 'asp.net'],
  ['graphql'], ['grpc'], ['websockets', 'websocket'], ['socket.io'], ['rest api', 'restful'],
  ['mongodb', 'mongo'], ['mysql'], ['postgresql', 'postgres'], ['sql server', 'mssql'], ['redis'], ['firebase', 'firestore'], ['dynamodb'], ['cassandra'], ['elasticsearch'], ['snowflake'], ['bigquery'], ['sqlite'], ['nosql'], ['sql'],
  ['aws', 'amazon web services'], ['google cloud', 'gcp'], ['azure'], ['docker'], ['kubernetes', 'k8s'], ['terraform'], ['ansible'], ['jenkins'], ['github actions'], ['ci/cd', 'cicd'], ['git'], ['linux'], ['nginx'], ['lambda'], ['s3'], ['ec2'],
  ['kafka'], ['rabbitmq'], ['spark'], ['hadoop'], ['airflow'], ['microservices'],
  ['ai'], ['machine learning', 'ml'], ['deep learning'], ['llm', 'llms', 'large language model', 'large language models'], ['nlp'], ['rag'], ['openai', 'gpt'], ['langchain'], ['pytorch'], ['tensorflow'], ['computer vision'],
  ['owasp'], ['sast'], ['dast'], ['oauth', 'oauth 2.0', 'oauth2'], ['sso'], ['saml'], ['penetration testing', 'pentest', 'pen testing'], ['soc 2', 'soc2'], ['pci', 'pci-dss', 'pci dss'], ['iso 27001'], ['gdpr'], ['casa'], ['zero trust'], ['encryption'], ['iam'],
  ['stripe'], ['plaid'], ['quickbooks', 'qbo'], ['intuit'], ['salesforce'], ['chrome extension'], ['rtsp'], ['react-rnd'], ['excel'], ['pdf'],
  ['jest'], ['cypress'], ['selenium'], ['playwright'], ['unit test', 'unit tests', 'unit testing'], ['tdd'],
  ['agile'], ['scrum'], ['jira'],
];

const ALIAS = new Map();
const TERM_RES = [];
for (const group of TECH) {
  const canon = group[0];
  for (const t of group) {
    ALIAS.set(t, canon);
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    TERM_RES.push({ canon, re: new RegExp(`(?<![A-Za-z0-9+#])${esc}(?![A-Za-z0-9+#])`, 'i') });
  }
}

function techIn(text) {
  const out = new Set();
  for (const { canon, re } of TERM_RES) if (re.test(text)) out.add(canon);
  return out;
}

// ------------------------------------------------------------ ownership verbs

// Verbs that claim more ownership than "contributed", "participated", "co-developed".
const OWNERSHIP = ['led', 'lead', 'leading', 'architected', 'spearheaded', 'owned', 'headed', 'directed', 'drove', 'managed', 'mentored', 'founded', 'pioneered', 'championed', 'orchestrated', 'single-handedly', 'sole', 'solely', 'independently'];

function ownershipIn(text) {
  const words = String(text).toLowerCase().match(/[a-z-]+/g) || [];
  return new Set(words.filter((w) => OWNERSHIP.includes(w)));
}

// "Co-developed" -> "Developed", "Contributed to building" -> "Built"
function droppedHedge(orig, rewrite) {
  const o = orig.toLowerCase(); const r = rewrite.toLowerCase();
  const hedges = ['co-developed', 'co-designed', 'co-founded', 'contributed', 'participated', 'assisted', 'helped', 'supported'];
  const had = hedges.filter((h) => o.includes(h));
  if (!had.length) return [];
  // OK as long as the rewrite still hedges somewhere; only a full upgrade is rejected.
  return hedges.some((h) => r.includes(h)) ? [] : had;
}

// ------------------------------------------------------------ bullet check

/**
 * @returns {string|null} reason the rewrite is rejected, or null if it's OK.
 */
function checkBullet(original, rewrite) {
  const r = String(rewrite || '').trim();
  if (!r) return 'empty';
  if (r.length > Math.max(230, original.length * 1.3)) return 'too long';

  const allowedNums = numbersIn(original);
  const newNums = [...numbersIn(r)].filter((n) => !allowedNums.has(n));
  if (newNums.length) return `added number(s) ${newNums.join(', ')}`;

  const origTech = techIn(original);
  const newTech = [...techIn(r)].filter((t) => !origTech.has(t));
  if (newTech.length) return `added ${newTech.join(', ')}`;

  const origOwn = ownershipIn(original);
  const newOwn = [...ownershipIn(r)].filter((w) => !origOwn.has(w));
  if (newOwn.length) return `upgraded ownership ("${newOwn.join('", "')}")`;

  const hedges = droppedHedge(original, r);
  if (hedges.length) return `dropped "${hedges[0]}"`;

  return null;
}

// ------------------------------------------------------------ merge

function mergeBullets(masterItem, outItem, warnings, label) {
  const byId = new Map(masterItem.bullets.map((b) => [b.id, b]));
  const used = new Set();
  const result = [];

  for (const ob of (outItem && Array.isArray(outItem.bullets)) ? outItem.bullets : []) {
    const orig = ob && byId.get(ob.id);
    if (!orig || used.has(ob.id)) continue; // unknown or duplicate id - ignore
    used.add(ob.id);
    const why = checkBullet(orig.text, ob.text);
    if (why) {
      warnings.push(`${label}: kept original wording for one bullet (rewrite ${why}).`);
      result.push({ id: orig.id, text: orig.text });
    } else {
      result.push({ id: orig.id, text: String(ob.text).trim() });
    }
  }

  // Enforce minimums: at least 2 bullets if the original had 2+, never zero.
  const min = Math.min(2, masterItem.bullets.length);
  for (const b of masterItem.bullets) {
    if (result.length >= min) break;
    if (!used.has(b.id)) { result.push({ id: b.id, text: b.text }); used.add(b.id); }
  }
  return result;
}

function mergeResume(master, out) {
  const warnings = [];
  const o = out || {};
  const outExp = new Map((Array.isArray(o.experience) ? o.experience : []).map((e) => [e && e.id, e]));
  const outProj = Array.isArray(o.projects) ? o.projects : [];

  // Experience: always master order (reverse-chronological) and master metadata.
  const experience = master.experience.map((job) => ({
    ...job,
    bullets: mergeBullets(job, outExp.get(job.id), warnings, job.company),
  }));

  // Projects: model's order, known ids only, then any it left out.
  const projById = new Map(master.projects.map((p) => [p.id, p]));
  const order = [];
  for (const p of outProj) if (p && projById.has(p.id) && !order.includes(p.id)) order.push(p.id);
  for (const p of master.projects) if (!order.includes(p.id)) order.push(p.id);
  const outProjById = new Map(outProj.map((p) => [p && p.id, p]));
  const projects = order.map((id) => {
    const p = projById.get(id);
    return { ...p, bullets: mergeBullets(p, outProjById.get(id), warnings, p.name.split(' — ')[0]) };
  });

  // Skills: master categories in master order; items must already exist in that category.
  const outSkills = new Map((Array.isArray(o.skills) ? o.skills : []).map((s) => [String(s && s.label).toLowerCase(), s]));
  const dropped = new Set();
  const skills = master.skills.map((cat) => {
    const allowed = new Map(cat.items.map((i) => [i.toLowerCase(), i]));
    const os = outSkills.get(cat.label.toLowerCase());
    const items = [];
    for (const it of (os && Array.isArray(os.items)) ? os.items : []) {
      const hit = allowed.get(String(it).toLowerCase().trim());
      if (hit && !items.includes(hit)) items.push(hit);
      else if (!hit) dropped.add(String(it));
    }
    // Reorder only: anything the model left out goes back on, in original order.
    // The page has room, and ATS keyword filters reward breadth.
    for (const it of cat.items) if (!items.includes(it)) items.push(it);
    return { label: cat.label, items };
  });
  if (dropped.size) warnings.push(`Removed skills not on your resume: ${[...dropped].join(', ')}.`);

  return {
    resume: { ...master, experience, projects, skills },
    warnings,
  };
}

// ------------------------------------------------------------ cover letter

function checkCoverLetter(master, cl, jobText, company = '') {
  const warnings = [];
  const paragraphs = (cl && Array.isArray(cl.paragraphs) ? cl.paragraphs : []).map((p) => String(p).trim()).filter(Boolean);
  if (!paragraphs.length) return { ok: false, warnings: ['Gemini returned an empty cover letter.'] };

  const masterText = JSON.stringify(master);
  const allText = paragraphs.join(' ');

  const allowedNums = new Set([...numbersIn(masterText), ...numbersIn(jobText), String(new Date().getFullYear()), String(new Date().getFullYear() + 1)]);
  const newNums = [...numbersIn(allText)].filter((n) => !allowedNums.has(n));
  if (newNums.length) warnings.push(`Cover letter mentions number(s) not on your resume or in the posting: ${newNums.join(', ')}. Check before sending.`);

  // "N years of experience" is the classic invented claim - flag any duration
  // claim outright, whatever numbers happen to be on the resume elsewhere.
  const years = allText.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|many)\+?\s*(?:years?|yrs?)\b/gi);
  if (years) warnings.push(`Cover letter claims "${years.join('", "')}" - make sure that's accurate.`);

  const masterTech = techIn(masterText);
  const companyTerms = techIn(company); // applying to Stripe isn't claiming Stripe experience
  const extraTech = [...techIn(allText)].filter((t) => !masterTech.has(t) && !companyTerms.has(t));
  if (extraTech.length) warnings.push(`Cover letter mentions ${extraTech.join(', ')} - not on your resume. Make sure it reads as interest, not experience.`);

  const words = allText.split(/\s+/).length;
  if (words > 380) warnings.push(`Cover letter is long (${words} words).`);

  return {
    ok: true,
    warnings,
    letter: {
      greeting: String((cl && cl.greeting) || 'Dear Hiring Team,').trim(),
      paragraphs,
      closing: String((cl && cl.closing) || 'Sincerely,').trim(),
    },
  };
}

module.exports = { mergeResume, checkCoverLetter, checkBullet, numbersIn, techIn };
