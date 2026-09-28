import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../lib/db.mjs';
import { forecastQuestions } from '../lib/forecast-questions.mjs';
import { LATEST_MIGRATION, MIGRATION_LOCK_KEY, migrate, schemaIsCurrent } from '../lib/migrations.mjs';
import { DRAFT_QUESTION, EPISODE_01, freshDatabase } from './support/database.mjs';

test('migrations create the he schema once, open Episode 01, and are idempotent', async (t) => {
  const db = await freshDatabase(t, { migrated: false });
  assert.deepEqual(await migrate(db), { applied: [1, 2] });
  assert.deepEqual(await migrate(db), { applied: [] });
  assert.equal(await schemaIsCurrent(db), true);
  assert.equal(LATEST_MIGRATION, 2);
  const { rows: tables } = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'he' ORDER BY table_name");
  assert.deepEqual(tables.map(({ table_name: name }) => name), ['audit', 'comments', 'expert_forecasts', 'forecasts', 'members', 'questions', 'schema_migrations', 'sessions']);
  const { rows: questions } = await db.query('SELECT id, status, opens_at, closes_at FROM he.questions ORDER BY id');
  assert.equal(questions.length, forecastQuestions.length);
  const episode = questions.find(({ id }) => id === EPISODE_01);
  assert.equal(episode.status, 'open');
  assert.ok(episode.opens_at instanceof Date);
  assert.equal(episode.closes_at, null);
  assert.ok(questions.filter(({ id }) => id !== EPISODE_01).every(({ status }) => status === 'draft'));
  const { rows: versions } = await db.query('SELECT version FROM he.schema_migrations ORDER BY version');
  assert.deepEqual(versions, [{ version: 1 }, { version: 2 }]);
});

test('migration 2 removes the random anon_id default so the application must derive it', async (t) => {
  const db = await freshDatabase(t, { migrated: false });
  await migrate(db);
  await assert.rejects(db.query("INSERT INTO he.members (linkedin_sub, name, created_at, last_sign_in_at) VALUES ('sub-x', 'X', now(), now())"), /null value in column "anon_id"/);
  const { rows } = await db.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'he' AND indexname = 'forecasts_anon_submitted_idx'");
  assert.equal(rows.length, 1);
});

test('later boots refresh question text without overwriting editorial status', async (t) => {
  const db = await freshDatabase(t);
  await db.query("UPDATE he.questions SET status = 'closed', closes_at = now() WHERE id = $1", [EPISODE_01]);
  const edited = forecastQuestions.map((question) => (question.id === EPISODE_01 ? { ...question, title: 'Customer Evolution (edited)' } : question));
  await migrate(db, { questions: [...edited, { id: 'he-question-09-new-v1', episode: null, title: 'New', prompt: 'A new question?' }] });
  const { rows: [episode] } = await db.query('SELECT title, status FROM he.questions WHERE id = $1', [EPISODE_01]);
  assert.deepEqual(episode, { title: 'Customer Evolution (edited)', status: 'closed' });
  const { rows: [added] } = await db.query("SELECT status FROM he.questions WHERE id = 'he-question-09-new-v1'");
  assert.equal(added.status, 'draft');
});

test('migrations run inside one transaction under the advisory lock', async (t) => {
  const db = await freshDatabase(t, { migrated: false });
  const statements = [];
  const spy = {
    query: db.query,
    withTransaction: (fn) => db.withTransaction((tx) => fn({ query: (sql, params) => { statements.push({ sql, params }); return tx.query(sql, params); } })),
  };
  await migrate(spy);
  assert.match(statements[0].sql, /pg_advisory_xact_lock/);
  assert.deepEqual(statements[0].params, [MIGRATION_LOCK_KEY]);
  assert.ok(statements.every(({ sql }) => !/\b(public|hollywood_evolves_demo)\./.test(sql)), 'only the he schema is touched');
});

test('a failed migration rolls back completely', async (t) => {
  const db = await freshDatabase(t, { migrated: false });
  await assert.rejects(migrate(db, { questions: [{ id: EPISODE_01, episode: '01', title: null, prompt: 'x' }] }), /null value/);
  const { rows } = await db.query("SELECT to_regclass('he.members') AS members, to_regclass('he.schema_migrations') AS migrations");
  assert.deepEqual(rows[0], { members: null, migrations: null });
});

test('forecasts are append-only except for detaching a deleted member', async (t) => {
  const db = await freshDatabase(t);
  const { rows: [member] } = await db.query("INSERT INTO he.members (linkedin_sub, anon_id, name, created_at, last_sign_in_at) VALUES ('sub-1', gen_random_uuid(), 'Ada', now(), now()) RETURNING id, anon_id");
  await db.query('INSERT INTO he.forecasts (question_id, anon_id, member_id, probability, submitted_at) VALUES ($1, $2, $3, 40, now())', [EPISODE_01, member.anon_id, member.id]);
  await assert.rejects(db.query('UPDATE he.forecasts SET probability = 90'), /append-only/);
  await assert.rejects(db.query('DELETE FROM he.forecasts'), /append-only/);
  await assert.rejects(db.query('UPDATE he.forecasts SET member_id = NULL, probability = 90'), /append-only/);
  await assert.rejects(db.query('INSERT INTO he.forecasts (question_id, anon_id, probability, submitted_at) VALUES ($1, gen_random_uuid(), 100, now())', [EPISODE_01]), /check constraint/);
  await db.query('DELETE FROM he.members WHERE id = $1', [member.id]);
  const { rows } = await db.query('SELECT anon_id, member_id, probability FROM he.forecasts');
  assert.deepEqual(rows, [{ anon_id: member.anon_id, member_id: null, probability: 40 }]);
  await assert.rejects(db.query("UPDATE he.questions SET status = 'resolved' WHERE id = $1", [DRAFT_QUESTION]), /check constraint/);
});

test('withTransaction commits on success and rolls back on error', async (t) => {
  const db = await freshDatabase(t);
  await db.withTransaction((tx) => tx.query("INSERT INTO he.members (linkedin_sub, anon_id, name, created_at, last_sign_in_at) VALUES ('kept', gen_random_uuid(), 'Kept', now(), now())"));
  await assert.rejects(db.withTransaction(async (tx) => {
    await tx.query("INSERT INTO he.members (linkedin_sub, anon_id, name, created_at, last_sign_in_at) VALUES ('discarded', gen_random_uuid(), 'Discarded', now(), now())");
    throw new Error('abort');
  }), /abort/);
  const { rows } = await db.query('SELECT linkedin_sub FROM he.members ORDER BY linkedin_sub');
  assert.deepEqual(rows, [{ linkedin_sub: 'kept' }]);
});

test('the pg driver requires a connection string and surfaces connection failures', async () => {
  assert.throws(() => createDatabase({}), /connection string/);
  const db = createDatabase({ connectionString: 'postgres://user:secret@127.0.0.1:1/none' });
  await assert.rejects(db.query('SELECT 1'), (error) => error.code === 'ECONNREFUSED' && !/secret/.test(error.message));
  await assert.rejects(db.withTransaction(async () => {}), (error) => error.code === 'ECONNREFUSED');
  await db.close();
});
