import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { settleEvent, type EventRow } from "@/lib/db";
import { isAdmin } from "@/lib/auth";

// POST /api/events/:id/settle  (admin) — manually settle a split event now.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", id).single();
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const ev = event as EventRow;
  if (ev.status !== "open") {
    return NextResponse.json({ error: "Event is not open" }, { status: 400 });
  }
  if (ev.payment_mode !== "split") {
    return NextResponse.json(
      { error: "Fixed-mode events are paid at registration — nothing to settle" },
      { status: 400 }
    );
  }

  const result = await settleEvent(ev);
  return NextResponse.json({ ok: true, ...result });
}
