export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { getShopper } from "@/lib/session";

// The signed-in shopper changes their password (POST accounts/{id}/change-password).
export async function PUT(request) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await jsonBody(request);
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");
  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }
  try {
    await erpPost(erpPath(`/accounts/${shopper.accountId}/change-password`), { currentPassword, newPassword });
    return NextResponse.json({ success: true });
  } catch (error) {
    // A wrong current password is the same "credentials invalid" as a sign-in.
    if (error?.code === "ACCOUNT_CREDENTIALS_INVALID") {
      return NextResponse.json({ error: "Current password is incorrect", code: error.code }, { status: 400 });
    }
    return erpFailure(error);
  }
}
