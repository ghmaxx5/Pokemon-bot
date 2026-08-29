const { loadImage } = require("@napi-rs/canvas");

/**
 * Shared sprite cache.
 *
 * Battle images used to reload every sprite from the network on every single
 * turn — a 60-turn duel meant well over a hundred HTTP fetches, which is both
 * slow and a good way to get rate-limited. Sprites never change, so they are
 * cached by URL for the life of the process.
 */

const MAX_ENTRIES = 400;
const NEGATIVE_TTL = 5 * 60 * 1000;

const cache = new Map();   // url -> Image        (insertion order = LRU order)
const failures = new Map(); // url -> timestamp of the failed attempt
const inflight = new Map(); // url -> Promise      (dedupes concurrent loads)

function touchLru(url, img) {
  // Re-inserting moves the key to the end, so the oldest key is always first.
  cache.delete(url);
  cache.set(url, img);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/**
 * Loads a sprite, returning null instead of throwing so a missing image can
 * never take a battle turn down with it.
 */
async function getSprite(url) {
  if (!url) return null;

  const hit = cache.get(url);
  if (hit) {
    touchLru(url, hit);
    return hit;
  }

  // Don't retry a known-bad URL on every frame, but do let it recover later.
  const failedAt = failures.get(url);
  if (failedAt !== undefined) {
    if (Date.now() - failedAt < NEGATIVE_TTL) return null;
    failures.delete(url);
  }

  // Two Pokemon on screen can share a sprite URL; load it once.
  const pending = inflight.get(url);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const img = await loadImage(url);
      touchLru(url, img);
      return img;
    } catch (err) {
      failures.set(url, Date.now());
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, promise);
  return promise;
}

/** Warms the cache without blocking on the result. */
function prefetch(urls) {
  for (const url of urls) {
    if (url && !cache.has(url) && !inflight.has(url)) getSprite(url).catch(() => {});
  }
}

function stats() {
  return { cached: cache.size, failed: failures.size, inflight: inflight.size };
}

function clear() {
  cache.clear();
  failures.clear();
}

module.exports = { getSprite, prefetch, stats, clear, MAX_ENTRIES };
