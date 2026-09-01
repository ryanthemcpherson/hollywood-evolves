import assert from 'node:assert/strict';
import test from 'node:test';
import { AudienceSignalStore, generateLinkedInPostCopy, parseLinkedInReactionCsv } from '../lib/audience-signals.mjs';
import { audienceCampaigns, forecastQuestions } from '../lib/forecast-questions.mjs';
import { LinkedInReactionImportAdapter } from '../lib/linkedin-reaction-adapter.mjs';

const OPEN_NOW = () => '2026-08-30T12:00:00.000Z';
const openQuestion = {
  id: 'he-test-question-v1',
  prompt: 'Will the test resolve YES?',
  state: 'open',
  opensAt: '2026-08-01T00:00:00.000Z',
  closesAt: '2026-09-01T00:00:00.000Z',
};

test('Episode 01 has an immutable draft ID and cannot publish audience values yet', () => {
  assert.equal(forecastQuestions.length, 8);
  assert.deepEqual(forecastQuestions[0], {
    id: 'he-episode-01-customer-evolution-v1',
    episode: '01',
    title: 'Customer Evolution',
    prompt: 'Will at least three of Netflix, Disney+, HBO Max, Peacock, and Paramount+ report more U.S. subscribers on ad-supported plans than ad-free plans by December 31, 2029?',
    state: 'draft',
    opensAt: null,
    closesAt: null,
  });
  assert.deepEqual(audienceCampaigns[0], {
    id: 'li-episode-01-v1',
    questionId: forecastQuestions[0].id,
    state: 'draft',
    postUrn: null,
    cutoff: null,
    mapping: { LIGHTBULB: 'yes', PRAISE: 'no', CLAP: 'no' },
  });
  assert.deepEqual(forecastQuestions.map(({ id }) => id), [
    'he-episode-01-customer-evolution-v1',
    'he-question-02-media-supply-chain-evolution-v1',
    'he-question-03-creator-evolution-v1',
    'he-question-04-content-evolution-v1',
    'he-question-05-commercial-evolution-v1',
    'he-question-06-audio-evolution-v1',
    'he-question-07-vfx-evolution-v1',
    'he-question-08-animation-evolution-v1',
  ]);
  assert.equal(audienceCampaigns.length, 8);
  assert.ok(forecastQuestions.every(({ state, opensAt, closesAt }) => state === 'draft' && opensAt === null && closesAt === null));
});

test('records a direct forecast and exposes only aggregate source-separated results', async () => {
  const store = new AudienceSignalStore({ questions: [openQuestion], secret: 'test-secret', now: OPEN_NOW });
  const result = await store.recordDirectResponse({
    questionId: openQuestion.id,
    choice: 'yes',
    confidence: 73,
    browserToken: 'browser-token-00000001',
    idempotencyKey: 'response-key-00000001',
    source: 'newsletter',
  });

  assert.equal(result.accepted, true);
  assert.deepEqual(store.publicResults(openQuestion.id), {
    questionId: openQuestion.id,
    state: 'open',
    directForecasts: {
      total: 1,
      yes: 1,
      no: 0,
      confidenceResponses: 1,
      averageConfidence: 73,
      bySource: { newsletter: { total: 1, yes: 1, no: 0 } },
    },
    linkedInReactions: { total: 0, yes: 0, no: 0, byCampaign: {} },
  });
  assert.doesNotMatch(JSON.stringify(store.publicResults(openQuestion.id)), /browser|token|idempotency/i);
});

test('enforces one direct response per browser and idempotent retries', async () => {
  const store = new AudienceSignalStore({ questions: [openQuestion], secret: 'test-secret', now: () => '2026-08-30T12:00:00.000Z' });
  const base = {
    questionId: openQuestion.id,
    choice: 'yes',
    browserToken: 'browser-token-00000001',
    idempotencyKey: 'response-key-00000001',
    source: 'qr',
  };

  assert.deepEqual(await store.recordDirectResponse(base), { accepted: true });
  assert.deepEqual(await store.recordDirectResponse(base), { accepted: false, duplicate: true });
  await assert.rejects(
    store.recordDirectResponse({ ...base, choice: 'no', idempotencyKey: 'response-key-00000002' }),
    (error) => error.statusCode === 409 && /already recorded/i.test(error.message),
  );
  assert.equal(store.publicResults(openQuestion.id).directForecasts.total, 1);
  assert.equal(store.audit.length, 2);
  assert.deepEqual(store.audit.map(({ action }) => action), ['direct_response_recorded', 'duplicate_ignored']);
  assert.ok(store.audit.every(({ at }) => at === '2026-08-30T12:00:00.000Z'));
});

