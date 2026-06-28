import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { getConfirmedCount, getWaitlistCount, type EventRow } from "@/lib/db";
import { calcCharge } from "@/lib/pricing";

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// POST /api/register  { eventId, name, email }
// Creates a Stripe Checkout Session and returns its URL. The participant row is
// only written once Stripe confirms, via the webhook.
export async function POST(req: Request) {
  const { eventId, name, email } = await req.json().catch(() => ({}));

  if (!eventId || !name || !email) {
    return NextResponse.json({ error: "Missing eventId, name or email" }, { status: 400 });
  }
  if (!EMAIL_RE.test(String(email).trim())) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", eventId).single();
  if (!event || (event as EventRow).status !== "open" || !(event as EventRow).visible) {
    return NextResponse.json({ error: "Event not available" }, { status: 400 });
  }
  const ev = event as EventRow;

  // Split events stop taking registrations once the settlement time has passed.
  if (ev.payment_mode === "split" && ev.settlement_time && new Date(ev.settlement_time).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Registration has closed — the settlement time has passed." }, { status: 400 });
  }

  const confirmedCount = await getConfirmedCount(eventId);
  const isFull = confirmedCount >= ev.max_participants;
  const listType: "confirmed" | "waitlist" = isFull ? "waitlist" : "confirmed";

  // Split mode caps the waitlist; fixed mode keeps its existing (uncapped) behavior.
  if (isFull && ev.payment_mode === "split") {
    const waitlistCount = await getWaitlistCount(eventId);
    if (waitlistCount >= ev.max_waitlist) {
      return NextResponse.json({ error: "This event is full — the waitlist is also full." }, { status: 400 });
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_URL || new URL(req.url).origin;
  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim();

  // Pass event name + date to the success page so it can greet the registrant.
  const successUrl =
    `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}` +
    `&evt=${encodeURIComponent(ev.name)}` +
    (ev.event_date ? `&date=${ev.event_date}` : "");

  const customer = await stripe.customers.create({ name: cleanName, email: cleanEmail });

  const metadata = {
    event_id: eventId,
    name: cleanName,
    email: cleanEmail,
    list_type: listType,
    payment_mode: ev.payment_mode,
  };

  try {
    let session;
    if (ev.payment_mode === "fixed" && !isFull) {
      // Pay-now: charge the locked price (total / max spots) immediately.
      const { chargeCents } = calcCharge(Number(ev.total_cost), ev.max_participants);
      // Stripe's minimum charge for AUD is A$0.50.
      if (chargeCents < 50) {
        return NextResponse.json(
          {
            error: `Each person would be charged $${(chargeCents / 100).toFixed(
              2
            )}, below Stripe's A$0.50 minimum. Ask the organiser to raise the total cost or lower the max spots.`,
          },
          { status: 400 }
        );
      }
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customer.id,
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: { name: ev.name },
              unit_amount: chargeCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          setup_future_usage: "off_session",
          description: `${ev.name} - registration`,
        },
        success_url: successUrl,
        cancel_url: `${baseUrl}/?cancelled=1`,
        metadata,
      });
    } else {
      // Split mode, or a fixed-mode waitlister: just save the card for later.
      session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customer.id,
        payment_method_types: ["card"],
        success_url: successUrl,
        cancel_url: `${baseUrl}/?cancelled=1`,
        metadata,
      });
    }

    return NextResponse.json({ url: session.url, listType });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not start checkout";
    console.error("[register] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
