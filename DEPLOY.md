# Deploying to Vercel

The code is on GitHub: https://github.com/dcdanny945/splitplay
All environment variable **values** live in your local `.env.local` (which is NOT in the repo).

> ⚠️ This file is in a public repo, so it contains **no keys**. Copy the values from your
> local `.env.local` when needed.

---

## Step 1 — Import & first deploy

1. Go to https://vercel.com/new → sign in with **GitHub** (dcdanny945)
2. Find **splitplay** → **Import**
3. Framework auto-detects as **Next.js** — leave the other settings as-is
4. Expand **Environment Variables** and add each of these (copy values from `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `GMAIL_USER`
   - `GMAIL_APP_PASSWORD`
   - `EMAIL_FROM`
   - `ADMIN_PASSWORD`
   - `ADMIN_SESSION_SECRET`
   - `CRON_SECRET`
   - *(leave `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_URL` for now)*
5. Click **Deploy** and wait 1–2 minutes
6. Note the deployed URL, e.g. `https://splitbball-sepia.vercel.app`

---

## Step 2 — Create the Stripe webhook

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://splitbball-sepia.vercel.app/api/webhook`
3. Select event: **`checkout.session.completed`** (only this one — do NOT pick the "Accounts v2" group, or the endpoint becomes incompatible)
4. Create, then reveal & copy the **Signing secret** (`whsec_...`)

---

## Step 3 — Add the last two env vars & redeploy

Vercel → project → **Settings → Environment Variables**, add:

- `STRIPE_WEBHOOK_SECRET` = the `whsec_...` from Step 2
- `NEXT_PUBLIC_URL` = `https://splitbball-sepia.vercel.app` (no trailing `/`)

Then **Deployments → latest → ⋯ → Redeploy** so the new variables take effect.

---

## Step 4 — Test on the live site

1. Open `https://splitbball-sepia.vercel.app`
2. Go to `/admin`, log in with `ADMIN_PASSWORD`, create an event
3. Test card (**test mode only**): `4242 4242 4242 4242`, any future expiry, any CVC
4. Confirm the person appears in the list and the payment shows in the Stripe Dashboard

---

## Email (Gmail SMTP)

Emails are sent through Gmail using an **App Password** — this can email any recipient
with no domain verification. Set:

- `GMAIL_USER` = the sending Gmail address
- `GMAIL_APP_PASSWORD` = a 16-character Google App Password (requires 2-Step Verification on that Google account)
- `EMAIL_FROM` = display name + address, e.g. `Bball Court Fee <you@gmail.com>`

---

## Auto-settlement (Cron)

`vercel.json` runs `/api/cron/settle` once a day (`0 11 * * *`, 11:00 UTC). Vercel automatically adds
`Authorization: Bearer $CRON_SECRET`, so `CRON_SECRET` must be set in Vercel. Split-mode
events are charged at the first daily run after their settlement time.

> Note: the free (Hobby) plan only allows one cron run per day, so the charge happens at
> the next daily check after the settlement time — not the exact minute.

---

## Going live (test → real payments)

To take real money:

1. Switch Stripe to **Live mode**, copy `sk_live_` / `pk_live_`, and update them in Vercel
2. Create the webhook again in **Live mode**, and update `STRIPE_WEBHOOK_SECRET`
3. Redeploy

*(Test cards like `4242...` only work in test mode; live mode requires a real card.)*

---

## Updating later

Push to `main` and Vercel auto-deploys:

```bash
git add -A
git commit -m "your change"
git push
```

If the GitHub → Vercel auto-deploy doesn't trigger, deploy from the CLI instead
(create a token at https://vercel.com/account/settings/tokens):

```bash
vercel deploy --prod --token=<your-token>
```

## Production domain change checklist

Production URL: `https://splitbball-sepia.vercel.app`.
These dashboard settings are outside Git; repository changes do not update them.
Apply production changes and redeploy only after approval.

### Vercel

- Confirm the production domain belongs to this project.
- Set **Production** `NEXT_PUBLIC_URL` to `https://splitbball-sepia.vercel.app`
  without a trailing slash. Keep local development at `http://localhost:3000`;
  review Preview overrides separately if they contain a previous production URL.
- A new build/deployment is required for the environment change to take effect.
  Do not deploy until approved. Changing the domain alone does not update this variable.
- Keep all existing keys and secrets. `NEXT_PUBLIC_SUPABASE_URL` is the Supabase
  project URL, not the application's Vercel URL.

### Stripe

- Edit the existing webhook destination to
  `https://splitbball-sepia.vercel.app/api/webhook`; keep the existing
  `checkout.session.completed` subscription and signing secret. Check the relevant
  test/live configuration separately. Do not recreate the endpoint or rotate secrets
  as part of this URL change, and do not rely on redirects from the previous hostname.
- Checkout success/cancel URLs are supplied by the application using `NEXT_PUBLIC_URL`,
  rather than configured as fixed Dashboard URLs. Registration returns to
  `/success?session_id={CHECKOUT_SESSION_ID}` (plus event details), or `/?cancelled=1`.
  Card updates return to `/update-card?done=1`, or `/update-card?token=...` on cancel.
  Existing Checkout sessions retain the URLs they were created with.
- There is no Customer Portal API integration or `return_url` in this repository;
  card updates use Checkout setup sessions. If a portal is separately enabled in
  Stripe, inspect its default return URL and replace the previous hostname with
  `https://splitbball-sepia.vercel.app`, preserving any intended path/query.

### Supabase

- This application uses a server-side service-role database client and its own
  password/cookie admin login. It does not call Supabase Auth or define auth callbacks.
- If Supabase Auth is used separately, inspect **Authentication → URL Configuration**:
  update the Site URL and any redirect allowlist entries that use the previous hostname.
  Preserve required callback paths and local-development entries; do not invent a new
  `/auth/callback` route for this application. Review custom auth email templates for
  hardcoded links if any are configured. No database or API-key changes are required.

### cron-job.org and Vercel Cron

- If an external cron-job.org job is configured, edit its URL to
  `https://splitbball-sepia.vercel.app/api/cron/settle`. Preserve its GET method,
  schedule, and `Authorization: Bearer <existing CRON_SECRET>` header.
  Its configuration is not stored in this repository.
- The built-in Vercel Cron uses the relative `/api/cron/settle` path in `vercel.json`,
  so no hostname change is needed there. Its existing schedule is `0 11 * * *`.
- Review whether both schedulers are enabled to avoid overlapping settlement runs.
  Do not trigger this endpoint as a connectivity test: it can charge saved cards.

### Repository audit

The latest main branch already updated the README live URL. No previous production
hostname remains in tracked files. Remaining deployment examples now use the current
hostname; the local environment template keeps localhost and identifies the production
value in a comment.

`NEXT_PUBLIC_URL` controls Checkout redirects (`app/api/register/route.ts`,
`app/api/update-card/route.ts`), email withdraw/card-update links (`lib/db.ts`,
`app/api/webhook/route.ts`, `app/api/events/[id]/merge/route.ts`), and social metadata
(`app/layout.tsx`). Request routes fall back to the request origin; background email
paths fall back to an empty prefix, so the production variable must be set correctly.
Existing emails retain their original links; this change cannot rewrite sent messages.
Keep runtime URL selection unchanged to preserve local and preview behavior.

Configuration references:
[Vercel environment variables](https://vercel.com/docs/environment-variables),
[Stripe webhook redirects](https://support.stripe.com/questions/webhooks-what-to-do-when-the-http-status-code-starts-with-a-three-%283xx%29),
[Stripe portal return URL](https://docs.stripe.com/api/customer_portal/configurations/create),
[Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
