import { recordAudit } from './account-store.mjs';
import { apiError } from './http-response.mjs';

export const MINIMUM_FORECASTERS = 10;
export const MAX_SUBMISSIONS_PER_HOUR = 30;

const iso = (value) => (value ? new Date(value).toISOString() : null);
const isProbability = (value) => Number.isInteger(value) && value >= 1 && value <= 99;

// Median of each forecaster's log-odds, mapped back to a whole percent. Even counts average the two middle log-odds.
export function communityProbability(probabilities) {
  if (!probabilities.length) return null;
  const logOdds = probabilities.map((probability) => Math.log(probability / (100 - probability))).sort((left, right) => left - right);
  const middle = Math.floor(logOdds.length / 2);
  const median = logOdds.length % 2 ? logOdds[middle] : (logOdds[middle - 1] + logOdds[middle]) / 2;
  return Math.round(100 / (1 + Math.exp(-median)));
}

export function brierScore(probability, outcome) {
  const observed = outcome === 'yes' ? 1 : 0;
  return Math.round(((probability / 100 - observed) ** 2) * 10_000) / 10_000;
}

function acceptingForecasts(question, at) {
  const time = Date.parse(at);
  return question.status === 'open'
    && (!question.opens_at || new Date(question.opens_at).getTime() <= time)
    && (!question.closes_at || time < new Date(question.closes_at).getTime());
}

// Scored forecasts are the last one submitted before the question closed (or resolved, if that came first).
function scoreFor(question, history) {
  if (question.status !== 'resolved' || !['yes', 'no'].includes(question.outcome)) return null;
  const cutoff = Math.min(question.closes_at ? new Date(question.closes_at).getTime() : Infinity, new Date(question.resolved_at).getTime());
  const scored = history.find(({ submittedAt }) => Date.parse(submittedAt) < cutoff);
  return scored ? { brier: brierScore(scored.probability, question.outcome) } : null;
}

function parseSchedule(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) throw apiError(422, 'invalid_schedule');
  return new Date(time).toISOString();
}

function boundedText(value, maxLength) {
  return typeof value === 'string' && value.trim() && value.trim().length <= maxLength ? value.trim() : null;
}

export class ForecastStore {
  constructor({ db, now = () => new Date(), minimumForecasters = MINIMUM_FORECASTERS, maxSubmissionsPerHour = MAX_SUBMISSIONS_PER_HOUR }) {
    this.db = db;
    this.now = now;
    this.minimumForecasters = minimumForecasters;
    this.maxSubmissionsPerHour = maxSubmissionsPerHour;
  }

  async question(runner, questionId, { lock = null } = {}) {
    const { rows: [question] } = await runner.query(
      `SELECT id, status, opens_at, closes_at, resolved_at, outcome FROM he.questions WHERE id = $1${lock ? ` FOR ${lock}` : ''}`,
      [questionId],
    );
    return question ?? null;
  }

  async publicSummary(questionId) {
    const question = await this.question(this.db, questionId);
    if (!question || question.status === 'draft') return null;
    const { rows: latest } = await this.db.query(
      'SELECT DISTINCT ON (anon_id) probability FROM he.forecasts WHERE question_id = $1 ORDER BY anon_id, submitted_at DESC, id DESC',
      [questionId],
    );
    const { rows: experts } = await this.db.query(
      `SELECT name, role, probability, recorded_at FROM (
         SELECT DISTINCT ON (name) name, role, probability, recorded_at FROM he.expert_forecasts WHERE question_id = $1 ORDER BY name, recorded_at DESC, id DESC
       ) latest ORDER BY recorded_at, name`,
      [questionId],
    );
    const at = this.now().getTime();
    const closed = question.status === 'open' && question.closes_at && new Date(question.closes_at).getTime() <= at;
    return {
      questionId,
      status: closed ? 'closed' : question.status,
      opensAt: iso(question.opens_at),
      closesAt: iso(question.closes_at),
      forecasters: latest.length,
      minimumForecasters: this.minimumForecasters,
      community: latest.length >= this.minimumForecasters ? { probability: communityProbability(latest.map(({ probability }) => probability)) } : null,
      expert: experts.map((row) => ({ name: row.name, role: row.role, probability: row.probability, recordedAt: iso(row.recorded_at) })),
      resolution: question.status === 'resolved' ? { outcome: question.outcome, resolvedAt: iso(question.resolved_at) } : null,
    };
  }

  async memberView(runner, question, memberId) {
    const { rows } = await runner.query(
      'SELECT probability, submitted_at FROM he.forecasts WHERE question_id = $1 AND member_id = $2 ORDER BY submitted_at DESC, id DESC',
      [question.id, memberId],
    );
    const history = rows.map((row) => ({ probability: row.probability, submittedAt: iso(row.submitted_at) }));
    return { current: history[0] ?? null, history, score: scoreFor(question, history) };
  }

  async mine(questionId, memberId) {
    const question = await this.question(this.db, questionId);
    if (!question || question.status === 'draft') return null;
    return this.memberView(this.db, question, memberId);
  }

