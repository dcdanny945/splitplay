// Shared pricing logic — safe to import from both server and client (no server-only deps).
// The fee is passed on to the participant so the organiser always nets the full
// activity cost.
//
// Stripe AU charges 1.7% + A$0.30 on a domestic card but 3.5% + A$0.30 on one
// issued overseas, and which is which can't be known before charging. Grossing
// up at the domestic rate left the organiser short whenever someone paid with
// an overseas card (31/10/2026: sixteen fees of $0.39, two of $0.48, $0.12
// short on a $90 court). 2.5% is the blend that covers a mix of up to roughly
// eight overseas cards in eighteen, while costing everyone else about four
// cents when there are none.
export const STRIPE_PCT = 0.025;
export const STRIPE_FIXED = 0.3; // A$0.30

export type Pricing = {
  base: number; // each person's share of the activity cost (AUD)
  fee: number; // Stripe fee added on top (AUD)
  charge: number; // total amount charged to the participant (AUD)
  chargeCents: number; // same amount in cents, for the Stripe API
};

/**
 * Work out what a single participant is charged.
 * @param total    The event's total cost (AUD).
 * @param divisor  How many people the cost is split across.
 */
export function calcCharge(total: number, divisor: number): Pricing {
  if (!divisor || divisor <= 0) {
    const chargeCents = Math.max(0, Math.ceil(total * 100));
    return { base: total, fee: 0, charge: chargeCents / 100, chargeCents };
  }
  const base = total / divisor;
  // Gross up so that after Stripe's cut the organiser receives `base`.
  const chargeCents = Math.ceil(((base + STRIPE_FIXED) / (1 - STRIPE_PCT)) * 100);
  const charge = chargeCents / 100;
  return { base, fee: charge - base, charge, chargeCents };
}

export type PaymentMode = "split" | "fixed";

/**
 * Which number we divide the total by:
 *  - split: current confirmed headcount (price drops as more people join)
 *  - fixed: max spots (price is locked in upfront, known at registration)
 */
export function divisorFor(mode: PaymentMode, confirmedCount: number, maxParticipants: number) {
  return mode === "fixed" ? maxParticipants : confirmedCount;
}
