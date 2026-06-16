export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import Settings from "@/models/Settings";
import { skuConfig, buildBaseCode, buildVariantSku, buildSlug } from "@/lib/sku";
import { slugify } from "@/lib/utils";

// Backfill SKUs + slugs for existing products using the saved SKU scheme.
// Assigns each product a base code (running number), sets every variant's SKU,
// and — when appendToSlug is on — moves the slug to name+code, recording the old
// slug in previousSlugs so /shop/<old> 301-redirects to the new one.
//
// Idempotent by default: only products that don't yet have a skuBase are touched.
// POST { force: true } regenerates ALL products (re-numbers them).
export async function POST(request) {
  const { error } = await requireAdmin("products.manage");
  if (error) return error;

  try {
    await connectDB();
    const body = await request.json().catch(() => ({}));
    const force = !!body.force;

    const settings = (await Settings.findOne()) || (await Settings.create({}));
    const cfg = skuConfig(settings.sku);

    const catCode = new Map(
      (await Category.find({}).select("_id code").lean()).map((c) => [String(c._id), c.code || ""])
    );

    // Oldest first so numbering follows creation order.
    const query = force ? {} : { $or: [{ skuBase: { $exists: false } }, { skuBase: "" }] };
    const products = await Product.find(query).sort({ createdAt: 1 });

    // Slugs already in use (to guarantee uniqueness when appendToSlug is off).
    const taken = new Set(
      (await Product.find({}).select("slug").lean()).map((p) => p.slug)
    );

    let number = Number(settings.sku?.nextNumber) || 1;
    let migrated = 0;
    const failures = [];

    for (const p of products) {
      try {
        const categoryCode = catCode.get(String(p.category)) || "";
        const baseCode = buildBaseCode(cfg, { number, categoryCode });

        // Variant SKUs.
        p.variants.forEach((v) => { v.sku = buildVariantSku(cfg, baseCode, v.size); });

        // Slug — keep unique even if appendToSlug is off.
        let newSlug = buildSlug(cfg, p.name, baseCode);
        if (newSlug !== p.slug) {
          taken.delete(p.slug);
          if (taken.has(newSlug)) newSlug = `${slugify(p.name)}-${slugify(baseCode)}`;
          let candidate = newSlug, n = 2;
          while (taken.has(candidate)) candidate = `${newSlug}-${n++}`;
          newSlug = candidate;

          if (p.slug && !p.previousSlugs.includes(p.slug)) p.previousSlugs.push(p.slug);
          p.slug = newSlug;
          taken.add(newSlug);
        }

        p.skuBase = baseCode;
        await p.save();
        number += 1;
        migrated += 1;
      } catch (e) {
        failures.push({ id: String(p._id), name: p.name, error: e.message });
      }
    }

    settings.sku = { ...cfg, nextNumber: number };
    await settings.save();

    return NextResponse.json({
      ok: true,
      migrated,
      nextNumber: number,
      scanned: products.length,
      failures,
    });
  } catch (err) {
    console.error("POST /api/admin/products/migrate-skus error:", err);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
