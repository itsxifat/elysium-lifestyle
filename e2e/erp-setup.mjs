// Prepares a local *preview* brand ERP for the website's end-to-end run, through
// the ERP's own console API, the way staff would on its screens:
//
//   - signs in as the preview's org admin (setting up two-step login the first
//     time, and keeping the authenticator secret in e2e/.state/);
//   - Website → Settings: the site's contact details and address, cash on
//     delivery on, the announcement bar, free shipping over Tk 3,000;
//   - Website → Email: the shop's email server pointed at the local mail sink;
//   - the demo products put on the website (featured / new arrival / tags), two
//     pictures each, and one product's address changed so its old address must
//     redirect;
//   - a live flash sale (two sizes of one product, five units each);
//   - a regular ("was") price on the linen shirt (M39b), a product in two
//     colours with a photo per colour (M39b), a campaign link with a banner, a
//     pop-up and a highlighted product (M35b), and tracking switched off (M35b);
//   - the menu: a category entry and a highlighted link;
//   - Website → Connection: a new website key, written to .env.e2e.local (with
//     the older keys of the same label revoked).
//
// Only for a preview database (`pnpm preview:local` in the ERP repo): never point
// it at a real brand. Usage:
//
//   ERP_CONSOLE_API=http://localhost:3000 ERP_CONSOLE_ORIGIN=http://localhost:5173 \
//   ERP_PREVIEW_CREDENTIALS=../elysium-erp/preview-credentials.local.md node e2e/erp-setup.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API, ORIGIN, adminSession, call, setTracking } from "./erp-console.mjs";

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

// Two pictures per product (the card's and the hover one), uploaded the way the
// console does: an upload ticket, the bytes, finalize, attach. Public, so the
// ERP serves them under /media/.
const TONES = [
  ["#6b4a3a", "#e9dccb"],
  ["#2f3e46", "#d8e2dc"],
  ["#7a5c2e", "#f2e8cf"],
  ["#3d405b", "#f4f1de"],
  ["#5e3023", "#f3e9dc"],
  ["#264653", "#e9f5db"],
];

