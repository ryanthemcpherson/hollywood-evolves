import assert from 'node:assert/strict';
import { request } from 'node:http';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { AccountStore, deriveAnonId } from '../lib/account-store.mjs';
import { pkceChallenge } from '../lib/auth-flow-store.mjs';
import { createApp } from '../server.mjs';
import { ADMIN_TOKEN, AUTH_SECRET, completeAuthEnv, DRAFT_QUESTION, EPISODE_01, freshDatabase, PUBLIC_ORIGIN, signInMembers, testClock } from './support/database.mjs';

const issuer = 'https://www.linkedin.com';

// A stand-in for LinkedIn that checks the PKCE verifier the server sends against the challenge it published.
async function linkedInFixture() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', use: 'sig' };
  const pending = new Map();
  const fetch = async (url, options = {}) => {
    const target = String(url);
    if (target === `${issuer}/oauth/.well-known/openid-configuration`) {
      return Response.json({ issuer, authorization_endpoint: `${issuer}/oauth/v2/authorization`, token_endpoint: `${issuer}/oauth/v2/accessToken`, jwks_uri: `${issuer}/oauth/openid/jwks` });
    }
    if (target === `${issuer}/oauth/v2/accessToken`) {
      const body = new URLSearchParams(String(options.body));
      const grant = pending.get(body.get('code'));
      pending.delete(body.get('code'));
      if (!grant || pkceChallenge(body.get('code_verifier') ?? '') !== grant.codeChallenge) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      const idToken = await new SignJWT({ ...grant.claims, nonce: grant.nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .setIssuer(issuer).setAudience(completeAuthEnv.LINKEDIN_CLIENT_ID).setIssuedAt().setExpirationTime('5m')
        .sign(privateKey);
      return Response.json({ access_token: 'access-token', token_type: 'Bearer', expires_in: 3600, id_token: idToken });
    }
    if (target === `${issuer}/oauth/openid/jwks`) return Response.json({ keys: [jwk] });
    throw new Error(`Unexpected URL: ${target}`);
  };
  return {
    fetch,
    approve(authorizationUrl, claims, code = `code-${pending.size + 1}-${Math.random()}`) {
      const url = new URL(authorizationUrl);
      pending.set(code, { nonce: url.searchParams.get('nonce'), codeChallenge: url.searchParams.get('code_challenge'), claims });
      return { code, state: url.searchParams.get('state') };
    },
  };
}

function call(port, path, { method = 'GET', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port, path, method, headers: { ...(payload !== null && !headers['content-type'] ? { 'content-type': 'application/json' } : {}), ...headers } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

async function startApp(t, { env = {}, database = null } = {}) {
  const db = database ?? await freshDatabase(t, { migrated: false });
  const now = testClock();
  const linkedIn = await linkedInFixture();
  const app = createApp({ env: { ...completeAuthEnv, ...env }, database: db, fetch: linkedIn.fetch, now });
  const started = await app.forecasting.start();
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const { port } = app.server.address();
  const accounts = new AccountStore({ db, secret: AUTH_SECRET, now });
  return { app, db, now, port, linkedIn, accounts, started };
}

async function signIn(context, { returnPath, claims = { sub: 'linkedin-sub-1', name: 'Ada Lovelace', email: 'ada@example.com', email_verified: true } } = {}) {
  const start = await call(context.port, `/auth/linkedin${returnPath === undefined ? '' : `?return=${encodeURIComponent(returnPath)}`}`);
  assert.equal(start.status, 302);
  const flowCookie = start.headers['set-cookie'][0].split(';')[0];
  const { code, state } = context.linkedIn.approve(start.headers.location, claims);
  const callback = await call(context.port, `/auth/linkedin/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`, { headers: { cookie: flowCookie } });
  const sessionCookie = callback.headers['set-cookie']?.find((value) => value.startsWith('__Host-he_session='));
  return { start, callback, flowCookie, code, state, cookie: sessionCookie?.split(';')[0] ?? null };
}

async function csrfFor(port, cookie) {
  return (await call(port, '/api/session', { headers: { cookie } })).json.csrfToken;
}

function memberHeaders(cookie, csrf) {
  return { cookie, origin: PUBLIC_ORIGIN, 'x-csrf-token': csrf };
}

const adminHeaders = { authorization: `Bearer ${ADMIN_TOKEN}` };

test('LinkedIn sign-in uses PKCE S256, carries a validated return path, and sets the session cookie', async (t) => {
  const context = await startApp(t);
  assert.equal(context.started, true);
  const { start, callback, flowCookie, code, state } = await signIn(context, { returnPath: '/#forecast' });
  const authorization = new URL(start.headers.location);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  assert.match(authorization.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(authorization.searchParams.get('redirect_uri'), `${PUBLIC_ORIGIN}/auth/linkedin/callback`);
  assert.doesNotMatch(start.headers.location, /return|forecast/, 'the return path stays server-side');
  assert.match(start.headers['set-cookie'][0], /^__Host-he_oidc=[^;]+; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/);

  assert.equal(callback.status, 302);
  assert.equal(callback.headers.location, `${PUBLIC_ORIGIN}/#forecast`);
  assert.equal(callback.headers['cache-control'], 'no-store');
  const cookies = callback.headers['set-cookie'];
  assert.match(cookies[0], /^__Host-he_oidc=; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=0$/);
  assert.match(cookies[1], /^__Host-he_session=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=604800$/);

  // The flow is single-use: replaying the callback fails closed.
  const replay = await call(context.port, `/auth/linkedin/callback?code=${code}&state=${state}`, { headers: { cookie: flowCookie } });
  assert.equal(replay.status, 401);

  for (const [returnPath, expected] of [['//attacker.example', '/'], ['https://attacker.example/', '/'], [undefined, '/'], ['/privacy.html?x=1', '/privacy.html?x=1']]) {
    const result = await signIn(context, { returnPath });
    assert.equal(result.callback.headers.location, `${PUBLIC_ORIGIN}${expected}`, String(returnPath));
  }
  const { rows } = await context.db.query('SELECT linkedin_sub, name, email, email_verified FROM he.members');
  assert.deepEqual(rows, [{ linkedin_sub: 'linkedin-sub-1', name: 'Ada Lovelace', email: 'ada@example.com', email_verified: true }]);
});

test('a callback whose PKCE verifier LinkedIn rejects does not create a session', async (t) => {
  const context = await startApp(t);
  const start = await call(context.port, '/auth/linkedin');
  const flowCookie = start.headers['set-cookie'][0].split(';')[0];
  const { state } = context.linkedIn.approve(start.headers.location, { sub: 'x', name: 'X' }, 'known-code');
  const forged = await call(context.port, `/auth/linkedin/callback?code=unknown-code&state=${encodeURIComponent(state)}`, { headers: { cookie: flowCookie } });
  assert.equal(forged.status, 502);
  assert.ok(!forged.headers['set-cookie'].some((value) => value.startsWith('__Host-he_session=')));
  assert.deepEqual((await context.db.query('SELECT count(*)::int AS count FROM he.sessions')).rows, [{ count: 0 }]);
});

test('GET /api/session reports sign-in state with a tab-stable CSRF token', async (t) => {
  const context = await startApp(t, { env: { COMMENTARY_ENABLED: 'true' } });
  assert.deepEqual((await call(context.port, '/api/session')).json, { authEnabled: true, authenticated: false });
  const stale = await call(context.port, '/api/session', { headers: { cookie: '__Host-he_session=not-a-session' } });
  assert.deepEqual(stale.json, { authEnabled: true, authenticated: false });
  assert.match(stale.headers['set-cookie'][0], /^__Host-he_session=; .*Max-Age=0$/);

  const { cookie } = await signIn(context);
  const first = await call(context.port, '/api/session', { headers: { cookie } });
  assert.equal(first.status, 200);
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(first.json).sort(), ['authEnabled', 'authenticated', 'commentaryEnabled', 'csrfToken', 'member']);
  assert.deepEqual(first.json.member, { name: 'Ada Lovelace', verifiedIndustry: false });
  assert.equal(first.json.commentaryEnabled, true);
  assert.equal((await call(context.port, '/api/session', { headers: { cookie } })).json.csrfToken, first.json.csrfToken);
  assert.doesNotMatch(first.text, /ada@example\.com|linkedin-sub-1/);
});

test('every member write requires the exact origin, a session, and that session\'s CSRF token', async (t) => {
  const context = await startApp(t, { env: { COMMENTARY_ENABLED: 'true' } });
  const { cookie } = await signIn(context);
  const csrf = await csrfFor(context.port, cookie);
  const [other] = await signInMembers(context.accounts, 1, 'other');
  const otherCsrf = await csrfFor(context.port, `__Host-he_session=${other.token}`);
  const writes = [
    ['POST', '/api/session/logout', null],
    ['DELETE', '/api/account', null],
    ['POST', `/api/forecasts/${EPISODE_01}`, { probability: 60 }],
    ['POST', `/api/questions/${EPISODE_01}/comments`, { body: 'A sufficiently detailed perspective for moderation.', consent: true }],
  ];
  for (const [method, path, body] of writes) {
    const label = `${method} ${path}`;
    const attempt = (headers) => call(context.port, path, { method, body, headers });
    for (const origin of [undefined, 'https://attacker.example', 'http://hollywoodevolves.mcpherson.app']) {
      const response = await attempt({ cookie, 'x-csrf-token': csrf, ...(origin ? { origin } : {}) });
      assert.deepEqual([response.status, response.json], [403, { error: 'origin_not_allowed' }], `${label} origin=${origin}`);
    }
    assert.deepEqual((await attempt({ origin: PUBLIC_ORIGIN, 'x-csrf-token': csrf })).json, { error: 'authentication_required' }, label);
    for (const token of [undefined, 'forged-token', otherCsrf]) {
      const response = await attempt({ cookie, origin: PUBLIC_ORIGIN, ...(token ? { 'x-csrf-token': token } : {}) });
      assert.deepEqual([response.status, response.json], [403, { error: 'invalid_csrf_token' }], `${label} csrf=${token}`);
    }
  }
  // Nothing was written by any rejected attempt.
  assert.deepEqual((await context.db.query('SELECT (SELECT count(*)::int FROM he.forecasts) AS forecasts, (SELECT count(*)::int FROM he.comments) AS comments, (SELECT count(*)::int FROM he.members) AS members')).rows, [{ forecasts: 0, comments: 0, members: 2 }]);
});

test('members submit, revise, and read forecasts through the API', async (t) => {
  const context = await startApp(t);
  const { cookie } = await signIn(context);
  const headers = memberHeaders(cookie, await csrfFor(context.port, cookie));

  const summary = await call(context.port, `/api/forecasts/${EPISODE_01}`);
  assert.equal(summary.status, 200);
  assert.deepEqual(Object.keys(summary.json), ['questionId', 'status', 'opensAt', 'closesAt', 'forecasters', 'minimumForecasters', 'community', 'expert', 'resolution']);
  assert.deepEqual({ ...summary.json, opensAt: typeof summary.json.opensAt }, { questionId: EPISODE_01, status: 'open', opensAt: 'string', closesAt: null, forecasters: 0, minimumForecasters: 10, community: null, expert: [], resolution: null });
  for (const path of [`/api/forecasts/${DRAFT_QUESTION}`, '/api/forecasts/he-unknown-v1', `/api/forecasts/${DRAFT_QUESTION}/mine`]) {
    assert.deepEqual((await call(context.port, path, { headers: { cookie } })).json, { error: 'not_found' }, path);
  }

  assert.deepEqual((await call(context.port, `/api/forecasts/${EPISODE_01}/mine`)).json, { error: 'authentication_required' });
  assert.deepEqual((await call(context.port, `/api/forecasts/${EPISODE_01}/mine`, { headers: { cookie } })).json, { current: null, history: [], score: null });

  const first = await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 35 }, headers });
  assert.equal(first.status, 201);
  assert.deepEqual(first.json.current.probability, 35);
  context.now.advance(1000);
  const revised = await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 62 }, headers });
  assert.equal(revised.status, 201);
  assert.deepEqual(revised.json.history.map(({ probability }) => probability), [62, 35]);
  assert.deepEqual(revised.json, (await call(context.port, `/api/forecasts/${EPISODE_01}/mine`, { headers: { cookie } })).json);
  assert.equal((await call(context.port, `/api/forecasts/${EPISODE_01}`)).json.forecasters, 1);

  for (const body of [{ probability: 0 }, { probability: 100 }, { probability: '50' }, { probability: 12.5 }, {}, [], 'null']) {
    const response = await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body, headers });
    assert.deepEqual([response.status, response.json], [422, { error: 'invalid_probability' }], JSON.stringify(body));
  }
  const draft = await call(context.port, `/api/forecasts/${DRAFT_QUESTION}`, { method: 'POST', body: { probability: 50 }, headers });
  assert.deepEqual([draft.status, draft.json], [409, { error: 'question_not_open' }]);
  const unsupported = await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: 'probability=50', headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' } });
  assert.deepEqual([unsupported.status, unsupported.json], [415, { error: 'unsupported_media_type' }]);
  const malformed = await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: '{"probability":', headers });
  assert.deepEqual([malformed.status, malformed.json], [400, { error: 'invalid_json' }]);
  assert.deepEqual((await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'PUT', body: {}, headers })).json, { error: 'not_found' });
});

