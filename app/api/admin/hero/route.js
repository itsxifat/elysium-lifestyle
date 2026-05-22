export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    let settings = await Settings.findOne({}).lean();
    if (!settings) settings = (await Settings.create({})).toObject();
    return NextResponse.json({ heroSlides: settings.heroSlides || [] });
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

export async function PUT(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await connectDB();
    const { heroSlides } = await request.json();
    await Settings.findOneAndUpdate({}, { $set: { heroSlides } }, { upsert: true });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