function picture(name, [ink, paper], hover) {
  const label = name.replace(/[<>&"]/g, "");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
  <rect width="800" height="1000" fill="${hover ? ink : paper}"/>
  <path d="M300 330l-90 60 45 90 45-22v262h200V458l45 22 45-90-90-60c-15 45-52 68-90 68s-75-23-90-68z" fill="${hover ? paper : ink}" opacity="0.85"/>
  <text x="400" y="880" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" fill="${hover ? paper : ink}">${label}</text>
</svg>`);
}

async function upload(png, name) {
  const { body: ticket } = await call("POST", "/v1/files", {
    purpose: "product-image",
    contentType: "image/png",
    originalName: `${name}.png`,
    visibility: "public",
    sizeBytes: png.length,
  });
  const put = await fetch(ticket.url, { method: ticket.method || "PUT", headers: ticket.headers, body: png });
  if (!put.ok) throw new Error(`upload of ${name} → ${put.status}`);
  await call("POST", `/v1/files/${ticket.fileId}/finalize`, {});
  return ticket.fileId;
}

async function productImages(list) {
  const { default: sharp } = await import("sharp");
  for (const [index, product] of list.entries()) {
    const { body: detail } = await call("GET", `/v1/catalog/products/${product.id}`);
    if ((detail.images || []).length > 0) continue;
    for (const hover of [false, true]) {
      const png = await sharp(picture(product.name, TONES[index % TONES.length], hover)).png().toBuffer();
      const fileId = await upload(png, `${product.slug}${hover ? "-2" : ""}`);
      await call("POST", `/v1/catalog/products/${product.id}/images`, { fileId, altText: product.name });
    }
  }
}

// A live flash sale on two sizes of one product, five units each: the flash
// pages, the card's sale price and the quote's flash price have something to show.
const FLASH = { slug: "e2e-flash", product: "slim-fit-denim", salePricePoisha: "150000", sizes: ["M", "L"] };

async function flashSale(list) {
  const { body } = await call("GET", "/v1/promo/flash-sales");
  if ((body.items || []).some((sale) => sale.slug === FLASH.slug)) return;
  const product = list.find((p) => p.slug === FLASH.product);
  if (!product) return;
  const { body: detail } = await call("GET", `/v1/catalog/products/${product.id}`);
  const skus = detail.skus.filter((sku) => sku.attributes.some((a) => FLASH.sizes.includes(a.valueLabel)));
  await call("POST", "/v1/promo/flash-sales", {
    title: "Weekend Flash",
    subtitle: "Denim at a weekend price",
    slug: FLASH.slug,
    enabled: true,
    showOnHome: true,
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    items: skus.map((sku) => ({ skuId: sku.id, salePricePoisha: FLASH.salePricePoisha, unitLimit: 5 })),
  });
}

// A regular ("was") price above the price (M39b, D-640): the linen shirt sells at
// Tk 1,450 with Tk 1,800 struck through, so the cards, the product page, the bag
// and the shop's "On Sale" filter have something to show.
const REGULAR = { product: "linen-casual-shirt", compareAtPoisha: "180000" };

async function regularPrices(list) {
  const product = list.find((p) => p.slug === REGULAR.product);
  if (!product) return;
  const { body: detail } = await call("GET", `/v1/catalog/products/${product.id}`);
  const prices = detail.skus
    .filter((sku) => String(sku.compareAtPoisha ?? "") !== REGULAR.compareAtPoisha)
    .map((sku) => ({ skuId: sku.id, compareAtPoisha: REGULAR.compareAtPoisha }));
  if (prices.length) await call("PUT", "/v1/catalog/prices", { prices, reason: "e2e: a regular price" });
}

// A product in two colours, with a photo for each colour and one for every
// colour (M39b, D-643): picking a colour on the product page switches photos.
const COLOURED = {
  slug: "two-tone-oxford",
  name: "Two-Tone Oxford",
  pricePoisha: "160000",
  colours: [["RED", "Red"], ["BLUE", "Blue"]],
};

async function attributeWith(code, name, kind, values) {
  const find = async () => {
    const { body } = await call("GET", "/v1/catalog/attributes");
    return (body.items || body).find((a) => a.code === code);
  };
  let attribute = await find();
  if (!attribute) {
    await call("POST", "/v1/catalog/attributes", { code, name, kind });
    attribute = await find();
  }
  for (const [position, [valueCode, label]] of values.entries()) {
    if (attribute.values.some((v) => v.code === valueCode)) continue;
    await call("POST", `/v1/catalog/attributes/${attribute.id}/values`, { code: valueCode, label, position });
  }
  return find();
}

async function colouredProduct() {
  const { body: listed } = await call("GET", "/v1/catalog/products?limit=100");
  const known = (listed.items || listed).find((p) => p.slug === COLOURED.slug);
  const colour = await attributeWith("COLOUR", "Colour", "colour", COLOURED.colours);
  const valueId = (code) => colour.values.find((v) => v.code === code).id;
  let productId = known?.id;
  if (!productId) {
    const size = await attributeWith("SIZE", "Size", "size", [["M", "M"], ["L", "L"]]);
    const { body: categories } = await call("GET", "/v1/catalog/categories");
    const shirts = (categories.items || categories).find((c) => c.slug === "shirts");
    const { body: created } = await call("POST", "/v1/catalog/products", {
      name: COLOURED.name,
      slug: COLOURED.slug,
      categoryId: shirts?.id ?? null,
      status: "active",
      pricePoisha: COLOURED.pricePoisha,
      axes: [
        { attributeId: size.id, valueIds: size.values.filter((v) => ["M", "L"].includes(v.code)).map((v) => v.id) },
        { attributeId: colour.id, valueIds: ["RED", "BLUE"].map(valueId) },
      ],
    });
    productId = created.id;
  }

  let { body: detail } = await call("GET", `/v1/catalog/products/${productId}`);
  if ((detail.images || []).length === 0) {
    const { default: sharp } = await import("sharp");
    const shots = [
      ["every colour", ["#3d405b", "#f4f1de"], null],
      ["red", ["#9b2226", "#fde2e4"], "RED"],
      ["blue", ["#1d3557", "#dbe7f3"], "BLUE"],
    ];
    const uploaded = [];
    for (const [label, tones, colourCode] of shots) {
      const png = await sharp(picture(`${COLOURED.name}, ${label}`, tones, false)).png().toBuffer();
      const fileId = await upload(png, `${COLOURED.slug}-${label.replace(/\s+/g, "-")}`);
      await call("POST", `/v1/catalog/products/${productId}/images`, { fileId, altText: `${COLOURED.name}, ${label}` });
      uploaded.push({ fileId, colourCode });
    }
    ({ body: detail } = await call("GET", `/v1/catalog/products/${productId}`));
    for (const { fileId, colourCode } of uploaded) {
      if (!colourCode) continue;
      const row = detail.images.find((img) => img.fileId === fileId);
      await call("PUT", `/v1/catalog/products/${productId}/images/${row.id}/colour`, { colourValueId: valueId(colourCode) });
    }
    ({ body: detail } = await call("GET", `/v1/catalog/products/${productId}`));
  }
  // Which photo is which, for the spec: by the colour each one shows.
  const photoOf = (code) => detail.images.find((img) => (img.colourValueId ?? null) === (code ? valueId(code) : null))?.fileId;
  return { slug: COLOURED.slug, photos: { common: photoOf(null), red: photoOf("RED"), blue: photoOf("BLUE") } };
}

// A campaign link (M35b, D-551) opening on the shop, with a banner, a pop-up and
// the polo shirt highlighted.
const CAMPAIGN = { title: "E2E Eid post", highlight: "premium-polo-shirt" };

async function campaignLink(list) {
  const { body } = await call("GET", "/v1/storefront/campaign-links");
  const existing = (body.items || body).find((link) => link.title === CAMPAIGN.title);
  const highlight = list.find((p) => p.slug === CAMPAIGN.highlight);
  const input = {
    title: CAMPAIGN.title,
    baseType: "shop",
    categoryId: null,
    customPath: "",
    highlightProductIds: highlight ? [highlight.id] : [],
    banner: { enabled: true, text: "E2E Eid offer: free delivery this week", bgColor: "#264653", textColor: "#FFFFFF", link: "/shop" },
    modal: { enabled: true, type: "text", title: "Eid Mubarak", text: "Our Eid range is here.", imageFileId: null, ctaText: "Shop now", ctaLink: "/shop" },
    isActive: true,
  };
  if (existing) {
    await call("PUT", `/v1/storefront/campaign-links/${existing.id}`, input);
    return { id: existing.id, code: existing.code, banner: input.banner.text, modal: input.modal.title };
  }
  const { body: created } = await call("POST", "/v1/storefront/campaign-links", input);
  return { id: created.id, code: created.code, banner: input.banner.text, modal: input.modal.title };
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
  const coloured = await colouredProduct();
  const list = await products();
  await productImages(list);
  await regularPrices(list);
  await flashSale(list);
  await menu();
  const campaign = await campaignLink(list);
  // Tracking starts off: the spec checks that nothing loads, then switches it on.
  await setTracking(false);
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
    JSON.stringify(
      { api: API, origin: ORIGIN, orgId: org.orgId, renamed: RENAMED, products: list.map((p) => p.slug), regular: REGULAR, coloured, campaign },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(`ERP ready: ${list.length} products on the website, key ${key.keyId.slice(0, 12)}…`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
