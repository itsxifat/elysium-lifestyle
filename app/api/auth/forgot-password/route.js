export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";

// "Forgot password": the brand ERP emails a one-hour link to
// <site>/auth/reset-password?token=… if the address has an account, and answers
// the same either way.
export async function POST(request) {
  const body = await jsonBody(request);
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  const client = clientOf(request);
  try {
    await erpPost(erpPath("/accounts/forgot-password"), { email, ...(client ? { client } : {}) });
    return NextResponse.json({ success: true });
  } catch (error) {
    return erpFailure(error);
  }
}
