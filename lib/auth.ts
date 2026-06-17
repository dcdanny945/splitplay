import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Simple single-admin auth: a password (ADMIN_PASSWORD) exchanged for an
// HMAC-signed, httpOnly session cookie. Good enough for one organiser; swap for
// Supabase Auth if you ever need multiple admin accounts.

export const ADMIN_COOKIE = "splitplay_admin";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.CRON_SECRET || "dev-insecure-secret";
}

export function makeToken(): string {
  const payload = `admin.${Date.now()}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyToken(token?: string | null): boolean {
  if (!token) return false;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  // Optional freshness check
  const ts = Number(payload.split(".")[1]);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < MAX_AGE_SECONDS * 1000;
}

/** Reads the request cookie store and returns whether the caller is an authed admin. */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(ADMIN_COOKIE)?.value);
}

export const COOKIE_MAX_AGE = MAX_AGE_SECONDS;
