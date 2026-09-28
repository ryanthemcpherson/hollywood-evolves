import assert from 'node:assert/strict';
import test from 'node:test';
import { clientAddress, RateLimiter } from '../lib/rate-limit.mjs';

const request = (headers = {}, remoteAddress = '10.0.0.1') => ({ headers, socket: { remoteAddress } });

test('client address ignores X-Forwarded-For unless TRUST_PROXY is enabled', () => {
  const proxied = request({ 'x-forwarded-for': '203.0.113.7, 10.0.0.5' });
  assert.equal(clientAddress(proxied), '10.0.0.1');
  assert.equal(clientAddress(proxied, { trustProxy: false }), '10.0.0.1');
  assert.equal(clientAddress(proxied, { trustProxy: true }), '203.0.113.7');
  assert.equal(clientAddress(request({ 'x-forwarded-for': '2001:db8::1' }), { trustProxy: true }), '2001:db8::1');
  assert.equal(clientAddress(request({ 'x-forwarded-for': 'not-an-ip, 203.0.113.7' }), { trustProxy: true }), '10.0.0.1');
  assert.equal(clientAddress(request({}), { trustProxy: true }), '10.0.0.1');
  assert.equal(clientAddress({ headers: {}, socket: {} }), 'unknown');
});

test('sliding windows allow the limit and recover once hits age out', () => {
  let now = 0;
  const limiter = new RateLimiter({ now: () => now });
  assert.equal(limiter.allow('a', 2, 1000), true);
  assert.equal(limiter.allow('a', 2, 1000), true);
  assert.equal(limiter.allow('a', 2, 1000), false);
  assert.equal(limiter.allow('b', 2, 1000), true, 'buckets are independent');
  now = 1000;
  assert.equal(limiter.allow('a', 2, 1000), true);
});

test('buckets are bounded and swept once their window has passed', () => {
  let now = 0;
  const limiter = new RateLimiter({ now: () => now, maxKeys: 3 });
  for (const key of ['a', 'b', 'c', 'd']) assert.equal(limiter.allow(key, 1, 1000), true);
  assert.equal(limiter.size, 3, 'the oldest key was evicted to admit a new client');
  assert.equal(limiter.allow('a', 1, 1000), true, 'evicted key starts fresh');
  assert.equal(limiter.allow('d', 1, 1000), false);
  now = 1000;
  limiter.sweep();
  assert.equal(limiter.size, 0);
});

test('a full limiter prefers sweeping expired buckets over evicting live ones', () => {
  let now = 0;
  const limiter = new RateLimiter({ now: () => now, maxKeys: 2 });
  limiter.allow('short', 1, 10);
  limiter.allow('long', 1, 10_000);
  now = 20;
  limiter.allow('new', 1, 10_000);
  assert.equal(limiter.allow('long', 1, 10_000), false, 'the live bucket survived');
  assert.equal(limiter.size, 2);
});
