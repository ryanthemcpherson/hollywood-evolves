const DEFAULT_PUBLIC_ORIGIN = 'https://hollywoodevolves.mcpherson.app';

function httpsOrigin(value) {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    const normalized = value.replace(/\/$/, '');
    return url.protocol === 'https:' && url.origin === normalized ? normalized : null;
  } catch { return null; }
}

// Returns the names (never the values) of settings that keep sign-in and forecasting closed.
function authProblems(env, publicOrigin) {
  const problems = [];
  if (!env.DATABASE_URL) problems.push('DATABASE_URL');
  if (!publicOrigin) problems.push('PUBLIC_ORIGIN');
  if (!env.LINKEDIN_CLIENT_ID) problems.push('LINKEDIN_CLIENT_ID');
  if (!env.LINKEDIN_CLIENT_SECRET) problems.push('LINKEDIN_CLIENT_SECRET');
  if (!publicOrigin || env.LINKEDIN_REDIRECT_URI !== `${publicOrigin}/auth/linkedin/callback`) problems.push('LINKEDIN_REDIRECT_URI');
  if (!(env.AUTH_SECRET?.length >= 32)) problems.push('AUTH_SECRET');
  if (!(env.ADMIN_TOKEN?.length >= 32)) problems.push('ADMIN_TOKEN');
  if (!env.ADMIN_NAME?.trim()) problems.push('ADMIN_NAME');
  return problems;
}

export function loadConfig(env = process.env) {
  const configuredOrigin = httpsOrigin(env.PUBLIC_ORIGIN);
  const authRequested = env.AUTH_ENABLED === 'true';
  const problems = authRequested ? authProblems(env, configuredOrigin) : [];
  const authEnabled = authRequested && problems.length === 0;
  return Object.freeze({
    authRequested,
    authEnabled,
    authProblems: Object.freeze(problems),
    commentaryEnabled: authEnabled && env.COMMENTARY_ENABLED === 'true',
    trustProxy: env.TRUST_PROXY === 'true',
    publicOrigin: configuredOrigin ?? (env.PUBLIC_ORIGIN || DEFAULT_PUBLIC_ORIGIN).replace(/\/$/, ''),
    databaseUrl: authEnabled ? env.DATABASE_URL : null,
    authSecret: authEnabled ? env.AUTH_SECRET : null,
    adminToken: authEnabled ? env.ADMIN_TOKEN : null,
    adminName: authEnabled ? env.ADMIN_NAME.trim().slice(0, 100) : null,
    linkedIn: authEnabled ? Object.freeze({ clientId: env.LINKEDIN_CLIENT_ID, clientSecret: env.LINKEDIN_CLIENT_SECRET, redirectUri: env.LINKEDIN_REDIRECT_URI }) : null,
  });
}
