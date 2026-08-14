// Push the catalogue to ncom.bd: categories, then products, then opening stock.
//
// Re-runnable. Products match on externalId (our Mongo _id), so a second run
// updates rather than duplicates. Categories remember their remote id on
// Category.ncomId, so renaming one here updates it there instead of making a
// second copy.
//
// DRY RUN BY DEFAULT — pass --live to actually write to the workspace.
//
//   node scripts/ncom-migrate.mjs                 # print exactly what would be sent
//   node scripts/ncom-migrate.mjs --live          # do it
//   node scripts/ncom-migrate.mjs --live --no-images
//   node scripts/ncom-migrate.mjs --live --skip-stock
//
// Requires NCOM_API_KEY with PRODUCTS_WRITE, CATEGORIES_WRITE and
// INVENTORY_WRITE. Run scripts/ncom-backfill-skus.mjs --live first: stock sync
// keys on SKU, and products without one can never be reconciled.
//
import mongoose from "mongoose";
import { ncomFetch, toNcomProduct, takaToCents } from "../lib/ncom.js";

try {
  const dotenv = await import("dotenv");
  (dotenv.default ?? dotenv).config({ path: process.env.ENV_FILE || ".env.local" });
} catch { /* dotenv not installed — using process.env directly */ }

const { MONGODB_URI, NCOM_API_KEY } = process.env;
const LIVE = process.argv.includes("--live");
const INCLUDE_IMAGES = !process.argv.includes("--no-images");
const SKIP_STOCK = process.argv.includes("--skip-stock");
const BATCH = 100; // their import cap

