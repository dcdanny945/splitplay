import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase";
import { getConfirmedCount, getNextPosition, chargeFixedPending, type EventRow } from "@/lib/db";
import { sendConfirmationEmail } from "@/lib/email";

// Stripe needs the raw request body to verify the signature, so we read text().
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[webhook] signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleSessionCompleted(event.data.object as Stripe.Checkout.Session);
    }
  } catch (err) {
    console.error("[webhook] handler error:", err);
    // Return 500 so Stripe retries.
    return new Response("Handler error", { status: 500 });
  }

  return Response.json({ received: true });
}

async function handleSessionCompleted(session: Stripe.Checkout.Session) {
  const md = session.metadata || {};
  const eventId = md.event_id;
  if (!eventId) return;

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;

  // Idempotency: a customer is created once per registration, so if a row with
  // this customer already exists for the event, this webhook is a retry.
  if (customerId) {
    const { data: existing } = await supabaseAdmin
      .from("participants")
      .select("id")
      .eq("event_id", eventId)
      .eq("stripe_customer_id", customerId)
      .limit(1);
    if (existing && existing.length) return;
  }

  const { data: event } = await supabaseAdmin.from("events").select("*").eq("id", eventId).single();
  if (!event) return;
  const ev = event as EventRow;

  if (session.mode === "setup") {
    // Card saved (split mode, or fixed-mode waitlister). No charge yet.
    const si = await stripe.setupIntents.retrieve(session.setup_intent as string);
    const pm = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id ?? null;

    // Recompute the slot now in case capacity changed during checkout.
    const confirmedCount = await getConfirmedCount(eventId);
    const listType = confirmedCount < ev.max_participants ? "confirmed" : "waitlist";
    const position = await getNextPosition(eventId, listType);

    await supabaseAdmin.from("participants").insert({
      event_id: eventId,
      name: md.name,
      email: md.email,
      stripe_customer_id: customerId,
      stripe_payment_method_id: pm,
      list_type: listType,
      position,
      charge_status: "pending",
    });

    // Fixed mode + landed in a confirmed slot -> charge immediately.
    if (ev.payment_mode === "fixed" && listType === "confirmed") {
      await chargeFixedPending(eventId);
    }
  } else if (session.mode === "payment") {
    // Pay-now (fixed mode). Already charged by Checkout.
    const pi = session.payment_intent
      ? await stripe.paymentIntents.retrieve(session.payment_intent as string)
      : null;
    const pm =
      pi && typeof pi.payment_method === "string"
        ? pi.payment_method
        : (pi?.payment_method as Stripe.PaymentMethod | null)?.id ?? null;
    const amount = session.amount_total != null ? session.amount_total / 100 : null;
    const position = await getNextPosition(eventId, "confirmed");

    const { data: inserted } = await supabaseAdmin
      .from("participants")
      .insert({
        event_id: eventId,
        name: md.name,
        email: md.email,
        stripe_customer_id: customerId,
        stripe_payment_method_id: pm,
        list_type: "confirmed",
        position,
        charge_status: "charged",
        stripe_payment_intent_id: pi?.id ?? null,
        amount_charged: amount,
      })
      .select()
      .single();

    const sent = await sendConfirmationEmail({
      to: md.email!,
      name: md.name!,
      eventName: ev.name,
      amount: amount ?? 0,
      date: ev.event_date,
      location: ev.location,
      mode: "fixed",
    });
    if (sent && inserted) {
      await supabaseAdmin.from("participants").update({ email_sent: true }).eq("id", inserted.id);
    }
  }
}
