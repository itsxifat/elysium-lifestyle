export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import LandingPage from "@/models/LandingPage";
import Order from "@/models/Order";
import { requireAdmin } from "@/lib/auth";
import { normalizeCode, isReservedCode } from "@/lib/landing";
import { sanitize } from "../route";

export async function GET(request, { params }) {
  const { error } = await requireAdmin("landing.manage");
  if (error) return error;

  const { id } = params;
  await connectDB();
  const page = await LandingPage.findById(id)
    .populate("offers.items.product", "name images variants slug")
    .lean();
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ page });
}

export async function PATCH(request, { params }) {
  const { error } = await requireAdmin("landing.manage");
  if (error) return error;

  const { id } = params;
  const body = await request.json().catch(() => ({}));
  const doc = sanitize(body);
  if (!doc.name) return NextResponse.json({ error: "Give the landing page a name" }, { status: 400 });

  // A live page with no sellable offer would render an order form that can't be
  // submitted, so block publishing until at least one offer exists.
  if (doc.isActive && !doc.offers.some((o) => o.isActive)) {
    return NextResponse.json({ error: "Add at least one active offer before publishing" }, { status: 400 });
  }

  await connectDB();

  if (body.code !== undefined) {
    const code = normalizeCode(body.code);
    if (!code || code.length < 2) return NextResponse.json({ error: "Link is too short" }, { status: 400 });
    if (isReservedCode(code)) return NextResponse.json({ error: `"${code}" is reserved` }, { status: 400 });
    if (await LandingPage.exists({ code, _id: { $ne: id } })) {
      return NextResponse.json({ error: `/lp/${code} is already taken` }, { status: 409 });
    }
    doc.code = code;
  }

  try {
    const updated = await LandingPage.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ page: updated });
  } catch (err) {
    if (err?.code === 11000) return NextResponse.json({ error: "That link is already taken" }, { status: 409 });
    return NextResponse.json({ error: err.message || "Failed to save" }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  const { error } = await requireAdmin("landing.manage");
  if (error) return error;

  const { id } = params;
  await connectDB();

  // Orders keep a snapshot of the page (code/name/offer), so deleting is safe —
  // but a page that has sold something is a live campaign, and its /lp link is
  // probably in someone's ad. Require it to be unpublished first.
  const page = await LandingPage.findById(id).lean();
  if (!page) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orders = await Order.countDocuments({ "landingPage.page": id });
  if (orders > 0 && page.isActive) {
    return NextResponse.json(
      { error: `This page has ${orders} order(s). Unpublish it before deleting.` },
      { status: 409 }
    );
  }

  await LandingPage.deleteOne({ _id: id });
  return NextResponse.json({ success: true, ordersKept: orders });
}