test('forecast submissions are limited to 30 per member per hour', async (t) => {
  const context = await startApp(t);
  const { cookie } = await signIn(context);
  const headers = memberHeaders(cookie, await csrfFor(context.port, cookie));
  for (let index = 0; index < 30; index += 1) {
    assert.equal((await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 50 }, headers })).status, 201);
  }
  const limited = await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 50 }, headers });
  assert.deepEqual([limited.status, limited.json], [429, { error: 'rate_limited' }]);
  context.now.advance(60 * 60 * 1000 + 1);
  assert.equal((await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 50 }, headers })).status, 201);
});

test('admin routes require the bearer token, attribute every action to ADMIN_NAME, and export forecasts', async (t) => {
  const context = await startApp(t);
  const path = `/api/admin/questions/${EPISODE_01}`;
  for (const authorization of [undefined, 'Bearer wrong-token-with-at-least-32-characters!!', `Basic ${ADMIN_TOKEN}`, ADMIN_TOKEN]) {
    const response = await call(context.port, path, { method: 'POST', body: { status: 'closed' }, headers: authorization ? { authorization } : {} });
    assert.deepEqual([response.status, response.json, response.headers['www-authenticate']], [401, { error: 'unauthorized' }, 'Bearer'], String(authorization));
  }
  const foreign = await call(context.port, path, { method: 'POST', body: { status: 'closed' }, headers: { ...adminHeaders, origin: 'https://attacker.example' } });
  assert.deepEqual([foreign.status, foreign.json], [403, { error: 'origin_not_allowed' }]);
  assert.equal((await call(context.port, '/api/admin/export/forecasts')).status, 401);

  const [member] = await signInMembers(context.accounts, 1);
  const headers = memberHeaders(`__Host-he_session=${member.token}`, context.accounts.csrfToken(member.token));
  assert.equal((await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 80 }, headers })).status, 201);
  context.now.advance(1000);

  const expert = await call(context.port, `${path}/expert-forecasts`, { method: 'POST', body: { name: 'Guest One', role: 'Studio executive', probability: 45, actor: 'forged' }, headers: { ...adminHeaders, origin: PUBLIC_ORIGIN } });
  assert.equal(expert.status, 201);
  assert.deepEqual({ ...expert.json, recordedAt: typeof expert.json.recordedAt }, { questionId: EPISODE_01, name: 'Guest One', role: 'Studio executive', probability: 45, recordedAt: 'string' });
  assert.deepEqual((await call(context.port, `${path}/expert-forecasts`, { method: 'POST', body: { name: 'Guest', role: 'Role', probability: 100 }, headers: adminHeaders })).json, { error: 'invalid_expert_forecast' });

  const closed = await call(context.port, path, { method: 'POST', body: { status: 'closed', actor: 'forged' }, headers: adminHeaders });
  assert.deepEqual([closed.status, closed.json.status, closed.json.closesAt], [200, 'closed', context.now().toISOString()]);
  assert.deepEqual((await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 10 }, headers })).json, { error: 'question_not_open' });
  assert.deepEqual((await call(context.port, path, { method: 'POST', body: { status: 'draft' }, headers: adminHeaders })).json, { error: 'invalid_status' });
  assert.deepEqual((await call(context.port, '/api/admin/questions/he-unknown-v1', { method: 'POST', body: { status: 'open' }, headers: adminHeaders })).json, { error: 'not_found' });

  context.now.advance(1000);
  const resolved = await call(context.port, `${path}/resolution`, { method: 'POST', body: { outcome: 'yes', note: 'Reported in Q4 filings.' }, headers: adminHeaders });
  assert.deepEqual([resolved.status, resolved.json.status, resolved.json.resolution.outcome], [200, 'resolved', 'yes']);
  assert.deepEqual((await call(context.port, `/api/forecasts/${EPISODE_01}/mine`, { headers: { cookie: headers.cookie } })).json.score, { brier: 0.04 });
  const summary = (await call(context.port, `/api/forecasts/${EPISODE_01}`)).json;
  assert.deepEqual(summary.expert.map(({ name, probability }) => [name, probability]), [['Guest One', 45]]);
  assert.equal(summary.resolution.outcome, 'yes');

  const exported = await call(context.port, '/api/admin/export/forecasts', { headers: adminHeaders });
  assert.equal(exported.status, 200);
  assert.deepEqual(exported.json.forecasts.map(({ questionId, probability, name, email, anonId }) => ({ questionId, probability, name, email, anonId })), [{ questionId: EPISODE_01, probability: 80, name: 'Member 1', email: 'member-1@example.com', anonId: member.anonId }]);

  const { rows } = await context.db.query("SELECT action, actor FROM he.audit WHERE actor <> 'member' ORDER BY id");
  assert.deepEqual(rows.map(({ action }) => action), ['expert_forecast_recorded', 'question_status_changed', 'question_resolved', 'forecasts_exported']);
  assert.ok(rows.every(({ actor }) => actor === 'Ian McPherson'));
  assert.doesNotMatch(JSON.stringify((await context.db.query('SELECT * FROM he.audit')).rows), /forged|member-1@example\.com/);
});

