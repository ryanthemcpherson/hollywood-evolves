# Forecasting operations

How to switch on LinkedIn sign-in and account-tied forecasting, and how to run a question from opening to Market Update. The API itself is specified in [`forecasting-api.md`](forecasting-api.md).

## 1. Create the LinkedIn app

1. In the LinkedIn Developer Portal, create an app owned by the Hollywood Evolves (or TMT Insights) LinkedIn Page.
2. Under **Products**, add **Sign In with LinkedIn using OpenID Connect**.
3. Under **Auth**, add the authorized redirect URL `https://hollywoodevolves.mcpherson.app/auth/linkedin/callback`.
4. Keep the client ID and client secret for step 3. Never commit them or paste them into chat.

## 2. Connect the database

The `hollywood-evolves` Railway project already has a Postgres service. Point the web service at it with a reference variable, so no credentials are copied by hand:

```bash
railway variables --service hollywood-evolves --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
```

Migrations run automatically at boot under an advisory lock and live in their own schema, so leftover demo tables are untouched.

## 3. Set the secrets

Run these from a terminal logged into the Railway account that owns the project. The two random secrets are generated locally and sent straight to Railway:

```bash
railway variables --service hollywood-evolves --set "LINKEDIN_CLIENT_ID=<client id>" --set "LINKEDIN_CLIENT_SECRET=<client secret>" --set "LINKEDIN_REDIRECT_URI=https://hollywoodevolves.mcpherson.app/auth/linkedin/callback" --set "PUBLIC_ORIGIN=https://hollywoodevolves.mcpherson.app" --set "AUTH_SECRET=$(openssl rand -hex 32)" --set "ADMIN_TOKEN=$(openssl rand -hex 32)" --set "ADMIN_NAME=Ian McPherson" --set "TRUST_PROXY=true"
```

Keep a copy of `ADMIN_TOKEN` in your password manager; the admin commands below need it. Nothing turns on until the final switch:

```bash
railway variables --service hollywood-evolves --set "AUTH_ENABLED=true"
```

Railway redeploys on each variable change. Check `https://hollywoodevolves.mcpherson.app/readyz`: it fails if sign-in is enabled but the database is unreachable. `COMMENTARY_ENABLED=true` additionally opens comments.

## 4. Run a question

Episode 01 opens automatically in the first migration. For everything else, create the temporary curl configuration from [`commentary-operations.md`](commentary-operations.md#moderation) so the admin token never appears on a command line, then:

```bash
curl --config "$AUTH_CONFIG" --fail --silent --show-error -X POST -H 'Content-Type: application/json' \
  --data '{"status":"open"}' "$BASE/api/admin/questions/he-question-02-media-supply-chain-evolution-v1"
```

| Step | Request |
|-|-|
| Open or close | `POST /api/admin/questions/:id` with `{ "status": "open" \| "closed", "opensAt"?, "closesAt"? }` |
| Record Expert Alpha after recording | `POST /api/admin/questions/:id/expert-forecasts` with `{ "name", "role", "probability" }` |
| Resolve | `POST /api/admin/questions/:id/resolution` with `{ "outcome": "yes" \| "no" \| "invalid", "note" }` |
| Export members and their forecasts | `GET /api/admin/export/forecasts` |

The Community Forecast stays hidden until ten members have forecast, and the forecaster count is always shown. After resolution, each member sees the Brier score of their last forecast before the close, which is the raw material for the Market Update segment.

## 5. Privacy obligations

- The privacy page describes exactly what is stored: LinkedIn identifier, name, email, verification flag, forecasts with timestamps, and comments. Update it before collecting anything new.
- The export contains personal data. Keep it out of shared drives and delete local copies after use.
- Account deletion removes identity, sessions, and comments; forecasts remain under a pseudonymous one-way code so a returning member is counted once.

## 6. Rotating AUTH_SECRET

`AUTH_SECRET` signs sessions, CSRF tokens, and sign-in state, and it keys the one-way code that keeps each person's forecasts under one pseudonymous identity. Treat it as long-lived and rotate it only after a suspected leak. Rotating it:

- signs every member out and cancels any sign-in in progress;
- leaves existing members' stored codes unchanged;
- means someone who deleted their account before the rotation and later returns is counted as a new forecaster once, and their earlier forecasts can no longer be linked to them.

The three-comments-per-hour limit resets if a member deletes their account, because comments are deleted with it. Moderation and the sign-in rate limit keep the impact small.
