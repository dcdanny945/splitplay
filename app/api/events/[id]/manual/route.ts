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
