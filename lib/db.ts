import { supabaseAdmin } from "./supabase";
import { stripe } from "./stripe";
import { calcCharge, type PaymentMode } from "./pricing";
import { sendConfirmationEmail } from "./email";

// ---------- Row types ----------
export type EventRow = {
  id: string;
  name: string;
  event_date: string | null;
  time_label: string | null;
  location: string | null;
  description: string | null;
  total_cost: number | string;
  max_participants: number;
  payment_mode: PaymentMode;
  settlement_time: string | null;
  status: "open" | "settled" | "cancelled";
  visible: boolean;
  created_at: string;
};

export type ParticipantRow = {
  id: string;
  event_id: string;
  name: string;
  email: string;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  list_type: "confirmed" | "waitlist";
  position: number;
  registered_at: string;
  charge_status: "pending" | "charged" | "failed";
  stripe_payment_intent_id: string | null;
  amount_charged: number | string | null;
  email_sent: boolean;
};

// ---------- Small query helpers ----------
export async function getConfirmedCount(eventId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("list_type", "confirmed");
  return count ?? 0;
}

export async function getNextPosition(eventId: string, listType: "confirmed" | "waitlist"): Promise<number> {
  const { data } = await supabaseAdmin
    .from("participants")
    .select("position")
    .eq("event_id", eventId)
    .eq("list_type", listType)
    .order("position", { ascending: false })
    .limit(1);
  return (data?.[0]?.position ?? 0) + 1;
}

// ---------- Serialization for the frontend ----------
function serializeParticipant(p: ParticipantRow, admin: boolean) {
  return {
    id: p.id,
    name: p.name,
    joinedAt: p.registered_at,
    paid: p.charge_status === "charged",
    // Admin-only details:
    email: admin ? p.email : undefined,
    chargeStatus: admin ? p.charge_status : undefined,
    amountCharged: admin && p.amount_charged != null ? Number(p.amount_charged) : undefined,
  };
}

export function serializeEvent(event: EventRow, participants: ParticipantRow[], admin: boolean) {
  const confirmed = participants
    .filter((p) => p.list_type === "confirmed")
    .sort((a, b) => a.position - b.position);
  const waitlist = participants
    .filter((p) => p.list_type === "waitlist")
    .sort((a, b) => a.position - b.position);
  return {
    id: event.id,
    name: event.name,
    date: event.event_date,
    timeLabel: event.time_label,
    location: event.location,
    description: event.description,
    totalCost: Number(event.total_cost),
    maxParticipants: event.max_participants,
    paymentMode: event.payment_mode,
    cutoffTime: event.settlement_time,
    status: event.status,
    visible: event.visible,
    participants: confirmed.map((p) => serializeParticipant(p, admin)),
    waitlist: waitlist.map((p) => serializeParticipant(p, admin)),
  };
}

// ---------- Charging ----------
async function chargeParticipant(
  event: EventRow,
  p: ParticipantRow,
  chargeCents: number,
  charge: number,
  mode: PaymentMode
): Promise<"charged" | "failed"> {
  if (!p.stripe_customer_id || !p.stripe_payment_method_id) {
    // No saved card -> can't charge off-session. Leave for admin follow-up.
    await supabaseAdmin.from("participants").update({ charge_status: "failed" }).eq("id", p.id);
    return "failed";
  }
  try {
    const pi = await stripe.paymentIntents.create({
      amount: chargeCents,
      currency: "aud",
      customer: p.stripe_customer_id,
      payment_method: p.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      description: `${event.name} - ${mode === "fixed" ? "registration" : "split payment"}`,
    });
    await supabaseAdmin
      .from("participants")
      .update({ charge_status: "charged", stripe_payment_intent_id: pi.id, amount_charged: charge })
      .eq("id", p.id);

    const sent = await sendConfirmationEmail({
      to: p.email,
      name: p.name,
      eventName: event.name,
      amount: charge,
      date: event.event_date,
      location: event.location,
      mode,
    });
    if (sent) {
      await supabaseAdmin.from("participants").update({ email_sent: true }).eq("id", p.id);
    }
    return "charged";
  } catch (err) {
    console.error(`[charge] failed for participant ${p.id}:`, err);
    await supabaseAdmin.from("participants").update({ charge_status: "failed" }).eq("id", p.id);
    return "failed";
  }
}

/**
 * Settle a SPLIT event: charge every confirmed participant their share, then
 * mark the event settled. Idempotent-ish — already-charged people are skipped.
 */
export async function settleEvent(event: EventRow): Promise<{ charged: number; failed: number }> {
  const { data } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("event_id", event.id)
    .eq("list_type", "confirmed")
    .order("position", { ascending: true });
  const confirmed = (data ?? []) as ParticipantRow[];

  let charged = 0;
  let failed = 0;

  if (confirmed.length > 0) {
    const { chargeCents, charge } = calcCharge(Number(event.total_cost), confirmed.length);
    for (const p of confirmed) {
      if (p.charge_status === "charged") {
        charged++;
        continue;
      }
      const result = await chargeParticipant(event, p, chargeCents, charge, "split");
      if (result === "charged") charged++;
      else failed++;
    }
  }

  await supabaseAdmin.from("events").update({ status: "settled" }).eq("id", event.id);
  return { charged, failed };
}

/**
 * For FIXED events: charge any confirmed participant who has a saved card but is
 * still pending (e.g. a waitlister who just got promoted into an open spot).
 */
export async function chargeFixedPending(eventId: string): Promise<void> {
  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", eventId).single();
  if (!event || (event as EventRow).payment_mode !== "fixed") return;
  const ev = event as EventRow;

  const { data } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .eq("list_type", "confirmed")
    .eq("charge_status", "pending");
  const pending = (data ?? []) as ParticipantRow[];
  if (pending.length === 0) return;

  const { chargeCents, charge } = calcCharge(Number(ev.total_cost), ev.max_participants);
  for (const p of pending) {
    if (!p.stripe_customer_id || !p.stripe_payment_method_id) continue; // leave pending
    await chargeParticipant(ev, p, chargeCents, charge, "fixed");
  }
}

/**
 * Promote waitlisters into newly opened confirmed slots (used after an admin
 * raises max_participants). For fixed events, promoted people are then charged.
 */
export async function promoteWaitlist(eventId: string): Promise<void> {
  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", eventId).single();
  if (!event) return;
  const ev = event as EventRow;

  const confirmedCount = await getConfirmedCount(eventId);
  let slots = ev.max_participants - confirmedCount;
  if (slots <= 0) return;

  const { data } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("event_id", eventId)
    .eq("list_type", "waitlist")
    .order("position", { ascending: true })
    .limit(slots);
  const waiters = (data ?? []) as ParticipantRow[];

  for (const w of waiters) {
    if (slots <= 0) break;
    const pos = await getNextPosition(eventId, "confirmed");
    await supabaseAdmin
      .from("participants")
      .update({ list_type: "confirmed", position: pos })
      .eq("id", w.id);
    slots--;
  }

  if (ev.payment_mode === "fixed") {
    await chargeFixedPending(eventId);
  }
}
