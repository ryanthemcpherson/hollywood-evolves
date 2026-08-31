# Audience-signal intake

## Current truth

The intake infrastructure is deployed-capable, but Episode 01 remains `draft`. Its contract is still under editorial review, `opensAt` and `closesAt` are `null`, submissions return HTTP 409, the poll page does not open its modal, and no audience values are published. Opening a question is a separate editorial and operations decision.

The immutable Episode 01 question ID is:

`he-episode-01-customer-evolution-v1`

Never reuse that ID for materially changed wording or resolution terms. Create a new versioned ID instead.

## Visitor paths

Both forms preserve a bounded source label (`site`, `linkedin`, `newsletter`, `qr`, or `direct`):

- Direct route: `/poll/<immutable-question-id>?src=newsletter`
- Compact query deep link: `/?poll=<immutable-question-id>&src=qr`

The query form redirects to the canonical poll route. For an open question, a first visit opens a native accessible dialog. It has explicit Yes and No buttons, optional whole-number confidence from 1% through 99%, plain privacy copy, close and “Not now” controls, 44px targets, visible focus, reduced-motion handling, and no preselected answer. Closing or skipping suppresses the modal only for the current browser session. A successful answer is remembered in local storage.

## Data model and privacy boundary

Question configuration lives in `lib/forecast-questions.mjs`:

- `id`: immutable versioned identifier
- `episode`, `title`, `prompt`
- `state`: `draft`, `open`, or `closed`
- `opensAt`, `closesAt`: ISO timestamps fixed before opening

Direct responses retain only the question ID, Yes/No choice, optional confidence, bounded source label, keyed HMAC of a random browser token, and keyed HMAC of the idempotency key. Browser tokens and idempotency keys are never returned by the public API. Names, emails, LinkedIn profile fields, and raw IP addresses are not stored by this application. The in-memory rate limiter uses a request IP only for its current process lifetime; normal hosting logs remain governed by the hosting provider.

Campaign configuration stores `id`, immutable `questionId`, state, LinkedIn post URN, cutoff, and the explicit mapping:

- `LIGHTBULB` = Yes
- `PRAISE` or `CLAP` = No

Reaction imports retain only campaign/question IDs, mapped choice, a keyed HMAC of the provider reaction ID, and aggregate audit counts. Member identity fields are discarded by the adapter.

The public question API returns source-separated aggregate data only:

`GET /api/questions/<question-id>`

`directForecasts` and `linkedInReactions` are separate objects. Reaction totals are never represented as confidence, probability, or direct forecasts.

## Idempotency, audit, and abuse controls

- One direct response per question/browser HMAC. A second idempotency key from the same browser returns 409.
- Replaying the same idempotency key returns an idempotent duplicate result without adding a response.
- Import batches are keyed by campaign plus import key; reaction IDs are deduplicated per campaign.
- Direct submissions are limited to 10 attempts per IP/question per 10 minutes per process.
- Admin imports are limited to five attempts per IP per hour and require a constant-time checked bearer token.
- JSON bodies are type-checked and size-limited; confidence is integer-only, 1–99.
- Audit records describe accepted actions and ignored duplicates without public identity fields.
- State is atomically rewritten with mode 0600. File persistence assumes one application process. Before horizontal scaling, migrate to a transactional database with unique constraints on `(question_id, browser_hash)`, `(question_id, idempotency_hash)`, `(campaign_id, reaction_hash)`, and `(campaign_id, import_hash)`.

## LinkedIn permission boundary

`lib/linkedin-reaction-adapter.mjs` is deliberately transport-agnostic. It accepts a client exposing `listReactions({ postUrn, cutoff })`, normalizes only reaction ID/type/time, and strips actor data. Do not implement or claim automatic collection until the LinkedIn application has approved Community Management API access for the organization and the exact reaction-read capability has been verified against current LinkedIn documentation. The project does not scrape arbitrary public reactions.

### Manual CSV fallback

Use `docs/linkedin-reactions-template.csv`. The exact allowed header is:

`reaction_id,reaction_type,reacted_at`

Identity columns are rejected. Validate locally:

`npm run audience:tools -- validate-csv path/to/reactions.csv`

Import through the authenticated owned endpoint:

`AUDIENCE_IMPORT_TOKEN=... npm run audience:tools -- import-csv li-episode-01-v1 path/to/reactions.csv https://hollywoodevolves.mcpherson.app`

The CLI derives a stable import key from the CSV SHA-256, so rerunning the same file is idempotent.

### Post-copy generator

After a real post URN and cutoff are fixed in campaign configuration:

`npm run audience:tools -- post-copy he-episode-01-customer-evolution-v1 li-episode-01-v1`

The generator prints the prompt, `LIGHTBULB=YES`, `PRAISE/CLAP=NO`, UTC cutoff, direct poll link, and the required warning that reactions are informal signals rather than probability forecasts. It refuses to generate publishable copy while the cutoff is unset.

## Opening checklist

1. Finalize wording, resolution criteria, evidence hierarchy, edge cases, owner, and dates.
2. If wording or criteria changed materially, create a new immutable versioned ID.
3. Set the question to `open` with real `opensAt` and `closesAt` timestamps.
4. Create the campaign/post record with real post URN and cutoff; never invent either.
5. Provision a persistent Railway volume and set `AUDIENCE_DATA_PATH=/data/audience-signals.json`.
6. Set high-entropy `AUDIENCE_HASH_SECRET` and `AUDIENCE_IMPORT_TOKEN`; do not reuse them.
7. Deploy one application replica, submit a controlled test response, verify idempotent replay and source-separated aggregates, then remove test state or use a dedicated non-production question.
8. Review the live privacy text, keyboard flow, reduced motion, mobile layout, and hosting log retention.
9. Only then publish magic links or LinkedIn copy.

## Deployment and production verification

Build and test:

`npm test`

Railway configuration:

- Build: `npm run build`
- Start: `npm start`
- Health: `/healthz`
- Persistent volume mounted at `/data`
- Variables from `.env.example`
- One replica while using the file-backed store

Expected production checks while Episode 01 remains draft:

`curl -fsS https://hollywoodevolves.mcpherson.app/healthz`

`curl -fsS https://hollywoodevolves.mcpherson.app/api/questions/he-episode-01-customer-evolution-v1`

The API must report `state: "draft"` and zero direct/reaction totals. A POST to `/api/questions/he-episode-01-customer-evolution-v1/responses` must return 409. The poll URL must render the draft prompt, say it is not open, keep the dialog closed, and publish no values.
