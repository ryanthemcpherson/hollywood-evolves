# Demo data operations

## Purpose and truth boundary

Hollywood Evolves uses a deterministic illustrative layer so the forecast ledger can demonstrate populated states without presenting sample values as live forecasts or community input. It is isolated in the PostgreSQL schema `hollywood_evolves_demo`; it does not write to audience, commentary, member, session, or future real-forecast storage.

The public UI must retain the global **ILLUSTRATIVE FORECAST DATA · NOT LIVE** disclosure and local **DEMO** labels around every aggregate. A failed dependency displays **Demo data unavailable**—never zeros, cached fixtures, or values that could be mistaken for real data.

## Railway variables

Set these explicitly on the Hollywood Evolves application service:

- `DEMO_MODE=true` — opts the runtime into the illustrative layer.
- `DATABASE_URL` — a private Railway reference to the attached PostgreSQL service.
- `COMMENTARY_ENABLED=false` — keeps commentary inactive until its separate moderation/authentication requirements are deliberately approved.

Never paste `DATABASE_URL` into documentation, logs, build output, browser code, or support messages. The server never logs its value.

## Startup, schema, and seed semantics

When `DEMO_MODE=true` and `DATABASE_URL` is configured, startup creates and seeds only `hollywood_evolves_demo`:

1. acquire a transaction-scoped PostgreSQL advisory lock;
2. create the dedicated schema and `metadata`, `questions`, `views`, and `evidence` tables if absent;
3. upsert the deterministic migration/seed version, as-of date, three sample views, eight sample questions, and illustrative evidence;
4. remove obsolete demo rows not present in the current seed; and
5. commit atomically, or roll back the complete initialization on failure.

Concurrent application starts serialize on the advisory lock, so seeding is idempotent and race-safe. Public reads use a repeatable-read, read-only transaction.

The `pg` pool is bounded to five connections, with an 800ms connection timeout, 5s statement timeout, and 10s idle timeout. Graceful shutdown stops the HTTP server and closes the pool.

## Runtime contract

| Configuration/state | `/healthz` | `/readyz` | `GET /api/demo-state` |
|---|---:|---:|---:|
| `DEMO_MODE` is not `true` | 200 | 200 | 404 (route hidden) |
| Demo mode + database ready | 200 | 200 | 200, `demo: true`, `Cache-Control: no-store` |
| Demo mode + missing `DATABASE_URL` | 200 | 503 | 503, explicit demo-unavailable payload |
| Demo mode + database/init/read failure | 200 | 503 | 503, explicit demo-unavailable payload |

Only `GET` and `HEAD` are accepted at `/api/demo-state`; other methods return 405. There is no public seed, reset, or mutation route. `/healthz` is intentionally process-only; Railway should health-check `/readyz` so a demo-enabled release cannot be promoted while its database dependency is unavailable.

## Safe rollback

The reversible application rollback is:

1. set `DEMO_MODE=false` on the application service;
2. redeploy;
3. verify `/healthz` and `/readyz` are 200;
4. verify `/api/demo-state` is 404; and
5. verify the public UI does not present illustrative values as live data.

Disabling demo mode intentionally leaves the isolated schema intact for a later rollback-forward. Do **not** drop the schema during a routine rollback. Dropping `hollywood_evolves_demo` is destructive and requires an explicit backup/retention decision and operator approval.

## Real-data cutover

Future real forecasts must use separate tables/schema and an explicitly reviewed API contract. Never rename, copy, or reinterpret `hollywood_evolves_demo` rows as production history.

Before cutover:

1. provision and migrate real forecast storage separately;
2. verify provenance, publication state, and source-separated audience semantics;
3. add dependency-aware readiness and read/write tests for the real path;
4. change the UI to consume the real endpoint while keeping browser-local calls separate from published/community values;
5. disable `DEMO_MODE`; and
6. verify no public DEMO value remains and no real value inherits demo metadata.

Keep the demo schema until rollback/retention policy is settled. Its deletion is a separate destructive operation, not part of the application deploy.
