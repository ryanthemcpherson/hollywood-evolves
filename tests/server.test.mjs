import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';

async function availablePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function get(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function startServer(t) {
  const port = await availablePort();
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port) },
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

test('methods other than GET and HEAD are rejected', async (t) => {
  const { port } = await startServer(t);
  const response = await get(port, '/', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.body, 'Method Not Allowed');
  assert.equal(response.headers.allow, 'GET, HEAD');
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
  for (const [path, type] of [['/site.webmanifest', 'application/manifest+json'], ['/favicon.ico', 'image/x-icon'], ['/apple-touch-icon.png', 'image/png'], ['/icon-192.png', 'image/png'], ['/icon-512.png', 'image/png']]) {
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
  }
});
