# Bball Court Fee

Event registration with automatic cost-splitting and Stripe auto-charge.
Built with **Next.js 16 + Supabase + Stripe + Gmail (SMTP)**.

Live: https://splitplay-sepia.vercel.app

## Quick start

```bash
npm install
npm run dev      # local dev at http://localhost:3000
npm run build    # production build
```

Fill in `.env.local` first (see below), and run `schema.sql` in the Supabase SQL Editor.

## Two payment modes

- **Split** — registrants save a card at sign-up (no charge yet). At the settlement
  time (a weekday + time you choose, in Melbourne), the total is split evenly across
  everyone registered and each card is charged. Registrants can withdraw before
  settlement via a personal link in their email; a capped waitlist automatically
  backfills any spot that opens up or whose charge fails.
- **Pay-now** — registrants are charged immediately at sign-up (total ÷ max spots).

Each event can be switched between modes from the admin dashboard.

## Key features

- **Admin dashboard** (single-password login): create / edit / cancel / delete events;
  adjust cost, max participants, waitlist size, charge day/time, visibility and a note.
- **Emails via Gmail**: registration confirmation (with a personal withdraw link),
  waitlist notice, promotion notice, payment confirmation, failed-charge notice, and
  cancellation notice.
- **Auto-settlement** via a daily Vercel Cron job.
- **Manual "confirm paid participant"** for people who pay by bank transfer.
- **Cancel event** — emails everyone, removes saved cards (no one is charged) and hides
  the event from registrants immediately.
- Settled events stay visible to registrants until the event date passes; the admin keeps
  everything until deleted.

## Project layout

| Path | What it is |
|------|-----------|
| `schema.sql` | Supabase tables (run in the SQL Editor) |
| `.env.local` | Environment variables (gitignored) |
| `vercel.json` | Vercel Cron config (daily settlement check) |
| `lib/` | pricing, Supabase/Stripe clients, Gmail email, admin auth, Melbourne-time helpers, settlement logic |
| `app/api/` | Backend routes (events / register / webhook / withdraw / cancel / cron / admin) |
| `app/page.tsx` | Registrant page |
| `app/admin/` | Admin dashboard |
| `app/withdraw/` | Self-service withdraw page |
| `app/components/ui.tsx` | Shared UI components |

## Environment variables

See `.env.local.example`. You'll need:

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
- **Stripe:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Email (Gmail):** `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `EMAIL_FROM`
- **Admin / app:** `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_URL`

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for the full Vercel + Stripe webhook setup.