test('rejects invalid, closed, and malformed direct responses', async () => {
  const closedQuestion = { ...openQuestion, id: 'he-closed-v1', state: 'draft' };
  const store = new AudienceSignalStore({ questions: [openQuestion, closedQuestion], secret: 'test-secret', now: OPEN_NOW });
  const valid = {
    questionId: openQuestion.id,
    choice: 'yes',
    confidence: 50,
    browserToken: 'browser-token-00000001',
    idempotencyKey: 'response-key-00000001',
    source: 'site',
  };

  for (const [change, status] of [
    [{ choice: 'maybe' }, 400],
    [{ confidence: 0 }, 400],
    [{ confidence: 100 }, 400],
    [{ confidence: 50.5 }, 400],
    [{ browserToken: 'short' }, 400],
    [{ idempotencyKey: '' }, 400],
    [{ questionId: closedQuestion.id }, 409],
    [{ questionId: 'unknown-v1' }, 404],
  ]) {
    await assert.rejects(store.recordDirectResponse({ ...valid, ...change }), (error) => error.statusCode === status);
  }
});

test('enforces configured opening and closing timestamps', async () => {
  const base = { questionId: openQuestion.id, choice: 'yes', browserToken: 'browser-token-00000001', idempotencyKey: 'response-key-00000001', source: 'site' };
  for (const now of ['2026-07-31T23:59:59.000Z', '2026-09-01T00:00:00.001Z']) {
    const store = new AudienceSignalStore({ questions: [openQuestion], secret: 'test-secret', now: () => now });
    await assert.rejects(store.recordDirectResponse(base), (error) => error.statusCode === 409 && /not accepting/i.test(error.message));
  }
});

test('imports mapped LinkedIn reactions idempotently and keeps them separate from forecasts', async () => {
  const campaigns = [{
    id: 'li-episode-01-launch',
    questionId: openQuestion.id,
    postUrn: 'urn:li:share:1234',
    cutoff: '2026-08-31T23:59:59.000Z',
    mapping: { LIGHTBULB: 'yes', PRAISE: 'no', CLAP: 'no' },
  }];
  const store = new AudienceSignalStore({ questions: [openQuestion], campaigns, secret: 'test-secret' });
  const rows = [
    { reactionId: 'r-1', reactionType: 'LIGHTBULB', reactedAt: '2026-08-20T00:00:00.000Z' },
    { reactionId: 'r-2', reactionType: 'PRAISE', reactedAt: '2026-08-21T00:00:00.000Z' },
    { reactionId: 'r-3', reactionType: 'LIKE', reactedAt: '2026-08-22T00:00:00.000Z' },
    { reactionId: 'r-4', reactionType: 'CLAP', reactedAt: '2026-09-02T00:00:00.000Z' },
  ];

  assert.deepEqual(await store.importLinkedInReactions({ campaignId: campaigns[0].id, importKey: 'import-key-00000001', rows }), { imported: 2, ignored: 2, duplicate: false });
  assert.deepEqual(await store.importLinkedInReactions({ campaignId: campaigns[0].id, importKey: 'import-key-00000001', rows }), { imported: 0, ignored: 0, duplicate: true });
  assert.deepEqual(store.publicResults(openQuestion.id), {
    questionId: openQuestion.id,
    state: 'open',
    directForecasts: { total: 0, yes: 0, no: 0, confidenceResponses: 0, averageConfidence: null, bySource: {} },
    linkedInReactions: { total: 2, yes: 1, no: 1, byCampaign: { 'li-episode-01-launch': { total: 2, yes: 1, no: 1 } } },
  });
});

