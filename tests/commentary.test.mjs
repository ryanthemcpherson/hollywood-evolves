import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountStore } from '../lib/account-store.mjs';
import { CommentaryStore } from '../lib/commentary-store.mjs';
import { AUTH_SECRET, EPISODE_01 as questionId, freshDatabase, testClock } from './support/database.mjs';

const rejectsWith = (status, code) => (error) => error.statusCode === status && error.publicCode === code;

async function signedInStore(t, options = {}) {
  const db = await freshDatabase(t);
  const now = testClock('2030-08-30T20:00:00.000Z');
  const accounts = new AccountStore({ db, secret: AUTH_SECRET, now });
  const store = new CommentaryStore({ db, now, ...options });
  const session = await accounts.signIn({ sub: 'member-1', name: 'Ada Lovelace', email: 'ada@example.com', emailVerified: true });
  const member = await accounts.getSession(session.token);
  return { db, now, accounts, store, session, member };
}

async function dump(db) {
  const tables = {};
  for (const table of ['members', 'sessions', 'comments', 'audit']) tables[table] = (await db.query(`SELECT * FROM he.${table}`)).rows;
  return JSON.stringify(tables);
}

test('accepts authenticated commentary into a pending moderation queue only', async (t) => {
  const { store, member } = await signedInStore(t);
  const comment = await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'This is a substantive industry perspective with enough context.' });
  assert.equal(comment.status, 'pending');
  assert.equal((await store.publicComments(questionId)).length, 0);
  const pending = await store.pendingComments();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].member.email, 'ada@example.com');
  assert.equal(pending[0].member.sub, 'member-1');
  assert.equal(await store.publicComments('he-unknown-v1'), null);
  await assert.rejects(store.submitComment({ consent: true, memberId: member.id, questionId: 'he-unknown-v1', body: 'A substantive perspective on an unknown question.' }), rejectsWith(404, 'not_found'));
});

test('publishes only approved commentary and never exposes email or LinkedIn subject IDs', async (t) => {
  const { store, member } = await signedInStore(t);
  const pending = await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'A view with <script>alert(1)</script> kept as plain text in JSON.' });
  await store.moderateComment({ commentId: pending.id, decision: 'approved', moderator: 'editor' });
  const [published] = await store.publicComments(questionId);
  assert.deepEqual(published, {
    id: pending.id,
    questionId,
    body: 'A view with <script>alert(1)</script> kept as plain text in JSON.',
    createdAt: '2030-08-30T20:00:00.000Z',
    publishedAt: '2030-08-30T20:00:00.000Z',
    contributor: { name: 'Ada Lovelace', verifiedIndustry: false },
  });
  assert.doesNotMatch(JSON.stringify(published), /ada@example\.com|member-1/);
  await assert.rejects(store.moderateComment({ commentId: pending.id, decision: 'rejected', moderator: 'editor' }), rejectsWith(409, 'already_moderated'));
  await assert.rejects(store.moderateComment({ commentId: 'comment_missing', decision: 'approved', moderator: 'editor' }), rejectsWith(404, 'not_found'));
  await assert.rejects(store.moderateComment({ commentId: pending.id, decision: 'publish', moderator: 'editor' }), rejectsWith(422, 'invalid_decision'));
});

test('verified-industry status is separate from LinkedIn authentication', async (t) => {
  const { store, member, accounts, db } = await signedInStore(t);
  const first = await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'First sufficiently detailed professional perspective.' });
  await store.moderateComment({ commentId: first.id, decision: 'approved', moderator: 'editor' });
  assert.equal((await store.publicComments(questionId))[0].contributor.verifiedIndustry, false);
  assert.deepEqual(await accounts.setIndustryVerification({ memberSub: 'member-1', verified: true, reviewer: 'editor' }), { memberSub: 'member-1', verifiedIndustry: true });
  assert.equal((await store.publicComments(questionId))[0].contributor.verifiedIndustry, true);
  assert.equal((await accounts.getSession((await accounts.signIn({ sub: 'member-1', name: 'Ada Lovelace' })).token)).verifiedIndustry, true, 'sign-in keeps the editorial label');
  await assert.rejects(accounts.setIndustryVerification({ memberSub: 'member-1', verified: 'yes', reviewer: 'editor' }), rejectsWith(422, 'invalid_verification'));
  await assert.rejects(accounts.setIndustryVerification({ memberSub: 'missing', verified: true, reviewer: 'editor' }), rejectsWith(404, 'not_found'));
  const { rows } = await db.query("SELECT actor FROM he.audit WHERE action = 'industry_verified'");
  assert.deepEqual(rows, [{ actor: 'editor' }]);
});

