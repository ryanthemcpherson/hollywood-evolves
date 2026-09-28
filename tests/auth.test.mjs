import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { AccountStore } from '../lib/account-store.mjs';
import { pkceChallenge } from '../lib/auth-flow-store.mjs';
import { LinkedInOidcClient } from '../lib/linkedin-oidc.mjs';
import { AUTH_SECRET, freshDatabase, testClock } from './support/database.mjs';

const issuer = 'https://www.linkedin.com';
const clientId = 'linkedin-client-id';
const redirectUri = 'https://hollywoodevolves.mcpherson.app/auth/linkedin/callback';

async function oidcFixture({ nonce = 'expected-nonce', tokenNonce = nonce, audience = clientId, authorizedParty, issuedAt = Math.floor(Date.now() / 1000) } = {}) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key';
  publicJwk.use = 'sig';
  const idToken = await new SignJWT({ sub: 'linkedin-sub-123', name: 'Ada Lovelace', picture: 'https://media.example/ada.jpg', email: 'ada@example.com', email_verified: true, nonce: tokenNonce, ...(authorizedParty === undefined ? {} : { azp: authorizedParty }) })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
    .sign(privateKey);
  const calls = [];
  const fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === `${issuer}/oauth/.well-known/openid-configuration`) return Response.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/v2/authorization`,
      token_endpoint: `${issuer}/oauth/v2/accessToken`,
      jwks_uri: `${issuer}/oauth/openid/jwks`,
    });
    if (String(url) === `${issuer}/oauth/v2/accessToken`) return Response.json({ access_token: 'access-token', token_type: 'Bearer', expires_in: 3600, id_token: idToken });
    if (String(url) === `${issuer}/oauth/openid/jwks`) return Response.json({ keys: [publicJwk] });
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { fetch, calls, nonce };
}

test('builds a least-privilege LinkedIn authorization URL with state, nonce, and PKCE S256', async () => {
  const fixture = await oidcFixture();
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  const url = await client.authorizationUrl({ state: 'csrf-state', nonce: fixture.nonce, codeChallenge: pkceChallenge('verifier') });
  assert.equal(url.origin, issuer);
  assert.equal(url.pathname, '/oauth/v2/authorization');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), clientId);
  assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(url.searchParams.get('scope'), 'openid profile email');
  assert.equal(url.searchParams.get('state'), 'csrf-state');
  assert.equal(url.searchParams.get('nonce'), fixture.nonce);
  assert.equal(url.searchParams.get('code_challenge'), pkceChallenge('verifier'));
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  await assert.rejects(client.authorizationUrl({ state: 'csrf-state', nonce: fixture.nonce }), /PKCE/);
});

test('redeems a code with the PKCE verifier and cryptographically validates LinkedIn ID-token claims', async () => {
  const fixture = await oidcFixture();
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  await assert.rejects(client.redeem({ code: 'authorization-code', nonce: fixture.nonce }), /PKCE/);
  const member = await client.redeem({ code: 'authorization-code', nonce: fixture.nonce, codeVerifier: 'pkce-verifier' });
  // The profile photo is deliberately dropped: the UI never shows it, so it is never stored.
  assert.deepEqual(member, {
    sub: 'linkedin-sub-123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    emailVerified: true,
  });
  const tokenCall = fixture.calls.find(({ url }) => url.endsWith('/accessToken'));
  assert.equal(tokenCall.options.method, 'POST');
  assert.match(tokenCall.options.headers['content-type'], /application\/x-www-form-urlencoded/);
  assert.match(String(tokenCall.options.body), /client_secret=secret/);
  assert.equal(new URLSearchParams(String(tokenCall.options.body)).get('code_verifier'), 'pkce-verifier');
});

test('rejects a signed ID token with the wrong nonce or audience', async () => {
  for (const options of [{ tokenNonce: 'attacker-nonce' }, { audience: 'other-client' }]) {
    const fixture = await oidcFixture(options);
    const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
    await assert.rejects(client.redeem({ code: 'authorization-code', nonce: fixture.nonce, codeVerifier: 'pkce-verifier' }), /nonce|aud/i);
  }
});

test('rejects a stale ID token even when its expiration is still in the future', async () => {
  const fixture = await oidcFixture({ issuedAt: Math.floor(Date.now() / 1000) - 3600 });
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  await assert.rejects(client.redeem({ code: 'authorization-code', nonce: fixture.nonce, codeVerifier: 'pkce-verifier' }), /iat|token age/i);
});

test('requires the exact authorized party when an ID token has multiple audiences', async () => {
  for (const authorizedParty of [undefined, 'other-client']) {
    const fixture = await oidcFixture({ audience: [clientId, 'another-audience'], authorizedParty });
    const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
    await assert.rejects(client.redeem({ code: 'authorization-code', nonce: fixture.nonce, codeVerifier: 'pkce-verifier' }), /authorized party|azp/i);
  }

  const fixture = await oidcFixture({ audience: [clientId, 'another-audience'], authorizedParty: clientId });
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  assert.equal((await client.redeem({ code: 'authorization-code', nonce: fixture.nonce, codeVerifier: 'pkce-verifier' })).sub, 'linkedin-sub-123');
});

test('creates opaque server-side sessions, issues tab-stable CSRF tokens, and revokes logout', async (t) => {
  const db = await freshDatabase(t);
  const now = testClock();
  const store = new AccountStore({ db, secret: AUTH_SECRET, now });
  const created = await store.signIn({ sub: 'linkedin-sub-123', name: 'Ada Lovelace', email: null, emailVerified: false });
  assert.ok(created.token.length >= 32);
  const firstTab = store.csrfToken(created.token);
  const secondTab = store.csrfToken(created.token);
  assert.ok(firstTab.length >= 32);
  assert.equal(firstTab, secondTab);
  const member = await store.getSession(created.token);
  assert.equal(member.name, 'Ada Lovelace');
  assert.equal(store.verifyCsrf(created.token, firstTab), true);
  assert.equal(store.verifyCsrf(created.token, 'forged'), false);
  assert.equal(store.verifyCsrf(created.token, undefined), false);
  const other = await store.signIn({ sub: 'linkedin-sub-456', name: 'Grace Hopper' });
  assert.equal(store.verifyCsrf(other.token, firstTab), false, 'CSRF tokens are bound to their session');
  const stored = JSON.stringify((await db.query('SELECT * FROM he.sessions')).rows);
  assert.doesNotMatch(stored, new RegExp(created.token));
  assert.doesNotMatch(stored, new RegExp(firstTab));
  await store.revokeSession(created.token, member.id);
  assert.equal(await store.getSession(created.token), null);
  assert.ok(await store.getSession(other.token));
});

test('sessions expire after seven days and expired rows are purged on sign-in and on demand', async (t) => {
  const db = await freshDatabase(t);
  const now = testClock();
  const store = new AccountStore({ db, secret: AUTH_SECRET, now });
  const first = await store.signIn({ sub: 'linkedin-sub-123', name: 'Ada Lovelace' });
  const { rows: [session] } = await db.query('SELECT created_at, expires_at FROM he.sessions');
  assert.equal(session.expires_at - session.created_at, 7 * 24 * 60 * 60 * 1000);
  now.advance(7 * 24 * 60 * 60 * 1000);
  assert.equal(await store.getSession(first.token), null);
  const second = await store.signIn({ sub: 'linkedin-sub-456', name: 'Grace Hopper' });
  assert.deepEqual((await db.query('SELECT count(*)::int AS count FROM he.sessions')).rows, [{ count: 1 }], 'sign-in purged the expired session');
  now.advance(7 * 24 * 60 * 60 * 1000);
  assert.equal(await store.purgeExpiredSessions(), 1);
  assert.equal(await store.getSession(second.token), null);
  const { rows: audit } = await db.query('SELECT action, actor FROM he.audit ORDER BY id');
  assert.deepEqual(audit, [{ action: 'member_created', actor: 'member' }, { action: 'member_created', actor: 'member' }]);
});
