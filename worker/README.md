# petid-apply — partner application endpoint

The PetID app is a static export served from IPFS, so it has no origin to POST
to. This worker receives partner applications from `/partner/`, writes each one
to KV, and (optionally) emails a notification.

Applications are stored **before** email is attempted, so a mail outage costs a
notification, not a lead.

## Deploy

```bash
cd worker
npm install

# 1. KV namespace — paste the returned id into wrangler.toml
npx wrangler kv namespace create APPLICATIONS

# 2. Token for reading applications back (pick something long and random)
npx wrangler secret put ADMIN_TOKEN

# 3. Optional: email notifications via Resend. Skip this and the worker still
#    accepts applications — you just read them with the GET below instead.
npx wrangler secret put RESEND_API_KEY

npx wrangler deploy
```

Then put the deployed URL in the app's `.env.local` and rebuild:

```
NEXT_PUBLIC_PARTNER_APPLY_URL=https://petid-apply.<subdomain>.workers.dev
```

Without that variable the partner form falls back to a prefilled `mailto:` plus a
copyable text block, so the page is never a dead end — but nothing reaches KV.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/` | Submit an application. JSON body, CORS-restricted to `ALLOWED_ORIGINS`. |
| `GET` | `/applications` | Read the last 200 applications. Requires `Authorization: Bearer $ADMIN_TOKEN`. |

```bash
# Read what's come in
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://petid-apply.<subdomain>.workers.dev/applications | jq
```

## Notes

- `ALLOWED_ORIGINS` in `wrangler.toml` is a comma-separated list. The app is
  served from several hosts (`petid.eth.link`, `.eth.limo`, IPFS gateways, and
  partner iframes) — add hosts there rather than switching to `*`.
- `NOTIFY_FROM` must be a **verified sender** on the Resend account or mail is
  rejected. The applicant's address is set as `reply_to`, so replying from the
  notification reaches them directly. It currently reads
  `PetID <petid@onchain-id.id>` — if `onchain-id.id` isn't the domain verified on
  the Resend account, change the var and redeploy, or every send 403s.
- **A failed send is stamped onto the record** as `notifyError`, so
  `GET /applications` shows which leads were never emailed. The application
  itself is never lost either way. Check for it after changing anything about the
  sender:
  ```bash
  curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    https://petid-apply.<subdomain>.workers.dev/applications \
    | jq '.applications[] | select(.notifyError) | {businessName, notifyError}'
  ```
- The KV key is `app:<YYYY-MM-DD>:<wallet>`, so a resubmission on the same day
  overwrites rather than piling up.
- **No rate limiting.** CORS is not authentication — it stops a browser on
  another origin from *reading* the response, not from POSTing. The per-wallet
  key bounds how much one address can write, but nothing stops a script from
  rotating addresses and filling KV with junk applications. Acceptable for a
  form nobody knows about yet; if it ever gets found, the cheap fixes are a
  Turnstile token or an IP-keyed counter in the same namespace. Watch the KV
  key count as the early-warning signal.
- Approving a partner is a separate on-chain step: call the registrar's
  wholesaler allowlist for the wallet on the application. Until then the
  applicant sees "application received" on `/partner/`.
