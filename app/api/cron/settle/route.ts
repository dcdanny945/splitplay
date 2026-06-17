import { supabaseAdmin } from "@/lib/supabase";
import { settleEvent, type EventRow } from "@/lib/db";

// GET /api/cron/settle
// Vercel Cron calls this on a schedule (see vercel.json) and automatically adds
// the "Authorization: Bearer $CRON_SECRET" header when CRON_SECRET is set.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: events } = await supabaseAdmin
    .from("events")
    .select("*")
    .eq("status", "open")
    .eq("payment_mode", "split")
    .lte("settlement_time", new Date().toISOString());

  let settled = 0;
  const details: Array<{ id: string; charged: number; failed: number }> = [];
  for (const e of (events ?? []) as EventRow[]) {
    const r = await settleEvent(e);
    details.push({ id: e.id, ...r });
    settled++;
  }

  return Response.json({ settled, details });
}
