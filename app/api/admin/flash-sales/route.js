export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import FlashSale from "@/models/FlashSale";
import { requireAdmin } from "@/lib/auth";
import { buildSaleDoc, summariseSale } from "@/lib/flash-admin";

// The admin list: every sale with its status and headline numbers, computed
// against live stock.
export async function GET() {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  await connectDB();
  const sales = await FlashSale.find()
    .populate("items.product", "name images variants")
    .sort({ createdAt: -1 })
    .lean();
  const now = Date.now();
  return NextResponse.json({ sales: sales.map((s) => summariseSale(s, now)) });
}

export async function POST(request) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  await connectDB();
  const { doc, errors } = await buildSaleDoc(await request.json());
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

  try {
    const created = await FlashSale.create(doc);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to create flash sale" }, { status: 400 });
  }
}
