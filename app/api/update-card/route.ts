import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin, makeUpdateCardToken, verifyUpdateCardToken } from "@/lib/auth";
import { melbourneLabel } from "@/lib/time";

// Swapping the saved card. Registration stores one specific payment method id
// per participant and settlement charges exactly that (see chargeParticipant in
// lib/db.ts), so a new card has to be written back onto the row — adding one in
// Stripe alone changes nothing. Withdrawing and re-registering would work too,
// but on a full event the freed spot goes straight to the waitlist.

type ParticipantRow = {
  id: string;
  event_id: string | null;
  name: string | null;
  email: string | null;
  charge_status: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
};

async function loadRegistration(pid: string) {
  const { data: p } = await supabaseAdmin.from("participants").select("*").eq("id", pid).single();
  if (!p) return null;
  const { data: ev } = await supabaseAdmin.from("events").select("*").eq("id", (p as ParticipantRow).event_id).single();
  return { p: p as ParticipantRow, ev };
}

/** Card brand/last4 for display. Never fatal — the page works without it. */
async function describeCard(pmId: string | null) {
  if (!pmId) return null;
  try {
    const pm = await stripe.paymentMethods.retrieve(pmId);
    if (!pm.card) return null;
    return { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
  } catch (err) {
    console.error("[update-card] could not read payment method:", err);
    return null;
  }
}

// GET /api/update-card?token=...  — what the page needs, no changes made.
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const pid = verifyUpdateCardToken(token);
  if (!pid) return NextResponse.json({ ok: false, error: "Invalid or expired link" }, { status: 400 });

  const reg = await loadRegistration(pid);
  if (!reg) {
    return NextResponse.json(
      { ok: false, error: "Registration not found — you may have already withdrawn." },
      { status: 404 }
    );
  }
  const { p, ev } = reg;

  const settlementPassed = ev?.settlement_time ? new Date(ev.settlement_time).getTime() <= Date.now() : false;
  const alreadyCharged = p.charge_status === "charged";

  return NextResponse.json({
    ok: true,
    name: p.name,
    eventName: ev?.name ?? "",
    eventDate: ev?.event_date ?? null,
    settlementLabel: ev?.settlement_time ? `${melbourneLabel(ev.settlement_time)} (Melbourne)` : null,
    card: await describeCard(p.stripe_payment_method_id),
    canUpdate: !settlementPassed && !alreadyCharged,
    reason: alreadyCharged
      ? "This registration has already been charged, so there's nothing left to update."
      : settlementPassed
        ? "The settlement time has passed for this event."
        : null,
  });
}

// POST /api/update-card  { token } -> Stripe Checkout URL for saving a new card.
export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  const pid = verifyUpdateCardToken(token);
  if (!pid) return NextResponse.json({ error: "Invalid link" }, { status: 400 });

  const reg = await loadRegistration(pid);
  if (!reg) return NextResponse.json({ error: "Registration not found" }, { status: 404 });
  const { p, ev } = reg;

  if (p.charge_status === "charged") {
    return NextResponse.json({ error: "This registration has already been charged." }, { status: 400 });
  }
  if (ev?.settlement_time && new Date(ev.settlement_time).getTime() <= Date.now()) {
    return NextResponse.json({ error: "The settlement time has passed for this event." }, { status: 400 });
  }
  if (!p.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer on this registration." }, { status: 400 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: p.stripe_customer_id,
      payment_method_types: ["card"],
      success_url: `${baseUrl}/update-card?done=1`,
      cancel_url: `${baseUrl}/update-card?token=${encodeURIComponent(String(token))}`,
      // purpose keeps the webhook from treating this as a fresh registration.
      metadata: {
        purpose: "update_card",
        participant_id: p.id,
        event_id: p.event_id ?? "",
      },
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not start checkout";
    console.error("[update-card] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// PUT /api/update-card  { participantId } -> the personal link, for the admin
// UI. People who registered before this feature existed have no link in their
// email, so the organiser needs a way to hand them one.
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { participantId } = await req.json().catch(() => ({}));
  if (!participantId) return NextResponse.json({ error: "Missing participantId" }, { status: 400 });

  const { data: p } = await supabaseAdmin.from("participants").select("id").eq("id", participantId).single();
  if (!p) return NextResponse.json({ error: "Registration not found" }, { status: 404 });

  const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;
  return NextResponse.json({ url: `${baseUrl}/update-card?token=${makeUpdateCardToken(participantId)}` });
}
