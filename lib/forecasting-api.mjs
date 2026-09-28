import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { AccountStore, SESSION_LIFETIME_MS } from './account-store.mjs';
import { AuthorizationFlowStore, safeReturnPath } from './auth-flow-store.mjs';
import { CommentaryStore } from './commentary-store.mjs';
import { ForecastStore } from './forecast-store.mjs';
import { readJson } from './http-body.mjs';
import { apiError, securityHeaders, sendJson, sendText } from './http-response.mjs';
import { LinkedInOidcClient } from './linkedin-oidc.mjs';
import { migrate, schemaIsCurrent } from './migrations.mjs';

const SESSION_COOKIE = '__Host-he_session';
const FLOW_COOKIE = '__Host-he_oidc';
const QUESTION_ID = '([a-z0-9-]{1,120})';
const routes = [
  ['session', /^\/api\/session$/],
  ['logout', /^\/api\/session\/logout$/],
  ['account', /^\/api\/account$/],
  ['forecast', new RegExp(`^/api/forecasts/${QUESTION_ID}$`)],
  ['mine', new RegExp(`^/api/forecasts/${QUESTION_ID}/mine$`)],
  ['comments', new RegExp(`^/api/questions/${QUESTION_ID}/comments$`)],
  ['admin', /^\/api\/admin(?:\/.*)?$/],
];
const BODY_ERRORS = { 400: 'invalid_json', 413: 'payload_too_large', 415: 'unsupported_media_type' };
const CONNECTION_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE', '57P01', '57P02', '57P03']);

export function log(level, event, fields = {}) {
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...fields });
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

function matchRoute(pathname) {
  for (const [name, pattern] of routes) {
    const match = pathname.match(pattern);
    if (match) return { name, questionId: match[1] ?? null };
  }
  return null;
}

function parseCookies(req) {
  const cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const value = part.slice(index + 1).trim();
    try { cookies[part.slice(0, index).trim()] = decodeURIComponent(value); } catch { cookies[part.slice(0, index).trim()] = value; }
  }
  return cookies;
}

function cookie(name, value, { maxAge = null } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax'];
  if (maxAge !== null) parts.push(`Max-Age=${maxAge}`);
  return parts.join('; ');
}

const clearSessionCookie = () => cookie(SESSION_COOKIE, '', { maxAge: 0 });

function isConnectionError(error) {
  return CONNECTION_ERROR_CODES.has(error?.code) || /^08/.test(error?.code ?? '') || /connection|timeout/i.test(error?.message ?? '');
}