if (!MONGODB_URI) {
  console.error("MONGODB_URI is not set.");
  process.exit(1);
}
if (!NCOM_API_KEY) {
  console.error("NCOM_API_KEY is not set. Create one at Developers → API keys.");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
const db = mongoose.connection;
const productsCol = db.collection("products");
const categoriesCol = db.collection("categories");

const label = LIVE ? "LIVE" : "DRY RUN";
console.log(`\n=== ncom migrate (${label}) ===\n`);

// ---------------------------------------------------------------------------
// 0. Sanity-check the workspace
// ---------------------------------------------------------------------------

const { data: me } = await ncomFetch("/me");
console.log(`Workspace: ${me.organization.name} (${me.organization.slug})`);
console.log(`Currency:  ${me.organization.currencyCode}`);
console.log(`Key:       ${me.key.name} [${me.key.scopes.join(", ")}]\n`);

if (me.organization.currencyCode !== "BDT") {
  console.warn(
    `  !! Workspace currency is ${me.organization.currencyCode}, not BDT.\n` +
    `     Prices are pushed as taka x 100, so a 1290 Tk product will read as\n` +
    `     ${me.organization.currencyCode} 1,290.00 until you switch the workspace to BDT.\n`
  );
}

for (const needed of ["PRODUCTS_WRITE", "CATEGORIES_WRITE", "INVENTORY_WRITE"]) {
  if (!me.key.scopes.includes(needed)) console.warn(`  !! key is missing ${needed}`);
}

// ---------------------------------------------------------------------------
// 1. Categories — parents before children, three levels max
// ---------------------------------------------------------------------------

const categories = await categoriesCol.find({}).sort({ sortOrder: 1, name: 1 }).toArray();
const byId = new Map(categories.map((c) => [String(c._id), c]));

function depthOf(cat) {
  let d = 1;
  let cur = cat;
  const guard = new Set();
  while (cur?.parent && !guard.has(String(cur._id))) {
    guard.add(String(cur._id));
    cur = byId.get(String(cur.parent));
    if (!cur) break;
    d++;
  }
  return d;
}

const tooDeep = categories.filter((c) => depthOf(c) > 3);
if (tooDeep.length) {
  console.error(`Refusing to run: ${tooDeep.length} categor(ies) sit deeper than the 3 levels ncom allows:`);
  for (const c of tooDeep) console.error(`  ${c.name} (depth ${depthOf(c)})`);
  process.exit(1);
}

// Shallowest first, so a parent always exists before its child is created.
const ordered = [...categories].sort((a, b) => depthOf(a) - depthOf(b));
const categoryMap = new Map(); // our _id → their id

console.log(`Categories (${ordered.length}):`);
for (const cat of ordered) {
  const parentNcomId = cat.parent ? categoryMap.get(String(cat.parent)) : null;
  const body = {
    name: cat.name,
    ...(cat.code ? { code: cat.code } : {}),
    ...(parentNcomId ? { parentId: parentNcomId } : {}),
  };

  if (!LIVE) {
    const fakeId = `dry-${cat.slug}`;
    categoryMap.set(String(cat._id), fakeId);
    console.log(`  [would ${cat.ncomId ? "update" : "create"}] ${cat.name}${cat.code ? ` (${cat.code})` : ""}${parentNcomId ? ` under ${parentNcomId}` : ""}`);
    continue;
  }

  try {
    let remoteId = cat.ncomId;
    if (remoteId) {
      await ncomFetch(`/categories/${remoteId}`, { method: "PATCH", body });
      console.log(`  updated ${cat.name} → ${remoteId}`);
    } else {
      const { data } = await ncomFetch("/categories", { method: "POST", body });
      remoteId = data.id;
      await categoriesCol.updateOne({ _id: cat._id }, { $set: { ncomId: remoteId } });
      console.log(`  created ${cat.name} → ${remoteId}`);
    }
    categoryMap.set(String(cat._id), remoteId);
  } catch (e) {
    console.error(`  FAILED ${cat.name}: [${e.code}] ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Products — batches of 100 through the import endpoint
// ---------------------------------------------------------------------------

const products = await productsCol.find({}).sort({ createdAt: 1 }).toArray();
const noSku = products.filter((p) => (p.variants || []).some((v) => !v.sku));
if (noSku.length) {
  console.warn(
    `\n  !! ${noSku.length} product(s) still have variants without a SKU. They will import,\n` +
    `     but stock can never sync for them. Run scripts/ncom-backfill-skus.mjs --live.\n`
  );
}

console.log(`\nProducts (${products.length}), batches of ${BATCH}:`);

const totals = { created: 0, updated: 0, failed: 0 };

for (let i = 0; i < products.length; i += BATCH) {
  const chunk = products.slice(i, i + BATCH).map((p) => toNcomProduct(p, categoryMap, { includeImages: INCLUDE_IMAGES }));

  if (!LIVE) {
    for (const p of chunk) {
      const prices = p.variants.map((v) => v.priceCents);
      console.log(
        `  [would import] ${p.title}  externalId=${p.externalId}  status=${p.status}  ` +
        `${p.variants.length} variant(s)  priceCents ${Math.min(...prices)}–${Math.max(...prices)}` +
        `${p.categoryId ? `  cat=${p.categoryId}` : "  (no category)"}`
      );
    }
    if (i === 0 && chunk.length) {
      console.log(`\n  Full payload for the first product:\n`);
      console.log(JSON.stringify(chunk[0], null, 2).split("\n").map((l) => `    ${l}`).join("\n"));
      console.log();
    }
    continue;
  }

  try {
    const { data } = await ncomFetch("/products/import", {
      method: "POST",
      body: { source: "elysium", products: chunk },
    });
    totals.created += data.created;
    totals.updated += data.updated;
    totals.failed += data.failed;

    console.log(`  ${i + chunk.length}/${products.length} — created ${data.created}, updated ${data.updated}, failed ${data.failed}`);
    for (const problem of data.errors || []) {
      console.error(`    failed externalId=${problem.externalId} — ${problem.error}`);
    }
  } catch (e) {
    console.error(`  batch starting at ${i} FAILED: [${e.code}] ${e.message}`);
    for (const f of e.fields || []) console.error(`    ${f.path}: ${f.message}`);
  }
}

if (LIVE) console.log(`\nImport totals — created ${totals.created}, updated ${totals.updated}, failed ${totals.failed}`);

// ---------------------------------------------------------------------------
// 3. Opening stock — separate, because the import deliberately doesn't set it
// ---------------------------------------------------------------------------

if (!SKIP_STOCK) {
  const updates = [];
  for (const p of products) {
    for (const v of p.variants || []) {
      if (v.sku) updates.push({ sku: v.sku, available: Math.max(0, Number(v.stock) || 0) });
    }
  }

  console.log(`\nOpening stock (${updates.length} variant(s)):`);

  if (!LIVE) {
    for (const u of updates.slice(0, 10)) console.log(`  [would set] ${u.sku} → ${u.available}`);
    if (updates.length > 10) console.log(`  … and ${updates.length - 10} more`);
  } else {
    for (let i = 0; i < updates.length; i += 250) {
      const batch = updates.slice(i, i + 250);
      try {
        await ncomFetch("/inventory", { method: "POST", body: { updates: batch } });
        console.log(`  pushed ${i + batch.length}/${updates.length}`);
      } catch (e) {
        console.error(`  stock batch at ${i} FAILED: [${e.code}] ${e.message}`);
      }
    }
  }
}

if (!LIVE) {
  console.log(`\nDRY RUN — nothing was sent. Re-run with --live to apply.\n`);
} else {
  console.log(`\nDone. Register the webhook next: https://<your-domain>/api/ncom-webhook\n`);
}

await mongoose.disconnect();
