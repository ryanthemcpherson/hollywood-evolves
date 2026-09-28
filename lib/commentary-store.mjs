import { randomBytes } from 'node:crypto';
import { recordAudit } from './account-store.mjs';
import { apiError } from './http-response.mjs';

const iso = (value) => (value ? new Date(value).toISOString() : null);

export function normalizeCommentBody(body) {
  const normalized = typeof body === 'string' ? body.trim().replace(/\r\n?/g, '\n') : '';
  if (normalized.length < 20 || Buffer.byteLength(normalized, 'utf8') > 1500 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) return null;
  return normalized;
}

export class CommentaryStore {
  constructor({ db, now = () => new Date(), maxCommentsPerHour = 3 }) {
    this.db = db;
    this.now = now;
    this.maxCommentsPerHour = maxCommentsPerHour;
  }

  async submitComment({ memberId, questionId, body, consent }) {
    if (consent !== true) throw apiError(422, 'consent_required');
    const normalized = normalizeCommentBody(body);
    if (!normalized) throw apiError(422, 'invalid_comment');
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      // Locking the member row serializes one member's submissions so concurrent requests cannot overrun the hourly limit.
      const { rows: [member] } = await tx.query('SELECT id FROM he.members WHERE id = $1 FOR UPDATE', [memberId]);
      if (!member) throw apiError(401, 'authentication_required');
      const { rows: [question] } = await tx.query('SELECT id FROM he.questions WHERE id = $1', [questionId]);
      if (!question) throw apiError(404, 'not_found');
      const { rows: [recent] } = await tx.query("SELECT count(*)::int AS count FROM he.comments WHERE member_id = $1 AND created_at > $2::timestamptz - interval '1 hour'", [memberId, at]);
      if (recent.count >= this.maxCommentsPerHour) throw apiError(429, 'rate_limited');
      const id = `comment_${randomBytes(14).toString('base64url')}`;
      await tx.query(
        'INSERT INTO he.comments (id, question_id, member_id, body, consent, status, created_at) VALUES ($1, $2, $3, $4, true, \'pending\', $5::timestamptz)',
        [id, questionId, memberId, normalized, at],
      );
      await recordAudit(tx, { action: 'comment_submitted', actor: 'member', memberId, subjectType: 'comment', subjectId: id, details: { questionId }, at });
      return { id, status: 'pending' };
    });
  }

  async publicComments(questionId) {
    const { rows: [question] } = await this.db.query('SELECT id FROM he.questions WHERE id = $1', [questionId]);
    if (!question) return null;
    const { rows } = await this.db.query(
      `SELECT c.id, c.question_id, c.body, c.created_at, c.published_at, m.name, m.verified_industry
       FROM he.comments c JOIN he.members m ON m.id = c.member_id
       WHERE c.question_id = $1 AND c.status = 'approved' ORDER BY c.published_at, c.id`,
      [questionId],
    );
    return rows.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      body: row.body,
      createdAt: iso(row.created_at),
      publishedAt: iso(row.published_at),
      contributor: { name: row.name, verifiedIndustry: row.verified_industry === true },
    }));
  }

  async pendingComments() {
    const { rows } = await this.db.query(
      `SELECT c.id, c.question_id, c.body, c.created_at, m.linkedin_sub, m.name, m.email, m.email_verified, m.verified_industry
       FROM he.comments c JOIN he.members m ON m.id = c.member_id
       WHERE c.status = 'pending' ORDER BY c.created_at, c.id`,
    );
    return rows.map((row) => ({
      id: row.id,
      questionId: row.question_id,
      body: row.body,
      createdAt: iso(row.created_at),
      status: 'pending',
      member: { sub: row.linkedin_sub, name: row.name, email: row.email, emailVerified: row.email_verified === true, verifiedIndustry: row.verified_industry === true },
    }));
  }

  async moderateComment({ commentId, decision, reason = null, moderator }) {
    if (!['approved', 'rejected'].includes(decision)) throw apiError(422, 'invalid_decision');
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      const { rows: [comment] } = await tx.query('SELECT id, member_id, status FROM he.comments WHERE id = $1 FOR UPDATE', [commentId]);
      if (!comment) throw apiError(404, 'not_found');
      if (comment.status !== 'pending') throw apiError(409, 'already_moderated');
      const rejectionReason = decision === 'rejected' && typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 500) : null;
      await tx.query(
        'UPDATE he.comments SET status = $2, moderated_at = $3::timestamptz, moderated_by = $4, published_at = $5::timestamptz, rejection_reason = $6 WHERE id = $1',
        [commentId, decision, at, moderator, decision === 'approved' ? at : null, rejectionReason],
      );
      await recordAudit(tx, { action: `comment_${decision}`, actor: moderator, memberId: comment.member_id, subjectType: 'comment', subjectId: commentId, at });
      return { id: commentId, status: decision };
    });
  }
}
