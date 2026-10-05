export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";

// A new password from the emailed link. The link is used once; the email then
// counts as verified (D-522).
export async function POST(request) {
  const body = await jsonBody(request);
  const token = String(body?.token || "");
  const password = String(body?.password || "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  const client = clientOf(request);
  try {
    await erpPost(erpPath("/accounts/reset-password"), { token, password, ...(client ? { client } : {}) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return erpFailure(error);
  }
}
