import { supabaseAdmin } from "./supabase";
import { stripe } from "./stripe";
import { calcCharge, type PaymentMode } from "./pricing";
import { sendConfirmationEmail, sendFailedChargeEmail, sendRegistrationEmail } from "./email";
import { makeWithdrawToken } from "./auth";
import { melbourneLabel } from "./time";

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
  max_waitlist: number;
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

export async function getWaitlistCount(eventId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("participants")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("list_type", "waitlist");
  return count ?? 0;
}

/** Deletes the Stripe customers (and their saved cards) we created for an
 *  event's participants. Used when cancelling/deleting an event. Never charges. */
export async function deleteStripeCustomersForEvent(eventId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("participants")
    .select("stripe_customer_id")
    .eq("event_id", eventId);
  const seen = new Set<string>();
  for (const p of (data ?? []) as { stripe_customer_id: string | null }[]) {
    const cid = p.stripe_customer_id;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    try {
      await stripe.customers.del(cid);
    } catch (err) {
      console.error(`[cleanup] failed to delete Stripe customer ${cid}:`, err);
    }
  }
}

/** The waitlister who would be promoted next (lowest position). */
export async function getNextWaitlistId(eventId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("participants")
    .select("id")
    .eq("event_id", eventId)
    .eq("list_type", "waitlist")
    .order("position", { ascending: true })
    .limit(1);
  return data?.[0]?.id ?? null;
}

/**
 * After a confirmed participant is removed, the DB trigger promotes the first
 * waitlister. For SPLIT events, email that person to confirm they've moved up.
 * Pass the id captured (via getNextWaitlistId) BEFORE the delete.
 */
export async function notifyPromotedWaitlister(eventId: string, candidateId: string | null): Promise<void> {
  if (!candidateId) return;
  const { data: p } = await supabaseAdmin.from("participants").select("*").eq("id", candidateId).single();
  const part = p as ParticipantRow | null;
  if (!part || part.list_type !== "confirmed") return; // wasn't promoted

  const { data: ev } = await supabaseAdmin.from("events").select("*").eq("id", eventId).single();
  const event = ev as EventRow | null;
  if (!event || event.payment_mode !== "split") return;

  const baseUrl = process.env.NEXT_PUBLIC_URL || "";
  const withdrawUrl = `${baseUrl}/withdraw?token=${makeWithdrawToken(part.id)}`;
  const settlementLabel = event.settlement_time ? `${melbourneLabel(event.settlement_time)} (Melbourne)` : "settlement time";
  await sendRegistrationEmail({
    to: part.email,
    name: part.name,
    eventName: event.name,
    date: event.event_date,
    location: event.location,
    settlementLabel,
    withdrawUrl,
    promoted: true,
  });
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
    maxWaitlist: event.max_waitlist,
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
  mode: PaymentMode,
  splitCount?: number
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
      splitCount,
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
 * Settle a SPLIT event.
 *  - Per-person amount = total / (confirmed headcount at settlement).
 *  - Charge confirmed in order; on a failed charge, email the person, then pull
 *    the next waitlister in to take the spot (charged the same amount).
 *  - Keep going until each slot is filled with a successful charge or the
 *    waitlist runs out, then mark the event settled.
 */
export async function settleEvent(event: EventRow): Promise<{ charged: number; failed: number }> {
  const { data: confData } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("event_id", event.id)
    .eq("list_type", "confirmed")
    .order("position", { ascending: true });
  const confirmed = (confData ?? []) as ParticipantRow[];

  const { data: waitData } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("event_id", event.id)
    .eq("list_type", "waitlist")
    .eq("charge_status", "pending")
    .order("position", { ascending: true });
  const waitlistQueue = (waitData ?? []) as ParticipantRow[];

  let charged = 0;
  let failed = 0;

  const divisor = confirmed.length; // headcount at settlement -> total / divisor
  if (divisor > 0) {
    const { chargeCents, charge } = calcCharge(Number(event.total_cost), divisor);

    const notifyFailed = async (p: ParticipantRow) => {
      failed++;
      await sendFailedChargeEmail({ to: p.email, name: p.name, eventName: event.name, date: event.event_date });
    };

    for (const p of confirmed) {
      if (p.charge_status === "charged") {
        charged++; // manually-confirmed participant
        continue;
      }
      const result = await chargeParticipant(event, p, chargeCents, charge, "split", divisor);
      if (result === "charged") {
        charged++;
        continue;
      }
      // Failed -> notify, then backfill this slot from the waitlist.
      await notifyFailed(p);
      let filled = false;
      while (!filled && waitlistQueue.length > 0) {
        const w = waitlistQueue.shift()!;
        await supabaseAdmin.from("participants").update({ list_type: "confirmed" }).eq("id", w.id);
        const r2 = await chargeParticipant(event, w, chargeCents, charge, "split", divisor);
        if (r2 === "charged") {
          charged++;
          filled = true;
        } else {
          await notifyFailed(w);
        }
      }
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
