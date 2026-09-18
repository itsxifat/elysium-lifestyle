export const dynamic = "force-dynamic";

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import FlashSale from "@/models/FlashSale";
import { requireAdmin } from "@/lib/auth";
import { buildSaleDoc } from "@/lib/flash-admin";

// Copy a sale as a switched-off draft with no schedule and nothing sold — the
// quick way to re-run last weekend's campaign.
export async function POST(_, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  if (!mongoose.isValidObjectId(params.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await connectDB();
  const source = await FlashSale.findById(params.id).lean();
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // No `existing` → counters start from zero.
  const { doc } = await buildSaleDoc({
    ...source,
    title: `${source.title} (copy)`.slice(0, 120),
    slug: `${source.slug || source.title}-copy`,
    enabled: false,
    startsAt: null,
    endsAt: null,
  });

  const created = await FlashSale.create(doc);
  return NextResponse.json(created, { status: 201 });
}
