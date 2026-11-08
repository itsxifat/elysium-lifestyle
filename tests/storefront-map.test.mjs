// Unit tests for lib/storefront-map.js: the ERP's storefront answers mapped for
// the site (M39b's regular prices and live flash prices on cards, the product
// page and its photos by colour; M35b's campaign links and tracking config).
// The answers below follow docs/storefront-api.md in the ERP repository.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CAMPAIGN_CODE,
  coloursOf,
  galleryFor,
  indexFlash,
  mapCard,
  mapCustomLink,
  mapProduct,
  mapSale,
  mapSearchResult,
  mapTrackingConfig,
  priceSummary,
  taka,
  variantLabels,
} from "../lib/storefront-map.js";

const money = (t) => ({ poisha: String(Math.round(t * 100)), taka: t.toFixed(2) });
const image = (id, colour) => ({
  id,
  alt: id,
  width: 800,
  height: 1000,
  urls: { thumb: `https://erp.test/media/o/${id}/thumb`, card: `https://erp.test/media/o/${id}/card`, full: `https://erp.test/media/o/${id}/full` },
  ...(colour === undefined ? {} : { colour }),
});

const SALE = {
  id: "sale-1",
  slug: "eid-flash",
  title: "Eid flash",
  status: "live",
  endsAt: "2026-12-01T00:00:00.000Z",
  items: [
    { skuId: "sku-m", product: { id: "p-denim" }, price: money(1500), compareAt: money(1850), unitsLeft: 4 },
    { skuId: "sku-l", product: { id: "p-denim" }, price: money(1500), compareAt: money(1850), unitsLeft: 0 },
  ],
};

test("taka reads the ERP's display figure", () => {
  assert.equal(taka(money(1250)), 1250);
  assert.equal(taka(null), null);
  assert.equal(taka({ poisha: "1" }), null);
});

test("indexFlash keeps live offers with units left, the lowest per SKU", () => {
  const scheduled = { ...SALE, id: "sale-2", status: "scheduled", items: [{ ...SALE.items[0], price: null }] };
  const cheaper = { ...SALE, id: "sale-3", title: "Cheaper", items: [{ ...SALE.items[0], price: money(1400) }] };
  const flash = indexFlash([SALE, scheduled, cheaper]);
  assert.equal(flash.bySku.get("sku-m").price, 1400);
  assert.equal(flash.bySku.get("sku-m").sale.title, "Cheaper");
  assert.equal(flash.bySku.has("sku-l"), false, "no units left");
  assert.equal(flash.byProduct.get("p-denim").length, 2);
});

// The 2026-10-15 report: a shirt on two live sales at once showed Tk 999 on the
// newer sale's card and Tk 799 (the older sale's price, which the cart charges)
// on its product page.
const shirt = (price, unitsLeft) => ({
  skuId: "sku-shirt-m",
  sku: "ELP00395-M",
  size: "M",
  product: { id: "p-shirt", name: "Men's Formal Shirt", slug: "mens-formal-shirt" },
  price: money(price),
  compareAt: money(1999),
  unitsLeft,
});
const OLD_SALE = { id: "sale-01", slug: "flash-sale-01", title: "Flash Sale 01", status: "live", endsAt: null, items: [shirt(799, 3)] };
const NEW_SALE = { id: "sale-07", slug: "flash-sale-07", title: "Flash Sale 07", status: "live", endsAt: null, items: [shirt(999, 5)] };

test("a sale's card shows the cheaper price another live sale charges for the same size", () => {
  const flash = indexFlash([NEW_SALE, OLD_SALE]);
  const [item] = mapSale(NEW_SALE, flash).items;
  assert.equal(item.price, 799);
  assert.equal(item.regularPrice, 1999);
  assert.equal(item.maxDiscount, 60);
  assert.equal(item.remaining, 3, "what is left at the price charged");
  assert.deepEqual(item.sizes.map((s) => [s.size, s.price, s.discount, s.remaining]), [["M", 799, 60, 3]]);
  assert.equal(mapSale(NEW_SALE, flash).stats.maxDiscount, 60);
  // The product page and the cheaper sale agree.
  assert.equal(mapSale(OLD_SALE, flash).items[0].price, 799);
  assert.equal(mapProduct({ id: "p-shirt", variants: [{ skuId: "sku-shirt-m", size: "M", price: money(799), compareAt: money(1999), availableQty: 9 }] }, flash).variants[0].price, 799);
});

