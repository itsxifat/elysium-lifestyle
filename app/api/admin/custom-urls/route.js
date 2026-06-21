export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import CustomUrl from "@/models/CustomUrl";
import { requireAdmin } from "@/lib/auth";
import { generateUniqueCode, buildFullPath } from "@/lib/customUrl";

// Normalize an incoming payload into the CustomUrl schema shape.
export function sanitize(data) {
  const baseType = ["category", "shop", "custom"].includes(data.baseType) ? data.baseType : "category";
  const b = data.banner || {};
  const m = data.modal || {};
  return {
    title: (data.title || "").trim(),
    baseType,
    category: baseType === "category" && data.category ? data.category : null,
    customPath: baseType === "custom" ? (data.customPath || "").trim() : "",
    highlightProducts: Array.isArray(data.highlightProducts)
      ? data.highlightProducts.filter(Boolean)
      : [],
    banner: {
      enabled: !!b.enabled,
      text: (b.text || "").trim(),
      bgColor: b.bgColor || "#B85C3A",
      textColor: b.textColor || "#FFFFFF",
      link: (b.link || "").trim(),
    },
    modal: {
      enabled: !!m.enabled,
      type: m.type === "image" ? "image" : "text",
      title: (m.title || "").trim(),
      text: (m.text || "").trim(),
      image: (m.image || "").trim(),
      ctaText: (m.ctaText || "").trim(),
      ctaLink: (m.ctaLink || "").trim(),
    },
    isActive: data.isActive !== false,
  };
}

export async function GET() {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  await connectDB();
  const docs = await CustomUrl.find()
    .populate("category", "name slug")
    .sort({ createdAt: -1 })
    .lean();

  const campaigns = docs.map((d) => ({ ...d, fullPath: buildFullPath(d) }));
  return NextResponse.json({ campaigns });
}

export async function POST(request) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;

  const doc = sanitize(await request.json());
  if (!doc.title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (doc.baseType === "category" && !doc.category) {
    return NextResponse.json({ error: "Pick a category for this campaign" }, { status: 400 });
  }
  if (doc.baseType === "custom" && !doc.customPath) {
    return NextResponse.json({ error: "Enter a custom link path" }, { status: 400 });
  }

  await connectDB();
  try {
    const code = await generateUniqueCode();
    const created = await CustomUrl.create({ ...doc, code });
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Failed to create campaign" }, { status: 400 });
  }
}
