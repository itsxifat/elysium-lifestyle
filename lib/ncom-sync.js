// The three ncom.bd operations — SKU backfill, catalogue migrate, stock
// reconcile — written once and driven from two places: the CLI scripts in
// scripts/ and the admin panel at /admin/ncom.
//
// Relative imports only (see lib/ncom.js) so the plain-node scripts can import
// this without path-alias resolution. Every operation is dry-run capable and
// returns a structured log the admin UI renders verbatim, so what you see in
// the panel is exactly what the CLI prints.

import Settings from "../models/Settings.js";
import Product from "../models/Product.js";
import Category from "../models/Category.js";
import { skuConfig, buildBaseCode, buildVariantSku } from "./sku.js";
import { ncomFetch, ncomList, toNcomProduct, getNcomConfig, resolveImageUrls, PRICE_CURRENCY } from "./ncom.js";

const IMPORT_BATCH = 100; // their cap
const INVENTORY_BATCH = 250; // their cap

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

// ---------------------------------------------------------------------------
// Connection + status
// ---------------------------------------------------------------------------

const REQUIRED_SCOPES = ["PRODUCTS_WRITE", "CATEGORIES_WRITE", "INVENTORY_WRITE"];

export async function connectionStatus() {
  const cfg = await getNcomConfig({ fresh: true });
  if (!cfg.apiKey) {
    return { ok: false, configured: false, error: "No API key configured yet." };
  }

  try {
    const { data } = await ncomFetch("/me");
    const scopes = data.key?.scopes || [];
    const warnings = [];
    const org = data.organization || {};

    if (org.currencyCode !== PRICE_CURRENCY) {
      warnings.push(
        `Workspace currency is ${org.currencyCode}, not ${PRICE_CURRENCY}. Prices push as taka x 100, so a ` +
        `1290 Tk product would read as ${org.currencyCode} 1,290.00. Imports declare ${PRICE_CURRENCY} and ` +
        `will be refused outright until you switch the workspace currency — nothing can be mis-priced.`
      );
    } else if (org.currencyConfigured === false) {
      // Right currency, but nobody ever chose it — so it is a default that
      // could change under you rather than a decision.
      warnings.push(
        `The workspace currency is ${org.currencyCode} but was never explicitly chosen. Set it in the ncom ` +
        `dashboard so it can't shift beneath a future import.`
      );
    }
    for (const scope of REQUIRED_SCOPES) {
      if (!scopes.includes(scope)) warnings.push(`API key is missing the ${scope} permission.`);
    }

    return {
      ok: true,
      configured: true,
      source: cfg.source,
      organization: data.organization,
      key: data.key,
      scopes,
      warnings,
    };
  } catch (e) {
    return { ok: false, configured: true, source: cfg.source, error: e.message, code: e.code };
  }
}

// Local vs remote counts, so the panel can show what still needs doing without
// running anything.
export async function syncStatus() {
  const products = await Product.find({}).select("name variants skuBase category").lean();
  const categories = await Category.find({}).select("name ncomId").lean();

  const variants = products.flatMap((p) => p.variants || []);
  const missingSku = variants.filter((v) => !v.sku).length;

  const local = {
    products: products.length,
    variants: variants.length,
    missingSku,
    categories: categories.length,
    categoriesLinked: categories.filter((c) => c.ncomId).length,
  };

  const settings = await Settings.findOne({}).select("ncom sku").lean();
  const schemeEnabled = Boolean(settings?.sku?.enabled);

  const cfg = await getNcomConfig();
  if (!cfg.apiKey) return { local, remote: null, schemeEnabled, ncom: settings?.ncom || {} };

  try {
    const [remoteProducts, remoteCategories, remoteInventory] = await Promise.all([
      ncomFetch("/products?limit=1").then((r) => r.pagination?.total ?? 0),
      ncomFetch("/categories?flat=true").then((r) => (r.data || []).length),
      ncomFetch("/inventory?limit=1").then((r) => r.pagination?.total ?? 0),
    ]);

    return {
      local,
      remote: { products: remoteProducts, categories: remoteCategories, variants: remoteInventory },
      schemeEnabled,
      ncom: settings?.ncom || {},
    };
  } catch (e) {
    return { local, remote: null, remoteError: e.message, schemeEnabled, ncom: settings?.ncom || {} };
  }
}