test("a sale keeps its own price when it is the cheapest, or the cheaper one has run out", () => {
  assert.equal(mapSale(OLD_SALE, indexFlash([NEW_SALE, OLD_SALE])).items[0].price, 799);
  const runOut = { ...OLD_SALE, items: [shirt(799, 0)] };
  const [item] = mapSale(NEW_SALE, indexFlash([NEW_SALE, runOut])).items;
  assert.equal(item.price, 999);
  assert.equal(item.remaining, 5);
  assert.equal(mapSale(NEW_SALE).items[0].price, 999, "no live index: the sale's own figures");
});

test("a scheduled sale is not repriced by a live one", () => {
  const upcoming = { ...NEW_SALE, status: "scheduled", items: [{ ...shirt(999, 5), price: null }] };
  const [item] = mapSale(upcoming, indexFlash([OLD_SALE])).items;
  assert.equal(item.price, null);
  assert.equal(item.regularPrice, 1999);
});

test("a card shows what is paid now with the regular price struck through", () => {
  const card = mapCard({
    id: "p-linen",
    slug: "linen-casual-shirt",
    name: "Linen Casual Shirt",
    price: { min: money(1450), max: money(1450) },
    compareAt: money(1800),
    onSale: true,
    image: image("f1"),
    images: [image("f1"), image("f2")],
    sizes: ["M", "L"],
    inStock: true,
  });
  assert.equal(card.minPrice, 1450);
  assert.equal(card.compareAt, 1800);
  assert.equal(card.discount, 19);
  assert.equal(card.onSale, true);
  assert.equal(card.flash, null);
  assert.deepEqual(card.images, ["https://erp.test/media/o/f1/card", "https://erp.test/media/o/f2/card"]);
});

test("a card without a saving has nothing struck through", () => {
  const card = mapCard({ id: "p", slug: "p", name: "P", price: { min: money(1250), max: money(1250) }, compareAt: money(1250), onSale: false });
  assert.equal(card.compareAt, null);
  assert.equal(card.discount, 0);
  assert.equal(card.onSale, false);
});

test("a card on a live flash sale keeps the flash badge, priced by the catalog", () => {
  const card = mapCard(
    { id: "p-denim", slug: "slim-fit-denim", name: "Slim Fit Denim", price: { min: money(1500), max: money(1850) }, compareAt: money(1850), onSale: true },
    indexFlash([SALE])
  );
  assert.equal(card.minPrice, 1500);
  assert.equal(card.maxPrice, 1850);
  assert.equal(card.compareAt, 1850);
  assert.equal(card.flash.sale.slug, "eid-flash");
});

test("a search row carries its struck-through price", () => {
  const row = mapSearchResult({ id: "p", name: "P", slug: "p", price: { min: money(900) }, compareAt: money(1200), image: image("t") });
  assert.deepEqual(row, { _id: "p", name: "P", slug: "p", image: "https://erp.test/media/o/t/thumb", price: 900, compareAt: 1200 });
});

const PRODUCT = {
  id: "p-denim",
  slug: "slim-fit-denim",
  name: "Slim Fit Denim",
  images: [image("common", null), image("red-1", "Red"), image("blue-1", "Blue")],
  galleries: [
    { colour: null, images: [image("common", null)] },
    { colour: "Red", images: [image("red-1", "Red")] },
    { colour: "Blue", images: [image("blue-1", "Blue")] },
  ],
  variants: [
    { skuId: "sku-m", sku: "D-M-R", size: "M", colour: "Red", price: money(1500), compareAt: money(1850), availableQty: 9, inStock: true },
    { skuId: "sku-l", sku: "D-L-R", size: "L", colour: "Red", price: money(1850), compareAt: null, availableQty: 0, inStock: false },
    { skuId: "sku-mb", sku: "D-M-B", size: "M", colour: "Blue", price: money(1700), compareAt: money(2000), availableQty: 3, inStock: true },
  ],
};