test('moderated commentary runs on Postgres: pending until approved, attributed without PII, and deleted with the account', async (t) => {
  const context = await startApp(t, { env: { COMMENTARY_ENABLED: 'true' } });
  const { cookie } = await signIn(context);
  const headers = memberHeaders(cookie, await csrfFor(context.port, cookie));
  const commentsPath = `/api/questions/${EPISODE_01}/comments`;

  assert.deepEqual((await call(context.port, commentsPath, { method: 'POST', body: { body: 'A detailed perspective without consent given.' }, headers })).json, { error: 'consent_required' });
  assert.deepEqual((await call(context.port, commentsPath, { method: 'POST', body: { body: 'short', consent: true }, headers })).json, { error: 'invalid_comment' });
  const submission = await call(context.port, commentsPath, { method: 'POST', body: { body: 'A detailed industry perspective submitted for editorial review.', consent: true }, headers });
  assert.equal(submission.status, 202);
  assert.deepEqual({ ...submission.json, id: typeof submission.json.id }, { accepted: true, id: 'string', status: 'pending' });
  assert.deepEqual((await call(context.port, commentsPath)).json, { comments: [] });
  assert.deepEqual((await call(context.port, '/api/questions/he-unknown-v1/comments')).json, { error: 'not_found' });

  assert.equal((await call(context.port, '/api/admin/comments')).status, 401);
  const pending = await call(context.port, '/api/admin/comments', { headers: adminHeaders });
  assert.equal(pending.json.comments[0].member.email, 'ada@example.com');

  const verification = await call(context.port, '/api/admin/verification', { method: 'POST', body: { memberSub: 'linkedin-sub-1', verified: true, reviewer: 'attacker-controlled' }, headers: { ...adminHeaders, origin: PUBLIC_ORIGIN } });
  assert.deepEqual([verification.status, verification.json], [200, { memberSub: 'linkedin-sub-1', verifiedIndustry: true }]);
  const moderation = await call(context.port, `/api/admin/comments/${submission.json.id}`, { method: 'POST', body: { decision: 'approved', moderator: 'attacker-controlled' }, headers: adminHeaders });
  assert.deepEqual([moderation.status, moderation.json], [200, { id: submission.json.id, status: 'approved' }]);
  assert.deepEqual((await call(context.port, `/api/admin/comments/${submission.json.id}`, { method: 'POST', body: { decision: 'rejected' }, headers: adminHeaders })).json, { error: 'already_moderated' });

  const published = (await call(context.port, commentsPath)).json.comments;
  assert.equal(published[0].contributor.name, 'Ada Lovelace');
  assert.equal(published[0].contributor.verifiedIndustry, true);
  assert.doesNotMatch(JSON.stringify(published), /ada@example\.com|linkedin-sub-1/);
  assert.equal((await call(context.port, '/api/session', { headers: { cookie } })).json.member.verifiedIndustry, true);
  const { rows: audit } = await context.db.query("SELECT actor FROM he.audit WHERE action IN ('comment_approved', 'industry_verified')");
  assert.deepEqual(audit, [{ actor: 'Ian McPherson' }, { actor: 'Ian McPherson' }]);

  const deletion = await call(context.port, '/api/account', { method: 'DELETE', headers });
  assert.deepEqual([deletion.status, deletion.json], [200, { deleted: true }]);
  assert.match(deletion.headers['set-cookie'][0], /^__Host-he_session=; .*Max-Age=0$/);
  assert.deepEqual((await call(context.port, commentsPath)).json, { comments: [] });
  assert.deepEqual((await call(context.port, '/api/session', { headers: { cookie } })).json, { authEnabled: true, authenticated: false });
  const tables = {};
  for (const table of ['members', 'sessions', 'comments', 'audit']) tables[table] = (await context.db.query(`SELECT * FROM he.${table}`)).rows;
  const afterDeletion = JSON.stringify(tables);
  assert.doesNotMatch(afterDeletion, /linkedin-sub-1|ada@example\.com|Ada Lovelace|detailed industry perspective/);
  assert.match(afterDeletion, /account_deleted/);
});

