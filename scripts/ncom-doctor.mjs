// One-command health check for the ncom.bd integration.
//
// Run it on the server and read (or paste) the output. It writes NOTHING —
// every check is read-only — and it never prints a secret, only whether one is
// present.
//
//   node scripts/ncom-doctor.mjs
//
// Everything it reports is also visible at /admin/ncom; this exists for when
// you are already in a shell, or want the whole picture in one paste.
//
import { connect } from "./_ncom-cli.mjs";
import mongoose from "mongoose";
import { execSync } from "node:child_process";

const loaded = await connect();

// Dynamic, so env is populated before lib/cdn.js captures it. See _ncom-cli.mjs.
const { getNcomConfig, resolveImageUrls, duplicateVariants, PRICE_CURRENCY } = await import("../lib/ncom.js");
const { cdnConfigured } = await import("../lib/cdn.js");
const { connectionStatus, duplicateSkus, listWebhooks } = await import("../lib/ncom-sync.js");

const problems = [];
const flag = (text) => problems.push(text);

const h = (t) => console.log(`\n\x1b[1m${t}\x1b[0m\n${"─".repeat(t.length)}`);
const row = (k, v) => console.log(`  ${String(k).padEnd(26)} ${v}`);
const yn = (b) => (b ? "\x1b[32myes\x1b[0m" : "\x1b[31mno\x1b[0m");

console.log(`\n\x1b[1mncom doctor\x1b[0m — ${new Date().toISOString()}`);

// ── 1. Environment ────────────────────────────────────────────────────────
h("1. Environment");
row("node", process.version);
row("env file(s) read", loaded.length ? loaded.join(", ") : "\x1b[31mnone found\x1b[0m");
row("MONGODB_URI", yn(!!process.env.MONGODB_URI));
row("CDN_API_KEY / SECRET", yn(cdnConfigured()));
if (!cdnConfigured()) flag("CDN credentials are missing here, so product images cannot be signed and will not be sent. Use /admin/ncom, or add them to the env file this script reads.");

try {
  const rev = execSync("git log -1 --pretty=%h\\ %s", { cwd: process.cwd() }).toString().trim();
  const dirty = execSync("git status --porcelain", { cwd: process.cwd() }).toString().trim();
  row("deployed commit", rev);
  row("uncommitted changes", dirty ? `\x1b[33m${dirty.split("\n").length} file(s)\x1b[0m` : "none");
} catch {
  row("git", "not a git checkout");
}

const cfg = await getNcomConfig({ fresh: true });
row("ncom key source", cfg.source === "none" ? "\x1b[31mnot configured\x1b[0m" : cfg.source);
row("webhook secret stored", yn(!!cfg.webhookSecret));
row("stock sync switched on", yn(cfg.enabled && cfg.autoPushStock));
if (!cfg.webhookSecret) flag("No webhook signing secret — /api/ncom-webhook rejects everything, so sales on ncom will not reduce your stock.");
if (!cfg.enabled) flag("Stock sync is off, so your sales are not mirrored to ncom.");

// ── 2. Your catalogue ─────────────────────────────────────────────────────
h("2. Your catalogue");
const Product = mongoose.model("Product");
const Category = mongoose.model("Category");
const products = await Product.find({}).select("name variants images category").lean();
const categories = await Category.find({}).select("name ncomId parent").lean();

const variants = products.flatMap((p) => p.variants || []);
const missingSku = variants.filter((v) => !v.sku).length;
const dupSkus = duplicateSkus(products);
const dupSkuVariants = dupSkus.reduce((n, [, list]) => n + list.length, 0);
const dupSize = products.map((p) => ({ p, d: duplicateVariants(p) })).filter((x) => x.d.length);

row("products", products.length);
row("variants", variants.length);
row("variants without a SKU", missingSku ? `\x1b[33m${missingSku}\x1b[0m` : "0");
row("SKUs used twice or more", dupSkus.length ? `\x1b[31m${dupSkus.length} (${dupSkuVariants} variants)\x1b[0m` : "0");
row("products w/ duplicate size", dupSize.length ? `\x1b[33m${dupSize.length}\x1b[0m` : "0");
row("products with no category", products.filter((p) => !p.category).length);

if (missingSku) flag(`${missingSku} variants have no SKU — stock can never sync for them. Run the SKU backfill.`);
if (dupSkus.length) {
  flag(`${dupSkus.length} SKUs are shared by ${dupSkuVariants} variants. Stock is addressed by SKU, so those cannot sync and the reconcile will report the same drift forever.`);
  console.log("\n  Shared SKUs (first 10):");
  for (const [sku, list] of dupSkus.slice(0, 10)) console.log(`    ${sku} → ${list.join(" | ")}`);
  if (dupSkus.length > 10) console.log(`    …and ${dupSkus.length - 10} more`);
}
if (dupSize.length) {
  flag(`${dupSize.length} products have two variants of the same size; the extra is dropped on import.`);
  console.log("\n  Duplicate sizes (first 10):");
  for (const { p, d } of dupSize.slice(0, 10)) console.log(`    ${p.name} — ${d.map((v) => v.size).join(", ")}`);
}

