// Allocate a base code + per-variant SKUs for anything missing them, reusing
// the Settings-driven scheme so the codes match what the admin panel mints.
//
// This used to live in lib/ncom-sync.js, because stock sync addressed variants
// BY SKU and a missing one meant a variant that could never sync. Under ncom's
// contract 1 that is no longer true — variants are addressed by their own id,
// which cannot be edited or duplicated — so this is now what it always should
// have been: a catalogue housekeeping tool. SKUs still travel to ncom as
// metadata and are copied onto their order lines, so having them is worth it.
//
// Deliberately does NOT touch slugs: the scheme's appendToSlug option rewrites
// product URLs, and doing that as a side effect of a backfill would churn live
// links for no reason.
//
// Relative imports only, so scripts/backfill-skus.mjs can import this with
// plain node (no "@/" alias resolution there).
import Settings from "../models/Settings.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { skuConfig, buildBaseCode, buildVariantSku } from "./sku.js";

// SKUs owned by more than one variant. Harmless to the ncom connector now, but
// still a data-entry slip worth naming: two products sharing a SKU makes the
// scanner app and every stock report ambiguous.
export function duplicateSkus(products) {
  const owners = new Map();
  for (const p of products) {
    for (const v of p.variants || []) {
      if (!v.sku) continue;
      if (!owners.has(v.sku)) owners.set(v.sku, []);
      owners.get(v.sku).push(`${p.name} (${v.size})`);
    }
  }
  return [...owners.entries()].filter(([, list]) => list.length > 1);
}

// A tiny log collector — the shape the admin panel renders.
function makeLog() {
  const lines = [];
  const push = (level) => (text) => lines.push({ level, text });
  return {
    lines,
    info: push("info"),
    warn: push("warn"),
    error: push("error"),
    ok: push("success"),
  };
}

export async function backfillSkus({ dryRun = true, enableScheme = false } = {}) {
  const log = makeLog();

  let settings = await Settings.findOne({});
  if (!settings) {
    if (dryRun) {
      log.info("No settings document exists yet — it would be created with defaults.");
      settings = new Settings({});
    } else {
      settings = await Settings.create({});
    }
  }

  const cfg = skuConfig(settings.sku);
  log.info(
    `Scheme: codeSource=${cfg.codeSource} prefix=${cfg.prefix} separator="${cfg.separator}" ` +
    `padding=${cfg.padding} appendSize=${cfg.appendSize}`
  );

  if (!cfg.enabled && !enableScheme) {
    log.warn(
      "The SKU scheme is currently disabled, so products created from the admin panel will keep " +
      "arriving without SKUs. This backfill fills in existing ones regardless — tick “Enable scheme " +
      "for new products” to turn it on."
    );
  }

  const categoryCodes = new Map(
    (await Category.find({}).select("code").lean()).map((c) => [String(c._id), c.code || ""])
  );

  const products = await Product.find({}).sort({ createdAt: 1 }).lean();

  let next = Number(settings.sku?.nextNumber) || 1;
  const seen = new Set();
  for (const p of products) for (const v of p.variants || []) if (v.sku) seen.add(v.sku);

  const ops = [];
  const assignments = [];

  for (const p of products) {
    const variants = p.variants || [];
    if (p.skuBase && variants.length > 0 && variants.every((v) => v.sku)) continue;

    const skuBase =
      p.skuBase ||
      buildBaseCode(cfg, {
        number: next++,
        categoryCode: cfg.codeSource === "category" ? categoryCodes.get(String(p.category)) || "" : "",
      });

    const newVariants = variants.map((v) => {
      if (v.sku) return v;
      let sku = buildVariantSku(cfg, skuBase, v.size);
      // Only reachable when two variants share a size, which the schema allows;
      // suffix rather than emit a duplicate that makes every report ambiguous.
      let n = 2;
      while (seen.has(sku)) sku = `${buildVariantSku(cfg, skuBase, v.size)}${cfg.separator}${n++}`;
      seen.add(sku);
      return { ...v, sku };
    });

    ops.push({ updateOne: { filter: { _id: p._id }, update: { $set: { skuBase, variants: newVariants } } } });
    assignments.push({
      name: p.name,
      skuBase,
      skus: newVariants.map((v) => `${v.size}→${v.sku}`).join("  "),
    });
  }

  const dupes = duplicateSkus(products);
  if (dupes.length) {
    log.warn(`${dupes.length} SKU(s) are used by more than one variant:`);
    for (const [sku, list] of dupes.slice(0, 10)) log.warn(`  ${sku} → ${list.join(" | ")}`);
    if (dupes.length > 10) log.warn(`  …and ${dupes.length - 10} more`);
  }

  if (!assignments.length) {
    log.ok("Every product already has a base code and a SKU on every variant. Nothing to do.");
    return { ok: true, log: log.lines, stats: { updated: 0, duplicates: dupes.length } };
  }

  log.info(`${assignments.length} product(s) need SKUs:`);
  for (const a of assignments) log.info(`  ${a.name} — base ${a.skuBase} — ${a.skus}`);

  if (dryRun) {
    log.warn("Dry run — nothing written.");
    return { ok: true, dryRun: true, log: log.lines, stats: { wouldUpdate: assignments.length, duplicates: dupes.length } };
  }

  const result = await Product.bulkWrite(ops);
  const update = { "sku.nextNumber": next };
  if (enableScheme) update["sku.enabled"] = true;
  await Settings.updateOne({ _id: settings._id }, { $set: update });

  log.ok(`Wrote ${result.modifiedCount} product(s). Next number is ${next}.`);
  if (enableScheme) log.ok("SKU scheme enabled — new products will be numbered automatically.");

  return { ok: true, log: log.lines, stats: { updated: result.modifiedCount, duplicates: dupes.length } };
}