test("the product page's variants carry their own price, regular price and flash offer", () => {
  const product = mapProduct(PRODUCT, indexFlash([SALE]));
  const [m, l, mb] = product.variants;
  assert.equal(m.size, "M / Red");
  assert.equal(m.sizeOnly, "M");
  assert.equal(m.price, 1500);
  assert.equal(m.compareAt, 1850);
  assert.equal(m.discount, 19);
  assert.deepEqual(m.flash, { sale: { _id: "sale-1", slug: "eid-flash", title: "Eid flash", endsAt: "2026-12-01T00:00:00.000Z" }, remaining: 4 });
  assert.equal(l.compareAt, null);
  assert.equal(l.flash, null, "the offer for L has no units left");
  assert.equal(mb.compareAt, 2000, "a regular price without a flash sale");
  assert.equal(mb.flash, null);
  assert.equal(product.flash.sale.slug, "eid-flash");
});

test("a flash offer the catalog does not charge is not shown as one", () => {
  const product = mapProduct(
    { ...PRODUCT, variants: [{ ...PRODUCT.variants[0], price: money(1850), compareAt: null }] },
    indexFlash([SALE])
  );
  assert.equal(product.variants[0].flash, null);
  assert.equal(product.flash, null);
});

test("photos follow the chosen colour, falling back to all of them", () => {
  const product = mapProduct(PRODUCT);
  const url = (id) => `https://erp.test/media/o/${id}/full`;
  assert.deepEqual(coloursOf(product), ["Red", "Blue"]);
  assert.deepEqual(galleryFor(product, null), [url("common"), url("red-1"), url("blue-1")]);
  assert.deepEqual(galleryFor(product, "Red"), [url("red-1"), url("common")]);
  assert.deepEqual(galleryFor(product, "blue"), [url("blue-1"), url("common")], "colour names match regardless of case");
  assert.deepEqual(galleryFor(product, "Green"), [url("common"), url("red-1"), url("blue-1")]);
});

test("a product without galleries keeps every photo as one gallery", () => {
  const product = mapProduct({ ...PRODUCT, galleries: undefined, images: [image("a"), image("b")] });
  assert.equal(product.galleries.length, 1);
  assert.deepEqual(galleryFor(product, "Red"), product.images);
});

test("the price line: the lowest price now and its own regular price", () => {
  const variants = mapProduct(PRODUCT, indexFlash([SALE])).variants;
  assert.deepEqual(priceSummary(variants), { min: 1500, max: 1850, compareAt: 1850, discount: 19, maxDiscount: 19 });
  assert.deepEqual(priceSummary([]), { min: 0, max: 0, compareAt: null, discount: 0, maxDiscount: 0 });
  const tie = [
    { price: 100, compareAt: null, discount: 0 },
    { price: 100, compareAt: 150, discount: 33 },
  ];
  assert.equal(priceSummary(tie).compareAt, 150, "at the same price, the size with a saving speaks");
});

test("variant labels add the colour only when sizes repeat or colours differ", () => {
  assert.deepEqual(variantLabels([{ size: "M" }, { size: "L" }]), ["M", "L"]);
  assert.deepEqual(variantLabels([{ size: "M", colour: "Red" }, { size: "M", colour: "Blue" }]), ["M / Red", "M / Blue"]);
  assert.deepEqual(variantLabels([{ size: null, colour: "Red", sku: "X" }]), ["Red"]);
});

