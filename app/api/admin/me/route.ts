import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";

// GET /api/admin/me — lets the frontend know if the current session is admin.
export async function GET() {
  return NextResponse.json({ admin: await isAdmin() });
}
