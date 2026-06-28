import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { chargeFixedPending, getNextWaitlistId, notifyPromotedWaitlister } from "@/lib/db";
import { isAdmin, verifyWithdrawToken } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { melbourneLabel } from "@/lib/time";

// GET /api/withdraw?token=...
// Returns registration info for the withdraw page (no changes made).
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const pid = verifyWithdrawToken(token);
  if (!pid) return NextResponse.json({ ok: false, error: "Invalid or expired link" }, { status: 400 });

  const { data: p } = await supabaseAdmin.from("participants").select("*").eq("id", pid).single();
  if (!p) return NextResponse.json({ ok: false, error: "Registration not found — you may have already withdrawn." }, { status: 404 });

  const { data: ev } = await supabaseAdmin.from("events").select("*").eq("id", p.event_id).single();
  const settlementPassed = ev?.settlement_time ? new Date(ev.settlement_time).getTime() <= Date.now() : false;

  return NextResponse.json({
    ok: true,
    name: p.name,
    eventName: ev?.name ?? "",
    eventDate: ev?.event_date ?? null,
    settlementLabel: ev?.settlement_time ? `${melbourneLabel(ev.settlement_time)} (Melbourne)` : null,
    canWithdraw: !settlementPassed,
  });
}

// POST /api/withdraw
//  - { token }          -> self-withdraw via emailed link (enforces cutoff, refunds if charged)
//  - { participantId }  -> admin removal (requires admin cookie)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // ----- Self-withdraw via emailed token -----
  if (body.token) {
    const pid = verifyWithdrawToken(body.token);
    if (!pid) return NextResponse.json({ error: "Invalid link" }, { status: 400 });

    const { data: p } = await supabaseAdmin.from("participants").select("*").eq("id", pid).single();
    if (!p) return NextResponse.json({ error: "You've already withdrawn." }, { status: 404 });

    const { data: ev } = await supabaseAdmin.from("events").select("*").eq("id", p.event_id).single();
    const settlementPassed = ev?.settlement_time ? new Date(ev.settlement_time).getTime() <= Date.now() : false;
    if (settlementPassed) {
      return NextResponse.json({ error: "Withdrawals have closed — settlement time has passed." }, { status: 400 });
    }

    // If already charged (edge case), refund.
    if (p.charge_status === "charged" && p.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({ payment_intent: p.stripe_payment_intent_id });
      } catch (e) {
        console.error("[withdraw] refund failed:", e);
      }
    }

    const candidate = p.event_id ? await getNextWaitlistId(p.event_id) : null;
    const { error } = await supabaseAdmin.from("participants").delete().eq("id", pid);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // DB trigger promotes the next waitlister; charge promoted fixed-mode people,
    // and email promoted split-mode people that they've moved up.
    if (p.event_id) {
      await chargeFixedPending(p.event_id);
      await notifyPromotedWaitlister(p.event_id, candidate);
    }

    return NextResponse.json({ ok: true, eventName: ev?.name ?? "" });
  }

  // ----- Admin removal by participant id -----
  const { participantId } = body;
  if (!participantId) return NextResponse.json({ error: "Missing participantId or token" }, { status: 400 });
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: p } = await supabaseAdmin.from("participants").select("event_id").eq("id", participantId).single();
  const eventId = p?.event_id as string | undefined;

  const candidate = eventId ? await getNextWaitlistId(eventId) : null;
  const { error } = await supabaseAdmin.from("participants").delete().eq("id", participantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (eventId) {
    await chargeFixedPending(eventId);
    await notifyPromotedWaitlister(eventId, candidate);
  }
  return NextResponse.json({ ok: true });
}
