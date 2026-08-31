import assert from 'node:assert/strict';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { readJson } from '../lib/http-body.mjs';

test('oversized JSON stops buffering subsequent request chunks', async () => {
  const request = Readable.from([
    Buffer.from('{"body":"'),
    Buffer.alloc(64, 120),
    Buffer.alloc(64, 121),
    Buffer.from('"}'),
  ]);
  request.headers = { 'content-type': 'application/json' };
  await assert.rejects(readJson(request, 32), (error) => error.statusCode === 413);
  assert.equal(request.listenerCount('data'), 0);
});

test('valid bounded JSON still parses and enforces its content type', async () => {
  const request = Readable.from([Buffer.from('{"body":"within limit"}')]);
  request.headers = { 'content-type': 'application/json; charset=utf-8' };
  assert.deepEqual(await readJson(request, 128), { body: 'within limit' });

  const wrongType = Readable.from([Buffer.from('{}')]);
  wrongType.headers = { 'content-type': 'text/plain' };
  await assert.rejects(readJson(wrongType, 128), (error) => error.statusCode === 415);
});

test('malformed UTF-8 is rejected instead of being replaced before JSON parsing', async () => {
  const request = Readable.from([Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d])]);
  request.headers = { 'content-type': 'application/json' };
  await assert.rejects(readJson(request), (error) => error.statusCode === 400 && /UTF-8/.test(error.message));
});

test('a late stream error after a 413 remains handled while the request drains', async () => {
  const request = new PassThrough();
  request.headers = { 'content-type': 'application/json' };
  const result = readJson(request, 8);
  request.write(Buffer.alloc(16, 120));
  await assert.rejects(result, (error) => error.statusCode === 413);
  assert.ok(request.listenerCount('error') > 0);
  assert.doesNotThrow(() => request.emit('error', new Error('simulated late request error')));
  request.end();
  await new Promise((resolve) => setImmediate(resolve));
});
