import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizationFlowStore, pkceChallenge, safeReturnPath } from '../lib/auth-flow-store.mjs';

const secret = 'authorization-flow-test-secret-with-32-characters';

test('authorization transactions are server-side, single-use, state-bound, and carry PKCE and the return path', () => {
  const store = new AuthorizationFlowStore({ secret, now: () => 1_000 });
  const flow = store.create({ returnPath: '/#forecast' });

  assert.equal(typeof flow.token, 'string');
  assert.equal(typeof flow.state, 'string');
  assert.equal(typeof flow.nonce, 'string');
  assert.match(flow.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(flow.codeVerifier, undefined, 'the verifier never leaves the server-side flow');
  assert.equal(store.size, 1);
  const consumed = store.consume(flow.token, flow.state);
  assert.equal(consumed.nonce, flow.nonce);
  assert.equal(consumed.returnPath, '/#forecast');
  assert.match(consumed.codeVerifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(pkceChallenge(consumed.codeVerifier), flow.codeChallenge);
  assert.equal(store.size, 0);
  assert.equal(store.consume(flow.token, flow.state), null);
});

test('a state mismatch consumes the transaction and expired transactions fail closed', () => {
  let now = 1_000;
  const store = new AuthorizationFlowStore({ secret, now: () => now, lifetimeMs: 600_000 });
  const mismatched = store.create();
  assert.equal(store.consume(mismatched.token, 'attacker-state'), null);
  assert.equal(store.consume(mismatched.token, mismatched.state), null);

  const expired = store.create();
  now += 600_001;
  assert.equal(store.consume(expired.token, expired.state), null);
  assert.equal(store.size, 0);
});

test('PKCE challenges are the base64url SHA-256 of the verifier (RFC 7636 appendix B)', () => {
  assert.equal(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('return paths are limited to same-site paths', () => {
  const origin = 'https://hollywoodevolves.mcpherson.app';
  for (const [input, expected] of [
    ['/', '/'],
    ['/#forecast', '/#forecast'],
    ['/episodes/01?tab=forecast#top', '/episodes/01?tab=forecast#top'],
    ['/a/../b', '/b'],
    [null, '/'],
    ['', '/'],
    ['forecast', '/'],
    ['//attacker.example/path', '/'],
    ['/\\attacker.example', '/'],
    ['/\\/attacker.example', '/'],
    ['https://attacker.example/', '/'],
    ['javascript:alert(1)', '/'],
    ['/path\r\nSet-Cookie: x=1', '/'],
    ['/%0d%0aSet-Cookie:%20x=1', '/%0d%0aSet-Cookie:%20x=1'],
    ['/auth/linkedin', '/'],
    ['/' + 'a'.repeat(600), '/'],
  ]) assert.equal(safeReturnPath(input, origin), expected, String(input));
});

test('pending flows are bounded so a flood of sign-in starts cannot grow memory without limit', () => {
  const store = new AuthorizationFlowStore({ secret, now: () => 1_000, maxFlows: 3 });
  const first = store.create();
  const others = [store.create(), store.create(), store.create()];
  assert.equal(store.size, 3);
  assert.equal(store.consume(first.token, first.state), null, 'the oldest pending flow was evicted');
  assert.ok(store.consume(others[2].token, others[2].state));
});
