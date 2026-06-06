export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listFraudAccounts, addFraudAccount, removeFraudAccount, fraudAvailable } from "@/lib/fraud";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  try {
    const [accounts, available] = await Promise.all([listFraudAccounts(), fraudAvailable()]);
    return NextResponse.json({ accounts, available });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { email, password, label } = await request.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  try {
    await addFraudAccount({ email, password, label });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { email } = await request.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  await removeFraudAccount(email);
  return NextResponse.json({ ok: true });
}
