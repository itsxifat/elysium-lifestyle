export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { checkPhone } from "@/lib/fraud";

// Manual phone lookup tool for the Frauds admin page.
export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { phone } = await request.json().catch(() => ({}));
  if (!phone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  try {
    const r = await checkPhone(phone);
    const delivered = Number(r.delivered || 0);
    const cancelled = Number(r.cancelled || 0);
    const frauds = Number(r.frauds || 0);
    const totalParcels = Array.isArray(r.consignment) && r.consignment.length ? r.consignment.length : delivered + cancelled;
    const successRate = totalParcels ? Math.round((delivered / totalParcels) * 100) : 0;
    return NextResponse.json({ phone, delivered, cancelled, frauds, totalParcels, successRate });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
