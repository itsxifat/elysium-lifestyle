// Prepares a local *preview* brand ERP for the website's end-to-end run, through
// the ERP's own console API, the way staff would on its screens:
//
//   - signs in as the preview's org admin (setting up two-step login the first
//     time, and keeping the authenticator secret in e2e/.state/);
//   - Website → Settings: the site's contact details and address, cash on
//     delivery on, the announcement bar, free shipping over Tk 3,000;
//   - Website → Email: the shop's email server pointed at the local mail sink;
//   - the demo products put on the website (featured / new arrival / tags), and
//     one product's address changed so its old address must redirect;
//   - the menu: a category entry and a highlighted link;
//   - Website → Connection: a new website key, written to .env.e2e.local (with
//     the older keys of the same label revoked).
//
// Only for a preview database (`pnpm preview:local` in the ERP repo): never point
// it at a real brand. Usage:
//
//   ERP_CONSOLE_API=http://localhost:3300 ERP_CONSOLE_ORIGIN=http://localhost:5373 \
//   ERP_PREVIEW_CREDENTIALS=../elysium-erp/preview-credentials.local.md node e2e/erp-setup.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API, ORIGIN, adminSession, call } from "./erp-console.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const stateDir = path.join(here, ".state");
mkdirSync(stateDir, { recursive: true });

const SMTP_PORT = Number(process.env.MAIL_SINK_SMTP_PORT || 2525);
const KEY_LABEL = "Website e2e (local)";

// --- the brand's website ------------------------------------------------------------------------

async function websiteSettings() {
  const { body: current } = await call("GET", "/v1/storefront/settings");
  await call("PATCH", "/v1/storefront/settings", {
    siteInfo: {
      ...current.siteInfo,
      siteName: "Elysium Lifestyle",
      whatsapp: "+8801700000000",
      phone: "+880 1700-000000",
      email: "hello@elysium.test",
      address: "House 5, Road 3, Dhanmondi, Dhaka",
      siteUrl: "https://demo.elysium-lifestyle.bd",
    },
    announcement: { enabled: true, text: "Free shipping over Tk 3,000 · Cash on delivery", link: "/shop" },
    shipping: { ...current.shipping, freeShippingEnabled: true, freeShippingThresholdPoisha: "300000" },
    payments: { cod: true, sslcommerz: false },
  });
}

async function emailServer() {
  await call("PUT", "/v1/storefront/email", {
    enabled: true,
    host: "127.0.0.1",
    port: SMTP_PORT,
    secure: false,
    username: "",
    fromName: "Elysium Lifestyle",
    fromEmail: "shop@elysium.test",
  });
}

const RENAMED = { from: "classic-cotton-tee", to: "classic-cotton-crew-tee" };

async function products() {
  const { body } = await call("GET", "/v1/catalog/products?limit=50");
  const list = body.items.filter((p) => p.status === "active");
  for (const [index, product] of list.entries()) {
    await call("PUT", `/v1/storefront/products/${product.id}`, {
      webVisible: true,
      featured: index < 3,
      newArrival: index >= 3,
      gender: "men",
      material: index % 2 === 0 ? "100% cotton" : "Cotton blend",
      careInstructions: "Machine wash cold. Do not bleach.",
      tags: ["e2e", index % 2 === 0 ? "cotton" : "classic"],
    });
  }
  // One product moves to a new address, so its old one must redirect (M33's previous_slugs).
  const tee = list.find((p) => p.slug === RENAMED.from);
  if (tee) await call("PATCH", `/v1/catalog/products/${tee.id}`, { slug: RENAMED.to });
  return list;
}

async function menu() {
  const { body } = await call("GET", "/v1/storefront/nav-items");
  const items = body.items || body || [];
  if (items.some((item) => item.label === "Flash Sale")) return;
  const { body: categories } = await call("GET", "/v1/catalog/categories");
  const top = (categories.items || categories || []).find((c) => !c.parentId) || null;
  if (top) {
    await call("POST", "/v1/storefront/nav-items", {
      parentId: null,
      kind: "category",
      label: null,
      href: null,
      categoryId: top.id,
      highlighted: false,
      isActive: true,
    }, { allow: [400] });
  }
  await call("POST", "/v1/storefront/nav-items", {
    parentId: null,
    kind: "link",
    label: "Flash Sale",
    href: "/flash-sale",
    categoryId: null,
    highlighted: true,
    isActive: true,
  }, { allow: [400] });
}

async function siteKey() {
  const { body: keys } = await call("GET", "/v1/storefront/site-keys");
  for (const key of keys.items || keys || []) {
    if (key.label === KEY_LABEL && !key.revokedAt) {
      await call("POST", `/v1/storefront/site-keys/${key.id}/revoke`, {}, { allow: [400, 404, 409] });
    }
  }
  const { body } = await call("POST", "/v1/storefront/site-keys", { label: KEY_LABEL });
  return body;
}

async function main() {
  const org = await adminSession();
  await websiteSettings();
  await emailServer();
  const list = await products();
  await menu();
  const key = await siteKey();

  const env = [
    "# Written by e2e/erp-setup.mjs for the local end-to-end run. Never commit.",
    `ERP_API_URL=${API}`,
    `ERP_SITE_KEY_ID=${key.keyId}`,
    `ERP_SITE_SECRET=${key.secret}`,
    `ERP_ADMIN_URL=${ORIGIN}`,
    `ERP_MEDIA_ORIGINS=${API}`,
    "",
  ].join("\n");
  writeFileSync(path.join(root, ".env.e2e.local"), env, { mode: 0o600 });
  writeFileSync(
    path.join(stateDir, "erp.json"),
    JSON.stringify({ api: API, origin: ORIGIN, orgId: org.orgId, renamed: RENAMED, products: list.map((p) => p.slug) }, null, 2),
    { mode: 0o600 }
  );
  console.log(`ERP ready: ${list.length} products on the website, key ${key.keyId.slice(0, 12)}…`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
