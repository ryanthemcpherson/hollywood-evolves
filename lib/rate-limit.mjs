import { isIP } from 'node:net';

// Behind Railway's proxy every socket address is the proxy, so the client address comes from X-Forwarded-For.
// Only trust that header when TRUST_PROXY=true; otherwise any client could pick its own rate-limit bucket.
export function clientAddress(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const leftmost = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim();
    if (leftmost && isIP(leftmost)) return leftmost;
  }
  return req.socket?.remoteAddress || 'unknown';
}

// Sliding-window limiter with a hard cap on tracked keys so a flood of distinct addresses cannot grow memory unbounded.
export class RateLimiter {
  constructor({ maxKeys = 10_000, now = Date.now } = {}) {
    this.maxKeys = maxKeys;
    this.now = now;
    this.buckets = new Map();
  }

  get size() {
    return this.buckets.size;
  }

  allow(key, limit, windowMs) {
    const currentTime = this.now();
    const bucket = this.buckets.get(key);
    const hits = (bucket?.hits ?? []).filter((time) => currentTime - time < windowMs);
    if (hits.length >= limit) {
      this.buckets.set(key, { hits, windowMs });
      return false;
    }
    if (!bucket && this.buckets.size >= this.maxKeys) {
      this.sweep();
      // Still full: evict the oldest-inserted bucket rather than refusing to track the new client.
      if (this.buckets.size >= this.maxKeys) this.buckets.delete(this.buckets.keys().next().value);
    }
    hits.push(currentTime);
    this.buckets.delete(key);
    this.buckets.set(key, { hits, windowMs });
    return true;
  }

  sweep() {
    const currentTime = this.now();
    for (const [key, { hits, windowMs }] of this.buckets) {
      if (!hits.length || currentTime - hits[hits.length - 1] >= windowMs) this.buckets.delete(key);
    }
  }
}