test('comment routes stay closed unless COMMENTARY_ENABLED is also true', async (t) => {
  const context = await startApp(t);
  const { cookie } = await signIn(context);
  const session = (await call(context.port, '/api/session', { headers: { cookie } })).json;
  assert.equal(session.commentaryEnabled, false);
  assert.deepEqual((await call(context.port, `/api/questions/${EPISODE_01}/comments`)).json, { error: 'not_found' });
  const submit = await call(context.port, `/api/questions/${EPISODE_01}/comments`, { method: 'POST', body: { body: 'A detailed perspective for moderation.', consent: true }, headers: memberHeaders(cookie, session.csrfToken) });
  assert.deepEqual([submit.status, submit.json], [404, { error: 'not_found' }]);
});

test('deleting an account through the API keeps the community forecast unchanged', async (t) => {
  const context = await startApp(t);
  const members = await signInMembers(context.accounts, 10);
  for (const [index, member] of members.entries()) {
    const headers = memberHeaders(`__Host-he_session=${member.token}`, context.accounts.csrfToken(member.token));
    assert.equal((await call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 20 + index * 7 }, headers })).status, 201);
  }
  const before = (await call(context.port, `/api/forecasts/${EPISODE_01}`)).json;
  assert.equal(before.forecasters, 10);
  assert.ok(before.community.probability >= 1);
  const leaving = members[4];
  const deleted = await call(context.port, '/api/account', { method: 'DELETE', headers: memberHeaders(`__Host-he_session=${leaving.token}`, context.accounts.csrfToken(leaving.token)) });
  assert.equal(deleted.status, 200);
  assert.deepEqual((await call(context.port, `/api/forecasts/${EPISODE_01}`)).json, before);
  const { rows } = await context.db.query('SELECT member_id FROM he.forecasts WHERE anon_id = $1', [leaving.anonId]);
  assert.deepEqual(rows, [{ member_id: null }]);
});

