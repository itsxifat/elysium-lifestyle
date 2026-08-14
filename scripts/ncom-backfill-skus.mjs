// Allocate SKUs for products that don't have them.
//
// Stock sync addresses variants by SKU, so this is a prerequisite for
// scripts/ncom-migrate.mjs and for the /api/ncom-webhook receiver. It reuses
// the Settings-driven scheme from /admin/settings (prefix or category code +
// running number, optionally + size), so the codes it mints look exactly like
// the ones the admin panel produces.
//
// It deliberately does NOT touch slugs. The SKU scheme's appendToSlug option
// rewrites product URLs; doing that as a side effect of a stock integration
// would churn 13 live links for no reason. Enable it in the admin panel if you
// want it.
//
// DRY RUN BY DEFAULT — pass --live to write. (The older scripts in this folder
// default the other way; these ncom ones default safe because the sibling
// migrate script talks to an external service.)
//
//   node scripts/ncom-backfill-skus.mjs                  # preview
//   node scripts/ncom-backfill-skus.mjs --live           # write
//   node scripts/ncom-backfill-skus.mjs --live --enable-scheme
//
import mongoose from "mongoose";
import { skuConfig, buildBaseCode, buildVariantSku } from "../lib/sku.js";

try {
  const dotenv = await import("dotenv");
  (dotenv.default ?? dotenv).config({ path: process.env.ENV_FILE || ".env.local" });
} catch { /* dotenv not installed — using process.env directly */ }

const { MONGODB_URI } = process.env;
const LIVE = process.argv.includes("--live");
const ENABLE_SCHEME = process.argv.includes("--enable-scheme");

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection;

const settingsCol = db.collection("settings");
const productsCol = db.collection("products");
const categoriesCol = db.collection("categories");

let settings = await settingsCol.findOne({});
if (!settings) {
  if (!LIVE) {
    console.log("No settings document exists yet — it would be created with defaults.");
    settings = {};
  } else {
    const { insertedId } = await settingsCol.insertOne({ createdAt: new Date(), updatedAt: new Date() });
    settings = await settingsCol.findOne({ _id: insertedId });
  }
}

const cfg = skuConfig(settings?.sku);
console.log(`SKU scheme: codeSource=${cfg.codeSource} prefix=${cfg.prefix} separator="${cfg.separator}" padding=${cfg.padding} appendSize=${cfg.appendSize} enabled=${cfg.enabled}`);

if (!cfg.enabled) {
  console.log(
    "\n  NOTE: the scheme is currently DISABLED, so products created from the admin\n" +
    "  panel will keep arriving without SKUs. This backfill fills in the existing\n" +
    "  ones regardless; pass --enable-scheme to turn it on for future products,\n" +
    "  or flip it yourself at /admin/settings.\n"
  );
}

// Category codes, for codeSource="category".
const categoryCodes = new Map(
  (await categoriesCol.find({}).project({ code: 1 }).toArray()).map((c) => [String(c._id), c.code || ""])
);

const products = await productsCol.find({}).sort({ createdAt: 1 }).toArray();

let next = Number(settings?.sku?.nextNumber) || 1;
const ops = [];
const preview = [];
const seenSkus = new Set();

// Existing SKUs stay reserved so a re-run can't mint a colliding one.
for (const p of products) {
  for (const v of p.variants || []) if (v.sku) seenSkus.add(v.sku);
}

for (const p of products) {
  const variants = p.variants || [];
  const complete = p.skuBase && variants.length > 0 && variants.every((v) => v.sku);
  if (complete) continue;

  const skuBase =
    p.skuBase ||
    buildBaseCode(cfg, {
      number: next++,
      categoryCode: cfg.codeSource === "category" ? categoryCodes.get(String(p.category)) || "" : "",
    });

  const newVariants = variants.map((v) => {
    if (v.sku) return v;
    let sku = buildVariantSku(cfg, skuBase, v.size);
    // Only possible if two variants share a size, which the schema doesn't
    // forbid; suffix rather than emit a duplicate the stock sync would confuse.
    let n = 2;
    while (seenSkus.has(sku)) sku = `${buildVariantSku(cfg, skuBase, v.size)}${cfg.separator}${n++}`;
    seenSkus.add(sku);
    return { ...v, sku };
  });

  ops.push({
    updateOne: {
      filter: { _id: p._id },
      update: { $set: { skuBase, variants: newVariants } },
    },
  });

  preview.push({
    product: p.name,
    base: skuBase,
    skus: newVariants.map((v) => `${v.size}→${v.sku}`).join("  "),
  });
}

if (!preview.length) {
  console.log("\nEvery product already has a base code and a SKU on every variant. Nothing to do.");
} else {
  console.log(`\n${preview.length} product(s) need SKUs:\n`);
  for (const row of preview) {
    console.log(`  ${row.product}`);
    console.log(`    base ${row.base}`);
    console.log(`    ${row.skus}`);
  }
}

if (LIVE && ops.length) {
  const result = await productsCol.bulkWrite(ops);
  const update = { $set: { "sku.nextNumber": next, updatedAt: new Date() } };
  if (ENABLE_SCHEME) update.$set["sku.enabled"] = true;
  await settingsCol.updateOne({ _id: settings._id }, update);

  console.log(`\nWrote ${result.modifiedCount} product(s). nextNumber is now ${next}.`);
  if (ENABLE_SCHEME) console.log("SKU scheme enabled — new products will be numbered automatically.");
} else if (ops.length) {
  console.log(`\nDRY RUN — nothing written. Re-run with --live to apply.`);
}

await mongoose.disconnect();
