import Settings from "@/models/Settings";
import Category from "@/models/Category";
import Product from "@/models/Product";
import { skuConfig, buildBaseCode, buildVariantSku, buildSlug } from "@/lib/sku";

// DB-aware SKU helpers (kept separate from the pure lib/sku.js so the generator
// stays importable without pulling Mongoose in).

// Find a free product slug, suffixing on collision. With a base code the slug is
// already unique, so a numeric suffix is plenty; otherwise fall back to random.
export async function uniqueSlug(slug, { excludeId = null, hasBase = false } = {}) {
  let candidate = slug;
  let n = 2;
  for (let i = 0; i < 60; i++) {
    const q = { slug: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const clash = await Product.findOne(q).select("_id").lean();
    if (!clash) return candidate;
    candidate = hasBase ? `${slug}-${n++}` : `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

// Apply the configured SKU scheme to a product payload (create or update).
//   - create (no existing base): allocate a base code + bump the global counter
//   - update: reuse the base, refresh variant SKUs, rebuild the slug from the
//     (possibly new) name, recording the old slug in previousSlugs for redirects
// Returns the fields to merge into the product, or { applied:false } when the
// scheme is disabled (caller keeps its legacy slug logic).
export async function applySkuScheme(data, { existing = null } = {}) {
  const settings = (await Settings.findOne()) || (await Settings.create({}));
  const cfg = skuConfig(settings.sku);
  if (!cfg.enabled) return { applied: false, cfg };

  let skuBase = existing?.skuBase || "";
  if (!skuBase) {
    const number = Number(settings.sku?.nextNumber) || 1;
    let categoryCode = "";
    const categoryId = data.category ?? existing?.category;
    if (cfg.codeSource === "category" && categoryId) {
      const cat = await Category.findById(categoryId).select("code").lean();
      categoryCode = cat?.code || "";
    }
    skuBase = buildBaseCode(cfg, { number, categoryCode });
    settings.sku = { ...cfg, nextNumber: number + 1 };
    await settings.save();
  }

  const name = data.name ?? existing?.name;
  const sourceVariants = data.variants ?? existing?.variants ?? [];
  const variants = sourceVariants.map((v) => {
    const plain = typeof v?.toObject === "function" ? v.toObject() : v;
    return { ...plain, sku: buildVariantSku(cfg, skuBase, plain.size) };
  });

  const slug = await uniqueSlug(buildSlug(cfg, name, skuBase), {
    excludeId: existing?._id,
    hasBase: cfg.appendToSlug,
  });

  const out = { applied: true, cfg, skuBase, variants, slug };
  if (existing && existing.slug && existing.slug !== slug) {
    const prev = Array.isArray(existing.previousSlugs) ? existing.previousSlugs.slice() : [];
    if (!prev.includes(existing.slug)) prev.push(existing.slug);
    out.previousSlugs = prev;
  }
  return out;
}