test('draft LinkedIn campaign cannot ingest reactions before post and cutoff are finalized', async () => {
  const store = new AudienceSignalStore({ questions: forecastQuestions, campaigns: audienceCampaigns, secret: 'test-secret' });
  await assert.rejects(store.importLinkedInReactions({
    campaignId: 'li-episode-01-v1',
    importKey: 'import-key-00000001',
    rows: [{ reactionId: 'r-1', reactionType: 'LIGHTBULB', reactedAt: '2026-08-20T00:00:00.000Z' }],
  }), (error) => error.statusCode === 409 && /not active/i.test(error.message));
});

test('parses the documented manual LinkedIn CSV shape without identity columns', () => {
  const rows = parseLinkedInReactionCsv('reaction_id,reaction_type,reacted_at\nr-1,LIGHTBULB,2026-08-20T00:00:00.000Z\nr-2,CLAP,2026-08-21T00:00:00.000Z\n');
  assert.deepEqual(rows, [
    { reactionId: 'r-1', reactionType: 'LIGHTBULB', reactedAt: '2026-08-20T00:00:00.000Z' },
    { reactionId: 'r-2', reactionType: 'CLAP', reactedAt: '2026-08-21T00:00:00.000Z' },
  ]);
  assert.throws(() => parseLinkedInReactionCsv('member_name,reaction_type\nPerson,LIGHTBULB\n'), /exactly/i);
});

test('generates clear LinkedIn reaction poll copy with mapping and cutoff', () => {
  const copy = generateLinkedInPostCopy({
    prompt: openQuestion.prompt,
    pollUrl: 'https://example.com/poll/he-test-question-v1?src=linkedin',
    cutoff: '2026-08-31T23:59:59.000Z',
  });
  assert.match(copy, /💡 LIGHTBULB = YES/);
  assert.match(copy, /👏 PRAISE\/CLAP = NO/);
  assert.match(copy, /August 31, 2026/);
  assert.match(copy, /Reactions are an informal signal, not probability forecasts/);
  assert.match(copy, /https:\/\/example\.com\/poll\/he-test-question-v1\?src=linkedin/);
});

test('round-trips aggregate inputs and audit records for durable storage', async () => {
  const first = new AudienceSignalStore({ questions: [openQuestion], secret: 'test-secret', now: OPEN_NOW });
  const response = {
    questionId: openQuestion.id,
    choice: 'no',
    confidence: 61,
    browserToken: 'browser-token-00000001',
    idempotencyKey: 'response-key-00000001',
    source: 'site',
  };
  await first.recordDirectResponse(response);
  const restored = new AudienceSignalStore({ questions: [openQuestion], secret: 'test-secret', initialState: first.snapshot(), now: OPEN_NOW });

  assert.equal(restored.publicResults(openQuestion.id).directForecasts.no, 1);
  assert.deepEqual(await restored.recordDirectResponse(response), { accepted: false, duplicate: true });
  assert.equal(restored.audit.length, 2);
});

test('LinkedIn adapter requires an approved client and strips member identity fields', async () => {
  const adapter = new LinkedInReactionImportAdapter({
    client: {
      async listReactions({ postUrn, cutoff }) {
        assert.equal(postUrn, 'urn:li:share:1234');
        assert.equal(cutoff, '2026-08-31T23:59:59.000Z');
        return [
          { id: 'reaction-1', reactionType: 'LIGHTBULB', createdAt: '2026-08-20T00:00:00.000Z', actor: { name: 'Never retain me' } },
        ];
      },
    },
  });
  assert.deepEqual(await adapter.collect({ postUrn: 'urn:li:share:1234', cutoff: '2026-08-31T23:59:59.000Z' }), [
    { reactionId: 'reaction-1', reactionType: 'LIGHTBULB', reactedAt: '2026-08-20T00:00:00.000Z' },
  ]);
  await assert.rejects(new LinkedInReactionImportAdapter({}).collect({ postUrn: 'x', cutoff: 'y' }), /approved LinkedIn Community Management API client/i);
});
