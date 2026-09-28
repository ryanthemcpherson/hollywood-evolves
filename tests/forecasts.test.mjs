import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { AccountStore, deriveAnonId } from '../lib/account-store.mjs';
import { brierScore, communityProbability, ForecastStore, MINIMUM_FORECASTERS } from '../lib/forecast-store.mjs';
import { AUTH_SECRET, DRAFT_QUESTION, EPISODE_01, freshDatabase, signInMembers, testClock } from './support/database.mjs';

const HOUR = 60 * 60 * 1000;
const rejectsWith = (status, code) => (error) => error.statusCode === status && error.publicCode === code;

async function setup(t) {
  const db = await freshDatabase(t);
  const now = testClock();
  return { db, now, accounts: new AccountStore({ db, secret: AUTH_SECRET, now }), forecasts: new ForecastStore({ db, now }) };
}

test('community forecast is the median in log-odds, rounded to a whole percent', () => {
  assert.equal(communityProbability([]), null);
  assert.equal(communityProbability([37]), 37);
  assert.equal(communityProbability([10, 90, 60]), 60);
  assert.equal(communityProbability([99, 1, 50, 50, 70]), 50);
  // Even counts average the two middle log-odds: logit(20) and logit(80) cancel to exactly 50%.
  assert.equal(communityProbability([20, 80]), 50);
  // logit(60)=0.405, logit(90)=2.197 -> mean 1.301 -> 78.6% (a plain probability mean would give 75%).
  assert.equal(communityProbability([60, 90]), 79);
  assert.equal(communityProbability([1, 1]), 1);
  assert.equal(communityProbability([99, 99, 99, 1]), 99);
});

test('Brier score compares the probability to the observed outcome', () => {
  assert.equal(brierScore(70, 'yes'), 0.09);
  assert.equal(brierScore(70, 'no'), 0.49);
  assert.equal(brierScore(1, 'no'), 0.0001);
  assert.equal(brierScore(50, 'yes'), 0.25);
});

test('the public summary publishes the count always and the aggregate only from ten forecasters, using latest forecasts', async (t) => {
  const { accounts, forecasts, now } = await setup(t);
  const members = await signInMembers(accounts, MINIMUM_FORECASTERS);
  for (const member of members.slice(0, 9)) await forecasts.submit(EPISODE_01, member, 90);
  let summary = await forecasts.publicSummary(EPISODE_01);
  assert.equal(summary.forecasters, 9);
  assert.equal(summary.minimumForecasters, 10);
  assert.equal(summary.community, null);
  assert.equal(summary.status, 'open');
  assert.equal(summary.resolution, null);
  assert.deepEqual(summary.expert, []);

  // A revision replaces the member's contribution instead of adding a second forecaster.
  now.advance(1000);
  await forecasts.submit(EPISODE_01, members[0], 10);
  summary = await forecasts.publicSummary(EPISODE_01);
  assert.equal(summary.forecasters, 9);

  await forecasts.submit(EPISODE_01, members[9], 10);
  now.advance(1000);
  await forecasts.submit(EPISODE_01, members[1], 10);
  summary = await forecasts.publicSummary(EPISODE_01);
  assert.equal(summary.forecasters, 10);
  // Latest values: three at 10%, seven at 90% -> even count, middle pair (90, 90).
  assert.deepEqual(summary.community, { probability: 90 });
  assert.doesNotMatch(JSON.stringify(summary), /member-|@example|anon/i);
});

test('draft and unknown questions are hidden and reject forecasts', async (t) => {
  const { accounts, forecasts } = await setup(t);
  const [member] = await signInMembers(accounts, 1);
  assert.equal(await forecasts.publicSummary(DRAFT_QUESTION), null);
  assert.equal(await forecasts.publicSummary('he-unknown-v1'), null);
  assert.equal(await forecasts.mine(DRAFT_QUESTION, member.id), null);
  await assert.rejects(forecasts.submit(DRAFT_QUESTION, member, 50), rejectsWith(409, 'question_not_open'));
  await assert.rejects(forecasts.submit('he-unknown-v1', member, 50), rejectsWith(404, 'not_found'));
});

