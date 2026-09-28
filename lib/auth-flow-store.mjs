import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function opaqueToken() {
  return randomBytes(32).toString('base64url');
}

export function pkceChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url');
}

// Only same-site paths survive; everything else (absolute URLs, protocol-relative `//host`, backslash tricks,
// control characters, sign-in routes that would loop) falls back to the homepage.
export function safeReturnPath(value, publicOrigin) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.length > 512) return '/';
  if (/[\\\u0000-\u001F\u007F]/.test(value)) return '/';
  try {
    const base = new URL(publicOrigin);
    const resolved = new URL(value, base);
    if (resolved.origin !== base.origin || resolved.pathname.startsWith('/auth/')) return '/';
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch { return '/'; }
}

export class AuthorizationFlowStore {
  constructor({ secret, now = Date.now, lifetimeMs = 10 * 60 * 1000, maxFlows = 10_000 } = {}) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('An authorization-flow secret of at least 32 characters is required');
    this.secret = secret;
    this.now = now;
    this.lifetimeMs = lifetimeMs;
    this.maxFlows = maxFlows;
    this.flows = new Map();
  }

  get size() {
    return this.flows.size;
  }

  digest(value) {
    return createHmac('sha256', this.secret).update(value).digest();
  }

  prune() {
    const currentTime = this.now();
    for (const [tokenHash, flow] of this.flows) {
      if (flow.expiresAt <= currentTime) this.flows.delete(tokenHash);
    }
  }

  create({ returnPath = '/' } = {}) {
    this.prune();
    // Map iteration follows insertion order, so the first entry is always the oldest pending flow.
    while (this.flows.size >= this.maxFlows) this.flows.delete(this.flows.keys().next().value);
    const token = opaqueToken();
    const state = opaqueToken();
    const nonce = opaqueToken();
    const codeVerifier = opaqueToken();
    this.flows.set(this.digest(token).toString('hex'), { stateHash: this.digest(state), nonce, codeVerifier, returnPath, expiresAt: this.now() + this.lifetimeMs });
    return { token, state, nonce, codeChallenge: pkceChallenge(codeVerifier) };
  }

  consume(token, state) {
    this.prune();
    if (typeof token !== 'string' || !token || typeof state !== 'string' || !state) return null;
    const tokenHash = this.digest(token).toString('hex');
    const flow = this.flows.get(tokenHash);
    if (!flow) return null;
    this.flows.delete(tokenHash);
    const suppliedState = this.digest(state);
    if (flow.stateHash.length !== suppliedState.length || !timingSafeEqual(flow.stateHash, suppliedState)) return null;
    return { nonce: flow.nonce, codeVerifier: flow.codeVerifier, returnPath: flow.returnPath };
  }
}
