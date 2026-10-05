export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";

// A new email code (the old ones end). The ERP answers the same whether or not
// the address has an account, so nobody can probe for accounts here.
export async function POST(request) {
  const body = await jsonBody(request);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  const client = clientOf(request);
  try {
    await erpPost(erpPath("/accounts/resend-code"), { email, ...(client ? { client } : {}) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return erpFailure(error);
  }
}
