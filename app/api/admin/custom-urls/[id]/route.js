export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import CustomUrl from "@/models/CustomUrl";
import { requireAdmin } from "@/lib/auth";
import { sanitize } from "../route";
import { buildFullPath } from "@/lib/customUrl";

export async function GET(_, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  await connectDB();
  const doc = await CustomUrl.findById(params.id)
    .populate("category", "name slug")
    .populate("highlightProducts", "name images variants slug skuBase")
    .lean();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...doc, fullPath: buildFullPath(doc) });
}

export async function PUT(request, { params }) {
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
  // `code` is immutable — never let an edit regenerate or overwrite it.
  const updated = await CustomUrl.findByIdAndUpdate(
    params.id,
    { $set: doc },
    { new: true, runValidators: true }
  );
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  await connectDB();
  const deleted = await CustomUrl.findByIdAndDelete(params.id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
