import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { LinkedInOidcClient } from '../lib/linkedin-oidc.mjs';
import { CommentaryStore } from '../lib/commentary-store.mjs';

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

test('builds a least-privilege LinkedIn authorization URL with state and nonce', async () => {
  const fixture = await oidcFixture();
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  const url = await client.authorizationUrl({ state: 'csrf-state', nonce: fixture.nonce });
  assert.equal(url.origin, issuer);
  assert.equal(url.pathname, '/oauth/v2/authorization');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), clientId);
  assert.equal(url.searchParams.get('redirect_uri'), redirectUri);
  assert.equal(url.searchParams.get('scope'), 'openid profile email');
  assert.equal(url.searchParams.get('state'), 'csrf-state');
  assert.equal(url.searchParams.get('nonce'), fixture.nonce);
});

test('redeems a code and cryptographically validates LinkedIn ID-token claims', async () => {
  const fixture = await oidcFixture();
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  const member = await client.redeem({ code: 'authorization-code', nonce: fixture.nonce });
  assert.deepEqual(member, {
    sub: 'linkedin-sub-123',
    name: 'Ada Lovelace',
    picture: 'https://media.example/ada.jpg',
    email: 'ada@example.com',
    emailVerified: true,
  });
  const tokenCall = fixture.calls.find(({ url }) => url.endsWith('/accessToken'));
  assert.equal(tokenCall.options.method, 'POST');
  assert.match(tokenCall.options.headers['content-type'], /application\/x-www-form-urlencoded/);
  assert.match(String(tokenCall.options.body), /client_secret=secret/);
});

test('rejects a signed ID token with the wrong nonce or audience', async () => {
  for (const options of [{ tokenNonce: 'attacker-nonce' }, { audience: 'other-client' }]) {
    const fixture = await oidcFixture(options);
    const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
    await assert.rejects(client.redeem({ code: 'authorization-code', nonce: fixture.nonce }), /nonce|aud/i);
  }
});

test('rejects a stale ID token even when its expiration is still in the future', async () => {
  const fixture = await oidcFixture({ issuedAt: Math.floor(Date.now() / 1000) - 3600 });
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  await assert.rejects(client.redeem({ code: 'authorization-code', nonce: fixture.nonce }), /iat|token age/i);
});

test('requires the exact authorized party when an ID token has multiple audiences', async () => {
  for (const authorizedParty of [undefined, 'other-client']) {
    const fixture = await oidcFixture({ audience: [clientId, 'another-audience'], authorizedParty });
    const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
    await assert.rejects(client.redeem({ code: 'authorization-code', nonce: fixture.nonce }), /authorized party|azp/i);
  }

  const fixture = await oidcFixture({ audience: [clientId, 'another-audience'], authorizedParty: clientId });
  const client = new LinkedInOidcClient({ clientId, clientSecret: 'secret', redirectUri, fetch: fixture.fetch });
  assert.equal((await client.redeem({ code: 'authorization-code', nonce: fixture.nonce })).sub, 'linkedin-sub-123');
});

test('creates opaque server-side sessions, issues tab-stable CSRF tokens, and revokes logout', () => {
  const store = new CommentaryStore({ secret: 'commentary-test-secret', now: () => '2026-08-30T20:00:00.000Z' });
  store.upsertLinkedInMember({ sub: 'linkedin-sub-123', name: 'Ada Lovelace', picture: null, email: null, emailVerified: false });
  const created = store.createSession('linkedin-sub-123');
  assert.ok(created.token.length >= 32);
  const firstTab = store.csrfTokenForSession(created.token);
  const secondTab = store.csrfTokenForSession(created.token);
  assert.ok(firstTab.length >= 32);
  assert.equal(firstTab, secondTab);
  assert.equal(store.getSession(created.token).member.name, 'Ada Lovelace');
  assert.equal(store.verifyCsrf(created.token, firstTab), true);
  assert.doesNotMatch(JSON.stringify(store.snapshot()), new RegExp(created.token));
  assert.doesNotMatch(JSON.stringify(store.snapshot()), new RegExp(firstTab));
  store.revokeSession(created.token);
  assert.equal(store.getSession(created.token), null);
});
