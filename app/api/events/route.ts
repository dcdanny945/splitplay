import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { serializeEvent, type EventRow, type ParticipantRow } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { sanitizeNote } from "@/lib/sanitize";
import { nextWeekdayTimeMelbourne, WEEKDAY_NUM } from "@/lib/time";

// GET /api/events
// Public: open events with sanitized participant info.
// Admin (cookie present): all events incl. settled, with emails + charge status.
export async function GET() {
  const admin = await isAdmin();

  let query = supabaseAdmin.from("events").select("*").order("created_at", { ascending: false });
  if (!admin) query = query.eq("status", "open").eq("visible", true);
  const { data: events, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (events ?? []).map((e) => e.id);
  let participants: ParticipantRow[] = [];
  if (ids.length) {
    const { data } = await supabaseAdmin.from("participants").select("*").in("event_id", ids);
    participants = (data ?? []) as ParticipantRow[];
  }

  const result = ((events ?? []) as EventRow[]).map((e) =>
    serializeEvent(
      e,
      participants.filter((p) => p.event_id === e.id),
      admin
    )
  );
  return NextResponse.json(
    { events: result, admin },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
  );
}

// POST /api/events  (admin only) — create an event
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { name, event_date, time_label, location, description, total_cost, max_participants, max_waitlist, payment_mode, settlement_time, settlement_day, settlement_hour, settlement_minute } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Event name is required" }, { status: 400 });
  }
  const mode = payment_mode === "fixed" ? "fixed" : "split";

  let settlementTime: string | null = null;
  if (mode === "split") {
    const wd = settlement_day !== undefined ? WEEKDAY_NUM[String(settlement_day).toLowerCase()] : undefined;
    if (wd !== undefined) {
      settlementTime = nextWeekdayTimeMelbourne(wd, Number(settlement_hour) || 0, Number(settlement_minute) || 0).toISOString();
    } else if (settlement_time) {
      settlementTime = settlement_time;
    } else {
      return NextResponse.json({ error: "Split events need a settlement day/time" }, { status: 400 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("events")
    .insert({
      name: name.trim(),
      event_date: event_date || null,
      time_label: time_label || null,
      location: location || null,
      description: sanitizeNote(description),
      total_cost: Math.max(0, Number(total_cost) || 0),
      max_participants: Math.max(1, Math.min(500, Number(max_participants) || 1)),
      max_waitlist: Math.max(0, Math.min(100, Number(max_waitlist) || 2)),
      payment_mode: mode,
      settlement_time: settlementTime,
      status: "open",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
