import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CommentaryStore } from '../lib/commentary-store.mjs';

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function get(port, path, method = 'GET', body = null, requestHeaders = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: requestHeaders }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

async function startServer(t, env = {}) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(async () => {
    if (child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once('exit', resolve));
    child.kill();
    await exited;
  });

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 3000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited before startup (${code})`));
    });
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return { child, port };
}

test('malformed URL returns 400 without terminating the server', async (t) => {
  const { child, port } = await startServer(t);
  const response = await get(port, '/%');
  assert.equal(response.status, 400);
  assert.equal(response.body, 'Bad Request');
  assert.equal(child.exitCode, null);
  assert.equal((await get(port, '/healthz')).status, 200);
});

test('health route ignores query strings', async (t) => {
  const { port } = await startServer(t);
  const response = await get(port, '/healthz?probe=1');
  assert.equal(response.status, 200);
  assert.equal(response.body, '{"status":"ok"}');
});

test('only the root route serves the homepage and unknown extensionless paths are 404', async (t) => {
  const { port } = await startServer(t);
  const homepage = await get(port, '/?preview=1');
  assert.equal(homepage.status, 200);
  assert.match(homepage.body, /<title>Hollywood Evolves/);

  for (const path of ['/unknown', '/unknown?source=test']) {
    const response = await get(port, path);
    assert.equal(response.status, 404, path);
    assert.match(response.body, /Page not found/i, path);
  }
});

test('methods other than GET and HEAD are rejected', async (t) => {
  const { port } = await startServer(t);
  const response = await get(port, '/', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.body, 'Method Not Allowed');
  assert.equal(response.headers.allow, 'GET, HEAD');
});

test('draft question API publishes metadata and empty source-separated aggregates only', async (t) => {
  const { port } = await startServer(t);
  const response = await get(port, '/api/questions/he-episode-01-customer-evolution-v1');
  assert.equal(response.status, 200);
  assert.equal(response.headers['cache-control'], 'no-store');
  const payload = JSON.parse(response.body);
  assert.equal(payload.question.id, 'he-episode-01-customer-evolution-v1');
  assert.equal(payload.question.state, 'draft');
  assert.equal(payload.question.opensAt, null);
  assert.equal(payload.results.directForecasts.total, 0);
  assert.equal(payload.results.linkedInReactions.total, 0);
  assert.doesNotMatch(response.body, /browserHash|reactionHash|idempotencyHash/);
});

test('draft question rejects submissions and LinkedIn imports require an admin token', async (t) => {
  const { port } = await startServer(t);
  const direct = await get(port, '/api/questions/he-episode-01-customer-evolution-v1/responses', 'POST', JSON.stringify({
    choice: 'yes',
    confidence: 75,
    browserToken: 'browser-token-00000001',
    idempotencyKey: 'response-key-00000001',
    source: 'qr',
    consent: true,
  }), { 'content-type': 'application/json' });
  assert.equal(direct.status, 409);
  assert.match(JSON.parse(direct.body).error, /not open/i);

  const imported = await get(port, '/api/linkedin/import', 'POST', '{}', { 'content-type': 'application/json' });
  assert.equal(imported.status, 401);
});

test('direct poll route resolves only immutable configured question IDs', async (t) => {
  const { port } = await startServer(t);
  const poll = await get(port, '/poll/he-episode-01-customer-evolution-v1?src=linkedin');
  assert.equal(poll.status, 200);
  assert.match(poll.body, /Audience signal · Hollywood Evolves/);
  assert.equal((await get(port, '/poll/not-a-question')).status, 404);
});

test('encoded traversal cannot read from a sibling of the dist directory', async (t) => {
  const sibling = new URL('../dist-private/', new URL('../dist/', import.meta.url));
  await mkdir(sibling, { recursive: true });
  await writeFile(new URL('secret.txt', sibling), 'not public');
  t.after(() => rm(sibling, { recursive: true, force: true }));

  const { port } = await startServer(t);
  const response = await get(port, '/..%2Fdist-private/secret.txt');
  assert.equal(response.status, 403);
  assert.equal(response.body, 'Forbidden');
});

test('stable public asset URLs are revalidated instead of cached as immutable', async (t) => {
  const { port } = await startServer(t);
  const response = await get(port, '/favicon.svg');
  assert.equal(response.status, 200);
  assert.doesNotMatch(response.headers['cache-control'], /immutable/);
});

test('Open Graph PNG is served with the image/png media type', async (t) => {
  const { port } = await startServer(t);
  const response = await get(port, '/og-image.png');
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'image/png');
});

test('manifest and modern icon routes are served with correct media types', async (t) => {
  const { port } = await startServer(t);
  for (const [path, type] of [['/site.webmanifest', 'application/manifest+json'], ['/favicon.ico', 'image/x-icon'], ['/apple-touch-icon.png', 'image/png'], ['/icon-192.png', 'image/png'], ['/icon-512.png', 'image/png'], ['/icon-maskable-512.png', 'image/png']]) {
    const response = await get(port, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['content-type'], type, path);
  }
});

test('legal pages are served as static HTML', async (t) => {
  const { port } = await startServer(t);
  for (const [path, heading] of [['/accessibility.html', 'Accessibility'], ['/privacy.html', 'Privacy'], ['/terms.html', 'Terms']]) {
    const response = await get(port, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['content-type'], 'text/html; charset=utf-8', path);
    assert.match(response.body, new RegExp(`<h1>${heading}</h1>`), path);
  }
});

test('security headers remain on HTML and asset responses', async (t) => {
  const { port } = await startServer(t);
  for (const path of ['/', '/favicon.svg']) {
    const { headers } = await get(port, path);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(headers['permissions-policy'], /camera=\(\)/);
    assert.match(headers['content-security-policy'], /default-src 'self'/);
    assert.match(headers['content-security-policy'], /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
    assert.match(headers['content-security-policy'], /font-src 'self' https:\/\/fonts\.gstatic\.com/);
    assert.match(headers['content-security-policy'], /object-src 'none'/);
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  }
});

test('commentary API is fail-closed when LinkedIn and moderation configuration are absent', async (t) => {
  const { port } = await startServer(t);
  const session = await get(port, '/api/session');
  assert.equal(session.status, 200);
  assert.deepEqual(JSON.parse(session.body), { authenticated: false, commentaryEnabled: false });

  const login = await get(port, '/auth/linkedin');
  assert.equal(login.status, 503);
  assert.match(login.body, /not configured/i);

  const comments = await get(port, '/api/questions/he-episode-01-customer-evolution-v1/comments');
  assert.equal(comments.status, 200);
  assert.deepEqual(JSON.parse(comments.body), { comments: [] });

  const submit = await get(port, '/api/questions/he-episode-01-customer-evolution-v1/comments', 'POST', JSON.stringify({ body: 'A sufficiently detailed perspective for moderation.' }), { 'content-type': 'application/json', origin: 'https://hollywoodevolves.mcpherson.app' });
  assert.equal(submit.status, 401);

  const pending = await get(port, '/api/admin/comments');
  assert.equal(pending.status, 401);
});

test('state-changing commentary routes require the exact public origin before authentication', async (t) => {
  const { port } = await startServer(t, { PUBLIC_ORIGIN: 'https://hollywoodevolves.mcpherson.app' });
  for (const origin of [undefined, 'https://attacker.example']) {
    const response = await get(port, '/api/questions/he-episode-01-customer-evolution-v1/comments', 'POST', JSON.stringify({ body: 'A sufficiently detailed perspective for moderation.' }), {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    });
    assert.equal(response.status, 403);
    assert.match(JSON.parse(response.body).error, /origin/i);
  }
});

test('commentary activation requires moderation credentials and an explicit persistent path', async (t) => {
  const incomplete = {
    COMMENTARY_ENABLED: 'true',
    COMMENTARY_SECRET: 'a-commentary-secret-that-is-long-enough',
    LINKEDIN_CLIENT_ID: 'client-id',
    LINKEDIN_CLIENT_SECRET: 'client-secret',
    LINKEDIN_REDIRECT_URI: 'https://hollywoodevolves.mcpherson.app/auth/linkedin/callback',
  };
  const { port } = await startServer(t, incomplete);
  const session = await get(port, '/api/session');
  assert.deepEqual(JSON.parse(session.body), { authenticated: false, commentaryEnabled: false });
  const login = await get(port, '/auth/linkedin');
  assert.equal(login.status, 503);

  const { port: mismatchedPort } = await startServer(t, {
    ...incomplete,
    COMMENTARY_ADMIN_TOKEN: 'moderation-token-with-at-least-32-characters',
    COMMENTARY_ADMIN_NAME: 'Ian McPherson',
    COMMENTARY_DATA_PATH: '/tmp/hollywood-evolves-mismatched-commentary.json',
    PUBLIC_ORIGIN: 'https://hollywoodevolves.mcpherson.app',
    LINKEDIN_REDIRECT_URI: 'https://attacker.example/auth/linkedin/callback',
  });
  const mismatchedSession = await get(mismatchedPort, '/api/session');
  assert.deepEqual(JSON.parse(mismatchedSession.body), { authenticated: false, commentaryEnabled: false });
});

test('authenticated commentary stays pending until a configured editor approves and verifies it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'he-commentary-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dataPath = join(directory, 'commentary.json');
  const secret = 'commentary-secret-with-at-least-32-characters';
  const store = new CommentaryStore({ secret, now: () => '2026-08-30T20:00:00.000Z' });
  store.upsertLinkedInMember({ sub: 'member-1', name: 'Ada Lovelace', picture: null, email: 'ada@example.com', emailVerified: true });
  const sessionFixture = store.createSession('member-1');
  await writeFile(dataPath, JSON.stringify(store.snapshot()));
  const adminToken = 'moderation-token-with-at-least-32-characters';
  const origin = 'https://hollywoodevolves.mcpherson.app';
  const { port } = await startServer(t, {
    COMMENTARY_ENABLED: 'true', COMMENTARY_SECRET: secret, COMMENTARY_ADMIN_TOKEN: adminToken,
    COMMENTARY_ADMIN_NAME: 'Ian McPherson', COMMENTARY_DATA_PATH: dataPath, PUBLIC_ORIGIN: origin,
    LINKEDIN_CLIENT_ID: 'client-id', LINKEDIN_CLIENT_SECRET: 'client-secret',
    LINKEDIN_REDIRECT_URI: `${origin}/auth/linkedin/callback`,
  });
  const cookieHeader = `__Host-he_session=${sessionFixture.token}`;
  const session = await get(port, '/api/session', 'GET', null, { cookie: cookieHeader });
  const sessionBody = JSON.parse(session.body);
  assert.equal(sessionBody.authenticated, true);
  assert.equal(sessionBody.commentaryEnabled, true);

  const submission = await get(port, '/api/questions/he-episode-01-customer-evolution-v1/comments', 'POST', JSON.stringify({ body: 'A detailed industry perspective submitted for editorial review.', consent: true }), {
    cookie: cookieHeader, origin, 'content-type': 'application/json', 'x-csrf-token': sessionBody.csrfToken,
  });
  assert.equal(submission.status, 202);
  const commentId = JSON.parse(submission.body).id;
  assert.deepEqual(JSON.parse((await get(port, '/api/questions/he-episode-01-customer-evolution-v1/comments')).body), { comments: [] });

  const verification = await get(port, '/api/admin/verification', 'POST', JSON.stringify({ memberSub: 'member-1', verified: true, reviewer: 'attacker-controlled' }), {
    authorization: `Bearer ${adminToken}`, origin, 'content-type': 'application/json',
  });
  assert.equal(verification.status, 200);
  const moderation = await get(port, `/api/admin/comments/${commentId}`, 'POST', JSON.stringify({ decision: 'approved', moderator: 'attacker-controlled' }), {
    authorization: `Bearer ${adminToken}`, origin, 'content-type': 'application/json',
  });
  assert.equal(moderation.status, 200);
  const published = JSON.parse((await get(port, '/api/questions/he-episode-01-customer-evolution-v1/comments')).body).comments;
  assert.equal(published[0].contributor.name, 'Ada Lovelace');
  assert.equal(published[0].contributor.verifiedIndustry, true);
  assert.doesNotMatch(JSON.stringify(published), /ada@example\.com|member-1/);
  const persisted = JSON.parse(await readFile(dataPath, 'utf8'));
  assert.match(JSON.stringify(persisted.audit), /Ian McPherson/);
  assert.doesNotMatch(JSON.stringify(persisted.audit), /attacker-controlled/);

  const deletion = await get(port, '/api/account', 'DELETE', null, { cookie: cookieHeader, origin, 'x-csrf-token': sessionBody.csrfToken });
  assert.equal(deletion.status, 200);
  assert.match(deletion.headers['set-cookie'][0], /Max-Age=0/);
  assert.deepEqual(JSON.parse((await get(port, '/api/questions/he-episode-01-customer-evolution-v1/comments')).body), { comments: [] });
  const afterDeletion = await readFile(dataPath, 'utf8');
  assert.doesNotMatch(afterDeletion, /member-1|ada@example\.com|Ada Lovelace|detailed industry perspective/);
});
