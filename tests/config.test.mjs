import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../lib/config.mjs';
import { completeAuthEnv, PUBLIC_ORIGIN } from './support/database.mjs';

const origin = PUBLIC_ORIGIN;

test('sign-in and forecasting are off unless every required value is present and valid', () => {
  assert.equal(loadConfig({}).authEnabled, false);
  assert.equal(loadConfig({ ...completeAuthEnv, AUTH_ENABLED: 'false' }).authEnabled, false);
  const enabled = loadConfig(completeAuthEnv);
  assert.equal(enabled.authEnabled, true);
  assert.equal(enabled.commentaryEnabled, false);
  assert.equal(enabled.databaseUrl, completeAuthEnv.DATABASE_URL);
  assert.equal(enabled.adminName, 'Ian McPherson');

  for (const [name, value] of [
    ['DATABASE_URL', ''],
    ['PUBLIC_ORIGIN', 'http://hollywoodevolves.mcpherson.app'],
    ['PUBLIC_ORIGIN', `${origin}/path`],
    ['LINKEDIN_CLIENT_ID', ''],
    ['LINKEDIN_CLIENT_SECRET', ''],
    ['LINKEDIN_REDIRECT_URI', 'https://attacker.example/auth/linkedin/callback'],
    ['LINKEDIN_REDIRECT_URI', `${origin}/auth/linkedin/callback?next=/`],
    ['AUTH_SECRET', 'too-short'],
    ['ADMIN_TOKEN', 'too-short'],
    ['ADMIN_NAME', '   '],
  ]) {
    const config = loadConfig({ ...completeAuthEnv, [name]: value });
    assert.equal(config.authEnabled, false, `${name}=${value}`);
    assert.ok(config.authProblems.includes(name), name);
    assert.equal(config.databaseUrl, null, 'secrets are not exposed while disabled');
    assert.equal(config.adminToken, null);
  }
});

test('reported problems name variables but never contain their values', () => {
  const config = loadConfig({ ...completeAuthEnv, AUTH_SECRET: 'short-secret-value' });
  assert.deepEqual(config.authProblems, ['AUTH_SECRET']);
  assert.doesNotMatch(JSON.stringify(config.authProblems), /short-secret-value|password/);
});

test('comment routes need COMMENTARY_ENABLED on top of the sign-in gate', () => {
  assert.equal(loadConfig({ COMMENTARY_ENABLED: 'true' }).commentaryEnabled, false);
  assert.equal(loadConfig({ ...completeAuthEnv, COMMENTARY_ENABLED: 'true' }).commentaryEnabled, true);
});

test('proxy trust is explicit and a trailing slash on the origin is tolerated', () => {
  assert.equal(loadConfig({}).trustProxy, false);
  assert.equal(loadConfig({ TRUST_PROXY: 'true' }).trustProxy, true);
  assert.equal(loadConfig({ TRUST_PROXY: '1' }).trustProxy, false);
  assert.equal(loadConfig({ ...completeAuthEnv, PUBLIC_ORIGIN: `${origin}/` }).publicOrigin, origin);
  assert.equal(loadConfig({}).publicOrigin, origin);
});
