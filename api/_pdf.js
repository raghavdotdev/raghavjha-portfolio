'use strict';

/**
 * Renders the resume and cover letter as PDFs with pdf-lib.
 *
 * Geometry is measured from Raghav's original (LibreOffice / Liberation Sans,
 * which is metric-compatible with Helvetica), so the standard Helvetica
 * faces reproduce it without shipping font files.
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_W = 612;
const PAGE_H = 792;

const LEFT = 50.5;
const RIGHT_RULE = 562;       // right end of section rules
const TEXT_MAX_X = 559.5;     // wrap limit - measured max line end in the original
const RIGHT_COL = 518.5;      // right edge of right-aligned dates/locations
const BULLET_X = 56.5;
const BULLET_TEXT_X = 65.5;
const BOTTOM_LIMIT = PAGE_H - 36;

const C = {
  name: rgb(0x1f / 255, 0x2a / 255, 0x3c / 255),
  body: rgb(0.13, 0.13, 0.14),
  muted: rgb(0x6b / 255, 0x78 / 255, 0x8e / 255),
  accent: rgb(0x1f / 255, 0x57 / 255, 0xdb / 255),
};

// ------------------------------------------------------------ text safety

// Standard fonts are WinAnsi-encoded; anything outside it throws. Map the
// characters a model is likely to produce, drop the rest.
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
const REPLACE = {
  '→': '->', '←': '<-', '≥': '>=', '≤': '<=', '≈': '~', '×': 'x',
  '‑': '-', '‐': '-', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ',
  '​': '', '→': '->', '✓': '', '★': '*',
};

function safe(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    if (REPLACE[ch] !== undefined) { out += REPLACE[ch]; continue; }
    const code = ch.codePointAt(0);
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WINANSI_EXTRA.has(ch)) out += ch;
    else if (ch === '\n' || ch === '\t') out += ' ';
  }
  return out.replace(/\s+/g, ' ').trim();
}

// Same as safe() but keeps leading/trailing spaces (needed for "Label: " runs).
function safeInline(s) {
  const lead = /^\s/.test(String(s || '')) ? ' ' : '';
  const trail = /\s$/.test(String(s || '')) ? ' ' : '';
  const core = safe(s);
  return core ? lead + core + trail : (lead || trail);
}

// ------------------------------------------------------------ layout primitives

/**
 * Wrap rich runs [{text, font, size}] into lines no wider than maxWidth.
 * Returns [{segments:[{text,font,size,width}], width}]
 */
function wrapRuns(runs, maxWidth) {
  const tokens = [];
  for (const r of runs) {
    const parts = safeInline(r.text).split(/(\s+)/).filter((p) => p.length);
    for (const p of parts) {
      if (/^\s+$/.test(p)) { tokens.push({ text: ' ', font: r.font, size: r.size, color: r.color, space: true }); continue; }
      // Like the original (LibreOffice), a line may break right after a hyphen: "end-to-" / "end".
      for (const piece of p.split(/(?<=[A-Za-z]-)(?=[A-Za-z])/)) {
        tokens.push({ text: piece, font: r.font, size: r.size, color: r.color, space: false });
      }
    }
  }

  const lines = [];
  let cur = [];
  let width = 0;

  const flush = () => {
    while (cur.length && cur[cur.length - 1].space) { width -= cur[cur.length - 1].width; cur.pop(); }
    if (cur.length) lines.push({ segments: cur, width });
    cur = []; width = 0;
  };

  for (const t of tokens) {
    const tw = t.font.widthOfTextAtSize(t.space ? ' ' : t.text, t.size);
    if (t.space) {
      if (!cur.length) continue;
      cur.push({ ...t, text: ' ', width: tw }); width += tw;
      continue;
    }
    if (width + tw > maxWidth && cur.length) flush();
    cur.push({ ...t, width: tw }); width += tw;
  }
  flush();
  return lines;
}

function drawLine(page, line, x, y, defaultColor) {
  let cx = x;
  for (const s of line.segments) {
    page.drawText(s.text, { x: cx, y, size: s.size, font: s.font, color: s.color || defaultColor });
    cx += s.width;
  }
}

function drawRight(page, text, font, size, y, color) {
  const t = safe(text);
  page.drawText(t, { x: RIGHT_COL - font.widthOfTextAtSize(t, size), y, size, font, color });
}

function drawSpaced(page, text, font, size, x, y, color, tracking) {
  let cx = x;
  for (const ch of safe(text)) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + tracking;
  }
}