export function createForecasting({ config, db = null, fetch = globalThis.fetch, now = () => new Date(), limiter, clientKey }) {
  const enabled = config.authEnabled && db !== null;
  const accounts = enabled ? new AccountStore({ db, secret: config.authSecret, now }) : null;
  const forecasts = enabled ? new ForecastStore({ db, now }) : null;
  const commentary = enabled ? new CommentaryStore({ db, now }) : null;
  const flows = enabled ? new AuthorizationFlowStore({ secret: config.authSecret, now: () => now().getTime() }) : null;
  const linkedIn = enabled ? new LinkedInOidcClient({ ...config.linkedIn, fetch }) : null;
  const adminKey = randomBytes(32);
  const timers = new Set();
  let ready = false;
  let stopped = false;

  const schedule = (fn, delay) => {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, delay);
    timer.unref?.();
    timers.add(timer);
  };

  async function migrateWithRetry(delay = 2_000) {
    if (stopped) return false;
    try {
      const { applied } = await migrate(db);
      ready = true;
      log('info', 'database_ready', { migrationsApplied: applied });
      return true;
    } catch (error) {
      // Readiness stays failed (so /readyz reports 503) while the site keeps serving; retry with capped backoff.
      log('error', 'database_migration_failed', { code: error?.code ?? null, message: error?.message ?? 'unknown', retryInMs: delay });
      schedule(() => migrateWithRetry(Math.min(delay * 2, 60_000)), delay);
      return false;
    }
  }

  function purgeSessionsPeriodically() {
    schedule(async () => {
      if (ready) {
        try { await accounts.purgeExpiredSessions(); } catch (error) { log('error', 'session_purge_failed', { code: error?.code ?? null, message: error?.message ?? 'unknown' }); }
      }
      if (!stopped) purgeSessionsPeriodically();
    }, 60 * 60 * 1000);
  }

  async function start() {
    if (!enabled) return false;
    purgeSessionsPeriodically();
    return migrateWithRetry();
  }

  async function stop() {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    await db?.close();
  }

  async function readiness() {
    if (!config.authEnabled) return true;
    if (!ready) return false;
    try { return await schemaIsCurrent(db); } catch { return false; }
  }

  function adminAuthorized(req) {
    const provided = req.headers.authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!provided) return false;
    const expected = createHmac('sha256', adminKey).update(config.adminToken).digest();
    return timingSafeEqual(expected, createHmac('sha256', adminKey).update(provided).digest());
  }

  async function currentSession(req) {
    const token = parseCookies(req)[SESSION_COOKIE];
    if (!token) return { token: null, member: null };
    return { token, member: await accounts.getSession(token) };
  }

  async function requireMember(req, { write }) {
    if (write && req.headers.origin !== config.publicOrigin) throw apiError(403, 'origin_not_allowed');
    const session = await currentSession(req);
    if (!session.member) throw apiError(401, 'authentication_required');
    if (write && !accounts.verifyCsrf(session.token, req.headers['x-csrf-token'])) throw apiError(403, 'invalid_csrf_token');
    return session;
  }

  async function readBody(req) {
    const body = await readJson(req, 16 * 1024);
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  }

  async function handleSession(req, res) {
    if (req.method !== 'GET') throw apiError(404, 'not_found');
    const session = await currentSession(req);
    if (!session.member) {
      return sendJson(res, 200, { authEnabled: true, authenticated: false }, session.token ? { 'Set-Cookie': clearSessionCookie() } : {});
    }
    return sendJson(res, 200, {
      authEnabled: true,
      authenticated: true,
      member: { name: session.member.name, verifiedIndustry: session.member.verifiedIndustry },
      csrfToken: accounts.csrfToken(session.token),
      commentaryEnabled: config.commentaryEnabled,
    });
  }

  async function handleAdmin(req, res, pathname) {
    if (req.headers.origin && req.headers.origin !== config.publicOrigin) throw apiError(403, 'origin_not_allowed');
    if (!adminAuthorized(req)) return sendJson(res, 401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
    const actor = config.adminName;
    const questionMatch = pathname.match(new RegExp(`^/api/admin/questions/${QUESTION_ID}(/resolution|/expert-forecasts)?$`));
    const commentMatch = pathname.match(/^\/api\/admin\/comments\/([A-Za-z0-9_-]{1,64})$/);
    if (questionMatch && req.method === 'POST') {
      const body = await readBody(req);
      if (!questionMatch[2]) return sendJson(res, 200, await forecasts.setQuestionStatus(questionMatch[1], body, actor));
      if (questionMatch[2] === '/resolution') return sendJson(res, 200, await forecasts.resolve(questionMatch[1], body, actor));
      return sendJson(res, 201, await forecasts.addExpertForecast(questionMatch[1], body, actor));
    }
    if (pathname === '/api/admin/export/forecasts' && req.method === 'GET') return sendJson(res, 200, await forecasts.exportForecasts(actor));
    if (pathname === '/api/admin/comments' && req.method === 'GET') return sendJson(res, 200, { comments: await commentary.pendingComments() });
    if (commentMatch && req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, await commentary.moderateComment({ commentId: commentMatch[1], decision: body.decision, reason: body.reason, moderator: actor }));
    }
    if (pathname === '/api/admin/verification' && req.method === 'POST') {
      const body = await readBody(req);
      return sendJson(res, 200, await accounts.setIndustryVerification({ memberSub: body.memberSub, verified: body.verified, reviewer: actor }));
    }
    throw apiError(404, 'not_found');
  }

  async function dispatch(req, res, route, pathname) {
    const { name, questionId } = route;
    if (name === 'session') return handleSession(req, res);
    if (name === 'admin') return handleAdmin(req, res, pathname);
    if (name === 'logout' && req.method === 'POST') {
      const { token, member } = await requireMember(req, { write: true });
      await accounts.revokeSession(token, member.id);
      return sendJson(res, 200, { loggedOut: true }, { 'Set-Cookie': clearSessionCookie() });
    }
    if (name === 'account' && req.method === 'DELETE') {
      const { member } = await requireMember(req, { write: true });
      await accounts.deleteAccount(member.id);
      return sendJson(res, 200, { deleted: true }, { 'Set-Cookie': clearSessionCookie() });
    }
    if (name === 'forecast' && req.method === 'GET') {
      const summary = await forecasts.publicSummary(questionId);
      if (!summary) throw apiError(404, 'not_found');
      return sendJson(res, 200, summary);
    }
    if (name === 'forecast' && req.method === 'POST') {
      const { member } = await requireMember(req, { write: true });
      const body = await readBody(req);
      return sendJson(res, 201, await forecasts.submit(questionId, member, body.probability));
    }
    if (name === 'mine' && req.method === 'GET') {
      const { member } = await requireMember(req, { write: false });
      const view = await forecasts.mine(questionId, member.id);
      if (!view) throw apiError(404, 'not_found');
      return sendJson(res, 200, view);
    }
    if (name === 'comments' && req.method === 'GET') {
      const comments = await commentary.publicComments(questionId);
      if (!comments) throw apiError(404, 'not_found');
      return sendJson(res, 200, { comments });
    }
    if (name === 'comments' && req.method === 'POST') {
      const { member } = await requireMember(req, { write: true });
      const body = await readBody(req);
      const comment = await commentary.submitComment({ memberId: member.id, questionId, body: body.body, consent: body.consent });
      return sendJson(res, 202, { accepted: true, id: comment.id, status: comment.status });
    }
    throw apiError(404, 'not_found');
  }

  // Returns false for paths outside this contract so the caller can fall through to legacy routes.
  async function handleApi(req, res, url) {
    const route = matchRoute(url.pathname);
    if (!route) return false;
    try {
      if (!config.authEnabled) {
        if (route.name === 'session' && req.method === 'GET') sendJson(res, 200, { authEnabled: false });
        else sendJson(res, 404, { error: 'not_found' });
        return true;
      }
      if (route.name === 'comments' && !config.commentaryEnabled) throw apiError(404, 'not_found');
      if (!ready) {
        // Until the database is reachable and migrated the homepage behaves exactly as if sign-in were off.
        if (route.name === 'session' && req.method === 'GET') sendJson(res, 200, { authEnabled: false });
        else sendJson(res, 503, { error: 'unavailable' }, { 'Retry-After': '30' });
        return true;
      }
      await dispatch(req, res, route, url.pathname);
    } catch (error) {
      if (error?.publicCode) sendJson(res, error.statusCode, { error: error.publicCode });
      else if (BODY_ERRORS[error?.statusCode]) sendJson(res, error.statusCode, { error: BODY_ERRORS[error.statusCode] });
      else if (isConnectionError(error)) {
        log('error', 'database_unavailable', { route: route.name, code: error?.code ?? null, message: error?.message ?? 'unknown' });
        sendJson(res, 503, { error: 'unavailable' }, { 'Retry-After': '30' });
      } else {
        log('error', 'api_error', { route: route.name, code: error?.code ?? null, message: error?.message ?? 'unknown' });
        sendJson(res, 500, { error: 'internal_error' });
      }
    }
    return true;
  }

  async function handleAuth(req, res, url) {
    if (!enabled || !['/auth/linkedin', '/auth/linkedin/callback'].includes(url.pathname)) return sendText(res, 404, 'Not Found');
    if (req.method !== 'GET') return sendText(res, 405, 'Method Not Allowed', { Allow: 'GET' });
    if (!ready) return sendText(res, 503, 'Sign-in is temporarily unavailable.', { 'Retry-After': '30' });
    const clearFlow = cookie(FLOW_COOKIE, '', { maxAge: 0 });
    try {
      if (url.pathname === '/auth/linkedin') {
        if (!limiter.allow(`${clientKey(req)}:linkedin-login`, 20, 10 * 60 * 1000)) return sendText(res, 429, 'Too many login attempts.', { 'Retry-After': '600' });
        const flow = flows.create({ returnPath: safeReturnPath(url.searchParams.get('return'), config.publicOrigin) });
        const authorization = await linkedIn.authorizationUrl({ state: flow.state, nonce: flow.nonce, codeChallenge: flow.codeChallenge });
        res.writeHead(302, { ...securityHeaders, Location: authorization.href, 'Cache-Control': 'no-store', 'Set-Cookie': cookie(FLOW_COOKIE, flow.token, { maxAge: 600 }) });
        return res.end();
      }
      const codes = url.searchParams.getAll('code');
      const states = url.searchParams.getAll('state');
      const errors = url.searchParams.getAll('error');
      if (codes.length > 1 || states.length > 1 || errors.length > 1 || (errors.length && (codes.length || states.length))) {
        return sendText(res, 400, 'Invalid LinkedIn callback parameters.', { 'Set-Cookie': clearFlow });
      }
      if (errors.length === 1) return sendText(res, 400, 'LinkedIn sign-in was canceled or denied.', { 'Set-Cookie': clearFlow });
      if (codes.length !== 1 || states.length !== 1) return sendText(res, 400, 'Invalid LinkedIn callback parameters.', { 'Set-Cookie': clearFlow });
      const flow = flows.consume(parseCookies(req)[FLOW_COOKIE], states[0]);
      if (!flow) return sendText(res, 401, 'Invalid or expired LinkedIn sign-in state.', { 'Set-Cookie': clearFlow });
      const claims = await linkedIn.redeem({ code: codes[0], nonce: flow.nonce, codeVerifier: flow.codeVerifier });
      const session = await accounts.signIn(claims);
      res.writeHead(302, {
        ...securityHeaders,
        Location: `${config.publicOrigin}${flow.returnPath}`,
        'Cache-Control': 'no-store',
        'Set-Cookie': [clearFlow, cookie(SESSION_COOKIE, session.token, { maxAge: Math.floor(SESSION_LIFETIME_MS / 1000) })],
      });
      return res.end();
    } catch (error) {
      log('warn', 'linkedin_sign_in_failed', { code: error?.code ?? null, message: error?.message ?? 'unknown' });
      return sendText(res, 502, 'LinkedIn sign-in could not be completed.', { 'Set-Cookie': clearFlow });
    }
  }

  return { start, stop, readiness, handleApi, handleAuth, get ready() { return ready; } };
}
