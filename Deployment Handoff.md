# MiGym App Builder — Deployment Handoff

**For:** Developers taking over production hosting
**Source repo contents:** static `index.html`, `api/submit.js`, `api/upload-blob.js`, `vercel.json`, `package.json`

This document explains **what lives only in the Vercel deployment** (not in the repo) and what the production environment needs. The prototype was deployed to Vercel because two pieces of functionality can't run from a pure static file — a form-submission endpoint and direct-to-blob uploads for large ZIPs. You can keep the same architecture or swap either piece for equivalents in your stack.

---

## 1. Architecture at a glance

The client (`index.html`) is a single self-contained static page. At submit time it does two things that require a backend:

1. **Uploads two client-generated ZIPs** — the browser bundles the user's uploaded assets (logos, tile images) and the generated app-store assets into ZIPs and uploads them directly to blob storage, bypassing any serverless function payload limits.
2. **Posts the form data** (text fields, color choices, tile layout JSON, a small preview PNG) to a submit endpoint that emails the enrollment to an internal recipient.

```
browser (index.html)
  │
  ├─ GET  /api/upload-blob     → returns a short-lived blob write token
  │  │
  │  └─ PUT https://blob.vercel-storage.com/<filename>   (direct upload, big files)
  │
  └─ POST /api/submit          → builds HTML email + attaches preview PNG
                                 → sends via Resend (prototype only — replace)
```

Everything else — live preview, color pickers, tile layout editor, PNG generation — runs entirely in the browser and needs nothing from the server.

---

## 2. What's in the repo vs. what's only in the deployment

| Concern | In repo | Only in deployment |
|---|---|---|
| Static page | `index.html` | — |
| Serverless functions | `api/submit.js`, `api/upload-blob.js` | Their runtime config (timeout, memory) is in `vercel.json` |
| Routing | `vercel.json` rewrites | — |
| Node dependencies | `package.json` (`resend` only) | `node_modules` — installed by Vercel at build time |
| Email delivery | Resend SDK call inside `submit.js` | **Resend API key** (env var) and a verified sender domain |
| Blob storage | `api/upload-blob.js` returns a token | **The Blob store itself** (provisioned in Vercel) and **its read/write token** (env var) |
| CORS origin | Reads `ALLOWED_ORIGIN` env var | The value of that env var (your prod hostname) |
| Recipient address | Reads `RECIPIENT_EMAIL` env var | The value of that env var |

The folder `.vercel/` in my local checkout is the CLI link file for my personal Vercel project. **Do not copy that folder** — run `vercel link` (or `vercel` from the project root) against your own team/project and a fresh one will be created.

---

## 3. Heads-up on `api/submit.js` (email delivery — replace this)