// ---------------------------------------------------------------------------
// 1. SKU backfill
// ---------------------------------------------------------------------------

// Allocates a base code + per-variant SKUs for anything missing them, reusing
// the Settings-driven scheme so the codes match what the admin panel mints.
//
// Deliberately does NOT touch slugs: the scheme's appendToSlug option rewrites
// product URLs, and doing that as a side effect of a stock integration would
// churn live links for no reason.
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
      // suffix rather than emit a duplicate the stock sync would confuse.
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

  if (!assignments.length) {
    log.ok("Every product already has a base code and a SKU on every variant. Nothing to do.");
    return { ok: true, log: log.lines, stats: { updated: 0 } };
  }

  log.info(`${assignments.length} product(s) need SKUs:`);
  for (const a of assignments) log.info(`  ${a.name} — base ${a.skuBase} — ${a.skus}`);

  if (dryRun) {
    log.warn("Dry run — nothing written.");
    return { ok: true, dryRun: true, log: log.lines, stats: { wouldUpdate: assignments.length } };
  }

  const result = await Product.bulkWrite(ops);
  const update = { "sku.nextNumber": next };
  if (enableScheme) update["sku.enabled"] = true;
  await Settings.updateOne({ _id: settings._id }, { $set: update });

  log.ok(`Wrote ${result.modifiedCount} product(s). Next number is ${next}.`);
  if (enableScheme) log.ok("SKU scheme enabled — new products will be numbered automatically.");

  return { ok: true, log: log.lines, stats: { updated: result.modifiedCount } };
}

// ---------------------------------------------------------------------------
// 2. Catalogue migrate
// ---------------------------------------------------------------------------

