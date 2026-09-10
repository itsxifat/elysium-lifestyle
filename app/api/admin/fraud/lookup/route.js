export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { checkPhone } from "@/lib/fraud";
import { normalizeBdPhone } from "@/lib/utils";

// Manual phone lookup tool for the Frauds admin page.
export async function POST(request) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { phone: rawPhone } = await request.json().catch(() => ({}));
  if (!rawPhone) return NextResponse.json({ error: "Phone is required" }, { status: 400 });
  // Normalise before the lookup: the package validates the number now and
  // rejects anything that isn't a BD mobile, so a typo here is a 400 (bad
  // input) rather than a 502 (blaming the courier for the operator's slip).
  const phone = normalizeBdPhone(rawPhone);
  if (!/^01[3-9]\d{8}$/.test(phone)) {
    return NextResponse.json(
      { error: `"${rawPhone}" is not a valid Bangladeshi mobile number` },
      { status: 400 }
    );
  }
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