test('probabilities must be whole numbers from 1 to 99', async (t) => {
  const { accounts, forecasts } = await setup(t);
  const [member] = await signInMembers(accounts, 1);
  for (const probability of [0, 100, -5, 50.5, '50', null, undefined, Number.NaN]) {
    await assert.rejects(forecasts.submit(EPISODE_01, member, probability), rejectsWith(422, 'invalid_probability'), String(probability));
  }
  const accepted = await forecasts.submit(EPISODE_01, member, 1);
  assert.equal(accepted.current.probability, 1);
  assert.equal((await forecasts.submit(EPISODE_01, member, 99)).current.probability, 99);
});

test('submissions respect the schedule and admin status changes', async (t) => {
  const { accounts, forecasts, now, db } = await setup(t);
  const [member] = await signInMembers(accounts, 1);
  const future = new Date(now().getTime() + HOUR).toISOString();
  await forecasts.setQuestionStatus(EPISODE_01, { status: 'open', opensAt: future, closesAt: new Date(now().getTime() + 2 * HOUR).toISOString() }, 'Editor');
  await assert.rejects(forecasts.submit(EPISODE_01, member, 50), rejectsWith(409, 'question_not_open'));
  now.advance(HOUR);
  await forecasts.submit(EPISODE_01, member, 50);
  now.advance(HOUR);
  await assert.rejects(forecasts.submit(EPISODE_01, member, 50), rejectsWith(409, 'question_not_open'));
  assert.equal((await forecasts.publicSummary(EPISODE_01)).status, 'closed');

  const closed = await forecasts.setQuestionStatus(EPISODE_01, { status: 'closed' }, 'Editor');
  assert.equal(closed.status, 'closed');
  await assert.rejects(forecasts.setQuestionStatus(EPISODE_01, { status: 'resolved' }, 'Editor'), rejectsWith(422, 'invalid_status'));
  await assert.rejects(forecasts.setQuestionStatus(EPISODE_01, { status: 'open', opensAt: 'not a date' }, 'Editor'), rejectsWith(422, 'invalid_schedule'));
  await assert.rejects(forecasts.setQuestionStatus(EPISODE_01, { status: 'open', opensAt: future, closesAt: future }, 'Editor'), rejectsWith(422, 'invalid_schedule'));
  await assert.rejects(forecasts.setQuestionStatus('he-unknown-v1', { status: 'open' }, 'Editor'), rejectsWith(404, 'not_found'));

  const reopened = await forecasts.setQuestionStatus(EPISODE_01, { status: 'open', closesAt: null }, 'Editor');
  assert.deepEqual({ status: reopened.status, closesAt: reopened.closesAt }, { status: 'open', closesAt: null });
  await forecasts.submit(EPISODE_01, member, 60);
  const { rows } = await db.query("SELECT actor, details->>'to' AS target FROM he.audit WHERE action = 'question_status_changed' ORDER BY id");
  assert.deepEqual(rows, [{ actor: 'Editor', target: 'open' }, { actor: 'Editor', target: 'closed' }, { actor: 'Editor', target: 'open' }]);
});

test('closing without an explicit time records the actual close time', async (t) => {
  const { forecasts, now } = await setup(t);
  const closed = await forecasts.setQuestionStatus(EPISODE_01, { status: 'closed' }, 'Editor');
  assert.equal(closed.closesAt, now().toISOString());
});

