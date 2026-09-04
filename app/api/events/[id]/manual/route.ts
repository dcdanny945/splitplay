import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getConfirmedCount, getNextPosition, type EventRow } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { calcCharge } from "@/lib/pricing";
import { sendConfirmationEmail } from "@/lib/email";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// POST /api/events/:id/manual  (admin)
// Manually add a participant who already paid out-of-band (e.g. bank transfer).
// Marks them as "charged" and adds them to the list. Sends a confirmation email
// only if a valid email is supplied.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { name, email } = await req.json().catch(() => ({}));
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", id).single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const ev = event as EventRow;

  const confirmedCount = await getConfirmedCount(id);
  const listType = confirmedCount < ev.max_participants ? "confirmed" : "waitlist";
  const position = await getNextPosition(id, listType);

  const divisor = ev.payment_mode === "fixed" ? ev.max_participants : Math.max(1, confirmedCount + 1);
  const { charge } = calcCharge(Number(ev.total_cost), divisor);

  const cleanName = String(name).trim();
  const cleanEmail = typeof email === "string" && EMAIL_RE.test(email.trim()) ? email.trim() : "";

  const { data: inserted, error } = await supabaseAdmin
    .from("participants")
    .insert({
      event_id: id,
      name: cleanName,
      email: cleanEmail,
      list_type: listType,
      position,
      charge_status: "charged",
      amount_charged: charge,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (cleanEmail) {
    const sent = await sendConfirmationEmail({
      to: cleanEmail,
      name: cleanName,
      eventName: ev.name,
      amount: charge,
      date: ev.event_date,
      location: ev.location,
      mode: ev.payment_mode,
    });
    if (sent) await supabaseAdmin.from("participants").update({ email_sent: true }).eq("id", inserted.id);
  }

  return NextResponse.json({ ok: true, listType });
}

// PATCH /api/events/:id/manual  { participantId, paid }  (admin)
// Marks someone who's already on the list as paid off-platform — they sent a
// bank transfer instead of waiting for the card charge. settleEvent skips
// anyone already "charged" but still counts them in the headcount, so the split
// stays correct. Pass paid:false to undo a mistake.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { participantId, paid } = await req.json().catch(() => ({}));
  if (!participantId) return NextResponse.json({ error: "Missing participantId" }, { status: 400 });

  const { data: participant } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .eq("event_id", id)
    .single();
  if (!participant) return NextResponse.json({ error: "Participant not found on this event" }, { status: 404 });
  const p = participant as {
    id: string;
    charge_status: string;
    stripe_payment_intent_id: string | null;
  };

  // ----- Undo -----
  if (paid === false) {
    if (p.stripe_payment_intent_id) {
      return NextResponse.json(
        { error: "This person was charged through Stripe — refund them in Stripe instead of clearing the status." },
        { status: 400 }
      );
    }
    const { error } = await supabaseAdmin
      .from("participants")
      .update({ charge_status: "pending", amount_charged: null })
      .eq("id", participantId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, chargeStatus: "pending" });
  }

  // ----- Mark paid -----
  if (p.charge_status === "charged") {
    return NextResponse.json({ error: "This person is already marked as paid." }, { status: 400 });
  }

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", id).single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const ev = event as EventRow;

  // Best estimate of their share right now. For a split event the final amount
  // isn't settled until the cutoff, so this is a record of what they owed at
  // the time, not a promise.
  const confirmedCount = await getConfirmedCount(id);
  const divisor = ev.payment_mode === "fixed" ? ev.max_participants : Math.max(1, confirmedCount);
  const { charge } = calcCharge(Number(ev.total_cost), divisor);

  const { error } = await supabaseAdmin
    .from("participants")
    .update({ charge_status: "charged", amount_charged: charge })
    .eq("id", participantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, chargeStatus: "charged", amountCharged: charge });
}