  async submit(questionId, member, probability) {
    if (!isProbability(probability)) throw apiError(422, 'invalid_probability');
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      // The member lock serializes one member's submissions; the shared question lock waits out a concurrent close.
      const { rows: [locked] } = await tx.query('SELECT id, anon_id FROM he.members WHERE id = $1 FOR UPDATE', [member.id]);
      if (!locked) throw apiError(401, 'authentication_required');
      const question = await this.question(tx, questionId, { lock: 'SHARE' });
      if (!question) throw apiError(404, 'not_found');
      if (!acceptingForecasts(question, at)) throw apiError(409, 'question_not_open');
      // Counted by anon_id (stable per LinkedIn subject), so deleting and re-creating the account does not reset it.
      const { rows: [recent] } = await tx.query(
        "SELECT count(*)::int AS count FROM he.forecasts WHERE anon_id = $1 AND submitted_at > $2::timestamptz - interval '1 hour'",
        [locked.anon_id, at],
      );
      if (recent.count >= this.maxSubmissionsPerHour) throw apiError(429, 'rate_limited');
      await tx.query(
        'INSERT INTO he.forecasts (question_id, anon_id, member_id, probability, submitted_at) VALUES ($1, $2, $3, $4, $5::timestamptz)',
        [questionId, locked.anon_id, member.id, probability, at],
      );
      return this.memberView(tx, question, member.id);
    });
  }

  async setQuestionStatus(questionId, { status, opensAt, closesAt } = {}, actor) {
    if (!['open', 'closed'].includes(status)) throw apiError(422, 'invalid_status');
    const requestedOpensAt = parseSchedule(opensAt);
    const requestedClosesAt = parseSchedule(closesAt);
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      const question = await this.question(tx, questionId, { lock: 'UPDATE' });
      if (!question) throw apiError(404, 'not_found');
      if (question.status === 'resolved') throw apiError(409, 'invalid_transition');
      let nextOpensAt = requestedOpensAt !== undefined ? requestedOpensAt : iso(question.opens_at);
      let nextClosesAt = requestedClosesAt !== undefined ? requestedClosesAt : iso(question.closes_at);
      if (status === 'open' && !nextOpensAt) nextOpensAt = at;
      // Closing without an explicit time records the actual close, so scoring uses forecasts made while it was open.
      if (status === 'closed' && requestedClosesAt === undefined && (!nextClosesAt || Date.parse(nextClosesAt) > Date.parse(at))) nextClosesAt = at;
      if (nextOpensAt && nextClosesAt && Date.parse(nextClosesAt) <= Date.parse(nextOpensAt)) throw apiError(422, 'invalid_schedule');
      if (status === 'open' && nextClosesAt && Date.parse(nextClosesAt) <= Date.parse(at)) throw apiError(422, 'invalid_schedule');
      await tx.query(
        'UPDATE he.questions SET status = $2, opens_at = $3::timestamptz, closes_at = $4::timestamptz, updated_at = $5::timestamptz WHERE id = $1',
        [questionId, status, nextOpensAt, nextClosesAt, at],
      );
      const result = { questionId, status, opensAt: nextOpensAt, closesAt: nextClosesAt };
      await recordAudit(tx, { action: 'question_status_changed', actor, subjectType: 'question', subjectId: questionId, details: { from: question.status, to: status, opensAt: nextOpensAt, closesAt: nextClosesAt }, at });
      return result;
    });
  }

  async resolve(questionId, { outcome, note } = {}, actor) {
    if (!['yes', 'no', 'invalid'].includes(outcome)) throw apiError(422, 'invalid_outcome');
    const resolutionNote = boundedText(note, 2000);
    if (!resolutionNote) throw apiError(422, 'invalid_note');
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      const question = await this.question(tx, questionId, { lock: 'UPDATE' });
      if (!question) throw apiError(404, 'not_found');
      if (!['open', 'closed'].includes(question.status)) throw apiError(409, 'invalid_transition');
      await tx.query(
        "UPDATE he.questions SET status = 'resolved', outcome = $2, resolution_note = $3, resolved_at = $4::timestamptz, updated_at = $4::timestamptz WHERE id = $1",
        [questionId, outcome, resolutionNote, at],
      );
      await recordAudit(tx, { action: 'question_resolved', actor, subjectType: 'question', subjectId: questionId, details: { outcome }, at });
      return { questionId, status: 'resolved', resolution: { outcome, resolvedAt: at } };
    });
  }

  async addExpertForecast(questionId, { name, role, probability } = {}, actor) {
    const expertName = boundedText(name, 200);
    const expertRole = boundedText(role, 200);
    if (!expertName || !expertRole || !isProbability(probability)) throw apiError(422, 'invalid_expert_forecast');
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      const question = await this.question(tx, questionId);
      if (!question) throw apiError(404, 'not_found');
      await tx.query(
        'INSERT INTO he.expert_forecasts (question_id, name, role, probability, recorded_at, recorded_by) VALUES ($1, $2, $3, $4, $5::timestamptz, $6)',
        [questionId, expertName, expertRole, probability, at, actor],
      );
      await recordAudit(tx, { action: 'expert_forecast_recorded', actor, subjectType: 'question', subjectId: questionId, details: { name: expertName, role: expertRole, probability }, at });
      return { questionId, name: expertName, role: expertRole, probability, recordedAt: at };
    });
  }

  async exportForecasts(actor) {
    const at = this.now().toISOString();
    return this.db.withTransaction(async (tx) => {
      const { rows } = await tx.query(
        `SELECT f.id::text AS id, f.question_id, f.anon_id, f.probability, f.submitted_at, m.name, m.email
         FROM he.forecasts f LEFT JOIN he.members m ON m.id = f.member_id ORDER BY f.submitted_at, f.id`,
      );
      await recordAudit(tx, { action: 'forecasts_exported', actor, details: { count: rows.length }, at });
      return {
        exportedAt: at,
        forecasts: rows.map((row) => ({ id: row.id, questionId: row.question_id, anonId: row.anon_id, probability: row.probability, submittedAt: iso(row.submitted_at), name: row.name ?? null, email: row.email ?? null })),
      };
    });
  }
}
