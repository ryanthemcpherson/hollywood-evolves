import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function opaqueToken() {
  return randomBytes(32).toString('base64url');
}

export class AuthorizationFlowStore {
  constructor({ secret, now = Date.now, lifetimeMs = 10 * 60 * 1000 } = {}) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('An authorization-flow secret of at least 32 characters is required');
    this.secret = secret;
    this.now = now;
    this.lifetimeMs = lifetimeMs;
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

  create() {
    this.prune();
    const token = opaqueToken();
    const state = opaqueToken();
    const nonce = opaqueToken();
    this.flows.set(this.digest(token).toString('hex'), { stateHash: this.digest(state), nonce, expiresAt: this.now() + this.lifetimeMs });
    return { token, state, nonce };
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
    return { nonce: flow.nonce };
  }
}
