/**
 * Minimal KV store — no npm package required.
 *
 * • In production: uses Upstash Redis REST API directly via fetch
 *   (Vercel KV sets KV_REST_API_URL + KV_REST_API_TOKEN automatically)
 * • In development (no env vars): uses a simple in-memory Map
 *
 * This avoids any reference to @vercel/kv so Turbopack never warns.
 */

// ── In-memory fallback ────────────────────────────────────────────────────────
const memStore = new Map();
const memKv = {
  async get(key) { return memStore.get(key) ?? null; },
  async set(key, value) { memStore.set(key, value); return 'OK'; },
};

// ── Upstash REST client ───────────────────────────────────────────────────────
function makeUpstashKv(url, token) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  return {
    async get(key) {
      const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers });
      const json = await res.json();
      const raw = json.result;
      if (raw === null || raw === undefined) return null;
      try { return JSON.parse(raw); } catch { return raw; }
    },
    async set(key, value) {
      const body = JSON.stringify(['SET', key, JSON.stringify(value)]);
      await fetch(`${url}`, { method: 'POST', headers, body });
      return 'OK';
    },
  };
}

// ── Factory (runs once at startup) ───────────────────────────────────────────
function buildKv() {
  const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    console.log('[kv] Using Upstash REST API for KV storage.');
    return makeUpstashKv(url, token);
  }

  console.log('[kv] No KV credentials — using in-memory store (dev mode).');
  return memKv;
}

const _kv = buildKv();
export async function getKv() { return _kv; }
