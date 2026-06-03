// One-time migration: push every local /uploads/* image referenced in MongoDB
// up to EnCDN, then rewrite the stored value to the internal proxy path
// (/api/img/<clientId>/<filename>). Run with --dry-run to preview without
// uploading or writing anything.
//
//   node scripts/migrate-uploads-to-cdn.mjs --dry-run
//   node scripts/migrate-uploads-to-cdn.mjs
//
import mongoose from "mongoose";
import { readFile } from "fs/promises";
import path from "path";

// Load .env.local if dotenv is available; otherwise rely on real environment
// variables (production installs run with --omit=dev and won't have dotenv).
// Override the file with ENV_FILE=/path/to/.env if needed.
try {
  const dotenv = await import("dotenv");
  (dotenv.default ?? dotenv).config({ path: process.env.ENV_FILE || ".env.local" });
} catch { /* dotenv not installed — using process.env directly */ }

const { MONGODB_URI, CDN_API_KEY, CDN_API_SECRET } = process.env;
const CDN_BASE_URL = "https://cdn.enfinito.cloud";
const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
const DRY_RUN = process.argv.includes("--dry-run");

if (!MONGODB_URI) throw new Error("MONGODB_URI missing");
if (!DRY_RUN && (!CDN_API_KEY || !CDN_API_SECRET)) throw new Error("CDN_API_KEY / CDN_API_SECRET missing");

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

const cache = new Map();   // /uploads/x -> /api/img/cid/file
const missing = new Set(); // referenced but file not on disk
let uploads = 0;

function isLocal(v) {
  return typeof v === "string" && v.startsWith("/uploads/");
}

// Upload a single local file to the CDN (deduped). Returns the proxy path, or
// null if it isn't a local upload or the file is missing on disk.
async function toProxyPath(localUrl) {
  if (!isLocal(localUrl)) return null;
  if (cache.has(localUrl)) return cache.get(localUrl);

  const filename = path.basename(localUrl.split("?")[0]);
  let buffer;
  try {
    buffer = await readFile(path.join(UPLOADS_DIR, filename));
  } catch {
    missing.add(localUrl);
    console.warn(`  ! missing on disk, left as-is: ${localUrl}`);
    return null;
  }

  if (DRY_RUN) {
    const fake = `/api/img/<clientId>/${filename}`;
    cache.set(localUrl, fake);
    console.log(`  ~ would upload ${localUrl}`);
    return fake;
  }

  const ext = filename.split(".").pop().toLowerCase();
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: MIME[ext] || "application/octet-stream" }), filename);

  const res = await fetch(`${CDN_BASE_URL}/api/media/upload`, {
    method: "POST",
    headers: { "X-CDN-API-Key": CDN_API_KEY, "X-CDN-API-Secret": CDN_API_SECRET },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.media?.publicUrl) {
    throw new Error(`Upload failed for ${filename}: ${res.status} ${JSON.stringify(data)}`);
  }
  const m = new URL(data.media.publicUrl).pathname.match(/^\/d\/([^/]+)\/([^/?#]+)$/);
  if (!m) throw new Error(`Unexpected publicUrl: ${data.media.publicUrl}`);
  const proxyPath = `/api/img/${m[1]}/${m[2]}`;
  cache.set(localUrl, proxyPath);
  uploads++;
  console.log(`  ↑ ${localUrl} → ${proxyPath}`);
  return proxyPath;
}

async function run() {
  await mongoose.connect(MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  let docsChanged = 0;

  // products.images[]
  for await (const doc of db.collection("products").find({ images: /^\/uploads\// })) {
    let changed = false;
    const images = [];
    for (const img of doc.images || []) {
      const p = await toProxyPath(img);
      if (p) { images.push(p); changed = true; } else images.push(img);
    }
    if (changed) {
      if (!DRY_RUN) await db.collection("products").updateOne({ _id: doc._id }, { $set: { images } });
      docsChanged++;
    }
  }

  // single-string fields: collection -> dotted field path
  const singles = [
    ["categories", "image"],
    ["users", "image"],
    ["settings", "siteInfo.logo"],
  ];
  for (const [coll, field] of singles) {
    for await (const doc of db.collection(coll).find({ [field]: /^\/uploads\// })) {
      const cur = field.split(".").reduce((o, k) => o?.[k], doc);
      const p = await toProxyPath(cur);
      if (p) {
        if (!DRY_RUN) await db.collection(coll).updateOne({ _id: doc._id }, { $set: { [field]: p } });
        docsChanged++;
      }
    }
  }

  // orders.items[].image
  for await (const doc of db.collection("orders").find({ "items.image": /^\/uploads\// })) {
    let changed = false;
    const items = doc.items || [];
    for (const it of items) {
      const p = await toProxyPath(it.image);
      if (p) { it.image = p; changed = true; }
    }
    if (changed) {
      if (!DRY_RUN) await db.collection("orders").updateOne({ _id: doc._id }, { $set: { items } });
      docsChanged++;
    }
  }

  // settings.heroSlides[].imageDesktop / imageMobile
  for await (const doc of db.collection("settings").find({
    $or: [{ "heroSlides.imageDesktop": /^\/uploads\// }, { "heroSlides.imageMobile": /^\/uploads\// }],
  })) {
    let changed = false;
    const heroSlides = doc.heroSlides || [];
    for (const s of heroSlides) {
      for (const key of ["imageDesktop", "imageMobile"]) {
        const p = await toProxyPath(s[key]);
        if (p) { s[key] = p; changed = true; }
      }
    }
    if (changed) {
      if (!DRY_RUN) await db.collection("settings").updateOne({ _id: doc._id }, { $set: { heroSlides } });
      docsChanged++;
    }
  }

  // verification: any /uploads/ left anywhere?
  const stillLocal = [];
  for (const [coll, field] of [["products", "images"], ["categories", "image"], ["users", "image"],
    ["orders", "items.image"], ["settings", "siteInfo.logo"], ["settings", "heroSlides.imageDesktop"],
    ["settings", "heroSlides.imageMobile"]]) {
    const n = await db.collection(coll).countDocuments({ [field]: /^\/uploads\// });
    if (n) stillLocal.push(`${coll}.${field}: ${n}`);
  }

  console.log("\n──────── summary ────────");
  console.log(`mode:            ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`unique uploads:  ${DRY_RUN ? cache.size + " (planned)" : uploads}`);
  console.log(`docs changed:    ${docsChanged}`);
  console.log(`missing on disk: ${missing.size}${missing.size ? " → " + [...missing].join(", ") : ""}`);
  console.log(`remaining /uploads refs: ${stillLocal.length ? stillLocal.join("; ") : "none ✓"}`);

  await mongoose.disconnect();
}

run().catch((e) => { console.error("\n✗ Migration error:", e.message); process.exit(1); });