The submit endpoint currently uses [Resend](https://resend.com) because it was the fastest thing to wire up for a prototype. You'll almost certainly want to replace it. What `submit.js` actually needs to do is provider-agnostic:

1. Accept a POST with a JSON body containing form fields, a tile-layout array, a tile-layout-spans array, optional web-link and tile-image metadata, and a base64-encoded preview PNG. (See the `module.exports` handler and `buildEmailHtml()` for the exact shape — it's all validated server-side.)
2. Apply simple per-IP rate limiting (currently 5 submissions/min, in-memory — good enough for the traffic we expect, but note it resets when the serverless instance cold-starts).
3. Build an HTML email using the data and send it to an internal recipient with the preview PNG attached.
4. Return `{ success: true }` or a JSON error.

If you swap Resend for your own transactional email provider (SES, SendGrid, Mailgun, internal SMTP, etc.), the only things that change are the dependency in `package.json` and the `resend.emails.send(...)` call near the bottom of the handler. All validation, HTML building, and the response shape stay the same. The client doesn't care who delivers the email — it just reads `resp.ok` and shows a confirmation.

If you move the endpoint off Vercel entirely (say, to your own API gateway), update the two `fetch('/api/submit', ...)` / `fetch('/api/upload-blob', ...)` paths in `index.html` to point at your new URLs, and keep the CORS `Access-Control-Allow-Origin` header wired to your static site's origin.

---

## 4. Vercel Blob (keep or replace)

At submit time the browser builds two ZIPs on the fly — an "uploaded files" bundle (the logos and tile images the user uploaded into the builder) and an "app store assets" bundle (icons the builder generates from the user's logo). These can easily exceed Vercel's serverless function payload limit (~4.5 MB), so we upload them **directly from the browser** to Vercel Blob using a short-lived token.

How it works today:
- `GET /api/upload-blob` reads `process.env.BLOB_READ_WRITE_TOKEN` and returns it as JSON.
- The client `PUT`s the zip to `https://blob.vercel-storage.com/<filename>` with that token in the `Authorization` header.
- Blob responds with a permanent HTTPS URL; the client includes that URL in the `/api/submit` payload so the recipient email has download buttons.

If you keep Vercel Blob: just provision a Blob store in your Vercel project (Storage tab → Create → Blob). Vercel automatically adds `BLOB_READ_WRITE_TOKEN` to the project's env vars; no manual setup beyond that.

If you replace it (S3, GCS, Azure Blob, Cloudflare R2, etc.): the contract the client expects is tiny — the upload endpoint should return an object with a `token` field (or whatever you refactor to), and then the client needs a URL it can `PUT` the file to. Update `uploadToBlob()` in `index.html` (around line 7975) to match your provider's pre-signed URL flow. Presigned S3 URLs are probably the most direct analog.

**Important:** handing a write-scoped token to the browser is only acceptable because (a) it's short-lived on Vercel's side and (b) the endpoint is rate-limited (10 req/min per IP). If you move to a different provider, prefer **pre-signed PUT URLs scoped to a single object key** rather than a general write token. That's the safer pattern.

---

## 5. Environment variables (production)

Set these in the Vercel project (Settings → Environment Variables), or their equivalents on whatever host you use:

| Variable | Required | Purpose | Notes |
|---|---|---|---|
| `ALLOWED_ORIGIN` | **Yes** | CORS origin for both API endpoints | Set to your production URL, e.g. `https://migym.yourdomain.com`. Defaults to `*` in code — do not ship with `*`. |
| `RECIPIENT_EMAIL` | **Yes** | Where enrollment emails are delivered | Falls back to the prototyping address if unset; always set explicitly. |
| `FROM_EMAIL` | **Yes** (if using Resend) | Sender address on the outbound email | Falls back to Resend's sandbox `onboarding@resend.dev` if unset — fine for testing, not for prod. Replace if you swap providers. |
| `RESEND_API_KEY` | Only if keeping Resend | Auth for the email provider | Remove entirely if you swap providers. |
| `BLOB_READ_WRITE_TOKEN` | **Yes** (if keeping Vercel Blob) | Read/write token for the Blob store | Injected automatically when a Blob store is attached to the project — you don't set this by hand. |

Anything else your replacement email provider needs (e.g. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for SES, or a different blob provider's credentials) goes here too.

---

## 6. `vercel.json` settings worth knowing

```json
{
  "rewrites": [
    { "source": "/api/submit",       "destination": "/api/submit" },
    { "source": "/api/upload-blob",  "destination": "/api/upload-blob" }
  ],
  "functions": {
    "api/submit.js":      { "maxDuration": 60, "memory": 1024 },
    "api/upload-blob.js": { "maxDuration": 60, "memory": 1024 }
  }
}
```

The 60 s timeout and 1 GB memory are there because `submit.js` can handle a ~3 MB base64 preview image plus a long HTML email build. The rewrites are identity rewrites; they're kept so the function URLs don't change if someone later reshuffles the `api/` folder. If you move off Vercel, the functions config has a direct analog in most serverless platforms — make sure the equivalent timeout is high enough for the email-send round trip.

---

## 7. Setup checklist (fresh Vercel project)

If you're recreating on your own Vercel team rather than taking over mine, here's the short version:

1. Fork/clone the repo. Do not copy the `.vercel/` folder from my checkout — it points at my project.
2. `vercel link` to create/attach your own project. Framework preset: **Other** (no build step; it's a static file plus the `api/` folder).
3. Storage tab → **Create → Blob Store** → attach to this project. `BLOB_READ_WRITE_TOKEN` appears in env vars automatically.
4. Settings → Environment Variables → add `ALLOWED_ORIGIN`, `RECIPIENT_EMAIL`, and whichever provider credentials you're using. Scope them to Production (and Preview if you want test deploys to work too).
5. Replace `api/submit.js` (or just its Resend block) with your own provider. Drop `resend` from `package.json` if you're not using it.
6. Deploy. Smoke test: open the live URL, fill in the builder, submit. Check (a) the recipient inbox for the email + preview attachment, (b) the blob download links in that email actually resolve, (c) the CORS header on both endpoints matches your production origin.

---

## 8. Known limits / gotchas

- **In-memory rate limiter.** Both endpoints use a `Map` in module scope. That resets on cold start and doesn't coordinate across serverless instances, so the real limit is "5 per minute per IP per warm instance". Sufficient for expected traffic; if you ever need stricter guarantees, front it with Upstash Redis or your own KV store.
- **3 MB preview cap.** `MAX_PREVIEW_B64 = 4 * 1024 * 1024` in `submit.js` is the base64-inflated size — about 3 MB of actual PNG. If the client generates larger, the server rejects it. The client currently produces previews well under that; adjust together if you ever change the canvas resolution.
- **Tile whitelist.** `VALID_TILE_IDS` in `submit.js` must stay in sync with the tile IDs the client can emit. If you add a new tile type in `index.html`, add its ID here too or it'll be silently dropped on submission.
- **Sender domain.** Regardless of provider, production emails need to come from a domain you own and have configured DKIM/SPF for. The prototype's `onboarding@resend.dev` fallback is fine for a dev deploy but will land in spam in production.
- **Blob URLs are public.** Anyone with a blob URL can download the file. That's OK for our use case (the URL only goes to the internal recipient's inbox), but don't treat blob storage as a secure delivery channel for anything sensitive.

---

## 9. Summary — what each deployment piece needs

| Deployment piece | What to provision | How the client knows |
|---|---|---|
| Static hosting | Any static host (Vercel, Netlify, S3+CloudFront, your CDN) | Serves `index.html` at your production URL |
| `/api/submit` endpoint | Serverless function or API route running your email provider | Client `POST`s JSON to `/api/submit` — path is hardcoded, change it in `index.html` if you move it |
| `/api/upload-blob` endpoint | Serverless function or API route that returns a write token/URL for blob storage | Client `GET`s `/api/upload-blob` and expects `{ token }` — update the client if you change the response shape |
| Blob storage | Vercel Blob, S3, GCS, R2, etc. | Client `PUT`s directly to `https://blob.vercel-storage.com/<filename>` today — change this URL if you swap providers |
| Email provider | SES, SendGrid, Mailgun, SMTP, internal — whatever you normally use | `submit.js` is the only file that knows about the provider |
| Env vars | `ALLOWED_ORIGIN`, `RECIPIENT_EMAIL`, plus provider creds | Read via `process.env` in the two `api/*.js` files |

That's it — the repo is small on purpose. The deployment is where the secrets and the blob store live.