test("a campaign link maps the ERP's customLink onto the banner, pop-up and highlights", () => {
  const link = mapCustomLink({
    customLink: {
      code: "48213",
      title: "Eid post",
      basePath: "/shop?category=panjabi",
      banner: { text: "Eid offer", bgColor: "#B85C3A", textColor: "#FFFFFF", link: "/shop" },
      modal: { type: "image", title: "Eid", text: "10% off", image: image("pop"), ctaText: "Shop now", ctaLink: null },
      highlightProducts: [{ id: "p1", slug: "p1", name: "P1", price: { min: money(1000), max: money(1000) }, compareAt: null, onSale: false }],
    },
  });
  assert.equal(link.code, "48213");
  assert.equal(link.basePath, "/shop?category=panjabi");
  assert.deepEqual(link.banner, { text: "Eid offer", bgColor: "#B85C3A", textColor: "#FFFFFF", link: "/shop" });
  assert.equal(link.modal.image, "https://erp.test/media/o/pop/full");
  assert.equal(link.modal.ctaLink, null);
  assert.equal(link.highlightProducts[0].slug, "p1");
  assert.equal(link.highlightProducts[0].minPrice, 1000);
});

test("a campaign link with no banner or pop-up shows neither", () => {
  const link = mapCustomLink({ customLink: { code: "10000", title: "", basePath: "/shop", banner: null, modal: null, highlightProducts: [] } });
  assert.equal(link.banner, null);
  assert.equal(link.modal, null);
  assert.equal(mapCustomLink({}), null);
  assert.ok(CAMPAIGN_CODE.test("48213"));
  assert.ok(!CAMPAIGN_CODE.test("08213"));
  assert.ok(!CAMPAIGN_CODE.test("4821"));
});

const TRACKING = {
  tracking: {
    meta: { pixelEnabled: true, pixelId: "123456789012345" },
    ga4: { clientEnabled: false, measurementId: "" },
    proxy: { metaScriptPath: "/e1/s.js", metaCollectPath: "/e1/t", ga4ScriptPath: "/e2/s.js", ga4CollectPath: "/e2" },
    testMode: false,
    events: [{ name: "PageView", enabled: true, client: true }, { name: "Search", enabled: false, client: true }],
  },
};

test("tracking is on only when the ERP switches the pixel or gtag on with an id", () => {
  const on = mapTrackingConfig(TRACKING);
  assert.equal(on.enabled, true);
  assert.equal(on.meta.pixelEnabled, true);
  assert.equal(on.ga4.clientEnabled, false);
  assert.deepEqual(on.proxy, TRACKING.tracking.proxy);
  assert.deepEqual(on.events[1], { name: "Search", enabled: false, client: true });

  const off = (patch) => mapTrackingConfig({ tracking: { ...TRACKING.tracking, ...patch } }).enabled;
  assert.equal(off({ meta: { pixelEnabled: false, pixelId: "123456789012345" } }), false);
  assert.equal(off({ meta: { pixelEnabled: true, pixelId: "" } }), false);
  assert.equal(off({ meta: { pixelEnabled: true, pixelId: "12ab" } }), false);
  assert.equal(off({ proxy: { ...TRACKING.tracking.proxy, metaScriptPath: "//evil.example/s.js" } }), false);
  assert.equal(off({ proxy: { ...TRACKING.tracking.proxy, ga4ScriptPath: "https://evil.example/s.js" } }), false);
  assert.equal(mapTrackingConfig(null).enabled, false);
  // Any path the ERP accepts as a path on the site is used as it is.
  const custom = { metaScriptPath: "/static/m~1.js", metaCollectPath: "/static/m", ga4ScriptPath: "/static/g.js", ga4CollectPath: "/static/g" };
  assert.deepEqual(mapTrackingConfig({ tracking: { ...TRACKING.tracking, proxy: custom } }).proxy, custom);
  assert.equal(off({ proxy: { ...TRACKING.tracking.proxy, ga4CollectPath: "/a b" } }), false);
  assert.equal(
    mapTrackingConfig({ tracking: { ...TRACKING.tracking, meta: { pixelEnabled: false }, ga4: { clientEnabled: true, measurementId: "G-ABC1234" } } }).enabled,
    true
  );
});