test('rejects malformed commentary and enforces a persistent per-member hourly limit', async (t) => {
  const { store, member, db, now } = await signedInStore(t, { maxCommentsPerHour: 2 });
  for (const body of ['', 'too short', 'x'.repeat(1501), '🙂'.repeat(376), 'A detailed perspective with a forbidden\u0000control character.', 42]) {
    await assert.rejects(store.submitComment({ consent: true, memberId: member.id, questionId, body }), rejectsWith(422, 'invalid_comment'));
  }
  await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'First sufficiently detailed professional perspective.' });
  await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'Second sufficiently detailed professional perspective.' });
  await assert.rejects(store.submitComment({ consent: true, memberId: member.id, questionId, body: 'Third sufficiently detailed professional perspective.' }), rejectsWith(429, 'rate_limited'));
  now.advance(30 * 60 * 1000);
  const restored = new CommentaryStore({ db, now, maxCommentsPerHour: 2 });
  await assert.rejects(restored.submitComment({ consent: true, memberId: member.id, questionId, body: 'Still blocked after a process restart within the hour.' }), rejectsWith(429, 'rate_limited'));
  now.advance(31 * 60 * 1000);
  assert.equal((await restored.submitComment({ consent: true, memberId: member.id, questionId, body: 'Accepted again once the hour has passed.' })).status, 'pending');
});

test('the default limit is three comments per member per hour', async (t) => {
  const { store, member } = await signedInStore(t);
  for (let index = 1; index <= 3; index += 1) await store.submitComment({ consent: true, memberId: member.id, questionId, body: `Perspective number ${index} with enough detail to pass.` });
  await assert.rejects(store.submitComment({ consent: true, memberId: member.id, questionId, body: 'Perspective number 4 with enough detail to pass.' }), rejectsWith(429, 'rate_limited'));
});

test('requires explicit consent to publish the contributor name with an approved perspective', async (t) => {
  const { store, member, db } = await signedInStore(t);
  for (const consent of [undefined, false, 'true']) {
    await assert.rejects(store.submitComment({ memberId: member.id, questionId, body: 'A substantive perspective without publication consent.', consent }), rejectsWith(422, 'consent_required'));
  }
  await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'A substantive perspective with publication consent.' });
  const { rows } = await db.query('SELECT consent, created_at FROM he.comments');
  assert.deepEqual(rows.map(({ consent, created_at: createdAt }) => [consent, createdAt.toISOString()]), [[true, '2030-08-30T20:00:00.000Z']]);
});

test('rejecting commentary records an audit event with the editor name without making it public', async (t) => {
  const { store, member, db } = await signedInStore(t);
  const pending = await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'A perspective that the editor elects not to publish.' });
  await store.moderateComment({ commentId: pending.id, decision: 'rejected', moderator: 'editor', reason: 'Off topic' });
  assert.equal((await store.publicComments(questionId)).length, 0);
  assert.equal((await store.pendingComments()).length, 0);
  const { rows } = await db.query("SELECT actor, subject_id FROM he.audit WHERE action = 'comment_rejected'");
  assert.deepEqual(rows, [{ actor: 'editor', subject_id: pending.id }]);
  const { rows: [stored] } = await db.query('SELECT status, rejection_reason, moderated_by FROM he.comments WHERE id = $1', [pending.id]);
  assert.deepEqual(stored, { status: 'rejected', rejection_reason: 'Off topic', moderated_by: 'editor' });
});

test('account deletion removes sessions, submissions, and stored member PII', async (t) => {
  const { store, session, accounts, member, db } = await signedInStore(t);
  const comment = await store.submitComment({ consent: true, memberId: member.id, questionId, body: 'A published perspective that is later deleted with the account.' });
  await store.moderateComment({ commentId: comment.id, decision: 'approved', moderator: 'editor' });
  await accounts.setIndustryVerification({ memberSub: 'member-1', verified: true, reviewer: 'editor' });
  assert.deepEqual(await accounts.deleteAccount(member.id), { commentsDeleted: 1, forecastsDetached: 0 });
  assert.equal(await accounts.getSession(session.token), null);
  assert.equal((await store.publicComments(questionId)).length, 0);
  const snapshot = await dump(db);
  assert.doesNotMatch(snapshot, /member-1|ada@example\.com|Ada Lovelace|published perspective/);
  assert.doesNotMatch(snapshot, new RegExp(member.id));
  assert.match(snapshot, /account_deleted/);
  await assert.rejects(accounts.deleteAccount(member.id), rejectsWith(404, 'not_found'));
});