test('history is append-only and newest first; members are limited to 30 submissions per hour from the database', async (t) => {
  const { accounts, forecasts, now, db } = await setup(t);
  const [member, other] = await signInMembers(accounts, 2);
  const probabilities = [];
  for (let index = 0; index < 30; index += 1) {
    const probability = 10 + index;
    probabilities.push(probability);
    now.advance(1000);
    await forecasts.submit(EPISODE_01, member, probability);
  }
  await assert.rejects(forecasts.submit(EPISODE_01, member, 50), rejectsWith(429, 'rate_limited'));
  // A fresh store (as after a restart) still sees the persisted submissions.
  const restarted = new ForecastStore({ db, now });
  await assert.rejects(restarted.submit(EPISODE_01, member, 50), rejectsWith(429, 'rate_limited'));
  assert.equal((await forecasts.submit(EPISODE_01, other, 50)).history.length, 1, 'the limit is per member');

  const mine = await forecasts.mine(EPISODE_01, member.id);
  assert.equal(mine.history.length, 30);
  assert.deepEqual(mine.history.map(({ probability }) => probability), probabilities.toReversed());
  assert.deepEqual(mine.current, mine.history[0]);
  assert.ok(mine.history.every(({ submittedAt }, index, all) => index === 0 || Date.parse(all[index - 1].submittedAt) > Date.parse(submittedAt)));
  assert.equal(mine.score, null);

  now.advance(HOUR);
  const after = await forecasts.submit(EPISODE_01, member, 55);
  assert.equal(after.history.length, 31);
  assert.equal(after.current.probability, 55);
});

test('resolution scores the last forecast before closes_at and never scores invalid outcomes', async (t) => {
  const { accounts, forecasts, now, db } = await setup(t);
  const [early, late, silent] = await signInMembers(accounts, 3);
  await forecasts.setQuestionStatus(EPISODE_01, { status: 'open', closesAt: new Date(now().getTime() + HOUR).toISOString() }, 'Editor');
  await forecasts.submit(EPISODE_01, early, 30);
  now.advance(1000);
  await forecasts.submit(EPISODE_01, early, 80);
  await forecasts.submit(EPISODE_01, late, 20);
  now.advance(HOUR);
  await forecasts.setQuestionStatus(EPISODE_01, { status: 'closed' }, 'Editor');
  assert.equal((await forecasts.mine(EPISODE_01, early.id)).score, null, 'no score before resolution');

  await assert.rejects(forecasts.resolve(EPISODE_01, { outcome: 'maybe', note: 'x' }, 'Editor'), rejectsWith(422, 'invalid_outcome'));
  await assert.rejects(forecasts.resolve(EPISODE_01, { outcome: 'yes', note: '  ' }, 'Editor'), rejectsWith(422, 'invalid_note'));
  await assert.rejects(forecasts.resolve(DRAFT_QUESTION, { outcome: 'yes', note: 'Draft' }, 'Editor'), rejectsWith(409, 'invalid_transition'));
  const resolved = await forecasts.resolve(EPISODE_01, { outcome: 'yes', note: 'Three services reported the qualifying split.' }, 'Editor');
  assert.equal(resolved.resolution.outcome, 'yes');
  await assert.rejects(forecasts.resolve(EPISODE_01, { outcome: 'no', note: 'Again' }, 'Editor'), rejectsWith(409, 'invalid_transition'));
  await assert.rejects(forecasts.setQuestionStatus(EPISODE_01, { status: 'open' }, 'Editor'), rejectsWith(409, 'invalid_transition'));
  await assert.rejects(forecasts.submit(EPISODE_01, early, 50), rejectsWith(409, 'question_not_open'));

  assert.deepEqual((await forecasts.mine(EPISODE_01, early.id)).score, { brier: 0.04 });
  assert.deepEqual((await forecasts.mine(EPISODE_01, late.id)).score, { brier: 0.64 });
  assert.equal((await forecasts.mine(EPISODE_01, silent.id)).score, null);
  const summary = await forecasts.publicSummary(EPISODE_01);
  assert.equal(summary.status, 'resolved');
  assert.deepEqual(summary.resolution, { outcome: 'yes', resolvedAt: now().toISOString() });
  const { rows } = await db.query("SELECT actor, details FROM he.audit WHERE action = 'question_resolved'");
  assert.deepEqual(rows, [{ actor: 'Editor', details: { outcome: 'yes' } }]);

  const invalidDb = await setup(t);
  const [member] = await signInMembers(invalidDb.accounts, 1);
  await invalidDb.forecasts.submit(EPISODE_01, member, 70);
  await invalidDb.forecasts.resolve(EPISODE_01, { outcome: 'invalid', note: 'Reporting definitions changed.' }, 'Editor');
  assert.equal((await invalidDb.forecasts.mine(EPISODE_01, member.id)).score, null);
});

