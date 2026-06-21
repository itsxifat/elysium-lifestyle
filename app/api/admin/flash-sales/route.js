export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import FlashSale from "@/models/FlashSale";
import { requireAdmin } from "@/lib/auth";

// Normalize a payload into the FlashSale schema shape. `preserveSold` keeps the
// stored soldCount (edits must never reset how many have already been claimed).
export function sanitize(data, existingById = {}) {
  return {
    title: (data.title || "Flash Sale").trim(),
    subtitle: (data.subtitle || "").trim(),
    enabled: !!data.enabled,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    endsAt: data.endsAt ? new Date(data.endsAt) : null,
    items: (Array.isArray(data.items) ? data.items : [])
      .filter((it) => it && it.product)
      .map((it) => {
        const pid = String(it.product);
        const prevSold = existingById[pid]?.soldCount ?? 0;
        return {
          product: pid,
          salePrice: Math.max(0, Number(it.salePrice) || 0),
          stockLimit: Math.max(0, Math.floor(Number(it.stockLimit) || 0)),
          // Never trust a client-sent soldCount; carry the stored value.
          soldCount: Math.max(0, Math.floor(prevSold)),
        };
      }),
  };
}

export async function GET() {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  await connectDB();
  const sales = await FlashSale.find()
    .populate("items.product", "name images variants slug skuBase")
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ sales });
}

export async function POST(request) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  const doc = sanitize(await request.json());
  if (!doc.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  await connectDB();
  try {
    const created = await FlashSale.create(doc);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to create flash sale" }, { status: 400 });
  }
}
