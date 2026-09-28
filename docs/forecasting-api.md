# Account-tied forecasting — API contract

Members sign in with LinkedIn (OpenID Connect), submit a 1–99% probability on an open question, and can revise it. Every submission is kept; the latest per member is their current forecast. The public sees only the Community Forecast aggregate. Comments are attributed to the member's account and moderated.

LinkedIn sign-in authenticates control of a LinkedIn account. It is not identity verification; "verified industry" labels still require editorial review.

## Configuration (fail-closed)

Forecasting and sign-in are off unless **every** value below is set. When off, `GET /api/session` returns `200 { authEnabled: false }` (so the homepage can check without logging a console error), every other route in this document returns `404`, and the homepage keeps its browser-only forecast.

| Variable | Rule |
|-|-|
| `AUTH_ENABLED` | `true` |
| `DATABASE_URL` | Postgres connection string (Railway reference variable) |
| `PUBLIC_ORIGIN` | `https://` origin of the site |
| `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | From the LinkedIn developer app |
| `LINKEDIN_REDIRECT_URI` | Exactly `${PUBLIC_ORIGIN}/auth/linkedin/callback` |
| `AUTH_SECRET` | 32+ characters; signs sessions, CSRF tokens, and sign-in state |
| `ADMIN_TOKEN` | 32+ characters; bearer token for `/api/admin/*` |
| `ADMIN_NAME` | Name recorded in the audit log for admin actions |
| `COMMENTARY_ENABLED` | Additionally `true` to open comment routes |
| `TRUST_PROXY` | `true` behind Railway so rate limits use the client address from `X-Forwarded-For` |

## Data model (Postgres)

- `members`: LinkedIn `sub` (unique), name, email, email-verified flag, sign-in timestamps, a stable random `anon_id`, and the editorial `verified_industry` label.
- `sessions`: HMAC of the session token, member, expiry (7 days). Expired rows are purged.
- `questions`: seeded from `lib/forecast-questions.mjs`; `status` is `draft | open | closed | resolved`, with `opens_at`, `closes_at`, `resolved_at`, `outcome` (`yes | no | invalid`), and a resolution note. Episode 01 opens in the first migration.
- `forecasts`: append-only. `question_id`, `anon_id`, `member_id` (set to null if the account is deleted), `probability` (1–99), `submitted_at`.
- `expert_forecasts`: the episode guests' Expert Alpha, entered by an admin.
- `comments`: `member_id` (deleted with the account), body, consent flag, moderation status and audit fields.
- `audit`: every admin and account action.

Account deletion removes the member, their sessions, and their comments, and detaches their forecasts (`member_id = null`) while keeping `anon_id`, so past Community Forecasts and scores do not change after the fact.

`anon_id` is derived one-way from the LinkedIn subject (HMAC-SHA256 keyed with `AUTH_SECRET`), not generated at random. A member who deletes their account and signs in again gets the same `anon_id`, so they are counted once in the Community Forecast and the hourly submission limit carries over. `anon_id` never appears in any public or member API response.

## Aggregation and scoring

- **Community Forecast**: median, in log-odds, of each forecaster's latest probability; converted back and rounded to a whole percent. Published only when at least **10** members have forecast; the forecaster count is always published.
- **Score**: Brier score of a member's last forecast submitted before `closes_at`, once the question resolves `yes` or `no`. `invalid` resolutions are not scored.

## Sign-in

| Route | Behavior |
|-|-|
| `GET /auth/linkedin?return=<path>` | Starts sign-in with `state`, `nonce`, and PKCE (S256). `return` must be a same-site path beginning with `/` (not `//`); anything else becomes `/`. |
| `GET /auth/linkedin/callback` | Validates the ID token, creates or updates the member, starts a session (`__Host-he_session`: Secure, HttpOnly, SameSite=Lax), and redirects to `${PUBLIC_ORIGIN}${return}`. |

## Member API

All writes require the session cookie, an `Origin` equal to `PUBLIC_ORIGIN`, and `x-csrf-token` from `GET /api/session`. Errors are JSON `{ "error": "<code>" }`.

| Route | Response |
|-|-|
| `GET /api/session` | `200 { authEnabled: false }` when sign-in is off; otherwise `200 { authEnabled: true, authenticated: false }` or `200 { authEnabled: true, authenticated: true, member: { name, verifiedIndustry }, csrfToken, commentaryEnabled }` |
| `POST /api/session/logout` | `200 { loggedOut: true }` and clears the cookie |
| `DELETE /api/account` | `200 { deleted: true }`; behavior described above |
| `GET /api/forecasts/:questionId` | Public. `200 { questionId, status, opensAt, closesAt, forecasters, minimumForecasters: 10, community: { probability } \| null, expert: [{ name, role, probability, recordedAt }], resolution: { outcome, resolvedAt } \| null }`. `404` for draft or unknown questions. |
| `GET /api/forecasts/:questionId/mine` | Signed in. `200 { current: { probability, submittedAt } \| null, history: [{ probability, submittedAt }] (newest first), score: { brier } \| null }` |
| `POST /api/forecasts/:questionId` | Signed in. Body `{ probability }` (integer 1–99). `201` with the same shape as `mine`. `409 { error: "question_not_open" }` unless open and within `opens_at`/`closes_at`; `422 { error: "invalid_probability" }`; `429 { error: "rate_limited" }` (30 submissions per member per hour). |
| `GET /api/questions/:questionId/comments` | Public (comments enabled). Approved comments with author name and verified label. |
| `POST /api/questions/:questionId/comments` | Signed in (comments enabled). Body `{ body, consent: true }`. `202` pending moderation. |

## Admin API

Bearer `ADMIN_TOKEN`, compared in constant time; the audit actor is always `ADMIN_NAME`.

| Route | Purpose |
|-|-|
| `POST /api/admin/questions/:id` | `{ status: "open" \| "closed", opensAt?, closesAt? }` |
| `POST /api/admin/questions/:id/resolution` | `{ outcome: "yes" \| "no" \| "invalid", note }` |
| `POST /api/admin/questions/:id/expert-forecasts` | `{ name, role, probability }` |
| `GET /api/admin/export/forecasts` | Every forecast with its member's name and email (null once deleted), as JSON |
| `GET /api/admin/comments`, `POST /api/admin/comments/:id`, `POST /api/admin/verification` | Comment moderation and the verified-industry label, as before |

## Errors and edge cases

Every error is JSON `{ "error": "<code>" }`.

| Status | Codes |
|-|-|
| 400 | `invalid_json` |
| 401 | `authentication_required` (member routes), `unauthorized` (admin) |
| 403 | `origin_not_allowed`, `invalid_csrf_token` |
| 404 | `not_found` (unknown or draft question, or any route while sign-in is off) |
| 409 | `question_not_open`, `already_moderated`, `invalid_transition` |
| 413 / 415 | `payload_too_large`, `unsupported_media_type` |
| 422 | `invalid_probability`, `consent_required`, `invalid_comment`, and admin validation codes |
| 429 | `rate_limited` |
| 503 | `unavailable`: sign-in is enabled but the database is not ready. `GET /api/session` reports `{ authEnabled: false }` in this state, so the homepage falls back to its browser-only forecast. |

- A forecast `POST` to a draft question returns `409 question_not_open`; an unknown question returns `404`.
- An open question whose `closes_at` has passed is reported as `closed`.
- The public `expert` list shows the latest entry per guest name; expert probabilities are 1–99. A resolution requires a `note`.
- Logout, account deletion, and a stale cookie on `GET /api/session` all clear `__Host-he_session`. The CSRF token is stable for the life of a session.
- Writes require an `Origin` exactly equal to `PUBLIC_ORIGIN`, so member writes fail against a local server unless `PUBLIC_ORIGIN` matches it.
- Pending sign-in flows are held in memory: run a single replica.