test('forecasts submitted after closes_at are not scored even if the question was never closed manually', async (t) => {
  const { accounts, forecasts, now, db } = await setup(t);
  const [member] = await signInMembers(accounts, 1);
  const closesAt = new Date(now().getTime() + HOUR).toISOString();
  await forecasts.setQuestionStatus(EPISODE_01, { status: 'open', closesAt }, 'Editor');
  await forecasts.submit(EPISODE_01, member, 40);
  // Simulate a forecast recorded at the close boundary (the API itself refuses it with question_not_open).
  await db.query('INSERT INTO he.forecasts (question_id, anon_id, member_id, probability, submitted_at) VALUES ($1, $2, $3, 95, $4::timestamptz)', [EPISODE_01, member.anonId, member.id, closesAt]);
  now.advance(2 * HOUR);
  await forecasts.resolve(EPISODE_01, { outcome: 'no', note: 'Did not happen.' }, 'Editor');
  assert.deepEqual((await forecasts.mine(EPISODE_01, member.id)).score, { brier: 0.16 });
});

test('expert forecasts publish the latest entry per guest and are audited under the admin name', async (t) => {
  const { forecasts, now, db } = await setup(t);
  await assert.rejects(forecasts.addExpertForecast(EPISODE_01, { name: 'Guest', role: '', probability: 50 }, 'Editor'), rejectsWith(422, 'invalid_expert_forecast'));
  await assert.rejects(forecasts.addExpertForecast(EPISODE_01, { name: 'Guest', role: 'Analyst', probability: 0 }, 'Editor'), rejectsWith(422, 'invalid_expert_forecast'));
  await assert.rejects(forecasts.addExpertForecast('he-unknown-v1', { name: 'Guest', role: 'Analyst', probability: 50 }, 'Editor'), rejectsWith(404, 'not_found'));
  await forecasts.addExpertForecast(EPISODE_01, { name: 'Guest One', role: 'Studio executive', probability: 40 }, 'Editor');
  now.advance(1000);
  await forecasts.addExpertForecast(EPISODE_01, { name: 'Guest Two', role: 'Analyst', probability: 65 }, 'Editor');
  now.advance(1000);
  const corrected = await forecasts.addExpertForecast(EPISODE_01, { name: 'Guest One', role: 'Studio executive', probability: 45 }, 'Editor');
  const { expert } = await forecasts.publicSummary(EPISODE_01);
  assert.deepEqual(expert, [
    { name: 'Guest Two', role: 'Analyst', probability: 65, recordedAt: new Date(now().getTime() - 1000).toISOString() },
    { name: 'Guest One', role: 'Studio executive', probability: 45, recordedAt: corrected.recordedAt },
  ]);
  const { rows } = await db.query("SELECT DISTINCT actor FROM he.audit WHERE action = 'expert_forecast_recorded'");
  assert.deepEqual(rows, [{ actor: 'Editor' }]);
});

test('account deletion detaches forecasts but keeps the aggregate, scores, and export stable', async (t) => {
  const { accounts, forecasts, now, db } = await setup(t);
  const members = await signInMembers(accounts, 11);
  for (const [index, member] of members.entries()) {
    now.advance(1000);
    await forecasts.submit(EPISODE_01, member, 10 + index * 5);
  }
  const before = await forecasts.publicSummary(EPISODE_01);
  const exportBefore = await forecasts.exportForecasts('Editor');
  assert.equal(exportBefore.forecasts.length, 11);
  assert.deepEqual({ name: exportBefore.forecasts[0].name, email: exportBefore.forecasts[0].email }, { name: 'Member 1', email: 'member-1@example.com' });

  const removed = members[0];
  assert.deepEqual(await accounts.deleteAccount(removed.id), { commentsDeleted: 0, forecastsDetached: 1 });
  const after = await forecasts.publicSummary(EPISODE_01);
  assert.deepEqual(after, before);

  const exportAfter = await forecasts.exportForecasts('Editor');
  const detached = exportAfter.forecasts.find(({ anonId }) => anonId === removed.anonId);
  assert.deepEqual({ name: detached.name, email: detached.email, probability: detached.probability }, { name: null, email: null, probability: 10 });
  assert.doesNotMatch(JSON.stringify(exportAfter), /member-1@example\.com|"Member 1"/);
  const { rows: audits } = await db.query("SELECT actor, details FROM he.audit WHERE action = 'forecasts_exported'");
  assert.deepEqual(audits.map(({ actor, details }) => [actor, details.count]), [['Editor', 11], ['Editor', 11]]);
});

