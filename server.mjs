import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { AudienceSignalStore, parseLinkedInReactionCsv } from './lib/audience-signals.mjs';
import { audienceCampaigns, forecastQuestions } from './lib/forecast-questions.mjs';

const port = Number(process.env.PORT || 3000);
const root = join(process.cwd(), 'dist');
const dataPath = process.env.AUDIENCE_DATA_PATH || join(process.cwd(), '.data', 'audience-signals.json');
const hashSecret = process.env.AUDIENCE_HASH_SECRET || 'preview-draft-no-live-responses';
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
const headers = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
const questions = new Map(forecastQuestions.map((question) => [question.id, question]));
if (forecastQuestions.some(({ state }) => state === 'open') && (!process.env.AUDIENCE_HASH_SECRET || !process.env.AUDIENCE_DATA_PATH)) {
  throw new Error('Open questions require explicit AUDIENCE_HASH_SECRET and persistent AUDIENCE_DATA_PATH configuration.');
}
const initialState = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : null;
const audience = new AudienceSignalStore({ questions: forecastQuestions, campaigns: audienceCampaigns, secret: hashSecret, initialState });
const rateBuckets = new Map();

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {...headers, 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store', ...extraHeaders});
  res.end(JSON.stringify(payload));
}

function persist() {
  mkdirSync(dirname(dataPath), { recursive: true });
  const temporary = `${dataPath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(audience.snapshot(), null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, dataPath);
}

function authorized(req) {
  const expected = process.env.AUDIENCE_IMPORT_TOKEN;
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!expected || !provided) return false;
  const expectedDigest = createHmac('sha256', 'audience-import').update(expected).digest();
  const providedDigest = createHmac('sha256', 'audience-import').update(provided).digest();
  return timingSafeEqual(expectedDigest, providedDigest);
}

function allowRequest(req, scope, limit = 10, windowMs = 10 * 60 * 1000) {
  const key = `${req.socket.remoteAddress || 'unknown'}:${scope}`;
  const now = Date.now();
  const recent = (rateBuckets.get(key) || []).filter((time) => now - time < windowMs);
  if (recent.length >= limit) return false;
  recent.push(now);
  rateBuckets.set(key, recent);
  return true;
}

function readJson(req, maxBytes = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
    });
    req.on('end', () => {
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return reject(Object.assign(new Error('Content-Type must be application/json'), { statusCode: 415 }));
      try { resolve(JSON.parse(body)); } catch { reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 })); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const questionMatch = url.pathname.match(/^\/api\/questions\/([a-z0-9-]+)$/);
  const responseMatch = url.pathname.match(/^\/api\/questions\/([a-z0-9-]+)\/responses$/);
  try {
    if (questionMatch && ['GET', 'HEAD'].includes(req.method)) {
      const question = questions.get(questionMatch[1]);
      if (!question) return json(res, 404, { error: 'Question not found' });
      const payload = { question, results: audience.publicResults(question.id) };
      if (req.method === 'HEAD') return json(res, 200, {});
      return json(res, 200, payload);
    }
    if (responseMatch && req.method === 'POST') {
      if (!allowRequest(req, responseMatch[1])) return json(res, 429, { error: 'Too many attempts. Try again later.' }, { 'Retry-After': '600' });
      const body = await readJson(req);
      if (body.consent !== true) throw Object.assign(new Error('Consent is required to submit'), { statusCode: 400 });
      const result = await audience.recordDirectResponse({ ...body, questionId: responseMatch[1] });
      if (result.accepted) persist();
      return json(res, result.accepted ? 201 : 200, result);
    }
    if (url.pathname === '/api/linkedin/import' && req.method === 'POST') {
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      if (!allowRequest(req, 'linkedin-import', 5, 60 * 60 * 1000)) return json(res, 429, { error: 'Too many import attempts.' }, { 'Retry-After': '3600' });
      const body = await readJson(req, 256 * 1024);
      const rows = typeof body.csv === 'string' ? parseLinkedInReactionCsv(body.csv) : body.rows;
      if (!Array.isArray(rows)) throw Object.assign(new Error('Provide rows or CSV data'), { statusCode: 400 });
      const result = await audience.importLinkedInReactions({ campaignId: body.campaignId, importKey: body.importKey, rows });
      if (!result.duplicate) persist();
      return json(res, 200, result);
    }
    return json(res, 404, { error: 'API route not found' });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal Server Error' });
  }
}

createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, {...headers, 'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'});
    return res.end('Bad Request');
  }
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, {...headers, 'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Allow':'GET, HEAD'});
    return res.end('Method Not Allowed');
  }
  if (url.pathname === '/healthz') { res.writeHead(200, {...headers, 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); return res.end('{"status":"ok"}'); }
  const pollMatch = url.pathname.match(/^\/poll\/([a-z0-9-]+)$/);
  let pathname = url.pathname;
  if (pollMatch) {
    if (!questions.has(pollMatch[1])) pathname = '/404.html';
    else pathname = '/poll.html';
  }
  let file = normalize(join(root, decodeURIComponent(pathname)));
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
}).listen(port, '0.0.0.0', () => console.log(`Hollywood Evolves listening on 0.0.0.0:${port}`));