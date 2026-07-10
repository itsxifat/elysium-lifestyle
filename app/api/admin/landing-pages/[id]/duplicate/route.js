export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import LandingPage from "@/models/LandingPage";
import { requireAdmin } from "@/lib/auth";
import { generateUniqueCode } from "@/lib/landing";

// Clone a page onto a fresh /lp code. The copy starts as an unpublished draft
// with zeroed stats so it can be reworked without touching the live campaign.
export async function POST(request, { params }) {
  const { error, session } = await requireAdmin("landing.manage");
  if (error) return error;

  const { id } = params;
  await connectDB();

  const src = await LandingPage.findById(id).lean();
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { _id, code, createdAt, updatedAt, __v, ...rest } = src;

  const copy = await LandingPage.create({
    ...rest,
    name: `${src.name} (copy)`,
    code: await generateUniqueCode(),
    isActive: false,
    views: 0,
    orderCount: 0,
    revenue: 0,
    createdBy: session.user.id,
    createdByName: session.user.name || "",
  });

  return NextResponse.json({ page: copy }, { status: 201 });
}
