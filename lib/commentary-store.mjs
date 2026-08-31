import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function appError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function opaqueToken() {
  return randomBytes(32).toString('base64url');
}

export class CommentaryStore {
  constructor({ secret, initialState = null, now = () => new Date().toISOString(), maxCommentsPerHour = 3, sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
    if (typeof secret !== 'string' || secret.length < 16) throw new Error('A commentary secret of at least 16 characters is required');
    this.secret = secret;
    this.now = now;
    this.maxCommentsPerHour = maxCommentsPerHour;
    this.sessionLifetimeMs = sessionLifetimeMs;
    this.members = structuredClone(initialState?.members ?? []);
    this.sessions = structuredClone(initialState?.sessions ?? []);
    this.comments = structuredClone(initialState?.comments ?? []);
    this.audit = structuredClone(initialState?.audit ?? []);
  }

  digest(purpose, value) {
    return createHmac('sha256', this.secret).update(`${purpose}:${value}`).digest('hex');
  }

  snapshot() {
    return structuredClone({ version: 1, members: this.members, sessions: this.sessions, comments: this.comments, audit: this.audit });
  }

  upsertLinkedInMember(member) {
    if (!member?.sub || !member?.name) throw appError('LinkedIn member claims are incomplete', 400);
    const existing = this.members.find(({ sub }) => sub === member.sub);
    const next = {
      sub: member.sub,
      name: String(member.name).trim().slice(0, 200),
      picture: typeof member.picture === 'string' ? member.picture.slice(0, 2048) : null,
      email: typeof member.email === 'string' ? member.email.slice(0, 320) : null,
      emailVerified: member.emailVerified === true,
      linkedInAuthenticatedAt: this.now(),
      verifiedIndustry: existing?.verifiedIndustry === true,
      verifiedIndustryAt: existing?.verifiedIndustryAt ?? null,
      verifiedIndustryBy: existing?.verifiedIndustryBy ?? null,
    };
    if (existing) Object.assign(existing, next);
    else this.members.push(next);
    this.audit.push({ action: existing ? 'member_refreshed' : 'member_created', memberSub: member.sub, at: this.now() });
    return structuredClone(next);
  }

  createSession(memberSub) {
    if (!this.members.some(({ sub }) => sub === memberSub)) throw appError('Member not found', 404);
    const token = opaqueToken();
    const csrfToken = this.digest('csrf-token', token);
    const nowMs = Date.parse(this.now());
    this.sessions.push({
      tokenHash: this.digest('session', token),
      csrfHash: this.digest('csrf', csrfToken),
      memberSub,
      createdAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(nowMs + this.sessionLifetimeMs).toISOString(),
    });
    this.audit.push({ action: 'session_created', memberSub, at: this.now() });
    return { token, expiresAt: new Date(nowMs + this.sessionLifetimeMs).toISOString() };
  }

  getSession(token) {
    if (typeof token !== 'string' || !token) return null;
    const hash = this.digest('session', token);
    const session = this.sessions.find(({ tokenHash }) => tokenHash === hash);
    if (!session || Date.parse(session.expiresAt) <= Date.parse(this.now())) return null;
    const member = this.members.find(({ sub }) => sub === session.memberSub);
    return member ? { session: structuredClone(session), member: structuredClone(member) } : null;
  }

  verifyCsrf(token, csrfToken) {
    const found = this.getSession(token);
    if (!found || typeof csrfToken !== 'string') return false;
    const expected = Buffer.from(found.session.csrfHash, 'hex');
    const provided = Buffer.from(this.digest('csrf', csrfToken), 'hex');
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  }

  csrfTokenForSession(token) {
    const found = this.getSession(token);
    if (!found) throw appError('Authentication required', 401);
    return this.digest('csrf-token', token);
  }

  revokeSession(token) {
    if (typeof token !== 'string') return;
    const hash = this.digest('session', token);
    const session = this.sessions.find(({ tokenHash }) => tokenHash === hash);
    this.sessions = this.sessions.filter(({ tokenHash }) => tokenHash !== hash);
    if (session) this.audit.push({ action: 'session_revoked', memberSub: session.memberSub, at: this.now() });
  }

  deleteAccount(memberSub) {
    const member = this.members.find(({ sub }) => sub === memberSub);
    if (!member) throw appError('Member not found', 404);
    const commentIds = new Set(this.comments.filter((comment) => comment.memberSub === memberSub).map(({ id }) => id));
    this.members = this.members.filter(({ sub }) => sub !== memberSub);
    this.sessions = this.sessions.filter((session) => session.memberSub !== memberSub);
    this.comments = this.comments.filter((comment) => comment.memberSub !== memberSub);
    this.audit = this.audit.filter((entry) => entry.memberSub !== memberSub && !commentIds.has(entry.commentId));
    this.audit.push({ action: 'account_deleted', subjectHash: this.digest('deleted-member', memberSub), at: this.now() });
  }

  submitComment({ memberSub, questionId, body, consent }) {
    if (!this.members.some(({ sub }) => sub === memberSub)) throw appError('Authentication required', 401);
    if (consent !== true) throw appError('Consent to identified publication is required', 400);
    if (!/^he-[a-z0-9-]+-v\d+$/.test(questionId || '')) throw appError('Invalid question', 400);
    const normalized = typeof body === 'string' ? body.trim().replace(/\r\n?/g, '\n') : '';
    if (normalized.length < 20 || normalized.length > 1500) throw appError('Commentary must be between 20 and 1500 characters', 400);
    const nowMs = Date.parse(this.now());
    const recent = this.comments.filter((comment) => comment.memberSub === memberSub && nowMs - Date.parse(comment.createdAt) < 60 * 60 * 1000);
    if (recent.length >= this.maxCommentsPerHour) throw appError('Too many commentary submissions. Try again later.', 429);
    const comment = { id: `comment_${opaqueToken().slice(0, 18)}`, questionId, memberSub, body: normalized, consentAt: this.now(), status: 'pending', createdAt: this.now(), publishedAt: null, moderatedAt: null, moderatedBy: null, rejectionReason: null };
    this.comments.push(comment);
    this.audit.push({ action: 'comment_submitted', commentId: comment.id, memberSub, questionId, at: this.now() });
    return structuredClone(comment);
  }

  pendingComments() {
    return this.comments.filter(({ status }) => status === 'pending').map((comment) => ({ ...structuredClone(comment), member: structuredClone(this.members.find(({ sub }) => sub === comment.memberSub)) }));
  }

  moderateComment({ commentId, decision, moderator, reason = null }) {
    if (!['approved', 'rejected'].includes(decision) || !moderator) throw appError('Invalid moderation decision', 400);
    const comment = this.comments.find(({ id }) => id === commentId);
    if (!comment) throw appError('Comment not found', 404);
    if (comment.status !== 'pending') throw appError('Comment has already been moderated', 409);
    comment.status = decision;
    comment.moderatedAt = this.now();
    comment.moderatedBy = String(moderator).slice(0, 100);
    comment.publishedAt = decision === 'approved' ? this.now() : null;
    comment.rejectionReason = decision === 'rejected' && reason ? String(reason).slice(0, 500) : null;
    this.audit.push({ action: `comment_${decision}`, commentId, moderator: comment.moderatedBy, at: this.now() });
    return structuredClone(comment);
  }

  setIndustryVerification({ memberSub, verified, reviewer }) {
    if (!reviewer || typeof verified !== 'boolean') throw appError('Invalid verification decision', 400);
    const member = this.members.find(({ sub }) => sub === memberSub);
    if (!member) throw appError('Member not found', 404);
    member.verifiedIndustry = verified;
    member.verifiedIndustryAt = this.now();
    member.verifiedIndustryBy = String(reviewer).slice(0, 100);
    this.audit.push({ action: verified ? 'industry_verified' : 'industry_verification_removed', memberSub, reviewer: member.verifiedIndustryBy, at: this.now() });
  }

  publicComments(questionId) {
    return this.comments.filter((comment) => comment.questionId === questionId && comment.status === 'approved').map((comment) => {
      const member = this.members.find(({ sub }) => sub === comment.memberSub);
      return {
        id: comment.id,
        questionId: comment.questionId,
        body: comment.body,
        createdAt: comment.createdAt,
        publishedAt: comment.publishedAt,
        contributor: { name: member?.name ?? 'Contributor', verifiedIndustry: member?.verifiedIndustry === true },
      };
    });
  }
}
