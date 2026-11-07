# StoryStamper

Screenshot a social media post → StoryStamper checks it against current, reputable sources
(Gemini + Google Search) → you get a verdict stamped onto the image to share.

```
worker/   Cloudflare Worker: website, API, accounts (D1), AI fact-checking
ios/      Native SwiftUI iPhone app + Share extension (see ios/README.md for TestFlight)
```

---

## How it fits together

| Piece | What it does |
|---|---|
| **Website** (`/`, `/login`) | Served by the worker. Email + password accounts. |
| **iPhone app** | Email + password **or** Sign in with Apple. "Share → StoryStamper" from Photos. |
| **Accounts** | Cloudflare D1 database (`worker/migrations`). Invite code needed to sign up. |
| **Fact-check** | `POST /api/check`. `gemini-3.8-flash` with Google Search grounding, falls back to `gemini-3.6-flash`. |
| **Limits** | `DAILY_CHECK_LIMIT` checks per user per UTC day (default 25). |

---

## Backend setup (one time)

You need: Cloudflare account, Node 20+, a Gemini API key from https://aistudio.google.com/apikey

```bash
cd worker
npm install

# 1. Log in to Cloudflare
npx wrangler login

# 2. Create the accounts database, then paste the printed database_id
#    into wrangler.toml (replace REPLACE_WITH_YOUR_D1_DATABASE_ID)
npx wrangler d1 create storystamper

# 3. Create the tables
npm run db:migrate:remote

# 4. Secrets
npx wrangler secret put GEMINI_API_KEY      # paste your Gemini key
openssl rand -hex 32                        # copy the output...
npx wrangler secret put ADMIN_TOKEN         # ...and paste it here. Keep it somewhere safe.

# 5. Deploy
npm run deploy
```

Check it's alive: open `https://<your-worker>.workers.dev/api/health`.
You should see `"hasApiKey": true, "hasDatabase": true`.

> The old beta PIN is gone. Anyone using the old site has to create an account.

### Settings in `worker/wrangler.toml`

| Var | Default | Meaning |
|---|---|---|
| `GEMINI_MODEL` | `gemini-3.8-flash` | AI model. Check https://aistudio.google.com/docs/deprecations before it's retired. |
| `DAILY_CHECK_LIMIT` | `25` | Checks per user per day |
| `INVITE_REQUIRED` | `true` | Set `false` to allow open sign-up |
| `APPLE_BUNDLE_ID` | `com.storystamper.app` | Must match the iOS app's bundle ID |
| `SUPPORT_EMAIL` | empty | Shown on `/support` (App Store Connect needs a support URL) |

---

## Invite codes

Create codes (replace the URL and token):

```bash
curl -X POST https://storystamper.ryan-b00.workers.dev/api/admin/invites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"count": 5, "maxUses": 1, "note": "family"}'
```

- `count`: how many codes (max 100). `maxUses`: how many accounts each code can create.
- One shared code for a group: `{"count": 1, "maxUses": 50, "note": "church group"}`
- List codes and usage: same URL with `GET` (drop `-X POST` and `-d`).
- Share link that pre-fills the code: `https://<your-worker>/login?invite=STAMP-XXXX-XXXX`

---

## Local development

```bash
cd worker
printf 'GEMINI_API_KEY=your-key\nADMIN_TOKEN=dev-token\n' > .dev.vars
npm run db:migrate:local
npm run dev            # http://localhost:8787
npm test               # Sign in with Apple unit tests
```

---

## API (used by the iOS app)

All requests from the app send `X-Client: ios` and `Authorization: Bearer <token>`.

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email, password, inviteCode}` | returns `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` | returns `{token, user}` |
| POST | `/api/auth/apple` | `{identityToken, nonce, authorizationCode?, name?, inviteCode?}` | `403 code=invite_required` for new users with no code |
| POST | `/api/auth/logout` | | |
| GET | `/api/me` | | user and today's usage |
| DELETE | `/api/account` | | deletes everything (App Store requirement) |
| POST | `/api/check` | multipart `image` | `{verdict, reasons, claimSummary, sources, usage}`; `429 code=daily_limit` |

---

## Costs

- **Gemini**: a few tenths of a cent per check, plus Google Search grounding fees past the free daily allowance (https://ai.google.dev/pricing). The daily limit caps the worst case at users × limit.
- **Workers, D1**: free tiers cover a beta easily.
- **Apple Developer Program**: $99/year (needed for TestFlight).

---

## TODO

- [ ] Password reset (needs an email provider, e.g. Resend or Postmark)
- [ ] Crisp 1024px app icon (current one is upscaled from 512px)
- [ ] Check history
- [ ] QR code / link on the stamp
