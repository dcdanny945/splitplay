import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { chargeFixedPending } from "@/lib/db";

// POST /api/withdraw  { participantId }
// Removes a participant. The DB trigger auto-promotes the next waitlister; for
// fixed-mode events that promoted person is then charged.
//
// NOTE: there is no per-user auth here (the app has no user accounts), so anyone
// with a participant id can withdraw it. Admins use the same endpoint to remove.
export async function POST(req: Request) {
  const { participantId } = await req.json().catch(() => ({}));
  if (!participantId) {
    return NextResponse.json({ error: "Missing participantId" }, { status: 400 });
  }

  const { data: p } = await supabaseAdmin
    .from("participants")
    .select("event_id")
    .eq("id", participantId)
    .single();
  const eventId = p?.event_id as string | undefined;

  const { error } = await supabaseAdmin.from("participants").delete().eq("id", participantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (eventId) await chargeFixedPending(eventId);

  return NextResponse.json({ ok: true });
}