export async function migrateCatalogue({ dryRun = true, skipStock = false } = {}) {
  const log = makeLog();
  const stats = { created: 0, updated: 0, failed: 0, categories: 0, stockPushed: 0 };

  // --- sanity check -------------------------------------------------------
  const status = await connectionStatus();
  if (!status.ok) {
    log.error(status.error || "Could not reach ncom.");
    return { ok: false, log: log.lines, stats };
  }
  log.info(`Workspace: ${status.organization.name} (${status.organization.slug}) — ${status.organization.currencyCode}`);
  for (const w of status.warnings) log.warn(w);

  // --- categories: parents before children, three levels max --------------
  const categories = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean();
  const byId = new Map(categories.map((c) => [String(c._id), c]));

  const depthOf = (cat) => {
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
  };

  const tooDeep = categories.filter((c) => depthOf(c) > 3);
  if (tooDeep.length) {
    log.error(`ncom allows three category levels; these sit deeper: ${tooDeep.map((c) => `${c.name} (${depthOf(c)})`).join(", ")}`);
    return { ok: false, log: log.lines, stats };
  }

  const ordered = [...categories].sort((a, b) => depthOf(a) - depthOf(b));
  const categoryMap = new Map();

  log.info(`Categories (${ordered.length}):`);
  for (const cat of ordered) {
    const parentNcomId = cat.parent ? categoryMap.get(String(cat.parent)) : null;
    const body = {
      name: cat.name,
      ...(cat.code ? { code: cat.code } : {}),
      ...(parentNcomId ? { parentId: parentNcomId } : {}),
    };

    if (dryRun) {
      categoryMap.set(String(cat._id), `dry-${cat.slug}`);
      log.info(`  would ${cat.ncomId ? "update" : "create"} ${cat.name}${cat.code ? ` (${cat.code})` : ""}`);
      continue;
    }

    try {
      let remoteId = cat.ncomId;
      if (remoteId) {
        await ncomFetch(`/categories/${remoteId}`, { method: "PATCH", body });
        log.info(`  updated ${cat.name}`);
      } else {
        const { data } = await ncomFetch("/categories", { method: "POST", body });
        remoteId = data.id;
        await Category.updateOne({ _id: cat._id }, { $set: { ncomId: remoteId } });
        log.info(`  created ${cat.name}`);
      }
      categoryMap.set(String(cat._id), remoteId);
      stats.categories++;
    } catch (e) {
      log.error(`  ${cat.name} failed: [${e.code}] ${e.message}`);
    }
  }

  // --- products -----------------------------------------------------------
  const products = await Product.find({}).sort({ createdAt: 1 }).lean();
  const noSku = products.filter((p) => (p.variants || []).some((v) => !v.sku));
  if (noSku.length) {
    log.warn(
      `${noSku.length} product(s) still have variants without a SKU. They will import, but stock can ` +
      `never sync for them — run the SKU backfill first.`
    );
  }

  // Images are the easiest thing to lose silently: they are stored as internal
  // proxy paths and have to be signed before an off-site fetcher can read them.
  // Report the count either way, so "no artwork arrived" is never a mystery.
  const withImages = products.filter((p) => (p.images || []).length);
  const unresolved = withImages.filter((p) => resolveImageUrls(p).length === 0);
  const imageCount = products.reduce((n, p) => n + resolveImageUrls(p).length, 0);

  if (unresolved.length) {
    log.warn(
      `${unresolved.length} of ${withImages.length} product(s) with images resolved to no usable URL — ` +
      `they will import without artwork.`
    );
    log.warn(`  first unresolved value: ${unresolved[0].images[0]}`);
    if (!process.env.CDN_API_SECRET) {
      log.warn(
        `  CDN_API_SECRET is not set in this environment, so image URLs cannot be signed. ` +
        `Run this from /admin/ncom (the app has the secret) rather than the command line.`
      );
    }
  } else if (imageCount) {
    log.info(`Images: ${imageCount} across ${withImages.length} product(s), sent as signed CDN URLs.`);
  }

  log.info(`Products (${products.length}), batches of ${IMPORT_BATCH}:`);

  // One bad field fails every row with an identical message. Printing 370 copies
  // of it buries the single fact you need, so errors are counted and reported
  // once, with a few examples.
  //
  // Group by the SHAPE of the message, not its text: an image-fetch failure
  // embeds the URL, so grouping on the raw string produces one entry per
  // product and collapses nothing — which is exactly how a wall of unreadable
  // log happened. Examples are product names, since an externalId is a Mongo
  // ObjectId nobody can act on.
  const errorTally = new Map();
  const normalize = (message) => String(message).replace(/https?:\/\/\S+/g, "<url>");
  const tally = (message, label) => {
    const key = normalize(message);
    const entry = errorTally.get(key) || { count: 0, examples: [] };
    entry.count++;
    if (entry.examples.length < 4) entry.examples.push(label);
    errorTally.set(key, entry);
  };
  const flushErrors = (heading) => {
    if (!errorTally.size) return;
    log.error(heading);
    for (const [message, { count, examples }] of [...errorTally].sort((a, b) => b[1].count - a[1].count)) {
      log.error(`  ${count}x  ${message}`);
      log.error(`        e.g. ${examples.join(", ")}`);
    }
    errorTally.clear();
  };

  // externalId → product name, so failures name something a human can find.
  const nameOf = new Map(products.map((p) => [String(p._id), p.name]));
  // Products ncom refused solely because an image would not download. It fails
  // the WHOLE product, not just the picture, so these are retried without
  // artwork below — losing a product over a dead photo is never the right trade.
  const imageBlocked = new Map();

  for (let i = 0; i < products.length; i += IMPORT_BATCH) {
    const chunk = products.slice(i, i + IMPORT_BATCH).map((p) => toNcomProduct(p, categoryMap));

    if (dryRun) {
      for (const p of chunk) {
        const prices = p.variants.map((v) => v.priceCents);
        log.info(
          `  would import ${p.title} — ${p.status}, ${p.variants.length} variant(s), ` +
          `priceCents ${Math.min(...prices)}–${Math.max(...prices)}${p.categoryId ? "" : " (no category)"}`
        );
      }
      continue;
    }

    try {
      const { data } = await ncomFetch("/products/import", {
        method: "POST",
        // Declaring the currency makes a mismatched workspace refuse the batch
        // before a single row is written, rather than importing wrong prices.
        body: { source: "elysium", expectCurrency: PRICE_CURRENCY, products: chunk },
      });
      for (const w of data.warnings || []) log.warn(`  ${w}`);
      stats.created += data.created;
      stats.updated += data.updated;
      stats.failed += data.failed;
      log.info(`  ${i + chunk.length}/${products.length} — created ${data.created}, updated ${data.updated}, failed ${data.failed}`);
      for (const problem of data.errors || []) {
        const label = nameOf.get(problem.externalId) || problem.externalId;
        tally(problem.error, label);
        if (/could not fetch/i.test(problem.error)) {
          imageBlocked.set(problem.externalId, { label, error: problem.error });
        }
      }
    } catch (e) {
      log.error(`  batch at ${i} failed: [${e.code}] ${e.message}`);
      for (const f of e.fields || []) log.error(`    ${f.path}: ${f.message}`);

      // A currency mismatch rejects every batch identically and writes nothing,
      // so grinding through the rest just repeats one message N times.
      if (e.code === "conflict") {
        log.error("  Stopping — fix the workspace currency, then run this again. Nothing was written.");
        return { ok: false, log: log.lines, stats };
      }
    }
  }

  flushErrors(`${stats.failed} product(s) rejected:`);

  // --- second pass: rescue products blocked by an unfetchable image --------
  if (imageBlocked.size) {
    log.warn(
      `${imageBlocked.size} product(s) were rejected only because an image could not be downloaded. ` +
      `ncom fails the whole product in that case, so they are being re-sent without artwork — ` +
      `the product data is worth more than the photo.`
    );

    const retry = products.filter((p) => imageBlocked.has(String(p._id)));
    stats.imageBlocked = imageBlocked.size;
    stats.rescued = 0;

    for (let i = 0; i < retry.length; i += IMPORT_BATCH) {
      const chunk = retry.slice(i, i + IMPORT_BATCH).map((p) => {
        const mapped = toNcomProduct(p, categoryMap);
        delete mapped.images;
        return mapped;
      });

      try {
        const { data } = await ncomFetch("/products/import", {
          method: "POST",
          body: { source: "elysium", expectCurrency: PRICE_CURRENCY, products: chunk },
        });
        stats.created += data.created;
        stats.updated += data.updated;
        stats.rescued += data.created + data.updated;
        stats.failed -= data.created + data.updated;
        for (const problem of data.errors || []) {
          tally(problem.error, nameOf.get(problem.externalId) || problem.externalId);
        }
      } catch (e) {
        log.error(`  retry batch at ${i} failed: [${e.code}] ${e.message}`);
      }
    }

    log.ok(`Rescued ${stats.rescued} of ${imageBlocked.size} — imported, but with no images.`);
    flushErrors("Still rejected after dropping images:");

    log.warn("These products need their broken images fixed, then a re-run:");
    for (const { label, error } of [...imageBlocked.values()].slice(0, 15)) {
      log.warn(`  ${label} — ${error.replace(/^Could not fetch /, "")}`);
    }
    if (imageBlocked.size > 15) log.warn(`  …and ${imageBlocked.size - 15} more`);
  }

  // --- opening stock (the import deliberately doesn't set it) -------------
  if (!skipStock) {
    const updates = [];
    for (const p of products) {
      for (const v of p.variants || []) {
        if (v.sku) updates.push({ sku: v.sku, available: Math.max(0, Number(v.stock) || 0) });
      }
    }

    log.info(`Opening stock (${updates.length} variant(s)):`);
    if (dryRun) {
      for (const u of updates.slice(0, 10)) log.info(`  would set ${u.sku} → ${u.available}`);
      if (updates.length > 10) log.info(`  …and ${updates.length - 10} more`);
    } else {
      for (let i = 0; i < updates.length; i += INVENTORY_BATCH) {
        const batch = updates.slice(i, i + INVENTORY_BATCH);
        try {
          const res = await ncomFetch("/inventory", { method: "POST", body: { updates: batch } });
          // A 200 can still carry per-SKU failures, so count what was applied
          // rather than assuming the whole batch landed.
          stats.stockPushed += res?.data?.applied ?? batch.length;
          for (const f of res?.data?.errors || []) tally(`stock — ${f.error}`, f.sku);
          for (const c of res?.data?.clamps || []) {
            log.warn(`  clamped ${c.sku}: asked ${c.requested}, applied ${c.applied}, now ${c.available}`);
          }
        } catch (e) {
          log.error(`  stock batch at ${i} failed: [${e.code}] ${e.message}`);
          for (const f of e.errors || []) tally(`stock — ${f.error}`, f.sku);
        }
      }
      log.info(`  pushed ${stats.stockPushed}/${updates.length}`);
      flushErrors("Stock not applied:");
      // Stock matches on SKU, so nothing lands until the products themselves
      // exist over there. Say so rather than leaving five identical failures.
      if (stats.stockPushed === 0 && updates.length > 0) {
        log.warn(
          "  No stock applied — their side has no variant with these SKUs yet. " +
          "That is expected when the product import above failed; fix that and re-run."
        );
      }
    }
  }

  if (dryRun) {
    log.warn("Dry run — nothing was sent.");
  } else {
    await Settings.updateOne({}, { $set: { "ncom.lastMigrateAt": new Date() } });
    log.ok(`Done — created ${stats.created}, updated ${stats.updated}, failed ${stats.failed}.`);
  }

  return { ok: true, dryRun, log: log.lines, stats };
}

