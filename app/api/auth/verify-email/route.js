export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";

// The six-digit email code, checked by the brand ERP (15 minutes, five tries;
// D-522). Past guest orders that gave this email join the account (D-523).
export async function POST(request) {
  const body = await jsonBody(request);
  const email = String(body?.email || "").trim().toLowerCase();
  const code = String(body?.otp ?? body?.code ?? "").trim();
  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Enter the 6-digit code from your email." }, { status: 400 });
  }
  const client = clientOf(request);
  try {
    await erpPost(erpPath("/accounts/verify-email"), { email, code, ...(client ? { client } : {}) });
    return NextResponse.json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    return erpFailure(error);
  }
}