test('anon_id is HMAC-derived from the LinkedIn subject, so deletion and re-creation keep the same forecaster identity', async (t) => {
  const { accounts, db } = await setup(t);
  const expectedHex = createHmac('sha256', AUTH_SECRET).update('he-anon-v1:returning-sub').digest().subarray(0, 16).toString('hex');
  assert.equal(deriveAnonId(AUTH_SECRET, 'returning-sub').replaceAll('-', ''), expectedHex);
  assert.match(deriveAnonId(AUTH_SECRET, 'returning-sub'), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

  const first = await accounts.getSession((await accounts.signIn({ sub: 'returning-sub', name: 'Returning' })).token);
  assert.equal(first.anonId, deriveAnonId(AUTH_SECRET, 'returning-sub'));
  await accounts.deleteAccount(first.id);
  const second = await accounts.getSession((await accounts.signIn({ sub: 'returning-sub', name: 'Returning' })).token);
  assert.notEqual(second.id, first.id, 'a new member row was created');
  assert.equal(second.anonId, first.anonId);
  const other = await accounts.getSession((await accounts.signIn({ sub: 'other-sub', name: 'Other' })).token);
  assert.notEqual(other.anonId, first.anonId);
  assert.notEqual(deriveAnonId('another-secret-with-at-least-32-characters', 'returning-sub'), first.anonId);
  const { rows } = await db.query('SELECT count(DISTINCT anon_id)::int AS count FROM he.members');
  assert.deepEqual(rows, [{ count: 2 }]);
});

test('a delete and re-sign-in loop counts one forecaster, uses only the latest forecast, and cannot reset the hourly limit', async (t) => {
  const { accounts, forecasts, now } = await setup(t);
  const others = await signInMembers(accounts, 8);
  for (const member of others) await forecasts.submit(EPISODE_01, member, 90);
  let sybil = (await signInMembers(accounts, 1, 'sybil'))[0];
  for (let round = 0; round < 3; round += 1) {
    now.advance(1000);
    await forecasts.submit(EPISODE_01, sybil, 5 + round);
    await accounts.deleteAccount(sybil.id);
    sybil = (await signInMembers(accounts, 1, 'sybil'))[0];
  }
  let summary = await forecasts.publicSummary(EPISODE_01);
  assert.equal(summary.forecasters, 9, 'the returning subject is one forecaster, not four');
  assert.equal(summary.community, null, 'one person cannot push the count to the publication threshold');

  const [tenth] = await signInMembers(accounts, 1, 'tenth');
  await forecasts.submit(EPISODE_01, tenth, 5);
  summary = await forecasts.publicSummary(EPISODE_01);
  assert.equal(summary.forecasters, 10);
  // Latest values: eight at 90, sybil at 7 (its last round), tenth at 5 -> middle pair (90, 90).
  assert.deepEqual(summary.community, { probability: 90 });

  for (let index = 3; index < 30; index += 1) {
    now.advance(1000);
    await forecasts.submit(EPISODE_01, sybil, 50);
  }
  await assert.rejects(forecasts.submit(EPISODE_01, sybil, 50), rejectsWith(429, 'rate_limited'));
  await accounts.deleteAccount(sybil.id);
  sybil = (await signInMembers(accounts, 1, 'sybil'))[0];
  await assert.rejects(forecasts.submit(EPISODE_01, sybil, 50), rejectsWith(429, 'rate_limited'), 'the limit survives account deletion');
  assert.deepEqual((await forecasts.mine(EPISODE_01, sybil.id)).history, [], 'the new account does not see the detached history');
});
