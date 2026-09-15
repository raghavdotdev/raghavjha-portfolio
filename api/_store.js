'use strict';

/**
 * Minimal Upstash Redis REST client - no dependencies, so the site stays a
 * zero-build static project.
 *
 * Vercel injects the credentials under different names depending on how the
 * store was linked (UPSTASH_REDIS_REST_*, KV_REST_API_*, or those with a
 * store-name prefix), so discover them rather than hard-coding one pair.
 */

const KEY = 'libcal:rooms';

function discover() {
  const env = process.env;

  // Exact names first, in order of preference.
  const pairs = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['REDIS_REST_URL', 'REDIS_REST_TOKEN'],
  ];
  for (const [u, t] of pairs) {
    if (env[u] && env[t]) return { url: env[u], token: env[t], via: u };
  }

  // Otherwise: any *_REST_URL whose sibling *_REST_TOKEN also exists.
  for (const name of Object.keys(env)) {
    if (!/REST_URL$/.test(name)) continue;
    const tokenName = name.replace(/REST_URL$/, 'REST_TOKEN');
    if (env[name] && env[tokenName]) return { url: env[name], token: env[tokenName], via: name };
  }
  return null;
}

const creds = () => {
  const c = discover();
  if (!c) return null;
  return { ...c, url: c.url.replace(/\/+$/, '') };
};

const configured = () => Boolean(creds());

/** Names only, never values - for the diagnostic endpoint. */
function debugNames() {
  const c = discover();
  return {
    configured: Boolean(c),
    matchedVar: c ? c.via : null,
    candidateVars: Object.keys(process.env)
      .filter((n) => /REDIS|UPSTASH|KV_/i.test(n))
      .sort(),
  };
}

async function get() {
  const c = creds();
  if (!c) return null;
  const r = await fetch(`${c.url}/get/${KEY}`, {
    headers: { Authorization: `Bearer ${c.token}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`store read ${r.status}`);
  const { result } = await r.json();
  if (!result) return null;
  try { return JSON.parse(result); } catch { return null; }
}

async function set(value) {
  const c = creds();
  if (!c) throw new Error('store not configured');
  const r = await fetch(`${c.url}/set/${KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}` },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`store write ${r.status} ${(await r.text()).slice(0, 120)}`);
}

module.exports = { get, set, configured, debugNames };
