export const DEMO_SCHEMA = 'hollywood_evolves_demo';
export const DEMO_MIGRATION_VERSION = 1;
export const DEMO_SEED_VERSION = 1;
export const DEMO_AS_OF = '2026-08-30T12:00:00.000Z';
export const DEMO_LABEL = 'DEMO — Illustrative sample data';
export const DEMO_ADVISORY_LOCK_KEY = 684276031;

export const demoQuestions = Object.freeze([
  ['he-episode-01-customer-evolution-v1', 'Customer Evolution', 58, 42, 'monitoring', 'At least three of the five named services.', 'December 31, 2029'],
  ['he-question-02-media-supply-chain-evolution-v1', 'Media Supply Chain Evolution', 44, 56, 'high uncertainty', 'Two studios confirm qualifying use.', 'December 31, 2028'],
  ['he-question-03-creator-evolution-v1', 'Creator Evolution', 31, 69, 'criteria review', 'Top billing in a 2,000-theater release.', 'December 31, 2030'],
  ['he-question-04-content-evolution-v1', 'Content Evolution', 47, 53, 'monitoring', 'A qualifying film reaches 1,000 U.S. theaters.', 'December 31, 2029'],
  ['he-question-05-commercial-evolution-v1', 'Commercial Evolution', 63, 37, 'definition pending', 'One named service launches the feature.', 'December 31, 2028'],
  ['he-question-06-audio-evolution-v1', 'Audio Evolution', 54, 46, 'signal review', 'Two named services offer qualifying controls.', 'December 31, 2029'],
  ['he-question-07-vfx-evolution-v1', 'VFX Evolution', 39, 61, 'high uncertainty', 'More than half of final shots in a qualifying release.', 'December 31, 2028'],
  ['he-question-08-animation-evolution-v1', 'Animation Evolution', 67, 33, 'criteria review', 'A final appellate decision makes the specified holding.', 'December 31, 2029'],
].map(([id, title, yes, no, status, threshold, deadline], index) => Object.freeze({ id, displayId: `question-${String(index + 1).padStart(2, '0')}`, title, yes, no, status, threshold, deadline })));

export const demoViews = Object.freeze([
  Object.freeze({ label: 'Guest', yes: 61, no: 39, status: 'sample view' }),
  Object.freeze({ label: 'Community', yes: 54, no: 46, status: 'sample aggregate · display only' }),
  Object.freeze({ label: 'Research System', yes: 58, no: 42, status: 'sample model view' }),
]);

export const demoEvidence = Object.freeze([
  Object.freeze({ id: 'signal-01', status: 'reviewed', description: 'A fictional quarterly disclosure clarifies how sample plan categories would be counted.' }),
  Object.freeze({ id: 'signal-02', status: 'monitoring', description: 'A generic product rollout suggests the illustrative adoption rate could change.' }),
  Object.freeze({ id: 'signal-03', status: 'definition pending', description: 'A sample reporting change requires an editorial decision before it could qualify.' }),
  Object.freeze({ id: 'signal-04', status: 'reviewed', description: 'A fictional methodology note confirms the example geography and comparison period.' }),
]);

export const schemaStatements = Object.freeze([
  `CREATE SCHEMA IF NOT EXISTS ${DEMO_SCHEMA}`,
  `CREATE TABLE IF NOT EXISTS ${DEMO_SCHEMA}.metadata (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), migration_version integer NOT NULL, seed_version integer NOT NULL, as_of timestamptz NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ${DEMO_SCHEMA}.questions (id text PRIMARY KEY, display_id text UNIQUE NOT NULL, title text NOT NULL, yes_percent integer NOT NULL CHECK (yes_percent BETWEEN 0 AND 100), no_percent integer NOT NULL CHECK (no_percent BETWEEN 0 AND 100), status text NOT NULL, threshold text NOT NULL, deadline text NOT NULL, CHECK (yes_percent + no_percent = 100))`,
  `CREATE TABLE IF NOT EXISTS ${DEMO_SCHEMA}.views (label text PRIMARY KEY, yes_percent integer NOT NULL CHECK (yes_percent BETWEEN 0 AND 100), no_percent integer NOT NULL CHECK (no_percent BETWEEN 0 AND 100), status text NOT NULL, CHECK (yes_percent + no_percent = 100))`,
  `CREATE TABLE IF NOT EXISTS ${DEMO_SCHEMA}.evidence (id text PRIMARY KEY, status text NOT NULL, description text NOT NULL)`,
]);

