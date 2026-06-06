export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { testFraudAccounts } from "@/lib/fraud";

// Verifies the configured Steadfast accounts can log in + look up a number.
export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { phone } = await request.json().catch(() => ({}));
  const result = await testFraudAccounts(phone || undefined);
  return NextResponse.json(result);
}
