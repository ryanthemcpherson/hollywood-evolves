import assert from 'node:assert/strict';
import test from 'node:test';
import { CommentaryStore } from '../lib/commentary-store.mjs';

const questionId = 'he-episode-01-customer-evolution-v1';

function signedInStore(options = {}) {
  const store = new CommentaryStore({ secret: 'commentary-test-secret', now: () => '2026-08-30T20:00:00.000Z', ...options });
  store.upsertLinkedInMember({ sub: 'member-1', name: 'Ada Lovelace', picture: 'https://media.example/ada.jpg', email: 'ada@example.com', emailVerified: true });
  const session = store.createSession('member-1');
  return { store, session };
}

test('accepts authenticated commentary into a pending moderation queue only', () => {
  const { store } = signedInStore();
  const comment = store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'This is a substantive industry perspective with enough context.' });
  assert.equal(comment.status, 'pending');
  assert.equal(store.publicComments(questionId).length, 0);
  assert.equal(store.pendingComments().length, 1);
  assert.equal(store.pendingComments()[0].member.email, 'ada@example.com');
});

test('publishes only approved commentary and never exposes email or LinkedIn subject IDs', () => {
  const { store } = signedInStore();
  const pending = store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'A view with <script>alert(1)</script> kept as plain text in JSON.' });
  store.moderateComment({ commentId: pending.id, decision: 'approved', moderator: 'editor' });
  const [published] = store.publicComments(questionId);
  assert.deepEqual(published, {
    id: pending.id,
    questionId,
    body: 'A view with <script>alert(1)</script> kept as plain text in JSON.',
    createdAt: '2026-08-30T20:00:00.000Z',
    publishedAt: '2026-08-30T20:00:00.000Z',
    contributor: { name: 'Ada Lovelace', verifiedIndustry: false },
  });
  assert.doesNotMatch(JSON.stringify(published), /ada@example\.com|member-1/);
});

test('verified-industry status is separate from LinkedIn authentication', () => {
  const { store } = signedInStore();
  const first = store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'First sufficiently detailed professional perspective.' });
  store.moderateComment({ commentId: first.id, decision: 'approved', moderator: 'editor' });
  assert.equal(store.publicComments(questionId)[0].contributor.verifiedIndustry, false);
  store.setIndustryVerification({ memberSub: 'member-1', verified: true, reviewer: 'editor' });
  assert.equal(store.publicComments(questionId)[0].contributor.verifiedIndustry, true);
});

test('rejects malformed commentary and enforces a persistent per-member hourly limit', () => {
  const { store } = signedInStore({ maxCommentsPerHour: 2 });
  for (const body of ['', 'too short', 'x'.repeat(1501)]) {
    assert.throws(() => store.submitComment({ consent: true, memberSub: 'member-1', questionId, body }), (error) => error.statusCode === 400);
  }
  store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'First sufficiently detailed professional perspective.' });
  store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'Second sufficiently detailed professional perspective.' });
  assert.throws(() => store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'Third sufficiently detailed professional perspective.' }), (error) => error.statusCode === 429);
  const restored = new CommentaryStore({ secret: 'commentary-test-secret', now: () => '2026-08-30T20:30:00.000Z', maxCommentsPerHour: 2, initialState: store.snapshot() });
  assert.throws(() => restored.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'Still blocked after a process restart within the hour.' }), (error) => error.statusCode === 429);
});

test('requires explicit consent to publish the contributor name with an approved perspective', () => {
  const { store } = signedInStore();
  assert.throws(
    () => store.submitComment({ memberSub: 'member-1', questionId, body: 'A substantive perspective without publication consent.' }),
    (error) => error.statusCode === 400 && /consent/i.test(error.message),
  );
  const accepted = store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'A substantive perspective with publication consent.' });
  assert.equal(accepted.consentAt, '2026-08-30T20:00:00.000Z');
});

test('rejecting commentary records an audit event without making it public', () => {
  const { store } = signedInStore();
  const pending = store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'A perspective that the editor elects not to publish.' });
  store.moderateComment({ commentId: pending.id, decision: 'rejected', moderator: 'editor', reason: 'Off topic' });
  assert.equal(store.publicComments(questionId).length, 0);
  assert.equal(store.pendingComments().length, 0);
  assert.match(JSON.stringify(store.snapshot().audit), /comment_rejected/);
});

test('account deletion removes sessions, submissions, and stored member PII', () => {
  const { store, session } = signedInStore();
  const comment = store.submitComment({ consent: true, memberSub: 'member-1', questionId, body: 'A published perspective that is later deleted with the account.' });
  store.moderateComment({ commentId: comment.id, decision: 'approved', moderator: 'editor' });
  store.deleteAccount('member-1');
  assert.equal(store.getSession(session.token), null);
  assert.equal(store.publicComments(questionId).length, 0);
  const snapshot = JSON.stringify(store.snapshot());
  assert.doesNotMatch(snapshot, /member-1|ada@example\.com|Ada Lovelace|published perspective/);
  assert.match(snapshot, /account_deleted/);
});
