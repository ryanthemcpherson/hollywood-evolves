# Retired demo-data design

This document is historical. The public demo-data route and its PostgreSQL runtime were removed after the premium editorial release. Stale `DEMO_MODE` and `DATABASE_URL` deployment variables have no effect on the application.

The retired design used a separate `hollywood_evolves_demo` schema and deterministic seed values. None of those rows are part of the editorial product, audience signals, commentary, or real forecast evidence. Do not restore the route or copy the old rows into a public data model.

Removing the unused Railway variables or PostgreSQL service is an infrastructure cleanup that requires operator approval. The application does not depend on either one.