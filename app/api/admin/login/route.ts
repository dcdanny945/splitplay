import { NextResponse } from "next/server";
import { ADMIN_COOKIE, makeToken, COOKIE_MAX_AGE } from "@/lib/auth";

// POST /api/admin/login  { password }
export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, makeToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