// ---------------------------------------------------------------------------
// Image audit
// ---------------------------------------------------------------------------

// Fetch every product image the way ncom would, and report what breaks.
//
// Worth having as its own action because ncom rejects the ENTIRE product when
// any one image 404s — so a single dead photo silently costs you a product, and
// the import log can only tell you afterwards. This tells you beforehand, by
// name.
export async function auditImages({ concurrency = 8 } = {}) {
  const log = makeLog();
  const products = await Product.find({}).select("name slug images").lean();

  const targets = [];
  const noneResolved = [];
  let unusableValues = 0;

  for (const p of products) {
    const stored = p.images || [];
    const urls = resolveImageUrls(p);
    unusableValues += stored.length - urls.length;
    if (stored.length && !urls.length) noneResolved.push(p);
    for (const url of urls) targets.push({ product: p, url });
  }

  log.info(`${products.length} product(s), ${targets.length} image URL(s) to check.`);
  if (unusableValues) {
    log.warn(`${unusableValues} stored image value(s) could not be turned into a URL at all (legacy /uploads paths or blanks) — those are simply not sent.`);
  }
  if (!process.env.CDN_API_SECRET) {
    log.error("CDN_API_SECRET is not set here, so nothing can be signed — run this from /admin/ncom.");
    return { ok: false, log: log.lines, stats: {} };
  }

  const broken = [];
  let ok = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= targets.length) return;
      const { product, url } = targets[i];
      try {
        // GET, not HEAD — some CDNs answer HEAD differently, and ncom does a GET.
        const res = await fetch(url, { redirect: "follow" });
        if (res.ok) ok++;
        else broken.push({ name: product.name, slug: product.slug, url, status: res.status });
      } catch (e) {
        broken.push({ name: product.name, slug: product.slug, url, status: e.message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length || 1) }, worker));

  if (!broken.length) {
    log.ok(`All ${ok} image(s) fetched cleanly. Nothing here will block an import.`);
  } else {
    log.error(`${broken.length} image(s) cannot be downloaded — each one blocks its whole product:`);
    for (const b of broken.slice(0, 40)) {
      log.error(`  [${b.status}] ${b.name}`);
      log.error(`         ${b.url.slice(0, 120)}`);
    }
    if (broken.length > 40) log.error(`  …and ${broken.length - 40} more`);
    log.warn(`Fix these in /admin/products (re-upload or remove the image), then push again. ${ok} other image(s) are fine.`);
  }

  if (noneResolved.length) {
    log.warn(`${noneResolved.length} product(s) have images stored that resolve to nothing — they import with no artwork:`);
    for (const p of noneResolved.slice(0, 15)) log.warn(`  ${p.name} — ${p.images[0]}`);
    if (noneResolved.length > 15) log.warn(`  …and ${noneResolved.length - 15} more`);
  }

  return {
    ok: true,
    log: log.lines,
    stats: { checked: targets.length, ok, broken: broken.length, unresolved: noneResolved.length },
  };
}

