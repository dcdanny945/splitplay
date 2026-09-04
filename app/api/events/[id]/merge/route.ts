import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { stripe } from "@/lib/stripe";
import { getNextPosition, type EventRow, type ParticipantRow } from "@/lib/db";
import { isAdmin, makeUpdateCardToken, makeWithdrawToken } from "@/lib/auth";
import { sendSessionMovedEmail } from "@/lib/email";
import { melbourneLabel } from "@/lib/time";

// POST /api/events/:id/merge  (admin)
//   { targetEventId, totalCost?, maxParticipants? }
//
// Folds this session into another one: everyone moves across, then this one is
// marked cancelled. Two uses, same mechanism — leave the cost/capacity out and
// it's "this session didn't fill, move everyone to that one"; pass them and
// it's a merge where the combined group splits whatever the courts actually
// cost.
//
// Registrations carry their own Stripe customer and payment method, so moving
// the row keeps a chargeable card — which is why this can't reuse the cancel
// route, which deletes the cards outright.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { targetEventId, totalCost, maxParticipants } = await req.json().catch(() => ({}));
  if (!targetEventId) return NextResponse.json({ error: "Missing targetEventId" }, { status: 400 });
  if (targetEventId === id) return NextResponse.json({ error: "Can't merge a session into itself" }, { status: 400 });

  const { data: sourceRow } = await supabaseAdmin.from("events").select("*").eq("id", id).single();
  const { data: targetRow } = await supabaseAdmin.from("events").select("*").eq("id", targetEventId).single();
  if (!sourceRow || !targetRow) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const source = sourceRow as EventRow;
  let target = targetRow as EventRow;

  if (source.status !== "open") {
    return NextResponse.json({ error: `This session is ${source.status} — only open sessions can be merged.` }, { status: 400 });
  }
  if (target.status !== "open") {
    return NextResponse.json({ error: `The target session is ${target.status}.` }, { status: 400 });
  }
  if (source.payment_mode !== target.payment_mode) {
    return NextResponse.json(
      { error: "Both sessions must use the same payment mode — people already paid under different rules can't be mixed." },
      { status: 400 }
    );
  }

  // ----- Optionally restate the target's cost and capacity (the merge case) --
  const patch: Record<string, unknown> = {};
  if (totalCost !== undefined && totalCost !== null && String(totalCost) !== "") {
    const cost = Number(totalCost);
    if (!Number.isFinite(cost) || cost < 0) return NextResponse.json({ error: "Invalid total cost" }, { status: 400 });
    patch.total_cost = cost;
  }
  if (maxParticipants !== undefined && maxParticipants !== null && String(maxParticipants) !== "") {
    const max = Number(maxParticipants);
    if (!Number.isInteger(max) || max < 1) return NextResponse.json({ error: "Invalid max participants" }, { status: 400 });
    patch.max_participants = max;
  }
  if (Object.keys(patch).length) {
    const { data: updated } = await supabaseAdmin.from("events").update(patch).eq("id", target.id).select().single();
    if (updated) target = updated as EventRow;
  }

  // ----- Who moves, and in what order --------------------------------------
  const { data: sourceParts } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("event_id", id)
    .order("position", { ascending: true });
  const moving = ((sourceParts ?? []) as ParticipantRow[]).sort((a, b) => {
    // Confirmed people keep their head start over the source's waitlist.
    if (a.list_type !== b.list_type) return a.list_type === "confirmed" ? -1 : 1;
    return a.position - b.position;
  });

  const { data: targetParts } = await supabaseAdmin
    .from("participants")
    .select("*")
    .eq("event_id", target.id);
  const existing = (targetParts ?? []) as ParticipantRow[];
  const takenEmails = new Set(existing.filter((p) => p.email).map((p) => p.email.toLowerCase()));

  let confirmedCount = existing.filter((p) => p.list_type === "confirmed").length;
  let nextConfirmed = await getNextPosition(target.id, "confirmed");
  let nextWaitlist = await getNextPosition(target.id, "waitlist");

  const settlementLabel = target.settlement_time ? `${melbourneLabel(target.settlement_time)} (Melbourne)` : null;
  const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;

  let movedConfirmed = 0;
  let movedWaitlist = 0;
  let duplicates = 0;
  let emailed = 0;

  for (const p of moving) {
    // Already in the target session — drop the duplicate registration and its
    // saved card rather than letting them be charged twice.
    if (p.email && takenEmails.has(p.email.toLowerCase())) {
      await supabaseAdmin.from("participants").delete().eq("id", p.id);
      if (p.stripe_customer_id) {
        try {
          await stripe.customers.del(p.stripe_customer_id);
        } catch (err) {
          console.error(`[merge] could not delete duplicate customer ${p.stripe_customer_id}:`, err);
        }
      }
      duplicates++;
      continue;
    }

    const listType: "confirmed" | "waitlist" = confirmedCount < target.max_participants ? "confirmed" : "waitlist";
    const position = listType === "confirmed" ? nextConfirmed++ : nextWaitlist++;

    const { error } = await supabaseAdmin
      .from("participants")
      .update({ event_id: target.id, list_type: listType, position })
      .eq("id", p.id);
    if (error) {
      console.error(`[merge] could not move participant ${p.id}:`, error);
      continue;
    }

    if (listType === "confirmed") {
      confirmedCount++;
      movedConfirmed++;
    } else {
      movedWaitlist++;
    }
    if (p.email) takenEmails.add(p.email.toLowerCase());

    if (p.email) {
      // The participant id is unchanged by the move, so the links they already
      // have keep working — these are the same ones.
      const sent = await sendSessionMovedEmail({
        to: p.email,
        name: p.name,
        fromEventName: source.name,
        eventName: target.name,
        date: target.event_date,
        time: target.time_label,
        location: target.location,
        settlementLabel,
        listType,
        withdrawUrl: `${baseUrl}/withdraw?token=${makeWithdrawToken(p.id)}`,
        updateCardUrl: `${baseUrl}/update-card?token=${makeUpdateCardToken(p.id)}`,
      });
      if (sent) emailed++;
    }
  }

  // Make room on the target's waitlist rather than turning anyone away.
  if (movedWaitlist > 0) {
    const waitlistTotal = existing.filter((p) => p.list_type === "waitlist").length + movedWaitlist;
    if (waitlistTotal > target.max_waitlist) {
      await supabaseAdmin.from("events").update({ max_waitlist: waitlistTotal }).eq("id", target.id);
    }
  }

  // Cards stay with the people who moved, so this deliberately does not call
  // deleteStripeCustomersForEvent the way the plain cancel route does.
  await supabaseAdmin.from("events").update({ status: "cancelled", visible: false }).eq("id", id);

  return NextResponse.json({
    ok: true,
    movedConfirmed,
    movedWaitlist,
    duplicates,
    emailed,
    targetName: target.name,
  });
}
