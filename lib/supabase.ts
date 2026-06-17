import { createClient } from "@supabase/supabase-js";

// Service-role client. Bypasses Row Level Security, so it must ONLY ever be
// imported from server code (route handlers, server actions) — never from a
// "use client" component.
//
// The placeholder fallbacks only keep `next build` from crashing before you've
// added your real values to .env.local. Real queries need the real keys.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_KEY || "placeholder-service-key",
  { auth: { persistSession: false, autoRefreshToken: false } }
);
