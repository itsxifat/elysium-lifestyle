export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCourierBalance } from "@/lib/steadfast";

// Connectivity check — hits /get_balance with the saved credentials.
export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  try {
    const data = await getCourierBalance();
    return NextResponse.json({ ok: true, balance: data?.current_balance ?? null });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message || "Connection failed" }, { status: 200 });
  }
}
