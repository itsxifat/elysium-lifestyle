export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import Product from "@/models/Product";
import Category from "@/models/Category";
import NcomReservation from "@/models/NcomReservation";
import { requireAdmin } from "@/lib/auth";
import { getNcomConfig } from "@/lib/ncom";

// What the connector is actually serving, and what it has been asked for.
// Local only — no call leaves this server — so the panel stays instant.
export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();

  const [total, published, categories, settings, cfg, held, releasedToday] = await Promise.all([
    Product.countDocuments({}),
    Product.countDocuments({ isPublished: true }),
    Category.countDocuments({ $or: [{ isActive: true }, { isActive: { $exists: false } }] }),
    Settings.findOne({}).select("ncom.stats ncom.lastRequestAt ncom.lastRequestKind ncom.lastRefusalAt ncom.lastRefusalReason").lean(),
    getNcomConfig({ fresh: true }),
    NcomReservation.countDocuments({ state: "held" }),
    NcomReservation.countDocuments({ state: "released", releasedAt: { $gte: new Date(Date.now() - 86_400_000) } }),
  ]);

  // Variants are what ncom addresses, so count them rather than products.
  const [variantAgg] = await Product.aggregate([
    { $project: { count: { $size: { $ifNull: ["$variants", []] } } } },
    { $group: { _id: null, variants: { $sum: "$count" } } },
  ]);

  return NextResponse.json({
    catalogue: {
      products: total,
      published,
      drafts: total - published,
      variants: variantAgg?.variants || 0,
      categories,
    },
    reservations: { held, releasedToday },
    capabilities: cfg.capabilities,
    includeDrafts: cfg.includeDrafts,
    stats: settings?.ncom?.stats || {},
    lastRequestAt: settings?.ncom?.lastRequestAt || null,
    lastRequestKind: settings?.ncom?.lastRequestKind || "",
    lastRefusalAt: settings?.ncom?.lastRefusalAt || null,
    lastRefusalReason: settings?.ncom?.lastRefusalReason || "",
  });
}
