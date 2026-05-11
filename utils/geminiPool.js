/**
 * utils/geminiPool.js — Gemini API key rotation pool
 *
 * Reads GEMINI_API_KEY, GEMINI_API_KEY_2, GEMINI_API_KEY_3 … from .env.
 * Tracks which keys are RPD-exhausted and automatically rotates to the next
 * available one. When all keys are exhausted, throws so callers can fall back.
 *
 * Usage:
 *   const pool = require('./geminiPool');
 *   const key  = pool.getKey();          // throws if all exhausted
 *   pool.markExhausted(key, errBody);    // call on 429 RPD hit
 *   pool.trackRequest(key);              // call on every successful request
 *   const status = pool.getStatus();     // for admin dashboard
 */

const log = require('./logger');

const GEMINI_MODEL   = 'gemini-2.5-flash-lite';
const GEMINI_RPD     = 20;   // free tier RPD per key
const GEMINI_RPM     = 10;   // free tier RPM per key (approximate)
const PLACEHOLDER    = 'your-gemini-api-key-here';

function loadKeys() {
  const keys = [];
  // Support GEMINI_API_KEY (primary) + GEMINI_API_KEY_2 … GEMINI_API_KEY_20
  const primary = process.env.GEMINI_API_KEY;
  if (primary && primary !== PLACEHOLDER) keys.push(primary.trim());
  for (let i = 2; i <= 50; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k && k !== PLACEHOLDER && k !== '') keys.push(k.trim());
  }
  return keys;
}

// Per-key state
const keyState = {};   // key → { rpdUsed, rpmUsed, rpmWindowStart, exhaustedAt, exhaustedDate }

function ensureState(key) {
  if (!keyState[key]) {
    keyState[key] = {
      rpdUsed:        0,
      rpmUsed:        0,
      rpmWindowStart: Date.now(),
      exhaustedAt:    null,
      exhaustedDate:  null,
    };
  }
  const s = keyState[key];
  // Reset RPM window if 60s elapsed
  const now = Date.now();
  if (now - s.rpmWindowStart > 60000) {
    s.rpmUsed = 0;
    s.rpmWindowStart = now;
  }
  // Reset RPD at midnight
  const today = new Date().toDateString();
  if (s.exhaustedDate && s.exhaustedDate !== today) {
    s.rpdUsed = 0;
    s.exhaustedAt = null;
    s.exhaustedDate = null;
    log.info(`Gemini key …${key.slice(-6)} RPD reset (new day).`);
  }
  return s;
}

function isExhausted(key) {
  const s = keyState[key];
  if (!s) return false;
  // Re-check date reset
  const today = new Date().toDateString();
  if (s.exhaustedDate && s.exhaustedDate !== today) {
    s.rpdUsed = 0;
    s.exhaustedAt = null;
    s.exhaustedDate = null;
    return false;
  }
  return !!s.exhaustedAt;
}

const pool = {
  model: GEMINI_MODEL,

  /** Returns the best available key, or null if all are exhausted / none configured */
  getKey() {
    const keys = loadKeys();
    if (!keys.length) return null;

    // Prefer keys that are not exhausted
    for (const key of keys) {
      if (!isExhausted(key)) return key;
    }
    return null; // all exhausted
  },

  /** Call on every successful Gemini request */
  trackRequest(key) {
    if (!key) return;
    const s = ensureState(key);
    s.rpdUsed++;
    s.rpmUsed++;
  },

  /** Call when Gemini returns 429. Returns true if it was an RPD (daily) hit. */
  markExhausted(key, errBody = '') {
    if (!key) return false;
    const s = ensureState(key);
    const isRPD = /RPD|per.day|requests.*per.*day|free_tier_requests/i.test(errBody);
    if (isRPD) {
      s.rpdUsed = GEMINI_RPD;
      s.exhaustedAt = new Date().toISOString();
      s.exhaustedDate = new Date().toDateString();
      log.aiError(`Gemini key …${key.slice(-6)} RPD exhausted. ${loadKeys().filter(k => !isExhausted(k)).length} key(s) remaining.`);
    }
    return isRPD;
  },

  /** Returns status for all configured keys (for admin dashboard) */
  getStatus() {
    const keys = loadKeys();
    const midnight = new Date(); midnight.setHours(24,0,0,0);
    const secsUntilReset = Math.ceil((midnight - new Date()) / 1000);
    return {
      model:     GEMINI_MODEL,
      keyCount:  keys.length,
      rpdLimit:  GEMINI_RPD,
      rpmLimit:  GEMINI_RPM,
      secsUntilReset,
      keys: keys.map((k, i) => {
        const s = keyState[k] || { rpdUsed: 0, rpmUsed: 0, rpmWindowStart: Date.now(), exhaustedAt: null };
        const now = Date.now();
        const rpmSecs = Math.max(0, 60 - Math.floor((now - (s.rpmWindowStart || now)) / 1000));
        return {
          index:      i + 1,
          label:      `Key ${i + 1} (…${k.slice(-6)})`,
          rpdUsed:    s.rpdUsed || 0,
          rpmUsed:    s.rpmUsed || 0,
          rpmSecsLeft: rpmSecs,
          exhausted:  isExhausted(k),
        };
      }),
      availableKeys: keys.filter(k => !isExhausted(k)).length,
      configured: keys.length > 0,
    };
  },

  /** Build the Gemini fetch URL for a given key */
  buildUrl(key) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;
  },
};

module.exports = pool;