test('logout revokes the session and clears the cookie', async (t) => {
  const context = await startApp(t);
  const { cookie } = await signIn(context);
  const logout = await call(context.port, '/api/session/logout', { method: 'POST', headers: memberHeaders(cookie, await csrfFor(context.port, cookie)) });
  assert.deepEqual([logout.status, logout.json], [200, { loggedOut: true }]);
  assert.match(logout.headers['set-cookie'][0], /^__Host-he_session=; .*Max-Age=0$/);
  assert.deepEqual((await call(context.port, '/api/session', { headers: { cookie } })).json, { authEnabled: true, authenticated: false });
});

test('the login rate limit keys on X-Forwarded-For only when TRUST_PROXY is true', async (t) => {
  const trusted = await startApp(t, { env: { TRUST_PROXY: 'true' } });
  for (let index = 0; index < 20; index += 1) assert.equal((await call(trusted.port, '/auth/linkedin', { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } })).status, 302);
  assert.equal((await call(trusted.port, '/auth/linkedin', { headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' } })).status, 429);
  assert.equal((await call(trusted.port, '/auth/linkedin', { headers: { 'x-forwarded-for': '203.0.113.2, 10.0.0.1' } })).status, 302, 'another client has its own bucket');

  const untrusted = await startApp(t);
  for (let index = 0; index < 20; index += 1) assert.equal((await call(untrusted.port, '/auth/linkedin', { headers: { 'x-forwarded-for': `203.0.113.${index}` } })).status, 302);
  assert.equal((await call(untrusted.port, '/auth/linkedin', { headers: { 'x-forwarded-for': '198.51.100.9' } })).status, 429, 'spoofed headers cannot escape the socket bucket');
});

test('an unreachable database fails readiness and degrades the contract routes without crashing', async (t) => {
  const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
  const database = { query: async () => { throw refused; }, withTransaction: async () => { throw refused; }, close: async () => {} };
  const context = await startApp(t, { database });
  assert.equal(context.started, false);
  assert.equal(context.app.forecasting.ready, false);
  assert.deepEqual([(await call(context.port, '/readyz')).status, (await call(context.port, '/readyz')).json], [503, { status: 'unavailable' }]);
  assert.equal((await call(context.port, '/healthz')).status, 200);
  assert.deepEqual((await call(context.port, '/api/session')).json, { authEnabled: false });
  const forecast = await call(context.port, `/api/forecasts/${EPISODE_01}`);
  assert.deepEqual([forecast.status, forecast.json], [503, { error: 'unavailable' }]);
  assert.equal((await call(context.port, '/auth/linkedin')).status, 503);
});

test('a database that fails after startup returns 503 instead of 500', async (t) => {
  const db = await freshDatabase(t, { migrated: false });
  let failing = false;
  const refused = Object.assign(new Error('Connection terminated unexpectedly'), { code: undefined });
  const database = { query: (sql, params) => (failing ? Promise.reject(refused) : db.query(sql, params)), withTransaction: (fn) => db.withTransaction(fn), close: () => db.close() };
  const context = await startApp(t, { database });
  assert.equal((await call(context.port, '/readyz')).status, 200);
  failing = true;
  assert.equal((await call(context.port, '/readyz')).status, 503);
  assert.deepEqual((await call(context.port, `/api/forecasts/${EPISODE_01}`)).json, { error: 'unavailable' });
});

test('anon_id never appears in public or member responses, and a returning subject keeps it', async (t) => {
  const context = await startApp(t, { env: { COMMENTARY_ENABLED: 'true' } });
  const anonId = deriveAnonId(AUTH_SECRET, 'linkedin-sub-1');
  const responses = [];
  const record = async (promise) => { const response = await promise; responses.push(response.text); return response; };

  const first = await signIn(context);
  const session = (await record(call(context.port, '/api/session', { headers: { cookie: first.cookie } }))).json;
  const headers = memberHeaders(first.cookie, session.csrfToken);
  await record(call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 30 }, headers }));
  await record(call(context.port, `/api/forecasts/${EPISODE_01}/mine`, { headers: { cookie: first.cookie } }));
  await record(call(context.port, `/api/forecasts/${EPISODE_01}`));
  const comment = await record(call(context.port, `/api/questions/${EPISODE_01}/comments`, { method: 'POST', body: { body: 'A detailed perspective that the editor approves.', consent: true }, headers }));
  await call(context.port, `/api/admin/comments/${comment.json.id}`, { method: 'POST', body: { decision: 'approved' }, headers: adminHeaders });
  await record(call(context.port, `/api/questions/${EPISODE_01}/comments`));
  await record(call(context.port, '/api/account', { method: 'DELETE', headers }));

  context.now.advance(1000);
  const second = await signIn(context);
  const secondSession = (await record(call(context.port, '/api/session', { headers: { cookie: second.cookie } }))).json;
  const revised = await record(call(context.port, `/api/forecasts/${EPISODE_01}`, { method: 'POST', body: { probability: 70 }, headers: memberHeaders(second.cookie, secondSession.csrfToken) }));
  assert.deepEqual(revised.json.history.map(({ probability }) => probability), [70], 'the re-created account starts with an empty personal history');
  const summary = await record(call(context.port, `/api/forecasts/${EPISODE_01}`));
  assert.equal(summary.json.forecasters, 1, 'the returning subject still counts once');

  const { rows } = await context.db.query('SELECT DISTINCT anon_id FROM he.forecasts');
  assert.deepEqual(rows, [{ anon_id: anonId }]);
  for (const text of responses) {
    assert.doesNotMatch(text, new RegExp(anonId, 'i'));
    assert.doesNotMatch(text, new RegExp(anonId.replaceAll('-', ''), 'i'));
    assert.doesNotMatch(text, /anon/i);
  }
});
