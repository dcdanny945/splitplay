import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { serializeEvent, promoteWaitlist, type EventRow, type ParticipantRow } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { sanitizeNote } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/events/:id
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const admin = await isAdmin();

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", id).single();
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!admin && ((event as EventRow).status !== "open" || !(event as EventRow).visible)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: parts } = await supabaseAdmin.from("participants").select("*").eq("event_id", id);
  return NextResponse.json({
    event: serializeEvent(event as EventRow, (parts ?? []) as ParticipantRow[], admin),
  });
}

// PATCH /api/events/:id  (admin) — update cost, max, mode, etc.
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (body.event_date !== undefined) patch.event_date = body.event_date || null;
  if (body.time_label !== undefined) patch.time_label = body.time_label || null;
  if (body.location !== undefined) patch.location = body.location || null;
  if (body.description !== undefined) patch.description = sanitizeNote(body.description);
  if (body.total_cost !== undefined) patch.total_cost = Math.max(0, Number(body.total_cost) || 0);
  if (body.payment_mode === "split" || body.payment_mode === "fixed") patch.payment_mode = body.payment_mode;
  if (typeof body.visible === "boolean") patch.visible = body.visible;
  if (body.settlement_time !== undefined) patch.settlement_time = body.settlement_time || null;

  let raisedMax = false;
  if (body.max_participants !== undefined) {
    patch.max_participants = Math.max(1, Math.min(500, Number(body.max_participants) || 1));
    raisedMax = true;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.from("events").update(patch).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Raising the cap may open slots for waitlisters.
  if (raisedMax) await promoteWaitlist(id);

  return NextResponse.json({ event: data });
}

// DELETE /api/events/:id  (admin) — cascade-deletes participants
export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { error } = await supabaseAdmin.from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
