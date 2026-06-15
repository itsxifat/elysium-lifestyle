export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    let settings = await Settings.findOne({}).lean();
    if (!settings) {
      const doc = await Settings.create({});
      settings = doc.toObject();
    }
    return NextResponse.json(settings.masterSizes || []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch sizes" }, { status: 500 });
  }
}

export async function PUT(request) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const { sizes } = await request.json();
    const settings = await Settings.findOneAndUpdate(
      {},
      { $set: { masterSizes: sizes } },
      { upsert: true, new: true }
    ).lean();
    return NextResponse.json(settings.masterSizes);
  } catch {
    return NextResponse.json({ error: "Failed to update sizes" }, { status: 500 });
  }
}
