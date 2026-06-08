export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { requireAdmin } from "@/lib/auth";
import { deleteImageIfUnreferenced } from "@/lib/images";

// Collect every image URL referenced by a set of hero slides.
function slideImages(slides) {
  const set = new Set();
  for (const s of slides || []) {
    if (s?.imageDesktop) set.add(s.imageDesktop);
    if (s?.imageMobile) set.add(s.imageMobile);
  }
  return set;
}

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

    const before = await Settings.findOne({}).select("heroSlides").lean();
    await Settings.findOneAndUpdate({}, { $set: { heroSlides } }, { upsert: true });

    // Delete from the CDN any image that a slide used before but doesn't now
    // (slide removed, image cleared, or image replaced).
    const next = slideImages(heroSlides);
    const removed = [...slideImages(before?.heroSlides)].filter((u) => !next.has(u));
    await Promise.all(removed.map((u) => deleteImageIfUnreferenced(u)));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
