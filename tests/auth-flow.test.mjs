import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthorizationFlowStore } from '../lib/auth-flow-store.mjs';

const secret = 'authorization-flow-test-secret-with-32-characters';

test('authorization transactions are server-side, single-use, and state-bound', () => {
  const store = new AuthorizationFlowStore({ secret, now: () => 1_000 });
  const flow = store.create();

  assert.equal(typeof flow.token, 'string');
  assert.equal(typeof flow.state, 'string');
  assert.equal(typeof flow.nonce, 'string');
  assert.equal(store.size, 1);
  assert.deepEqual(store.consume(flow.token, flow.state), { nonce: flow.nonce });
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
