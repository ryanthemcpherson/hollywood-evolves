import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { AuthorizationFlowStore } from './lib/auth-flow-store.mjs';
import { AudienceSignalStore, parseLinkedInReactionCsv } from './lib/audience-signals.mjs';
import { CommentaryStore } from './lib/commentary-store.mjs';
import { audienceCampaigns, forecastQuestions } from './lib/forecast-questions.mjs';
import { readJson } from './lib/http-body.mjs';
import { LinkedInOidcClient } from './lib/linkedin-oidc.mjs';


const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const root = join(process.cwd(), 'dist');
const dataPath = process.env.AUDIENCE_DATA_PATH || join(process.cwd(), '.data', 'audience-signals.json');
const hashSecret = process.env.AUDIENCE_HASH_SECRET || 'preview-draft-no-live-responses';
const commentaryPath = process.env.COMMENTARY_DATA_PATH || join(process.cwd(), '.data', 'commentary.json');
const commentarySecret = process.env.COMMENTARY_SECRET || randomBytes(32).toString('base64url');
const publicOrigin = (process.env.PUBLIC_ORIGIN || 'https://hollywoodevolves.mcpherson.app').replace(/\/$/, '');
const commentaryEnabled = process.env.COMMENTARY_ENABLED === 'true';

function validCommentaryConfig() {
  if (!(process.env.LINKEDIN_CLIENT_ID
    && process.env.LINKEDIN_CLIENT_SECRET
    && process.env.LINKEDIN_REDIRECT_URI
    && process.env.COMMENTARY_SECRET?.length >= 32
    && process.env.COMMENTARY_ADMIN_TOKEN?.length >= 32
    && process.env.COMMENTARY_ADMIN_NAME
    && process.env.COMMENTARY_DATA_PATH)) return false;
  try {
    const origin = new URL(publicOrigin);
    const redirect = new URL(process.env.LINKEDIN_REDIRECT_URI);
    return origin.protocol === 'https:'
      && redirect.origin === origin.origin
      && redirect.pathname === '/auth/linkedin/callback'
      && !redirect.search
      && !redirect.hash;
  } catch { return false; }
}
const authConfigured = commentaryEnabled && validCommentaryConfig();
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.ico':'image/x-icon'};
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
};
const questions = new Map(forecastQuestions.map((question) => [question.id, question]));
if (forecastQuestions.some(({ state }) => state === 'open') && (!process.env.AUDIENCE_HASH_SECRET || !process.env.AUDIENCE_DATA_PATH)) {
  throw new Error('Open questions require explicit AUDIENCE_HASH_SECRET and persistent AUDIENCE_DATA_PATH configuration.');
}
const initialState = existsSync(dataPath) ? JSON.parse(readFileSync(dataPath, 'utf8')) : null;
const audience = new AudienceSignalStore({ questions: forecastQuestions, campaigns: audienceCampaigns, secret: hashSecret, initialState });
const commentaryState = existsSync(commentaryPath) ? JSON.parse(readFileSync(commentaryPath, 'utf8')) : null;
const commentary = new CommentaryStore({ secret: commentarySecret, initialState: commentaryState });
const linkedIn = authConfigured ? new LinkedInOidcClient({
  clientId: process.env.LINKEDIN_CLIENT_ID,
  clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  redirectUri: process.env.LINKEDIN_REDIRECT_URI,
}) : null;
const authorizationFlows = authConfigured ? new AuthorizationFlowStore({ secret: commentarySecret }) : null;
const rateBuckets = new Map();

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {...headers, 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store', ...extraHeaders});
  res.end(JSON.stringify(payload));
}

function persistState(path, snapshot) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

const persistAudience = () => persistState(dataPath, audience.snapshot());
const persistCommentary = () => persistState(commentaryPath, commentary.snapshot());

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function sessionToken(req) {
  return parseCookies(req)['__Host-he_session'] || null;
}

function cookie(name, value, { maxAge = null } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  return origin === publicOrigin;
}

function secureEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftDigest = createHmac('sha256', commentarySecret).update(left).digest();
  const rightDigest = createHmac('sha256', commentarySecret).update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function adminAuthorized(req) {
  const provided = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return Boolean(process.env.COMMENTARY_ADMIN_TOKEN && secureEqual(provided, process.env.COMMENTARY_ADMIN_TOKEN));
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

async function handleAuth(req, res, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'GET' });
    return res.end('Method Not Allowed');
  }
  if (!authConfigured || !linkedIn) {
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('Not Found');
  }
  try {
    if (url.pathname === '/auth/linkedin') {
      if (!allowRequest(req, 'linkedin-login', 20, 10 * 60 * 1000)) {
        res.writeHead(429, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '600' });
        return res.end('Too many login attempts.');
      }
      const flow = authorizationFlows.create();
      const authorization = await linkedIn.authorizationUrl({ state: flow.state, nonce: flow.nonce });
      res.writeHead(302, { ...headers, Location: authorization.href, 'Cache-Control': 'no-store', 'Set-Cookie': cookie('__Host-he_oidc', flow.token, { maxAge: 600 }) });
      return res.end();
    }
    if (url.pathname === '/auth/linkedin/callback') {
      const clearFlow = cookie('__Host-he_oidc', '', { maxAge: 0 });
      const codes = url.searchParams.getAll('code');
      const states = url.searchParams.getAll('state');
      const errors = url.searchParams.getAll('error');
      if (codes.length > 1 || states.length > 1 || errors.length > 1 || (errors.length && (codes.length || states.length))) {
        res.writeHead(400, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearFlow });
        return res.end('Invalid LinkedIn callback parameters.');
      }
      if (errors.length === 1) {
        res.writeHead(400, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearFlow });
        return res.end('LinkedIn sign-in was canceled or denied.');
      }
      if (codes.length !== 1 || states.length !== 1) {
        res.writeHead(400, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearFlow });
        return res.end('Invalid LinkedIn callback parameters.');
      }
      const flow = authorizationFlows.consume(parseCookies(req)['__Host-he_oidc'], states[0]);
      if (!flow) {
        res.writeHead(401, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearFlow });
        return res.end('Invalid or expired LinkedIn sign-in state.');
      }
      const member = await linkedIn.redeem({ code: codes[0], nonce: flow.nonce });
      commentary.upsertLinkedInMember(member);
      const session = commentary.createSession(member.sub);
      persistCommentary();
      res.writeHead(302, { ...headers, Location: `${publicOrigin}/`, 'Cache-Control': 'no-store', 'Set-Cookie': [clearFlow, cookie('__Host-he_session', session.token, { maxAge: 7 * 24 * 60 * 60 })] });
      return res.end();
    }
    res.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('Not Found');
  } catch {
    res.writeHead(502, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': cookie('__Host-he_oidc', '', { maxAge: 0 }) });
    return res.end('LinkedIn sign-in could not be completed.');
  }
}