async function loadFonts(doc) {
  return {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    ital: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
}

// ------------------------------------------------------------ resume

/**
 * Build a list of drawing ops with y positions, so we can measure height
 * before committing to a page. `k` scales body sizes and spacing to fit.
 */
function layoutResume(r, contact, F, k) {
  const S = {
    name: 28.5, contact: 9.5,
    head: 9.5 * k, entry: 9.5 * k, body: 9 * k, bullet: 9 * k,
    headToEntry: 17.6 * k, afterHeadingBlock: 17 * k,
    row: 10.4 * k, titleToBullet: 12.95 * k, projToBullet: 11.95 * k,
    line: 10.5 * k, bulletGap: 1.5 * k, entryGap: 14.75 * k, projGap: 15.05 * k,
    skillLine: 10.85 * k, eduCourse: 11.8 * k,
  };
  const ops = [];
  let y = 62.2; // baseline of name, from top

  ops.push({ t: 'center', text: r.name, font: F.bold, size: S.name, y, color: C.name });
  y = 78.6;
  ops.push({ t: 'center', text: contact, font: F.reg, size: S.contact, y, color: C.muted });
  y = 97.5;

  const heading = (label, first) => {
    if (!first) y += S.afterHeadingBlock;
    ops.push({ t: 'heading', text: label.toUpperCase(), y });
    y += S.headToEntry;
  };

  const bullets = (list) => {
    list.forEach((b, i) => {
      const lines = wrapRuns([{ text: b.text, font: F.reg, size: S.bullet }], TEXT_MAX_X - BULLET_TEXT_X);
      lines.forEach((ln, j) => {
        if (j === 0) ops.push({ t: 'bullet', y });
        ops.push({ t: 'line', line: ln, x: BULLET_TEXT_X, y, color: C.body });
        if (j < lines.length - 1) y += S.line;
      });
      if (i < list.length - 1) y += S.line + S.bulletGap;
    });
  };

  // Education
  heading('Education', true);
  const e = r.education;
  ops.push({ t: 'text', text: e.school, font: F.bold, size: S.entry, x: LEFT, y, color: C.body });
  ops.push({ t: 'right', text: e.location, font: F.reg, size: S.body, y, color: C.muted });
  y += S.row;
  ops.push({ t: 'text', text: `${e.degree}  •  GPA: ${e.gpa}`, font: F.ital, size: S.body, x: LEFT, y, color: C.body });
  ops.push({ t: 'right', text: e.graduation, font: F.reg, size: S.body, y, color: C.muted });
  y += S.eduCourse;
  for (const ln of wrapRuns([
    { text: 'Coursework: ', font: F.bold, size: S.body },
    { text: e.coursework.join(', '), font: F.reg, size: S.body },
  ], TEXT_MAX_X - LEFT)) {
    ops.push({ t: 'line', line: ln, x: LEFT, y, color: C.body });
    y += S.line;
  }
  y -= S.line;

  // Experience
  heading('Work Experience');
  r.experience.forEach((job, i) => {
    if (i > 0) y += S.entryGap;
    ops.push({ t: 'text', text: job.company, font: F.bold, size: S.entry, x: LEFT, y, color: C.body });
    ops.push({ t: 'right', text: job.location, font: F.reg, size: S.body, y, color: C.muted });
    y += S.row;
    ops.push({ t: 'text', text: job.title, font: F.ital, size: S.body, x: LEFT, y, color: C.body });
    ops.push({ t: 'right', text: job.dates, font: F.reg, size: S.body, y, color: C.muted });
    y += S.titleToBullet;
    bullets(job.bullets);
  });

  // Projects
  if (r.projects.length) {
    heading('Projects');
    r.projects.forEach((p, i) => {
      if (i > 0) y += S.projGap;
      const label = p.link ? `${p.name}  •  ${p.link}` : p.name;
      ops.push({ t: 'text', text: label, font: F.reg, size: S.entry, x: LEFT, y, color: C.body });
      ops.push({ t: 'right', text: p.dates, font: F.reg, size: S.body, y, color: C.muted });
      y += S.projToBullet;
      bullets(p.bullets);
    });
  }

  // Skills
  heading('Technical Skills');
  y -= (S.headToEntry - 15.1 * k);
  r.skills.forEach((s) => {
    for (const ln of wrapRuns([
      { text: `${s.label}: `, font: F.bold, size: S.body },
      { text: s.items.join(', '), font: F.reg, size: S.body },
    ], TEXT_MAX_X - LEFT)) {
      ops.push({ t: 'line', line: ln, x: LEFT, y, color: C.body });
      y += S.skillLine;
    }
  });
  y -= S.skillLine;

  // Activities
  if (r.activities.length) {
    heading('Activities');
    r.activities.forEach((a, i) => {
      if (i > 0) y += S.projGap;
      ops.push({ t: 'text', text: a.name, font: F.reg, size: S.entry, x: LEFT, y, color: C.body });
      ops.push({ t: 'right', text: a.dates, font: F.reg, size: S.body, y, color: C.muted });
      y += S.projToBullet;
      bullets(a.bullets);
    });
  }

  return { ops, bottom: y, S };
}

function paint(page, ops, F, S) {
  const Y = (top) => PAGE_H - top;
  for (const o of ops) {
    switch (o.t) {
      case 'center': {
        const t = safe(o.text);
        page.drawText(t, { x: (PAGE_W - o.font.widthOfTextAtSize(t, o.size)) / 2, y: Y(o.y), size: o.size, font: o.font, color: o.color });
        break;
      }
      case 'heading':
        drawSpaced(page, o.text, F.bold, S.head, LEFT, Y(o.y), C.accent, 2.05 * (S.head / 9.5));
        page.drawLine({ start: { x: LEFT, y: Y(o.y + 4.2) }, end: { x: RIGHT_RULE, y: Y(o.y + 4.2) }, thickness: 0.8, color: C.accent });
        break;
      case 'text':
        page.drawText(safe(o.text), { x: o.x, y: Y(o.y), size: o.size, font: o.font, color: o.color });
        break;
      case 'right':
        drawRight(page, o.text, o.font, o.size, Y(o.y), o.color);
        break;
      case 'bullet':
        page.drawText('•', { x: BULLET_X, y: Y(o.y), size: S.bullet, font: F.reg, color: C.body });
        break;
      case 'line':
        drawLine(page, o.line, o.x, Y(o.y), o.color);
        break;
      default:
    }
  }
}

/**
 * Render a resume object (same shape as _resume.js) to PDF bytes.
 * Shrinks spacing/type in small steps until it fits on one page.
 */
async function renderResume(resume, contact) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${resume.signOff} - Resume`);
  doc.setAuthor(resume.signOff);
  doc.setCreator('raghavjha.com');
  const F = await loadFonts(doc);

  let chosen = null;
  for (const k of [1, 0.975, 0.95, 0.925, 0.9]) {
    const lay = layoutResume(resume, contact, F, k);
    chosen = { ...lay, k };
    if (lay.bottom <= BOTTOM_LIMIT) break;
  }

  const page = doc.addPage([PAGE_W, PAGE_H]);
  paint(page, chosen.ops, F, chosen.S);
  const bytes = await doc.save();
  return { bytes, fits: chosen.bottom <= BOTTOM_LIMIT, scale: chosen.k, bottom: chosen.bottom };
}

// ------------------------------------------------------------ cover letter

async function renderCoverLetter({ name, signOff, contact, date, company, role, greeting, paragraphs, closing }) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${signOff} - Cover Letter${company ? ` - ${company}` : ''}`);
  doc.setAuthor(signOff);
  doc.setCreator('raghavjha.com');
  const F = await loadFonts(doc);
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const Y = (top) => PAGE_H - top;

  const L = 72;
  const R = PAGE_W - 72;
  const size = 10.5;
  const lh = 15;

  const center = (text, font, sz, top, color) => {
    const t = safe(text);
    page.drawText(t, { x: (PAGE_W - font.widthOfTextAtSize(t, sz)) / 2, y: Y(top), size: sz, font, color });
  };

  center(name, F.bold, 28.5, 62.2, C.name);
  center(contact, F.reg, 9.5, 78.6, C.muted);
  page.drawLine({ start: { x: LEFT, y: Y(90) }, end: { x: RIGHT_RULE, y: Y(90) }, thickness: 0.8, color: C.accent });

  let y = 126;
  const para = (text, font = F.reg, gapAfter = 9) => {
    for (const ln of wrapRuns([{ text, font, size }], R - L)) {
      if (y > BOTTOM_LIMIT) break;
      drawLine(page, ln, L, Y(y), C.body);
      y += lh;
    }
    y += gapAfter;
  };

  para(date, F.reg, 12);
  if (company) {
    para('Hiring Team', F.reg, 0);
    para(company, F.reg, 12);
  }
  if (role) para(`Re: ${role}`, F.bold, 12);
  para(greeting || 'Dear Hiring Team,', F.reg, 6);
  for (const p of paragraphs) para(p);
  y += 4;
  para(closing || 'Sincerely,', F.reg, 18);
  para(signOff, F.bold, 0);

  return { bytes: await doc.save(), fits: y <= BOTTOM_LIMIT };
}

module.exports = { renderResume, renderCoverLetter, safe };