// ---------------------------------------------------------------------------
// 3. Stock reconcile
// ---------------------------------------------------------------------------

// Absolute counts, pushed from the side that does the physical counting.
// Deltas drift over months; this is what pulls them back.
export async function reconcileStock({ dryRun = true } = {}) {
  const log = makeLog();

  const products = await Product.find({}).select("name variants").lean();
  const ours = new Map();
  for (const p of products) {
    for (const v of p.variants || []) {
      if (v.sku) ours.set(v.sku, { stock: Math.max(0, Number(v.stock) || 0), product: p.name, size: v.size });
    }
  }

  let remote;
  try {
    remote = await ncomList("/inventory");
  } catch (e) {
    log.error(`Could not read remote inventory: [${e.code}] ${e.message}`);
    return { ok: false, log: log.lines, stats: {} };
  }

  const theirs = new Map(remote.filter((r) => r.sku).map((r) => [r.sku, Number(r.available)]));

  const updates = [];
  const drift = [];
  const unknown = [];

  for (const [sku, local] of ours) {
    if (!theirs.has(sku)) {
      unknown.push(sku);
      continue;
    }
    if (theirs.get(sku) !== local.stock) {
      drift.push({ sku, product: local.product, size: local.size, theirs: theirs.get(sku), ours: local.stock });
    }
    updates.push({ sku, available: local.stock });
  }

  const orphans = [...theirs.keys()].filter((sku) => !ours.has(sku));

  log.info(`${ours.size} local SKU(s), ${theirs.size} remote, ${drift.length} drifted, ${unknown.length} not present remotely.`);
  for (const d of drift) log.warn(`  ${d.sku} — ${d.product} (${d.size}): theirs ${d.theirs} → ours ${d.ours}`);
  if (unknown.length) log.warn(`Local SKUs with no remote variant (run the migrate first): ${unknown.slice(0, 20).join(", ")}${unknown.length > 20 ? ` …+${unknown.length - 20}` : ""}`);
  if (orphans.length) log.info(`Remote SKUs with no local variant (left untouched): ${orphans.slice(0, 20).join(", ")}${orphans.length > 20 ? ` …+${orphans.length - 20}` : ""}`);

  const stats = { local: ours.size, remote: theirs.size, drift: drift.length, unknown: unknown.length, orphans: orphans.length };

  if (dryRun) {
    log.warn("Dry run — nothing written.");
    return { ok: true, dryRun: true, log: log.lines, stats };
  }

  let pushed = 0;
  for (let i = 0; i < updates.length; i += INVENTORY_BATCH) {
    const batch = updates.slice(i, i + INVENTORY_BATCH);
    try {
      const res = await ncomFetch("/inventory", { method: "POST", body: { updates: batch } });
      // 200 no longer means every row landed — count what was actually applied.
      pushed += res?.data?.applied ?? batch.length;
      for (const f of res?.data?.errors || []) log.error(`  ${f.sku}: ${f.error}`);
      for (const c of res?.data?.clamps || []) {
        log.warn(`  clamped ${c.sku}: asked ${c.requested}, applied ${c.applied}, now ${c.available}`);
      }
    } catch (e) {
      log.error(`  batch at ${i} failed: [${e.code}] ${e.message}`);
    }
  }

  await Settings.updateOne({}, { $set: { "ncom.lastReconcileAt": new Date() } });
  log.ok(`Reconciled ${pushed} SKU(s).`);

  return { ok: true, log: log.lines, stats: { ...stats, pushed } };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

// Topics we actually act on. inventory.updated drives stock; order.created is
// informational (acting on both would double-count one sale).
export const WEBHOOK_TOPICS = ["inventory.updated", "order.created"];

export async function listWebhooks() {
  const { data } = await ncomFetch("/webhooks");
  return data || [];
}

// Register our receiver, or update the existing registration if one already
// points at this URL.
//
// The signing secret is returned ONLY by create — GET and PATCH never expose
// it. So re-registering an endpoint that already exists cannot recover a secret
// nobody stored; the honest answer is to say so and offer to replace it, which
// mints a new one (and breaks the old until it is saved).
export async function registerWebhook(url, { replace = false } = {}) {
  const existing = await listWebhooks().catch(() => []);
  const match = existing.find((w) => w.url === url);

  if (match && !replace) {
    const { data } = await ncomFetch(`/webhooks/${match.id}`, {
      method: "PATCH",
      body: { topics: WEBHOOK_TOPICS, isActive: true },
    });
    return { updated: true, webhook: data, secret: null, secretUnavailable: true };
  }

  // Replacing: drop the old registration so create can issue a fresh secret.
  if (match && replace) {
    await ncomFetch(`/webhooks/${match.id}`, { method: "DELETE" }).catch(() => {});
  }

  const { data } = await ncomFetch("/webhooks", {
    method: "POST",
    body: { url, topics: WEBHOOK_TOPICS },
  });
  return { created: true, replaced: Boolean(match), webhook: data, secret: data?.secret || null };
}
