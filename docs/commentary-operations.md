# LinkedIn commentary operations

## Status

The application code is production-ready but fail-closed. Written commentary activates only when `COMMENTARY_ENABLED=true` **and** every required secret, moderator identity, redirect, and persistent-data setting is present and valid. Until then, the homepage truthfully reports that commentary login is not active and `/auth/linkedin` returns `503`.

LinkedIn authentication proves control of a LinkedIn account. It does not establish real-world identity or industry standing. A `verifiedIndustry` label is a separate recorded editorial decision.

## LinkedIn application

1. Create a LinkedIn developer application owned by the appropriate organization.
2. Enable **Sign In with LinkedIn using OpenID Connect**.
3. Register this exact authorized redirect URL:
   `https://hollywoodevolves.mcpherson.app/auth/linkedin/callback`
4. Request only `openid profile email`.
5. Keep the client secret in the deployment secret store, never in this repository.

The server retrieves LinkedIn's discovery document, exchanges the authorization code server-side, verifies the ID-token RS256 signature, issuer, audience, expiration, issued-at age, and nonce, and then creates an opaque seven-day server-side session.

## Persistent storage and deployment

Run one application replica and attach a persistent volume at `/data`. The activation gate requires an explicit `COMMENTARY_DATA_PATH`; the expected production value is `/data/commentary.json`. The file is replaced atomically and written with mode `0600`.

Required environment variables:

```text
PUBLIC_ORIGIN=https://hollywoodevolves.mcpherson.app
COMMENTARY_ENABLED=true
COMMENTARY_SECRET=<at least 32 random characters>
COMMENTARY_ADMIN_TOKEN=<at least 32 random characters>
COMMENTARY_ADMIN_NAME=<stable editor name used in audit records>
COMMENTARY_DATA_PATH=/data/commentary.json
LINKEDIN_CLIENT_ID=<LinkedIn application client ID>
LINKEDIN_CLIENT_SECRET=<LinkedIn application client secret>
LINKEDIN_REDIRECT_URI=https://hollywoodevolves.mcpherson.app/auth/linkedin/callback
```

Generate independent secrets with a cryptographically secure generator, for example `openssl rand -base64 48`. Do not reuse either value elsewhere.

Before enabling:

- confirm the volume survives a redeploy;
- confirm the application is pinned to one replica;
- back up the commentary file to encrypted storage;
- run the full `npm test` gate;
- verify `/api/session` changes from `commentaryEnabled:false` to `true`;
- complete one real LinkedIn login, logout, and account-deletion canary;
- submit a canary perspective and confirm it is not public before approval;
- approve it, verify public attribution, then delete the canary account and verify the perspective disappears.

Rollback is `COMMENTARY_ENABLED=false`; this disables new login and submission without deleting stored records.

## Moderation

Admin routes require the bearer token and accept no browser session. If a request includes an `Origin` header, it must match `PUBLIC_ORIGIN`. The audit actor always comes from `COMMENTARY_ADMIN_NAME`; request bodies cannot forge it.

Create a temporary curl configuration so the bearer token is not exposed in the process command line:

```bash
read -rs COMMENTARY_ADMIN_TOKEN
AUTH_CONFIG=$(mktemp)
chmod 600 "$AUTH_CONFIG"
printf 'header = "Authorization: Bearer %s"\n' "$COMMENTARY_ADMIN_TOKEN" > "$AUTH_CONFIG"
unset COMMENTARY_ADMIN_TOKEN
trap 'rm -f "$AUTH_CONFIG"' EXIT
BASE=https://hollywoodevolves.mcpherson.app
```

List pending submissions:

```bash
curl --config "$AUTH_CONFIG" --fail --silent --show-error \
  "$BASE/api/admin/comments"
```

Approve or reject a pending item:

```bash
curl --config "$AUTH_CONFIG" --fail --silent --show-error \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"decision":"approved"}' \
  "$BASE/api/admin/comments/<comment-id>"

curl --config "$AUTH_CONFIG" --fail --silent --show-error \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"decision":"rejected","reason":"Off topic"}' \
  "$BASE/api/admin/comments/<comment-id>"
```

Grant or remove the separate verified-industry designation only after editorial review:

```bash
curl --config "$AUTH_CONFIG" --fail --silent --show-error \
  -X POST \
  -H 'Content-Type: application/json' \
  --data '{"memberSub":"<LinkedIn pairwise subject>","verified":true}' \
  "$BASE/api/admin/verification"
```

Never paste pending-submission output into public tickets or chat; the admin response can contain account email data for editorial contact.

## Privacy and deletion

Public comment responses contain only the approved text, dates, display name, and the separate verified-industry flag. They exclude email, LinkedIn subject identifiers, session material, and profile-image URLs.

The submission form records explicit consent to publish an approved perspective with the member's LinkedIn display name. A signed-in member can choose **Delete account and submissions**. After explicit confirmation, the service removes the member record, all sessions, every pending/rejected/approved submission, and PII-bearing audit entries; it retains only a keyed deletion receipt. This action cannot be undone.

Sessions expire after seven days. Account and submission records otherwise remain until member deletion or an editorial removal. Update the public privacy policy before changing these retention rules or collected LinkedIn scopes.
