// Repair SKUs that are shared by more than one variant.
//
// Stock is addressed BY SKU on both sides of the ncom sync, so a SKU held by
// several variants cannot be reconciled at all: a push meant for one lands on
// whichever the lookup returned, the reconcile compares against whichever won
// the map, and the two systems report drift that never settles no matter how
// many times you push.
//
// The cause was a read-modify-write on Settings.sku.nextNumber in
// lib/sku-server.js — concurrent product creates all read the same counter and
// all minted the same base code. That is fixed there; this repairs the rows it
// already produced.
//
// Rule: within a group of products sharing a base code, the OLDEST keeps it and
// every other product is issued a fresh one. Keeping the oldest means the
// product whose SKU is most likely to be on a printed label, a supplier order
// or a spreadsheet is the one that does not move.
//
// DRY RUN BY DEFAULT — pass --live to write.
//
import { connect, finish } from "./_ncom-cli.mjs";

await connect();

const Product = (await import("../models/Product.js")).default;
const Settings = (await import("../models/Settings.js")).default;
const Category = (await import("../models/Category.js")).default;
const { skuConfig, buildBaseCode, buildVariantSku } = await import("../lib/sku.js");

const dryRun = !process.argv.includes("--live");
const log = [];
const say = (line) => {
  log.push(line);
  console.log(line);
};

say(`\n=== fix duplicate SKUs (${dryRun ? "DRY RUN" : "LIVE"}) — ${new Date().toISOString()} ===\n`);

const settings = (await Settings.findOne({})) || (await Settings.create({}));
const cfg = skuConfig(settings.sku);
say(`Scheme: codeSource=${cfg.codeSource} prefix=${cfg.prefix} separator="${cfg.separator}" padding=${cfg.padding} appendSize=${cfg.appendSize}`);

const categoryCodes = new Map(
  (await Category.find({}).select("code").lean()).map((c) => [String(c._id), c.code || ""])
);

// Oldest first, so the first product in each group is the one that keeps its code.
const products = await Product.find({}).sort({ createdAt: 1 }).lean();

const usedBases = new Set(products.map((p) => p.skuBase).filter(Boolean));
const usedSkus = new Set();
for (const p of products) for (const v of p.variants || []) if (v.sku) usedSkus.add(v.sku);

let next = Number(settings.sku?.nextNumber) || 1;

// Never hand back a code that is already in use — the counter has been behind
// reality before, which is the whole reason this script exists.
function freshBase(categoryCode) {
  for (let guard = 0; guard < 1_000_000; guard++) {
    const base = buildBaseCode(cfg, { number: next++, categoryCode });
    if (!usedBases.has(base)) {
      usedBases.add(base);
      return base;
    }
  }
  throw new Error("Could not find a free base code");
}

function freshSku(base, size) {
  const wanted = buildVariantSku(cfg, base, size);
  if (!usedSkus.has(wanted)) {
    usedSkus.add(wanted);
    return wanted;
  }
  // Only reachable when one product carries two variants of the same size,
  // which the schema permits and ncom rejects. Suffix so the data is at least
  // self-consistent; the product itself still needs a human to merge the rows.
  for (let n = 2; ; n++) {
    const candidate = `${wanted}${cfg.separator}${n}`;
    if (!usedSkus.has(candidate)) {
      usedSkus.add(candidate);
      return candidate;
    }
  }
}

// --- group by base code ----------------------------------------------------
const byBase = new Map();
for (const p of products) {
  if (!p.skuBase) continue;
  if (!byBase.has(p.skuBase)) byBase.set(p.skuBase, []);
  byBase.get(p.skuBase).push(p);
}

const shared = [...byBase.entries()].filter(([, list]) => list.length > 1);
say(`\n${shared.length} base code(s) are shared by more than one product:`);
for (const [base, list] of shared) say(`  ${base} — ${list.length} products`);

// --- work out the rewrites -------------------------------------------------
const ops = [];
const changes = [];
let sameSizeProducts = 0;

for (const [, list] of shared) {
  // list[0] keeps its base; the rest are re-issued.
  for (const p of list.slice(1)) {
    const categoryCode = cfg.codeSource === "category" ? categoryCodes.get(String(p.category)) || "" : "";
    const base = freshBase(categoryCode);

    // The product's old SKUs stay in `usedSkus` on purpose — they are still
    // held by the sibling that kept the base code.
    const variants = (p.variants || []).map((v) => ({ ...v, sku: freshSku(base, v.size) }));

    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { skuBase: base, variants } } } });
    changes.push({
      name: p.name,
      id: String(p._id),
      from: p.skuBase,
      to: base,
      skus: variants.map((v) => `${v.size}→${v.sku}`).join("  "),
    });
  }
}

// --- products with two variants of the same size ---------------------------
// Not caused by the counter bug, but they collide the same way and ncom rejects
// the whole product for it, so they are worth naming here.
const sameSize = [];
for (const p of products) {
  const seen = new Set();
  const dupes = [];
  for (const v of p.variants || []) {
    const key = String(v.size || "").trim().toUpperCase();
    if (seen.has(key)) dupes.push(v);
    else seen.add(key);
  }
  if (dupes.length) {
    sameSize.push({ name: p.name, id: String(p._id), dupes: dupes.map((d) => `${d.size} (${d.sku}, stock ${d.stock})`) });
    sameSizeProducts++;
  }
}

say(`\n${changes.length} product(s) will be re-coded:`);
for (const c of changes.slice(0, 40)) {
  say(`  ${c.name} [${c.id}]  ${c.from} → ${c.to}`);
  say(`      ${c.skus}`);
}
if (changes.length > 40) say(`  …and ${changes.length - 40} more`);

if (sameSize.length) {
  say(`\n${sameSize.length} product(s) carry two variants of the SAME size. ncom allows one variant per`);
  say(`size, so it rejects the whole product — these need a human to merge or delete a row:`);
  for (const s of sameSize) say(`  ${s.name} [${s.id}] — ${s.dupes.join(", ")}`);
}

// --- verify the result would be clean --------------------------------------
const after = new Map();
for (const p of products) {
  const rewrite = changes.find((c) => c.id === String(p._id));
  const variants = rewrite
    ? ops.find((o) => String(o.updateOne.filter._id) === String(p._id)).updateOne.update.$set.variants
    : p.variants || [];
  for (const v of variants) {
    if (!v.sku) continue;
    after.set(v.sku, (after.get(v.sku) || 0) + 1);
  }
}
const stillDuplicated = [...after.entries()].filter(([, n]) => n > 1);
say(`\nAfter this run: ${after.size} distinct SKU(s), ${stillDuplicated.length} still duplicated.`);
for (const [sku, n] of stillDuplicated.slice(0, 20)) say(`  ${sku} x${n}`);

// Every line above was printed as it was produced, so `finish` is only here to
// disconnect and set the exit code.
if (dryRun) {
  say("\nDry run — nothing written. Re-run with --live to apply.");
  await finish({ ok: true });
} else {
  if (ops.length) await Product.bulkWrite(ops);
  await Settings.updateOne({}, { $set: { "sku.nextNumber": next } });
  say(`\nRe-coded ${changes.length} product(s). Counter advanced to ${next}.`);
  say("Now re-run the catalogue push so ncom picks up the new SKUs.");
  await finish({ ok: true });
}
