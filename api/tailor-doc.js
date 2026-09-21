'use strict';

/**
 * /tailor/dl/<id>/<resume|cover> - serves a generated PDF for 24 hours.
 * The id is 128 random bits, so it can't be guessed.
 */

const store = require('./_store');

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || '');
  const file = String((req.query && req.query.file) || '');

  const notFound = (msg) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(404).send(msg);
  };

  if (!/^[a-f0-9]{32}$/.test(id) || !['resume', 'cover'].includes(file)) return notFound('Not found.');

  let doc;
  try {
    const raw = await store.command(['GET', `tailor:doc:${id}`]);
    doc = raw && JSON.parse(raw);
  } catch {
    return notFound('Storage unavailable.');
  }
  if (!doc) return notFound('This link has expired. Tailor the job again.');

  const pdf = Buffer.from(file === 'resume' ? doc.r : doc.c, 'base64');
  const name = (file === 'resume' ? doc.rn : doc.cn).replace(/[^A-Za-z0-9_.-]/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.setHeader('Content-Length', pdf.length);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(pdf);
};
