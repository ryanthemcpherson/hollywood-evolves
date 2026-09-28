import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from '../../lib/db.mjs';
import { migrate } from '../../lib/migrations.mjs';

// Real Postgres (compiled to WASM) in memory: every suite runs genuine SQL without a database server.
export async function freshDatabase(t, { migrated = true } = {}) {
  const pglite = new PGlite();
  const db = createDatabase({ pglite });
  t?.after?.(() => (pglite.closed ? undefined : pglite.close()));
  if (migrated) await migrate(db);
  return db;
}

// A controllable clock. It starts slightly after real time because the first migration opens Episode 01 at the database's now().
export function testClock(start = new Date(Date.now() + 60_000).toISOString()) {
  let current = Date.parse(start);
  const now = () => new Date(current);
  now.advance = (ms) => { current += ms; };
  return now;
}

export const EPISODE_01 = 'he-episode-01-customer-evolution-v1';
export const DRAFT_QUESTION = 'he-question-02-media-supply-chain-evolution-v1';
export const AUTH_SECRET = 'auth-secret-for-tests-with-at-least-32-characters';

export async function signInMembers(accounts, count, prefix = 'member') {
  const members = [];
  for (let index = 1; index <= count; index += 1) {
    const { token } = await accounts.signIn({ sub: `${prefix}-${index}`, name: `Member ${index}`, email: `${prefix}-${index}@example.com`, emailVerified: true });
    members.push({ token, ...(await accounts.getSession(token)) });
  }
  return members;
}

export const PUBLIC_ORIGIN = 'https://hollywoodevolves.mcpherson.app';
export const ADMIN_TOKEN = 'admin-token-with-at-least-32-characters!!';
export const completeAuthEnv = Object.freeze({
  AUTH_ENABLED: 'true',
  DATABASE_URL: 'postgres://user:password@db.internal:5432/app',
  PUBLIC_ORIGIN,
  LINKEDIN_CLIENT_ID: 'client-id',
  LINKEDIN_CLIENT_SECRET: 'client-secret',
  LINKEDIN_REDIRECT_URI: `${PUBLIC_ORIGIN}/auth/linkedin/callback`,
  AUTH_SECRET,
  ADMIN_TOKEN,
  ADMIN_NAME: 'Ian McPherson',
});
