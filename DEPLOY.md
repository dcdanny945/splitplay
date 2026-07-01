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
6. Note the deployed URL, e.g. `https://splitplay-xxxx.vercel.app`

---

## Step 2 — Create the Stripe webhook

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**
2. Endpoint URL: `https://<your-vercel-url>/api/webhook`
3. Select event: **`checkout.session.completed`** (only this one — do NOT pick the "Accounts v2" group, or the endpoint becomes incompatible)
4. Create, then reveal & copy the **Signing secret** (`whsec_...`)

---

## Step 3 — Add the last two env vars & redeploy

Vercel → project → **Settings → Environment Variables**, add:

- `STRIPE_WEBHOOK_SECRET` = the `whsec_...` from Step 2
- `NEXT_PUBLIC_URL` = `https://<your-vercel-url>` (no trailing `/`)

Then **Deployments → latest → ⋯ → Redeploy** so the new variables take effect.

---

## Step 4 — Test on the live site

1. Open `https://<your-vercel-url>`
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

`vercel.json` runs `/api/cron/settle` once a day (`0 10 * * *`). Vercel automatically adds
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
