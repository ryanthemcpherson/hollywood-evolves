import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_ADVISORY_LOCK_KEY, DEMO_SCHEMA, DemoDataRepository, demoEvidence, demoQuestions, demoViews, deterministicDemoState, schemaStatements,
} from '../lib/demo-data-repository.mjs';

test('deterministic demo shape is complete and every percentage pair sums to 100', () => {
  const state = deterministicDemoState();
  assert.equal(state.questions.length, 8);
  assert.equal(state.views.length, 3);
  assert.ok(state.evidence.length >= 3 && state.evidence.length <= 5);
  assert.ok([...state.questions, ...state.views].every(({ yes, no }) => yes + no === 100));
  assert.deepEqual(state, { questions: structuredClone(demoQuestions), views: structuredClone(demoViews), evidence: structuredClone(demoEvidence) });
});

test('migration and seed are transactional, advisory-locked, idempotent, and isolated', async () => {
  const calls = [];
  const client = { async query(sql, values) { calls.push({ sql, values }); return { rows: [] }; }, release() { calls.push({ sql: 'RELEASE' }); } };
  const repository = new DemoDataRepository({ adapter: { async connect() { return client; } } });
  await repository.initialize();
  await repository.initialize();
  const sql = calls.map(({ sql: statement }) => statement).join('\n');
  assert.equal(calls.filter(({ sql: statement }) => statement === 'BEGIN').length, 2);
  assert.equal(calls.filter(({ sql: statement }) => statement === 'COMMIT').length, 2);
  assert.ok(calls.filter(({ sql: statement, values }) => /pg_advisory_xact_lock/.test(statement) && values[0] === DEMO_ADVISORY_LOCK_KEY).length === 2);
  assert.match(sql, new RegExp(`${DEMO_SCHEMA}\\.questions`));
  assert.match(sql, /ON CONFLICT/);
  assert.equal(calls.filter(({ sql: statement }) => statement.startsWith('DELETE FROM')).length, 6);
  assert.match(sql, /DELETE FROM hollywood_evolves_demo\.questions WHERE NOT/);
  assert.doesNotMatch(sql, /comment|session|audience|direct_response/i);
  assert.ok(schemaStatements.every((statement) => statement.includes(DEMO_SCHEMA)));
});

test('repository builds a transactionally consistent read-only public payload from fixed table queries', async () => {
  const calls = [];
  const client = { async query(sql) {
    calls.push(sql);
    if (sql.includes('.metadata')) return { rows: [{ migration_version: 1, seed_version: 1, as_of: '2026-08-30T12:00:00.000Z' }] };
    if (sql.includes('.questions')) return { rows: demoQuestions.map((q) => ({ id: q.id, display_id: q.displayId, title: q.title, yes_percent: q.yes, no_percent: q.no, status: q.status, threshold: q.threshold, deadline: q.deadline })) };
    if (sql.includes('.views')) return { rows: demoViews.map((v) => ({ label: v.label, yes_percent: v.yes, no_percent: v.no, status: v.status })) };
    if (sql.includes('.evidence')) return { rows: demoEvidence };
    return { rows: [{ ok: 1 }] };
  }, release() { calls.push('RELEASE'); } };
  const adapter = { async connect() { return client; } };
  const repository = new DemoDataRepository({ adapter });
  repository.available = true;
  const payload = await repository.getPublicState();
  assert.equal(payload.demo, true);
  assert.match(payload.label, /^DEMO/);
  assert.equal(payload.questions.length, 8);
  assert.equal(payload.headline.outcome.state, 'unresolved');
  assert.ok(payload.platforms.every(({ state, url }) => state === 'pending' && url === null));
  assert.doesNotMatch(JSON.stringify(payload), /comment|session|contributor/i);
  assert.equal(calls[0], 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.deepEqual(calls.slice(-2), ['COMMIT', 'RELEASE']);
});

test('failed initialization rolls back and readiness fails closed', async () => {
  const calls = [];
  const adapter = {
    async connect() { return { query: async (sql) => { calls.push(sql); if (sql.startsWith('CREATE SCHEMA')) throw new Error('offline'); return { rows: [] }; }, release() {} }; },
    async query() { throw new Error('offline'); },
  };
  const repository = new DemoDataRepository({ adapter });
  await assert.rejects(repository.initialize(), /offline/);
  assert.ok(calls.includes('ROLLBACK'));
  assert.equal(await repository.readiness(), false);
  await assert.rejects(repository.getPublicState(), (error) => error.statusCode === 503);
});
