import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { apiError } from './http-response.mjs';

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

// Audit rows reference members only through member_id (nulled on deletion); details must never carry PII.
export async function recordAudit(runner, { action, actor, memberId = null, subjectType = null, subjectId = null, details = {}, at }) {
  await runner.query(
    'INSERT INTO he.audit (action, actor, member_id, subject_type, subject_id, details, created_at) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)',
    [action, actor, memberId, subjectType, subjectId, JSON.stringify(details), at],
  );
}

// Stable pseudonym per LinkedIn subject: HMAC-SHA256(AUTH_SECRET, 'he-anon-v1:' + sub), first 16 bytes as a UUID.
// Deleting and re-creating an account therefore yields the same anon_id, so one person always counts once.
export function deriveAnonId(secret, linkedInSub) {
  const hex = createHmac('sha256', secret).update(`he-anon-v1:${linkedInSub}`).digest().subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class AccountStore {
  constructor({ db, secret, now = () => new Date(), sessionLifetimeMs = SESSION_LIFETIME_MS }) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('An auth secret of at least 32 characters is required');
    this.db = db;
    this.secret = secret;
    this.now = now;
    this.sessionLifetimeMs = sessionLifetimeMs;
  }

  digest(purpose, value) {
    return createHmac('sha256', this.secret).update(`${purpose}:${value}`).digest();
  }

  async signIn(claims) {
    if (typeof claims?.sub !== 'string' || !claims.sub || typeof claims.name !== 'string' || !claims.name.trim()) throw apiError(400, 'invalid_member_claims');
    const at = this.now().toISOString();
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.parse(at) + this.sessionLifetimeMs).toISOString();
    await this.db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM he.sessions WHERE expires_at <= $1::timestamptz', [at]);
      const { rows: [member] } = await tx.query(
        `INSERT INTO he.members (linkedin_sub, anon_id, name, email, email_verified, created_at, last_sign_in_at) VALUES ($1, $6::uuid, $2, $3, $4, $5::timestamptz, $5::timestamptz)
         ON CONFLICT (linkedin_sub) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, email_verified = EXCLUDED.email_verified, last_sign_in_at = EXCLUDED.last_sign_in_at
         RETURNING id, (xmax = 0) AS created`,
        [claims.sub, claims.name.trim().slice(0, 200), typeof claims.email === 'string' ? claims.email.slice(0, 320) : null, claims.emailVerified === true, at, deriveAnonId(this.secret, claims.sub)],
      );
      await tx.query('INSERT INTO he.sessions (token_hash, member_id, created_at, expires_at) VALUES ($1, $2, $3::timestamptz, $4::timestamptz)', [this.digest('session', token).toString('hex'), member.id, at, expiresAt]);
      await recordAudit(tx, { action: member.created ? 'member_created' : 'member_signed_in', actor: 'member', memberId: member.id, at });
    });
    return { token, expiresAt };
  }

  async getSession(token) {
    if (typeof token !== 'string' || !token) return null;
    const { rows: [row] } = await this.db.query(
      `SELECT m.id, m.anon_id, m.name, m.verified_industry FROM he.sessions s JOIN he.members m ON m.id = s.member_id
       WHERE s.token_hash = $1 AND s.expires_at > $2::timestamptz`,
      [this.digest('session', token).toString('hex'), this.now().toISOString()],
    );
    return row ? { id: row.id, anonId: row.anon_id, name: row.name, verifiedIndustry: row.verified_industry === true } : null;
  }

  // Deterministic per session so every tab gets the same token; never stored.
  csrfToken(token) {
    return this.digest('csrf', token).toString('base64url');
  }

  verifyCsrf(token, provided) {
    if (typeof token !== 'string' || typeof provided !== 'string' || !provided) return false;
    const expected = Buffer.from(this.csrfToken(token));
    const supplied = Buffer.from(provided);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  }

  async revokeSession(token, memberId) {
    const at = this.now().toISOString();
    await this.db.withTransaction(async (tx) => {
      await tx.query('DELETE FROM he.sessions WHERE token_hash = $1', [this.digest('session', token).toString('hex')]);
      await recordAudit(tx, { action: 'signed_out', actor: 'member', memberId, at });
    });
  }

  async purgeExpiredSessions() {
    const { rows } = await this.db.query('DELETE FROM he.sessions WHERE expires_at <= $1::timestamptz RETURNING 1', [this.now().toISOString()]);
    return rows.length;
  }

  async deleteAccount(memberId) {
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      const { rows: [member] } = await tx.query('SELECT id FROM he.members WHERE id = $1 FOR UPDATE', [memberId]);
      if (!member) throw apiError(404, 'not_found');
      const { rows: comments } = await tx.query('DELETE FROM he.comments WHERE member_id = $1 RETURNING 1', [memberId]);
      // Forecasts stay (with their anon_id) so published aggregates and scores never change after the fact.
      const { rows: forecasts } = await tx.query('UPDATE he.forecasts SET member_id = NULL WHERE member_id = $1 RETURNING 1', [memberId]);
      await tx.query('DELETE FROM he.sessions WHERE member_id = $1', [memberId]);
      await tx.query('DELETE FROM he.members WHERE id = $1', [memberId]);
      await recordAudit(tx, { action: 'account_deleted', actor: 'member', details: { commentsDeleted: comments.length, forecastsDetached: forecasts.length }, at });
      return { commentsDeleted: comments.length, forecastsDetached: forecasts.length };
    });
  }

  async setIndustryVerification({ memberSub, verified, reviewer }) {
    if (typeof memberSub !== 'string' || !memberSub || typeof verified !== 'boolean') throw apiError(422, 'invalid_verification');
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      const { rows: [member] } = await tx.query(
        'UPDATE he.members SET verified_industry = $2, verified_industry_at = $3::timestamptz, verified_industry_by = $4 WHERE linkedin_sub = $1 RETURNING id',
        [memberSub, verified, at, reviewer],
      );
      if (!member) throw apiError(404, 'not_found');
      await recordAudit(tx, { action: verified ? 'industry_verified' : 'industry_verification_removed', actor: reviewer, memberId: member.id, subjectType: 'member', at });
      return { memberSub, verifiedIndustry: verified };
    });
  }
}
