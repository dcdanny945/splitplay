import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { deleteStripeCustomersForEvent, type EventRow, type ParticipantRow } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { sendCancellationEmail } from "@/lib/email";

// POST /api/events/:id/cancel  (admin)
// Cancels a session: emails every registrant, removes their saved cards (so no
// one is charged), and marks the event cancelled (hidden from registrants
// immediately, skipped by the settlement cron). The record stays for the admin.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", id).single();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const ev = event as EventRow;
  if (ev.status === "cancelled") return NextResponse.json({ error: "Event is already cancelled" }, { status: 400 });

  const { data: parts } = await supabaseAdmin.from("participants").select("*").eq("event_id", id);
  const participants = (parts ?? []) as ParticipantRow[];

  // 1. Notify everyone who registered.
  let emailed = 0;
  for (const p of participants) {
    if (!p.email) continue;
    const sent = await sendCancellationEmail({
      to: p.email,
      name: p.name,
      eventName: ev.name,
      date: ev.event_date,
      time: ev.time_label,
      location: ev.location,
    });
    if (sent) emailed++;
  }

  // 2. Remove saved cards so nobody can be charged.
  await deleteStripeCustomersForEvent(id);

  // 3. Mark cancelled — hides from registrants now; the cron will skip it.
  await supabaseAdmin.from("events").update({ status: "cancelled" }).eq("id", id);

  return NextResponse.json({ ok: true, emailed, total: participants.length });
}
