import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AudienceSignalStore, parseLinkedInReactionCsv } from './lib/audience-signals.mjs';
import { loadConfig } from './lib/config.mjs';
import { createDatabase } from './lib/db.mjs';
import { audienceCampaigns, forecastQuestions } from './lib/forecast-questions.mjs';
import { createForecasting, log } from './lib/forecasting-api.mjs';
import { readJson } from './lib/http-body.mjs';
import { securityHeaders as headers, sendJson as json } from './lib/http-response.mjs';
import { clientAddress, RateLimiter } from './lib/rate-limit.mjs';

const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};

function persistState(path, snapshot) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function createApp({ env = process.env, database = null, fetch = globalThis.fetch, now = () => new Date(), cwd = process.cwd() } = {}) {
  const config = loadConfig(env);
  const root = join(cwd, 'dist');
  const dataPath = env.AUDIENCE_DATA_PATH || join(cwd, '.data', 'audience-signals.json');
  const hashSecret = env.AUDIENCE_HASH_SECRET || 'preview-draft-no-live-responses';
  const questions = new Map(forecastQuestions.map((question) => [question.id, question]));
  if (forecastQuestions.some(({ state }) => state === 'open') && (!env.AUDIENCE_HASH_SECRET || !env.AUDIENCE_DATA_PATH)) {
    throw new Error('Open questions require explicit AUDIENCE_HASH_SECRET and persistent AUDIENCE_DATA_PATH configuration.');
  }
  const initialState = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : null;
  const audience = new AudienceSignalStore({ questions: forecastQuestions, campaigns: audienceCampaigns, secret: hashSecret, initialState });
  const persistAudience = () => persistState(dataPath, audience.snapshot());
  const limiter = new RateLimiter();
  const clientKey = (req) => clientAddress(req, { trustProxy: config.trustProxy });
  if (config.authRequested && !config.authEnabled) log('warn', 'auth_disabled_incomplete_config', { missingOrInvalid: config.authProblems });
  const db = config.authEnabled
    ? database ?? createDatabase({ connectionString: config.databaseUrl, onError: (error) => log('error', 'database_pool_error', { code: error?.code ?? null, message: error?.message ?? 'unknown' }) })
    : null;
  const forecasting = createForecasting({ config, db, fetch, now, limiter, clientKey });

  function importAuthorized(req) {
    const expected = env.AUDIENCE_IMPORT_TOKEN;
    const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!expected || !provided) return false;
    const expectedDigest = createHmac('sha256', 'audience-import').update(expected).digest();
    const providedDigest = createHmac('sha256', 'audience-import').update(provided).digest();
    return timingSafeEqual(expectedDigest, providedDigest);
  }

  const allowRequest = (req, scope, limit = 10, windowMs = 10 * 60 * 1000) => limiter.allow(`${clientKey(req)}:${scope}`, limit, windowMs);

  // Legacy anonymous audience-signal routes; they stay fail-closed while every question is a draft.
  async function handleLegacyApi(req, res, url) {
    const questionMatch = url.pathname.match(/^\/api\/questions\/([a-z0-9-]+)$/);
    const responseMatch = url.pathname.match(/^\/api\/questions\/([a-z0-9-]+)\/responses$/);
    try {
      if (questionMatch && ['GET', 'HEAD'].includes(req.method)) {
        const question = questions.get(questionMatch[1]);
        if (!question || question.state !== 'open') return json(res, 404, { error: 'Question not found' });
        const payload = { question, results: audience.publicResults(question.id) };
        if (req.method === 'HEAD') return json(res, 200, {});
        return json(res, 200, payload);
      }
      if (responseMatch && req.method === 'POST') {
        if (!allowRequest(req, responseMatch[1])) return json(res, 429, { error: 'Too many attempts. Try again later.' }, { 'Retry-After': '600' });
        const body = await readJson(req);
        if (body.consent !== true) throw Object.assign(new Error('Consent is required to submit'), { statusCode: 400 });
        const result = await audience.recordDirectResponse({ ...body, questionId: responseMatch[1] });
        if (result.accepted) persistAudience();
        return json(res, result.accepted ? 201 : 200, result);
      }
      if (url.pathname === '/api/linkedin/import' && req.method === 'POST') {
        if (!importAuthorized(req)) return json(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
        if (!allowRequest(req, 'linkedin-import', 5, 60 * 60 * 1000)) return json(res, 429, { error: 'Too many import attempts.' }, { 'Retry-After': '3600' });
        const body = await readJson(req, 256 * 1024);
        const rows = typeof body.csv === 'string' ? parseLinkedInReactionCsv(body.csv) : body.rows;
        if (!Array.isArray(rows)) throw Object.assign(new Error('Provide rows or CSV data'), { statusCode: 400 });
        const result = await audience.importLinkedInReactions({ campaignId: body.campaignId, importKey: body.importKey, rows });
        if (!result.duplicate) persistAudience();
        return json(res, 200, result);
      }
      return json(res, 404, { error: 'API route not found' });
    } catch (error) {
      return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal Server Error' });
    }
  }

  const server = createServer(async (req, res) => {
    let url;
    let decodedPathname;
    try {
      url = new URL(req.url, 'http://localhost');
      decodedPathname = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400, {...headers, 'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
      return res.end('Bad Request');
    }
    if (url.pathname.startsWith('/auth/')) return forecasting.handleAuth(req, res, url);
    if (url.pathname.startsWith('/api/')) {
      if (await forecasting.handleApi(req, res, url)) return;
      return handleLegacyApi(req, res, url);
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, {...headers, 'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Allow':'GET, HEAD'});
      return res.end('Method Not Allowed');
    }
    if (url.pathname === '/healthz') { res.writeHead(200, {...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); return res.end('{"status":"ok"}'); }
    if (url.pathname === '/readyz') {
      return await forecasting.readiness() ? json(res, 200, { status: 'ready' }) : json(res, 503, { status: 'unavailable' });
    }
    if (decodedPathname === '/poll.html') {
      res.writeHead(404, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(join(root, '404.html')).pipe(res);
    }
    const pollMatch = decodedPathname.match(/^\/poll\/([a-z0-9-]+)$/);
    let pathname = decodedPathname;
    if (pollMatch) {
      if (questions.get(pollMatch[1])?.state !== 'open') pathname = '/404.html';
      else pathname = '/poll.html';
    }
    let file = normalize(join(root, pathname));
    const relativePath = relative(root, file);
    if (relativePath === '..' || relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(relativePath)) {
      res.writeHead(403, headers);
      return res.end('Forbidden');
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) file = join(root, '404.html');
    const status = file.endsWith('404.html') ? 404 : 200;
    const hashedAsset = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.(?:css|js)$/.test(pathname);
    const cache = file.endsWith('.html') ? 'no-cache' : hashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
    res.writeHead(status, {...headers,'Content-Type':types[extname(file)] || 'application/octet-stream','Cache-Control':cache});
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });

  const sweeper = setInterval(() => limiter.sweep(), 5 * 60 * 1000);
  sweeper.unref();

  async function close() {
    clearInterval(sweeper);
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    await forecasting.stop();
  }

  return { server, config, forecasting, limiter, close };
}

const invokedDirectly = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '0.0.0.0';
  const app = createApp();
  app.server.listen(port, host, () => {
    console.log(`Hollywood Evolves listening on ${host}:${port}`);
    // Migrations run after the site is serving; until they succeed /readyz reports 503 and contract routes are unavailable.
    app.forecasting.start();
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    setTimeout(() => process.exit(1), 10_000).unref();
    try { await app.close(); } catch (error) { log('error', 'shutdown_failed', { message: error?.message ?? 'unknown' }); }
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
