# LinkedIn commentary operations

## Status

Comments share the sign-in, sessions, and Postgres database used for forecasting. Set those up first with [`forecasting-operations.md`](forecasting-operations.md). Public comment routes then open only when `COMMENTARY_ENABLED=true` as well; admin moderation stays available either way. Rollback is `COMMENTARY_ENABLED=false`, which closes submission and the public list without deleting anything.

LinkedIn authentication proves control of a LinkedIn account. It does not establish real-world identity or industry standing. A `verifiedIndustry` label is a separate recorded editorial decision.

Comments are tied to the account that wrote them. They are published with the member's name only after moderation and only if the member consented when submitting. Members may submit at most three comments per hour.

Before enabling comments:

- run the full `npm test` gate;
- verify `/api/session` reports `commentaryEnabled: true` for a signed-in member;
- submit a canary comment and confirm it is not public before approval;
- approve it, verify the public attribution, then delete the canary account and confirm the comment disappears.

## Moderation

Admin routes require `ADMIN_TOKEN` as a bearer token and accept no browser session. If a request includes an `Origin` header, it must match `PUBLIC_ORIGIN`. The audit actor always comes from `ADMIN_NAME`; request bodies cannot forge it.

Create a temporary curl configuration so the token never appears on a command line or in shell history:

```bash
read -rs ADMIN_TOKEN
AUTH_CONFIG=$(mktemp)
chmod 600 "$AUTH_CONFIG"
printf 'header = "Authorization: Bearer %s"\n' "$ADMIN_TOKEN" > "$AUTH_CONFIG"
unset ADMIN_TOKEN
trap 'rm -f "$AUTH_CONFIG"' EXIT
BASE=https://hollywoodevolves.mcpherson.app
```

List pending submissions:

```bash
curl --config "$AUTH_CONFIG" --fail --silent --show-error "$BASE/api/admin/comments"
```

Approve or reject a pending item:

```bash
curl --config "$AUTH_CONFIG" --fail --silent --show-error -X POST -H 'Content-Type: application/json' \
  --data '{"decision":"approved"}' "$BASE/api/admin/comments/<comment-id>"

curl --config "$AUTH_CONFIG" --fail --silent --show-error -X POST -H 'Content-Type: application/json' \
  --data '{"decision":"rejected","reason":"Off topic"}' "$BASE/api/admin/comments/<comment-id>"
```

Grant or remove the verified-industry designation only after editorial review:

```bash
curl --config "$AUTH_CONFIG" --fail --silent --show-error -X POST -H 'Content-Type: application/json' \
  --data '{"memberSub":"<LinkedIn pairwise subject>","verified":true}' "$BASE/api/admin/verification"
```

Never paste pending-submission output into public tickets or chat; admin responses can contain member email addresses for editorial contact.

## Privacy and deletion

Public comment responses contain only the approved text, dates, display name, and the verified-industry flag. They exclude email, LinkedIn identifiers, and session material; profile photos are not stored.

A signed-in member can delete their account from the homepage. That removes the member record, all sessions, and every pending, rejected, or approved comment. Their forecasts remain under a pseudonymous code without their name or email (see the privacy page). The action cannot be undone. Update the public privacy page before changing retention rules or requested LinkedIn scopes.
