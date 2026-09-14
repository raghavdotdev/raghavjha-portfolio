'use strict';

/**
 * Minimal Upstash Redis REST client - no dependencies, so the site stays a
 * zero-build static project.
 *
 * Reads whichever env var pair Vercel injected: the Upstash integration uses
 * UPSTASH_REDIS_REST_*, the older Vercel KV naming uses KV_REST_API_*.
 */

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const KEY = 'libcal:rooms';

const configured = () => Boolean(URL_ && TOKEN);

async function get() {
  if (!configured()) return null;
  const r = await fetch(`${URL_}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`store read ${r.status}`);
  const { result } = await r.json();
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

async function set(value) {
  if (!configured()) throw new Error('store not configured');
  const r = await fetch(`${URL_}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`store write ${r.status}`);
}

module.exports = { get, set, configured };
