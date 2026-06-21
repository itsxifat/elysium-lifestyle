export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import FlashSale from "@/models/FlashSale";
import { requireAdmin } from "@/lib/auth";
import { sanitize } from "../route";

export async function GET(_, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  await connectDB();
  const sale = await FlashSale.findById(params.id)
    .populate("items.product", "name images variants slug skuBase")
    .lean();
  if (!sale) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(sale);
}

export async function PUT(request, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  await connectDB();
  // Carry forward each existing item's soldCount so an edit can't reset it.
  const current = await FlashSale.findById(params.id).lean();
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const existingById = Object.fromEntries(
    (current.items || []).map((it) => [String(it.product), { soldCount: it.soldCount }])
  );

  const doc = sanitize(await request.json(), existingById);
  if (!doc.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const updated = await FlashSale.findByIdAndUpdate(
    params.id,
    { $set: doc },
    { new: true, runValidators: true }
  );
  return NextResponse.json(updated);
}

export async function DELETE(_, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  await connectDB();
  const deleted = await FlashSale.findByIdAndDelete(params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