// ── 3. Images ─────────────────────────────────────────────────────────────
h("3. Images");
const withImages = products.filter((p) => (p.images || []).length);
const storedValues = withImages.reduce((n, p) => n + p.images.length, 0);
const resolvable = products.reduce((n, p) => n + resolveImageUrls(p).length, 0);
const noneResolve = withImages.filter((p) => resolveImageUrls(p).length === 0);

row("products with images", withImages.length);
row("stored image values", storedValues);
row("usable as URLs", resolvable === storedValues ? `${resolvable}` : `\x1b[33m${resolvable}\x1b[0m`);
row("products losing all images", noneResolve.length ? `\x1b[33m${noneResolve.length}\x1b[0m` : "0");

if (noneResolve.length) {
  flag(`${noneResolve.length} products have images that cannot be turned into a URL (usually legacy /uploads paths) — they import with no artwork.`);
  console.log("\n  Examples:");
  for (const p of noneResolve.slice(0, 8)) console.log(`    ${p.name} — ${p.images[0]}`);
}
console.log("\n  (Use “Check images” in /admin/ncom to actually download each one — a single");
console.log("   image ncom cannot fetch rejects that whole product.)");

// ── 4. Connection ─────────────────────────────────────────────────────────
h("4. ncom connection");
const conn = await connectionStatus();
if (!conn.ok) {
  row("status", `\x1b[31m${conn.error}\x1b[0m`);
  flag(`Cannot reach ncom: ${String(conn.error).replace(/\.$/, "")}. Everything below is skipped.`);
} else {
  row("workspace", `${conn.organization.name} (${conn.organization.slug})`);
  row("currency", `${conn.organization.currencyCode}${conn.organization.currencyConfigured === false ? " \x1b[33m(never explicitly chosen)\x1b[0m" : ""}`);
  row("we send prices as", PRICE_CURRENCY);
  row("key permissions", (conn.scopes || []).length);
  for (const w of conn.warnings || []) flag(w);

  // Category links — the failure that silently uncategorises everything.
  h("5. Category links");
  const linked = categories.filter((c) => c.ncomId);
  row("categories here", categories.length);
  row("with a stored ncom id", linked.length);

  let stale = 0;
  for (const c of linked) {
    const ok = await import("../lib/ncom.js").then(({ ncomFetch }) =>
      ncomFetch(`/categories/${c.ncomId}`).then(() => true).catch((e) => (e.code === "not_found" ? false : true))
    );
    if (!ok) stale++;
  }
  row("links that are dead", stale ? `\x1b[31m${stale}\x1b[0m` : "0");
  if (stale) {
    flag(`${stale} category links point at categories that no longer exist — normally because the API key now points at a different workspace. A push will re-create them automatically.`);
  }

  // Remote totals.
  h("6. Over there vs here");
  const { ncomFetch } = await import("../lib/ncom.js");
  const [rp, rc, ri] = await Promise.all([
    ncomFetch("/products?limit=1").then((r) => r.pagination?.total ?? 0).catch(() => "?"),
    ncomFetch("/categories?flat=true").then((r) => (r.data || []).length).catch(() => "?"),
    ncomFetch("/inventory?limit=1").then((r) => r.pagination?.total ?? 0).catch(() => "?"),
  ]);
  row("products", `${rp} there / ${products.length} here`);
  row("categories", `${rc} there / ${categories.length} here`);
  row("variants", `${ri} there / ${variants.length} here`);
  if (typeof rp === "number" && rp < products.length) {
    flag(`${products.length - rp} products are missing on ncom. A push reports why for each one.`);
  }

  h("7. Webhook");
  const hooks = await listWebhooks().catch(() => null);
  if (!hooks) row("status", "could not read");
  else if (!hooks.length) {
    row("registered endpoints", "\x1b[33m0\x1b[0m");
    flag("No webhook is registered, so sales on ncom will never reach your stock. Register it from /admin/ncom.");
  } else {
    for (const w of hooks) {
      row("endpoint", `${w.url} ${w.isActive === false ? "\x1b[31m(paused)\x1b[0m" : "\x1b[32m(active)\x1b[0m"}`);
      row("  topics", (w.topics || []).join(", ") || "none");
      // `deliveries` is a breakdown, not a count — printing it raw gave
      // "[object Object]", which is worse than useless on a health check.
      const d = w.deliveries || {};
      const counts =
        typeof w.deliveries === "object"
          ? `${d.succeeded ?? 0} ok / ${d.failed ?? 0} failed / ${d.pending ?? 0} pending`
          : `${w.deliveries ?? "?"}`;
      row("  deliveries", `${counts}${w.lastSuccessAt ? `, last ok ${w.lastSuccessAt}` : ""}${w.lastFailureAt ? `, last fail ${w.lastFailureAt}` : ""}`);
      if (d.pending) {
        flag(
          `${d.pending} webhook delivery(ies) are queued but never retried — ncom only retries when ` +
          `something calls its /api/cron/webhook-retries route, and nothing does. Clear the backlog ` +
          `before wiring that cron up, or stale stock values will be replayed over correct ones.`
        );
      }
    }
  }
}

// ── Verdict ───────────────────────────────────────────────────────────────
h(problems.length ? `Found ${problems.length} thing(s) to fix` : "No problems found");
problems.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
if (!problems.length) console.log("  Everything checks out.");
console.log();

await mongoose.disconnect();
