/**
 * Database abstraction layer for Clube do Natural API.
 *
 * Uses Vercel KV (Redis) when KV_REST_API_URL is set,
 * otherwise falls back to in-memory storage (dev only).
 */

// ---------------------------------------------------------------------------
// In-memory fallback (non-persistent — development only)
// ---------------------------------------------------------------------------
const memoryStore = new Map();

const memory = {
  async get(key) {
    return memoryStore.get(key) ?? null;
  },
  async set(key, value) {
    memoryStore.set(key, value);
  },
  async list(prefix) {
    const results = [];
    for (const [k, v] of memoryStore) {
      if (k.startsWith(prefix)) results.push({ key: k, value: v });
    }
    return results;
  },
  async append(key, item) {
    const current = memoryStore.get(key);
    const arr = Array.isArray(current) ? current : [];
    arr.push(item);
    memoryStore.set(key, arr);
  },
  async delete(key) {
    memoryStore.delete(key);
  },
};

// ---------------------------------------------------------------------------
// Vercel KV (Redis) adapter
// ---------------------------------------------------------------------------
function kvHeaders() {
  return {
    Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function kvUrl(path = "") {
  const base = process.env.KV_REST_API_URL.replace(/\/$/, "");
  return `${base}${path}`;
}

async function kvCommand(...args) {
  const res = await fetch(kvUrl(), {
    method: "POST",
    headers: kvHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.result;
}

const kv = {
  async get(key) {
    const raw = await kvCommand("GET", key);
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },
  async set(key, value) {
    await kvCommand("SET", key, JSON.stringify(value));
  },
  async list(prefix) {
    const keys = await kvCommand("KEYS", `${prefix}*`);
    if (!keys || keys.length === 0) return [];
    const results = [];
    for (const k of keys) {
      const value = await kv.get(k);
      results.push({ key: k, value });
    }
    return results;
  },
  async append(key, item) {
    const current = await kv.get(key);
    const arr = Array.isArray(current) ? current : [];
    arr.push(item);
    await kv.set(key, arr);
  },
  async delete(key) {
    await kvCommand("DEL", key);
  },
};

// ---------------------------------------------------------------------------
// Export the right adapter
// ---------------------------------------------------------------------------
const db = process.env.KV_REST_API_URL ? kv : memory;

module.exports = db;
