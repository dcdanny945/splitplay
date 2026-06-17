import Stripe from "stripe";

// Server-side Stripe client. Uses the SDK's pinned API version. The placeholder
// fallback only exists so `next build` doesn't crash before you've added your
// real key to .env.local — actual API calls require the real STRIPE_SECRET_KEY.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder_build_only");