const seedStatements = [
  [`INSERT INTO ${DEMO_SCHEMA}.metadata (singleton, migration_version, seed_version, as_of) VALUES (true, $1, $2, $3) ON CONFLICT (singleton) DO UPDATE SET migration_version = EXCLUDED.migration_version, seed_version = EXCLUDED.seed_version, as_of = EXCLUDED.as_of`, [DEMO_MIGRATION_VERSION, DEMO_SEED_VERSION, DEMO_AS_OF]],
  ...demoQuestions.map((item) => [`INSERT INTO ${DEMO_SCHEMA}.questions (id, display_id, title, yes_percent, no_percent, status, threshold, deadline) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO UPDATE SET display_id=EXCLUDED.display_id,title=EXCLUDED.title,yes_percent=EXCLUDED.yes_percent,no_percent=EXCLUDED.no_percent,status=EXCLUDED.status,threshold=EXCLUDED.threshold,deadline=EXCLUDED.deadline`, [item.id, item.displayId, item.title, item.yes, item.no, item.status, item.threshold, item.deadline]]),
  ...demoViews.map((item) => [`INSERT INTO ${DEMO_SCHEMA}.views (label, yes_percent, no_percent, status) VALUES ($1,$2,$3,$4) ON CONFLICT (label) DO UPDATE SET yes_percent=EXCLUDED.yes_percent,no_percent=EXCLUDED.no_percent,status=EXCLUDED.status`, [item.label, item.yes, item.no, item.status]]),
  ...demoEvidence.map((item) => [`INSERT INTO ${DEMO_SCHEMA}.evidence (id, status, description) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,description=EXCLUDED.description`, [item.id, item.status, item.description]]),
  [`DELETE FROM ${DEMO_SCHEMA}.questions WHERE NOT (id = ANY($1::text[]))`, [demoQuestions.map(({ id }) => id)]],
  [`DELETE FROM ${DEMO_SCHEMA}.views WHERE NOT (label = ANY($1::text[]))`, [demoViews.map(({ label }) => label)]],
  [`DELETE FROM ${DEMO_SCHEMA}.evidence WHERE NOT (id = ANY($1::text[]))`, [demoEvidence.map(({ id }) => id)]],
];

export class DemoDataRepository {
  constructor({ adapter }) { this.adapter = adapter; this.available = false; }

  async initialize() {
    const client = this.adapter.connect ? await this.adapter.connect() : this.adapter;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock($1)', [DEMO_ADVISORY_LOCK_KEY]);
      for (const statement of schemaStatements) await client.query(statement);
      for (const [statement, values] of seedStatements) await client.query(statement, values);
      await client.query('COMMIT');
      this.available = true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      this.available = false;
      throw error;
    } finally { client.release?.(); }
  }

  async readiness() {
    if (!this.available) return false;
    try {
      const result = await this.adapter.query(`SELECT migration_version, seed_version FROM ${DEMO_SCHEMA}.metadata WHERE singleton = true`);
      return result.rows[0]?.migration_version === DEMO_MIGRATION_VERSION
        && result.rows[0]?.seed_version === DEMO_SEED_VERSION;
    } catch { return false; }
  }

  async getPublicState() {
    if (!this.available) throw Object.assign(new Error('Demo data unavailable'), { statusCode: 503 });
    const client = this.adapter.connect ? await this.adapter.connect() : this.adapter;
    let metadata;
    let questions;
    let views;
    let evidence;
    try {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      metadata = await client.query(`SELECT migration_version, seed_version, as_of FROM ${DEMO_SCHEMA}.metadata WHERE singleton = true`);
      questions = await client.query(`SELECT id, display_id, title, yes_percent, no_percent, status, threshold, deadline FROM ${DEMO_SCHEMA}.questions ORDER BY display_id`);
      views = await client.query(`SELECT label, yes_percent, no_percent, status FROM ${DEMO_SCHEMA}.views ORDER BY CASE label WHEN 'Guest' THEN 1 WHEN 'Community' THEN 2 ELSE 3 END`);
      evidence = await client.query(`SELECT id, status, description FROM ${DEMO_SCHEMA}.evidence ORDER BY id`);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release?.(); }
    const meta = metadata.rows[0];
    if (!meta || meta.migration_version !== DEMO_MIGRATION_VERSION || meta.seed_version !== DEMO_SEED_VERSION
      || questions.rows.length !== demoQuestions.length || views.rows.length !== demoViews.length || evidence.rows.length !== demoEvidence.length) {
      throw Object.assign(new Error('Demo data unavailable'), { statusCode: 503 });
    }
    return {
      demo: true, label: DEMO_LABEL,
      metadata: { migrationVersion: meta.migration_version, seedVersion: meta.seed_version, asOf: new Date(meta.as_of).toISOString() },
      headline: {
        questionId: demoQuestions[0].id,
        views: views.rows.map((row) => ({ label: row.label, yes: row.yes_percent, no: row.no_percent, status: row.status, demo: true })),
        evidence: evidence.rows.map((row) => ({ id: row.id, status: row.status, description: row.description, demo: true })),
        outcome: { state: 'unresolved', demo: true, threshold: demoQuestions[0].threshold, deadline: demoQuestions[0].deadline },
      },
      questions: questions.rows.map((row) => ({ id: row.id, displayId: row.display_id, title: row.title, yes: row.yes_percent, no: row.no_percent, status: row.status, threshold: row.threshold, deadline: row.deadline, demo: true })),
      platforms: ['Spotify', 'Apple Music', 'YouTube'].map((name) => ({ name, state: 'pending', url: null })),
    };
  }

  async close() { await this.adapter.end?.(); }
}

export function deterministicDemoState() {
  return { questions: structuredClone(demoQuestions), views: structuredClone(demoViews), evidence: structuredClone(demoEvidence) };
}
