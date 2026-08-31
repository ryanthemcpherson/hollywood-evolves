# Decision Log

## 2026-08-30 — Initial direction

- Working project name: **Hollywood Evolves**.
- Core interaction: one headline forecast per episode, expressed as a probability rather than a binary poll.
- Editorial promise: show the source trail and update history; never fabricate activity to make the site feel populated.
- Position Ian as an experienced media-technology operator and convener, not a futurist personality.
- Keep the first website deliberately simple; the forecasting ledger is the distinctive product.
- Treat the Claude artifact as a visual/content reference only. Its displayed aired episodes, percentages, trend values, and comments are illustrative and must be replaced by explicit demo states or real data.

## 2026-08-30 — Public participation and launch cadence

- DEG is approved for public naming and use on the site.
- The website and aggregate audience signal are public.
- Written industry takes come from verified contributors; do not launch an unrestricted anonymous comment box.
- Add identity, moderation, rate-limiting, and abuse controls before accepting public submissions.
- Forecasts exist to sharpen discussion and sense expert/community/model views, not to crown winners or frame guests as right versus wrong.
- Episode 01 is scheduled to record in November 2026 and publish in January 2027.

## 2026-08-30 — Contributor authentication

- Use **Sign in with LinkedIn using OpenID Connect** as the account login for written commentary.
- Request only the `openid`, `profile`, and `email` scopes; email is optional in LinkedIn's response and must not be assumed present.
- Describe signed-in members as **LinkedIn-authenticated**, not identity-verified. LinkedIn's own OIDC documentation says the product does not verify real-world identity and must not be marketed as doing so.
- A “verified industry contributor” label requires separate editorial review of professional details and industry standing before publication.
- Authentication is only one control. Moderation, rate limits, abuse prevention, consent/privacy updates, session security, and a publication workflow remain launch requirements.
- Implementation now enforces a pending-only moderation queue, explicit attribution consent, persistent per-member rate limits, seven-day opaque server-side sessions, same-origin CSRF protection, configured editor audit attribution, and self-service deletion of the member account and all submissions. Activation remains fail-closed until the LinkedIn application, persistent volume, and all required production secrets are configured.

## 2026-08-30 — Episode forecast mix and private question calls

- Follow the forecasting-system brief: each episode carries three forecasts—one structural, one operating, and one fast-resolving—with one presented as the headline forecast.
- Treat the eight current season questions as an early editorial question pool, not a one-question-per-episode assignment.
- YES/NO controls on unopened discovery cards save only a private browser-local call. They do not submit, publish, count, or create a community percentage.
