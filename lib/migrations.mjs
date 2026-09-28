import { forecastQuestions } from './forecast-questions.mjs';

// Everything lives in the dedicated `he` schema so leftover tables elsewhere in the database are never touched.
export const MIGRATION_LOCK_KEY = 684276032;
export const EPISODE_01_QUESTION_ID = 'he-episode-01-customer-evolution-v1';

const forecastingSchema = [
  `CREATE TABLE he.members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    linkedin_sub text NOT NULL UNIQUE,
    name text NOT NULL,
    email text,
    email_verified boolean NOT NULL DEFAULT false,
    anon_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    verified_industry boolean NOT NULL DEFAULT false,
    verified_industry_at timestamptz,
    verified_industry_by text,
    created_at timestamptz NOT NULL,
    last_sign_in_at timestamptz NOT NULL
  )`,
  `CREATE TABLE he.sessions (
    token_hash text PRIMARY KEY,
    member_id uuid NOT NULL REFERENCES he.members(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  'CREATE INDEX sessions_member_id_idx ON he.sessions (member_id)',
  'CREATE INDEX sessions_expires_at_idx ON he.sessions (expires_at)',
  `CREATE TABLE he.questions (
    id text PRIMARY KEY,
    episode text,
    title text NOT NULL,
    prompt text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'resolved')),
    opens_at timestamptz,
    closes_at timestamptz,
    resolved_at timestamptz,
    outcome text CHECK (outcome IN ('yes', 'no', 'invalid')),
    resolution_note text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((status = 'resolved') = (outcome IS NOT NULL AND resolved_at IS NOT NULL)),
    CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at)
  )`,
  `CREATE TABLE he.forecasts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_id text NOT NULL REFERENCES he.questions(id),
    anon_id uuid NOT NULL,
    member_id uuid REFERENCES he.members(id) ON DELETE SET NULL,
    probability smallint NOT NULL CHECK (probability BETWEEN 1 AND 99),
    submitted_at timestamptz NOT NULL
  )`,
  'CREATE INDEX forecasts_question_anon_idx ON he.forecasts (question_id, anon_id, submitted_at DESC, id DESC)',
  'CREATE INDEX forecasts_member_submitted_idx ON he.forecasts (member_id, submitted_at DESC)',
  // Forecast history is evidence: rows may never change, except that account deletion detaches member_id.
  `CREATE FUNCTION he.forecasts_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    IF TG_OP = 'UPDATE' AND OLD.member_id IS NOT NULL AND NEW.member_id IS NULL
      AND (NEW.id, NEW.question_id, NEW.anon_id, NEW.probability, NEW.submitted_at)
        IS NOT DISTINCT FROM (OLD.id, OLD.question_id, OLD.anon_id, OLD.probability, OLD.submitted_at) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'he.forecasts is append-only';
  END
  $$`,
  'CREATE TRIGGER forecasts_append_only BEFORE UPDATE OR DELETE ON he.forecasts FOR EACH ROW EXECUTE FUNCTION he.forecasts_append_only()',
  `CREATE TABLE he.expert_forecasts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_id text NOT NULL REFERENCES he.questions(id),
    name text NOT NULL,
    role text NOT NULL,
    probability smallint NOT NULL CHECK (probability BETWEEN 1 AND 99),
    recorded_at timestamptz NOT NULL,
    recorded_by text NOT NULL
  )`,
  'CREATE INDEX expert_forecasts_question_idx ON he.expert_forecasts (question_id, name, recorded_at DESC)',
  `CREATE TABLE he.comments (
    id text PRIMARY KEY,
    question_id text NOT NULL REFERENCES he.questions(id),
    member_id uuid NOT NULL REFERENCES he.members(id) ON DELETE CASCADE,
    body text NOT NULL,
    consent boolean NOT NULL CHECK (consent),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at timestamptz NOT NULL,
    published_at timestamptz,
    moderated_at timestamptz,
    moderated_by text,
    rejection_reason text
  )`,
  'CREATE INDEX comments_question_status_idx ON he.comments (question_id, status, published_at)',
  'CREATE INDEX comments_member_created_idx ON he.comments (member_id, created_at DESC)',
  'CREATE INDEX comments_pending_idx ON he.comments (created_at) WHERE status = \'pending\'',
  `CREATE TABLE he.audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action text NOT NULL,
    actor text NOT NULL,
    member_id uuid REFERENCES he.members(id) ON DELETE SET NULL,
    subject_type text,
    subject_id text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL
  )`,
  'CREATE INDEX audit_created_at_idx ON he.audit (created_at)',
  'CREATE INDEX audit_member_id_idx ON he.audit (member_id)',
];

async function upsertQuestions(tx, questions) {
  for (const question of questions) {
    // Content follows lib/forecast-questions.mjs on every boot; status and schedule are editorial state and never overwritten.
    await tx.query(
      `INSERT INTO he.questions (id, episode, title, prompt) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET episode = EXCLUDED.episode, title = EXCLUDED.title, prompt = EXCLUDED.prompt, updated_at = now()
       WHERE (he.questions.episode, he.questions.title, he.questions.prompt) IS DISTINCT FROM (EXCLUDED.episode, EXCLUDED.title, EXCLUDED.prompt)`,
      [question.id, question.episode ?? null, question.title, question.prompt],
    );
  }
}

export const migrations = Object.freeze([
  Object.freeze({
    version: 1,
    name: 'account-tied forecasting',
    async up(tx, questions) {
      for (const statement of forecastingSchema) await tx.query(statement);
      await upsertQuestions(tx, questions);
      await tx.query(`UPDATE he.questions SET status = 'open', opens_at = now(), closes_at = NULL, updated_at = now() WHERE id = $1`, [EPISODE_01_QUESTION_ID]);
    },
  }),
  Object.freeze({
    version: 2,
    name: 'deterministic anon_id',
    async up(tx) {
      // anon_id is derived from the LinkedIn subject by the application (HMAC with AUTH_SECRET), so a deleted and
      // re-created account keeps the same forecaster identity; a random default would silently mint a new one.
      await tx.query('ALTER TABLE he.members ALTER COLUMN anon_id DROP DEFAULT');
      // The hourly submission limit counts by anon_id so it survives account deletion.
      await tx.query('CREATE INDEX forecasts_anon_submitted_idx ON he.forecasts (anon_id, submitted_at DESC)');
    },
  }),
]);

export const LATEST_MIGRATION = Math.max(...migrations.map(({ version }) => version));

export async function migrate(db, { questions = forecastQuestions } = {}) {
  return db.withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await tx.query('CREATE SCHEMA IF NOT EXISTS he');
    await tx.query('CREATE TABLE IF NOT EXISTS he.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await tx.query('SELECT version FROM he.schema_migrations');
    const applied = new Set(rows.map(({ version }) => version));
    const newlyApplied = [];
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await migration.up(tx, questions);
      await tx.query('INSERT INTO he.schema_migrations (version, name) VALUES ($1, $2)', [migration.version, migration.name]);
      newlyApplied.push(migration.version);
    }
    await upsertQuestions(tx, questions);
    return { applied: newlyApplied };
  });
}

export async function schemaIsCurrent(db) {
  const { rows } = await db.query('SELECT coalesce(max(version), 0)::int AS version FROM he.schema_migrations');
  return rows[0]?.version === LATEST_MIGRATION;
}
