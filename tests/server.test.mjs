import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { ADMIN_TOKEN, AUTH_SECRET, completeAuthEnv, EPISODE_01 } from './support/database.mjs';

// Tests start from a clean slate so a developer's shell cannot switch sign-in on by accident.
const AUTH_VARIABLES = ['AUTH_ENABLED', 'DATABASE_URL', 'PUBLIC_ORIGIN', 'LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_REDIRECT_URI', 'AUTH_SECRET', 'ADMIN_TOKEN', 'ADMIN_NAME', 'COMMENTARY_ENABLED', 'TRUST_PROXY'];
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !AUTH_VARIABLES.includes(name)));

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
    env: { ...baseEnv, PORT: String(port), ...env },
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
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  return { child, port, stderr: () => stderr };
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

test('draft question API is hidden from public GET and HEAD requests', async (t) => {
  const { port } = await startServer(t);
  for (const method of ['GET', 'HEAD']) {
    const response = await get(port, '/api/questions/he-episode-01-customer-evolution-v1', method);
    assert.equal(response.status, 404, method);
    assert.equal(response.headers['cache-control'], 'no-store', method);
  }
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

test('direct poll route hides configured questions until they open', async (t) => {
  const { port } = await startServer(t);
  const poll = await get(port, '/poll/he-episode-01-customer-evolution-v1?src=linkedin');
  assert.equal(poll.status, 404);
  assert.match(poll.body, /Page not found/i);
  for (const path of ['/poll.html', '/poll%2ehtml', '/%70oll.html', '/po%6cl.html', '/poll%252ehtml', '/%2570oll.html', '/po%256cl.html']) {
    for (const method of ['GET', 'HEAD']) {
      assert.equal((await get(port, `${path}?poll=he-episode-01-customer-evolution-v1&src=newsletter`, method)).status, 404, `${method} ${path}`);
    }
  }
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

test('custom 404 stylesheet is served as CSS', async (t) => {
  const { port } = await startServer(t);
  const response = await get(port, '/404.css');
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/css; charset=utf-8');
});

test('local brand fonts are served with the WOFF2 media type', async (t) => {
  const { port } = await startServer(t);
  for (const path of ['/fonts/dm-sans-latin-variable.woff2', '/fonts/dm-mono-latin-400.woff2', '/fonts/dm-mono-latin-500.woff2', '/fonts/newsreader-latin-variable.woff2']) {
    const response = await get(port, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers['content-type'], 'font/woff2', path);
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
  for (const [path, method] of [['/', 'GET'], ['/favicon.svg', 'GET'], ['/healthz', 'GET'], ['/api/demo-state', 'GET'], ['/missing-page', 'GET'], ['/', 'HEAD']]) {
    const { headers } = await get(port, path, method);
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['x-frame-options'], 'DENY');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.match(headers['permissions-policy'], /camera=\(\)/);
    assert.equal(headers['strict-transport-security'], 'max-age=31536000; includeSubDomains');
    assert.match(headers['content-security-policy'], /default-src 'self'/);
    assert.match(headers['content-security-policy'], /style-src 'self'/);
    assert.match(headers['content-security-policy'], /font-src 'self'/);
    assert.doesNotMatch(headers['content-security-policy'], /'unsafe-inline'/);
    assert.match(headers['content-security-policy'], /object-src 'none'/);
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  }
});

const contractRoutes = [
  ['GET', '/auth/linkedin'],
  ['GET', '/auth/linkedin/callback?code=x&state=y'],
  ['POST', '/api/session/logout'],
  ['DELETE', '/api/account'],
  ['GET', `/api/forecasts/${EPISODE_01}`],
  ['GET', `/api/forecasts/${EPISODE_01}/mine`],
  ['POST', `/api/forecasts/${EPISODE_01}`],
  ['GET', `/api/questions/${EPISODE_01}/comments`],
  ['POST', `/api/questions/${EPISODE_01}/comments`],
  ['POST', `/api/admin/questions/${EPISODE_01}`],
  ['POST', `/api/admin/questions/${EPISODE_01}/resolution`],
  ['POST', `/api/admin/questions/${EPISODE_01}/expert-forecasts`],
  ['GET', '/api/admin/export/forecasts'],
  ['GET', '/api/admin/comments'],
  ['POST', '/api/admin/comments/comment_1'],
  ['POST', '/api/admin/verification'],
];

async function assertSignInOff(port) {
  const session = await get(port, '/api/session');
  assert.equal(session.status, 200);
  assert.deepEqual(JSON.parse(session.body), { authEnabled: false });
  for (const [method, path] of contractRoutes) {
    // Node's client sends DELETE bodies without framing, so only POST carries one.
    const response = await get(port, path, method, method === 'POST' ? '{}' : null, {
      'content-type': 'application/json',
      origin: 'https://hollywoodevolves.mcpherson.app',
      authorization: `Bearer ${ADMIN_TOKEN}`,
    });
    assert.equal(response.status, 404, `${method} ${path}`);
  }
}

test('without sign-in configuration the server boots with no DATABASE_URL and every contract route is 404', async (t) => {
  const { port, child } = await startServer(t);
  await assertSignInOff(port);
  assert.equal((await get(port, '/readyz')).status, 200);
  assert.equal(child.exitCode, null);
});

test('sign-in stays off unless every required setting is present and valid, and the warning never includes values', async (t) => {
  const incomplete = { ...completeAuthEnv, ADMIN_TOKEN: 'short-admin-token' };
  const { port, stderr } = await startServer(t, incomplete);
  await assertSignInOff(port);
  assert.match(stderr(), /auth_disabled_incomplete_config/);
  assert.match(stderr(), /ADMIN_TOKEN/);
  assert.doesNotMatch(stderr(), /short-admin-token|password|client-secret/);
  assert.doesNotMatch(stderr(), new RegExp(AUTH_SECRET));

  const { port: mismatchedPort } = await startServer(t, { ...completeAuthEnv, LINKEDIN_REDIRECT_URI: 'https://attacker.example/auth/linkedin/callback' });
  await assertSignInOff(mismatchedPort);
  const { port: legacyPort } = await startServer(t, {
    COMMENTARY_ENABLED: 'true',
    COMMENTARY_SECRET: 'a-commentary-secret-that-is-long-enough',
    COMMENTARY_ADMIN_TOKEN: 'moderation-token-with-at-least-32-characters',
    COMMENTARY_ADMIN_NAME: 'Ian McPherson',
    LINKEDIN_CLIENT_ID: 'client-id',
    LINKEDIN_CLIENT_SECRET: 'client-secret',
    LINKEDIN_REDIRECT_URI: 'https://hollywoodevolves.mcpherson.app/auth/linkedin/callback',
  });
  await assertSignInOff(legacyPort);
});

test('with sign-in on and an unreachable database the site keeps serving while readiness fails', async (t) => {
  const { port, child, stderr } = await startServer(t, { ...completeAuthEnv, DATABASE_URL: 'postgres://he:db-password-value@127.0.0.1:1/none' });
  assert.equal((await get(port, '/')).status, 200);
  assert.equal((await get(port, '/healthz')).status, 200);
  const ready = await get(port, '/readyz');
  assert.equal(ready.status, 503);
  assert.deepEqual(JSON.parse(ready.body), { status: 'unavailable' });
  assert.deepEqual(JSON.parse((await get(port, '/api/session')).body), { authEnabled: false });
  const forecast = await get(port, `/api/forecasts/${EPISODE_01}`);
  assert.equal(forecast.status, 503);
  assert.deepEqual(JSON.parse(forecast.body), { error: 'unavailable' });
  assert.equal((await get(port, '/auth/linkedin')).status, 503);
  assert.equal(child.exitCode, null);
  assert.match(stderr(), /database_migration_failed/);
  assert.doesNotMatch(stderr(), /db-password-value|client-secret/);
  assert.doesNotMatch(stderr(), new RegExp(`${AUTH_SECRET}|${ADMIN_TOKEN}`));
});

test('public runtime retires the demo route even when stale deployment variables remain', async (t) => {
  const { port } = await startServer(t, { DEMO_MODE: 'true', DATABASE_URL: 'postgres://127.0.0.1:1/none' });
  const response = await get(port, '/api/demo-state');
  assert.equal(response.status, 404);
  const mutation = await get(port, '/api/demo-state', 'POST', '{}', { 'content-type': 'application/json' });
  assert.equal(mutation.status, 404);
  const ready = await get(port, '/readyz');
  assert.equal(ready.status, 200);
  assert.deepEqual(JSON.parse(ready.body), { status: 'ready' });
  const health = await get(port, '/healthz');
  assert.equal(health.status, 200);
});