async function handleApi(req, res, url) {
  const questionMatch = url.pathname.match(/^\/api\/questions\/([a-z0-9-]+)$/);
  const responseMatch = url.pathname.match(/^\/api\/questions\/([a-z0-9-]+)\/responses$/);
  const commentsMatch = url.pathname.match(/^\/api\/questions\/([a-z0-9-]+)\/comments$/);
  const moderationMatch = url.pathname.match(/^\/api\/admin\/comments\/([A-Za-z0-9_-]+)$/);
  try {

    if (!authConfigured && req.method === 'GET' && (url.pathname === '/api/session' || commentsMatch)) {
      return json(res, 404, { error: 'API route not found' });
    }
    const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const cookieMutation = commentsMatch || url.pathname === '/api/session/logout' || url.pathname === '/api/account';
    const adminMutation = url.pathname.startsWith('/api/admin/');
    if (mutation && ((cookieMutation && !sameOrigin(req)) || (adminMutation && req.headers.origin && !sameOrigin(req)))) {
      return json(res, 403, { error: 'Request origin is not allowed' });
    }
    if (url.pathname === '/api/session' && req.method === 'GET') {
      const token = sessionToken(req);
      const found = commentary.getSession(token);
      if (!found) return json(res, 200, { authenticated: false, commentaryEnabled: authConfigured });
      const csrfToken = commentary.csrfTokenForSession(token);
      return json(res, 200, { authenticated: true, commentaryEnabled: authConfigured, csrfToken, member: { name: found.member.name, linkedInAuthenticated: true, verifiedIndustry: found.member.verifiedIndustry === true } });
    }
    if (url.pathname === '/api/session/logout' && req.method === 'POST') {
      const token = sessionToken(req);
      if (!commentary.getSession(token)) return json(res, 401, { error: 'Authentication required' });
      if (!commentary.verifyCsrf(token, req.headers['x-csrf-token'])) return json(res, 403, { error: 'Invalid CSRF token' });
      commentary.revokeSession(token);
      persistCommentary();
      return json(res, 200, { loggedOut: true }, { 'Set-Cookie': cookie('__Host-he_session', '', { maxAge: 0 }) });
    }
    if (url.pathname === '/api/account' && req.method === 'DELETE') {
      const token = sessionToken(req);
      const found = commentary.getSession(token);
      if (!found) return json(res, 401, { error: 'Authentication required' });
      if (!commentary.verifyCsrf(token, req.headers['x-csrf-token'])) return json(res, 403, { error: 'Invalid CSRF token' });
      commentary.deleteAccount(found.member.sub);
      persistCommentary();
      return json(res, 200, { deleted: true }, { 'Set-Cookie': cookie('__Host-he_session', '', { maxAge: 0 }) });
    }
    if (commentsMatch && req.method === 'GET') {
      if (!questions.has(commentsMatch[1])) return json(res, 404, { error: 'Question not found' });
      return json(res, 200, { comments: commentary.publicComments(commentsMatch[1]) });
    }
    if (commentsMatch && req.method === 'POST') {
      const token = sessionToken(req);
      const found = commentary.getSession(token);
      if (!found) return json(res, 401, { error: 'Authentication required' });
      if (!authConfigured) return json(res, 503, { error: 'Commentary is not enabled' });
      if (!commentary.verifyCsrf(token, req.headers['x-csrf-token'])) return json(res, 403, { error: 'Invalid CSRF token' });
      if (!questions.has(commentsMatch[1])) return json(res, 404, { error: 'Question not found' });
      if (!allowRequest(req, `comment:${found.member.sub}`, 10, 60 * 60 * 1000)) return json(res, 429, { error: 'Too many submissions' }, { 'Retry-After': '3600' });
      const body = await readJson(req);
      const comment = commentary.submitComment({ memberSub: found.member.sub, questionId: commentsMatch[1], body: body.body, consent: body.consent });
      persistCommentary();
      return json(res, 202, { accepted: true, id: comment.id, status: comment.status });
    }
    if (url.pathname === '/api/admin/comments' && req.method === 'GET') {
      if (!adminAuthorized(req)) return json(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      return json(res, 200, { comments: commentary.pendingComments() });
    }
    if (url.pathname === '/api/admin/verification' && req.method === 'POST') {
      if (!adminAuthorized(req)) return json(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      const body = await readJson(req);
      commentary.setIndustryVerification({ memberSub: body.memberSub, verified: body.verified, reviewer: process.env.COMMENTARY_ADMIN_NAME });
      persistCommentary();
      return json(res, 200, { memberSub: body.memberSub, verifiedIndustry: body.verified });
    }
    if (moderationMatch && req.method === 'POST') {
      if (!adminAuthorized(req)) return json(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
      const body = await readJson(req);
      const comment = commentary.moderateComment({ commentId: moderationMatch[1], decision: body.decision, reason: body.reason, moderator: process.env.COMMENTARY_ADMIN_NAME });
      persistCommentary();
      return json(res, 200, { id: comment.id, status: comment.status });
    }
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
      if (!authorized(req)) return json(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
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
  if (url.pathname.startsWith('/auth/')) return handleAuth(req, res, url);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, {...headers, 'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Allow':'GET, HEAD'});
    return res.end('Method Not Allowed');
  }
  if (url.pathname === '/healthz') { res.writeHead(200, {...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); return res.end('{"status":"ok"}'); }
  if (url.pathname === '/readyz') return json(res, 200, { status: 'ready' });
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

server.listen(port, host, () => console.log(`Hollywood Evolves listening on ${host}:${port}`));

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
