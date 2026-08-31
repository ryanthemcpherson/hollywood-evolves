# Demo-data operations

## Safety boundary

Demo mode is explicit and read-only from the public web surface. Set `DEMO_MODE=true` only for an illustrative environment. The app never infers demo mode from the presence of a database. `GET /api/demo-state` returns a top-level `demo: true`, the label `DEMO — Illustrative sample data`, fixed seed/as-of metadata, and display-only values. There is no public reset, seed, or mutation route; the endpoint returns 404 when demo mode is off and 503 when the database is unreachable.

Demo records live only in the PostgreSQL schema `hollywood_evolves_demo`, in the tables `metadata`, `questions`, `views`, and `evidence`. They never enter commentary, sessions, audience aggregates, or the file-backed forecast intake. Platform destinations appear in the hero dock as named pending items only; the payload's platform entries carry a pending state and null URL.

## Presentation contract

- The demo banner (top of page) is hidden until JavaScript confirms a demo state; it shows the DEMO label, seed version, and as-of date when data loads.
- The forecast ledger shows the three sample views (Guest / Community / Research System) only after validated demo data arrives; the static fallback shows honest empty values.
- Each moving question card displays a `DEMO · n% YES / n% NO · status` line only after demo data loads.
- If the demo endpoint fails on a demo deployment, the banner reads `DEMO DATA UNAVAILABLE`, no sample values are substituted, and `/readyz` returns 503 while `/healthz` stays 200 for diagnosis.
- When demo mode is off, `/api/demo-state` returns 404 and the homepage shows no demo affordances at all.

## Railway setup

Add a private PostgreSQL service to the same Railway project as the app and connect its `DATABASE_URL` reference to the app service. This repository does not create or deploy Railway resources. Configure:

- `DEMO_MODE=true`
- `DATABASE_URL=${{Postgres.DATABASE_URL}}` (use the actual Railway service reference shown by the project)
- `COMMENTARY_ENABLED=false`

Railway builds with `npm run build`, starts with `npm start`, and probes `/readyz`. `/healthz` intentionally remains a coarse process-only check. In demo mode, `/readyz` and `/api/demo-state` return 503 when PostgreSQL is unavailable; the browser then shows `DEMO DATA UNAVAILABLE` and substitutes no zeros.

The pool is bounded to five connections with connection, statement, and idle timeouts. The application closes it on SIGTERM/SIGINT. Database URLs and errors containing connection details are never logged.

## Migration and seed semantics

Startup acquires a transaction-scoped advisory lock before creating the dedicated schema/tables and applying deterministic upserts. `metadata` records migration version 1, seed version 1, and a fixed as-of timestamp. Schema creation and seeding are idempotent, and the lock prevents concurrent replicas from racing. Percent checks are enforced in PostgreSQL and every sample YES/NO pair totals 100.

Changing deterministic content requires incrementing `DEMO_SEED_VERSION`. A schema change requires incrementing `DEMO_MIGRATION_VERSION` and an additive, reviewed migration. Do not repurpose demo tables for real forecasts.

## Verification

After configuration, verify:

```bash
curl -i https://HOST/healthz
curl -i https://HOST/readyz
curl -i https://HOST/api/demo-state
```

The demo response must use `Cache-Control: no-store`, identify itself as demo, show unresolved outcome metadata, and retain null platform URLs. POST/PUT/PATCH/DELETE to the demo endpoint must return 405.

## Real-data cutover and rollback

For cutover, first ship a separately reviewed real forecast repository and UI. Then set `DEMO_MODE=false` and redeploy; do not copy or rename demo rows. The demo endpoint becomes unavailable (404), while health remains coarse. Only after backup and review may an operator remove the isolated schema using a privileged database console—there is intentionally no application route for doing so.

Rollback is configuration-only: restore `DEMO_MODE=true` with the connected PostgreSQL service and redeploy. Idempotent startup recreates or refreshes deterministic demo rows. If the database is unhealthy, keep the app up for diagnosis via `/healthz`; `/readyz` will continue to fail closed.
