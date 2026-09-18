export const dynamic = "force-dynamic";

import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import FlashSale from "@/models/FlashSale";
import { requireAdmin } from "@/lib/auth";
import { buildSaleDoc } from "@/lib/flash-admin";
import { saleStatus } from "@/lib/flash-pricing";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

// The sale with each product's live variants, so the editor works from the
// real stock on the shelf, size by size.
export async function GET(_, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  if (!mongoose.isValidObjectId(params.id)) return notFound();

  await connectDB();
  const sale = await FlashSale.findById(params.id)
    .populate("items.product", "name images variants slug skuBase isPublished")
    .lean();
  if (!sale) return notFound();
  return NextResponse.json({ ...sale, status: saleStatus(sale) });
}

// The stored sold counters are carried into the new document, so the write must
// not land on top of a checkout claim made after they were read — that claim
// would be erased and the allocation oversold. Every claim bumps `updatedAt`,
// so the write only applies to the version that was read; if a claim got in
// first, read again and rebuild with the fresh counters.
async function save(id, payload, current = null) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const read = attempt === 0 && current ? current : await FlashSale.findById(id).lean();
    if (!read) return notFound();

    const { doc, errors } = await buildSaleDoc(payload, read);
    if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

    const updated = await FlashSale.findOneAndUpdate(
      { _id: id, updatedAt: read.updatedAt },
      { $set: doc },
      { new: true, runValidators: true }
    ).lean();
    if (updated) return NextResponse.json({ ...updated, status: saleStatus(updated) });
  }
  return NextResponse.json({ error: "The sale is busy taking orders — please save again." }, { status: 409 });
}

// Full save from the editor.
export async function PUT(request, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  if (!mongoose.isValidObjectId(params.id)) return notFound();

  await connectDB();
  return save(params.id, await request.json());
}

// Quick switches from the list — on/off, homepage, priority. Runs through the
// same normalisation as a full save, so switching a sale on is refused exactly
// when saving it switched on would be.
const QUICK_FIELDS = ["enabled", "showOnHomepage", "priority"];

export async function PATCH(request, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  if (!mongoose.isValidObjectId(params.id)) return notFound();

  await connectDB();
  const body = await request.json();
  const current = await FlashSale.findById(params.id).lean();
  if (!current) return notFound();

  const patch = Object.fromEntries(QUICK_FIELDS.filter((k) => k in body).map((k) => [k, body[k]]));
  return save(params.id, { ...current, ...patch }, current);
}

export async function DELETE(_, { params }) {
  const { error } = await requireAdmin("content.manage");
  if (error) return error;
  if (!mongoose.isValidObjectId(params.id)) return notFound();

  await connectDB();
  const deleted = await FlashSale.findByIdAndDelete(params.id);
  if (!deleted) return notFound();
  return NextResponse.json({ success: true });
}
