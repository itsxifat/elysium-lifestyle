import "server-only";

import { ErpError, erpGet, erpPath, erpPost } from "@/lib/erp";
import {
  CAMPAIGN_CODE,
  TRACKING_OFF,
  categoryRef,
  imageUrl,
  indexFlash,
  mapCard,
  mapCustomLink,
  mapProduct,
  mapSale,
  mapSearchResult,
  mapTrackingConfig,
  taka,
} from "@/lib/storefront-map";

// The ERP's storefront answers, shaped for this site's pages and components.
//
// Money arrives as `{ poisha, taka }` strings. Pages only *display* it, so a
// display figure is the ERP's own `taka` string as a number; nothing here adds
// or multiplies money that is then sent back — the cart quote and the checkout
// are priced by the ERP, and the checkout is sent the quote's own poisha.

// --- small helpers -----------------------------------------------------------------------------

export { taka } from "@/lib/storefront-map";

/** Read without failing the page: the ERP down means an empty section, not a 500. */
async function soft(read, fallback) {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof ErpError) || error.status === 0 || error.status >= 500 || error.status === 401) {
      console.error("[storefront] read failed:", error?.code || error?.message);
    }
    return fallback;
  }
}

// --- the site frame (GET /site) ------------------------------------------------------------------

const SITE_FALLBACK = {
  siteInfo: { siteName: "Elysiam Lifestyle", logo: null, whatsappNumber: "", phone: "", email: "", address: "" },
  socialLinks: { facebook: "", instagram: "", tiktok: "", youtube: "" },
  announcement: { enabled: false, text: "", link: "" },
  promoBanner: { enabled: false },
  testimonials: [],
  heroSlides: [],
  navItems: [],
  shipping: { freeShippingEnabled: false, freeShippingThreshold: null, zones: {} },
  paymentGateways: { cod: { enabled: true }, sslcommerz: { enabled: false } },
};

function navChild(entry) {
  if (entry.kind === "category" && entry.category) {
    return {
      _id: entry.id,
      name: entry.label || entry.category.name,
      slug: entry.category.slug,
      href: entry.href || `/shop?category=${encodeURIComponent(entry.category.slug)}`,
      children: (entry.subcategories || []).map((sub) => ({
        _id: sub.id,
        name: sub.name,
        slug: sub.slug,
        href: `/shop?category=${encodeURIComponent(sub.slug)}`,
        children: [],
      })),
    };
  }
  return { _id: entry.id, name: entry.label, href: entry.href || "/", children: [] };
}

function subTree(sub) {
  return {
    _id: sub.id,
    name: sub.name,
    slug: sub.slug,
    href: `/shop?category=${encodeURIComponent(sub.slug)}`,
    children: (sub.children || []).map(subTree),
  };
}

/** The ERP's menu as the navbar's items (two levels under each top entry). */
export function mapNav(menu = []) {
  return menu.map((entry) => {
    if (entry.kind === "category" && entry.category) {
      return {
        _id: entry.id,
        type: "category",
        label: entry.label || entry.category.name,
        href: entry.href || `/shop?category=${encodeURIComponent(entry.category.slug)}`,
        highlighted: !!entry.highlighted,
        children: (entry.subcategories || []).map(subTree),
      };
    }
    if (entry.kind === "dropdown") {
      return {
        _id: entry.id,
        type: "dropdown",
        label: entry.label,
        href: null,
        highlighted: !!entry.highlighted,
        children: (entry.children || []).map(navChild),
      };
    }
    return {
      _id: entry.id,
      type: "custom",
      label: entry.label,
      href: entry.href || "/",
      highlighted: !!entry.highlighted,
      children: [],
    };
  });
}

function digits(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

export function mapSite(answer) {
  if (!answer?.site) return SITE_FALLBACK;
  const { site, social = {}, announcement, promoBanner, testimonials = [], hero = [], menu = [], shipping, payments } = answer;
  return {
    siteInfo: {
      siteName: site.name || SITE_FALLBACK.siteInfo.siteName,
      logo: imageUrl(site.logo, "full"),
      whatsappNumber: digits(site.whatsapp),
      phone: site.phone || "",
      email: site.email || "",
      address: site.address || "",
    },
    socialLinks: {
      facebook: social.facebook || "",
      instagram: social.instagram || "",
      tiktok: social.tiktok || "",
      youtube: social.youtube || "",
    },
    announcement: announcement || SITE_FALLBACK.announcement,
    promoBanner: promoBanner || SITE_FALLBACK.promoBanner,
    testimonials: testimonials.map((t, i) => ({ _id: String(i), ...t })),
    heroSlides: hero.map((slide) => ({
      _id: slide.id,
      imageDesktop: imageUrl(slide.desktop, "full"),
      imageMobile: imageUrl(slide.mobile, "full"),
      href: slide.link || "",
      alt: slide.alt || "",
    })),
    navItems: mapNav(menu),
    shipping: {
      freeShippingEnabled: !!shipping?.freeShippingEnabled,
      freeShippingThreshold: taka(shipping?.freeShippingThreshold),
      zones: Object.fromEntries(
        Object.entries(shipping?.zones || {}).map(([zone, value]) => [zone, taka(value?.fee)])
      ),
    },
    paymentGateways: {
      cod: { enabled: payments?.cod !== false },
      sslcommerz: { enabled: !!payments?.sslcommerz },
    },
  };
}

/** Everything a page frame needs: the navbar, footer, announcement, WhatsApp, shipping, payments. */
export async function getSite() {
  return soft(async () => mapSite(await erpGet(erpPath("/site"))), SITE_FALLBACK);
}

// --- categories --------------------------------------------------------------------------------

export async function getCategoryTree() {
  return soft(async () => (await erpGet(erpPath("/catalog/categories"))).items || [], []);
}

/** The tree flattened with `parent` links (the shop's filter builds its own tree). */
export function flattenCategories(tree, parent = null, out = []) {
  for (const node of tree) {
    out.push({
      _id: node.id,
      name: node.name,
      slug: node.slug,
      parent,
      sortOrder: node.position ?? 0,
      description: node.description || "",
      image: imageUrl(node.image, "full"),
      featured: !!node.featured,
      gender: node.gender || null,
    });
    flattenCategories(node.children || [], node.id, out);
  }
  return out;
}

// --- flash sales (live prices, and the sale pages) -----------------------------------------------

async function rawFlashSales({ home = false } = {}) {
  return soft(async () => (await erpGet(erpPath("/flash-sales", home ? { home: "true" } : {}))).items || [], []);
}

/**
 * The live flash offers, indexed by SKU and by product: which sale a size's
 * flash price comes from, for the countdown strip and the zap badge. The price
 * itself is the catalog's own (M39b): the product and the cards already carry it.
 */
export async function liveFlash() {
  return indexFlash(await rawFlashSales());
}

export { mapCard };

const SORTS = new Set(["newest", "oldest", "price-asc", "price-desc", "featured", "name"]);

function poishaOf(takaText) {
  if (takaText === null || takaText === undefined || takaText === "") return undefined;
  if (!/^\d{1,9}$/.test(String(takaText).trim())) return undefined;
  return String(BigInt(String(takaText).trim()) * 100n);
}

/**
 * The shop's list, from the shop's own query string (`search`, `category`,
 * `size`, `minPrice`/`maxPrice` in whole taka, `sort`, `page`, …).
 */
export async function listProducts(searchParams, { limit = 12 } = {}) {
  const get = (key) => (typeof searchParams.get === "function" ? searchParams.get(key) : searchParams[key]);
  const page = Math.min(100, Math.max(1, parseInt(get("page") || "1", 10) || 1));
  const sort = SORTS.has(get("sort")) ? get("sort") : "newest";
  const query = {
    q: (get("search") || get("q") || "").trim().slice(0, 200) || undefined,
    category: get("category") || undefined,
    gender: get("gender") || undefined,
    size: get("size") || undefined,
    tags: get("tags") || undefined,
    minPricePoisha: poishaOf(get("minPrice")),
    maxPricePoisha: poishaOf(get("maxPrice")),
    featured: get("featured") === "true" ? "true" : undefined,
    newArrival: get("newArrival") === "true" ? "true" : undefined,
    // A regular price above the price, or a live flash price (M39b, D-640).
    onSale: get("onSale") === "true" ? "true" : undefined,
    sort,
    limit,
    page,
  };
  const [answer, flash] = await Promise.all([erpGet(erpPath("/catalog/products", query)), liveFlash()]);
  const total = answer.total ?? answer.items.length;
  return {
    products: (answer.items || []).map((card) => mapCard(card, flash)),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Home page rows: featured and new arrivals (falling back to the newest). */
export async function homeProducts() {
  const [featured, arrivals, flash] = await Promise.all([
    soft(() => erpGet(erpPath("/catalog/products", { featured: "true", limit: 8 })), { items: [] }),
    soft(() => erpGet(erpPath("/catalog/products", { newArrival: "true", limit: 8 })), { items: [] }),
    liveFlash(),
  ]);
  let featuredItems = featured.items || [];
  let arrivalItems = arrivals.items || [];
  if (!featuredItems.length || !arrivalItems.length) {
    const recent = (await soft(() => erpGet(erpPath("/catalog/products", { limit: 16 })), { items: [] })).items || [];
    if (!featuredItems.length) featuredItems = recent.slice(0, 8);
    if (!arrivalItems.length) arrivalItems = recent.slice(8, 16);
  }
  return {
    featuredProducts: featuredItems.map((c) => mapCard(c, flash)),
    newArrivals: arrivalItems.map((c) => mapCard(c, flash)),
  };
}

/** The search box: up to eight products. */
export async function searchProducts(q) {
  const answer = await erpGet(erpPath("/catalog/search", { q: q.slice(0, 200), limit: 8 }));
  return (answer.items || []).map(mapSearchResult);
}

/** The product page, a redirect for an old address, or null. */
export async function getProduct(slug) {
  let answer;
  try {
    answer = await erpGet(erpPath(`/catalog/products/${encodeURIComponent(slug)}`));
  } catch (error) {
    if (error instanceof ErpError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
  if (answer.redirect?.slug) return { redirect: answer.redirect.slug };
  const p = answer.product;
  const flash = await liveFlash();
  return {
    product: mapProduct(p, flash),
    related: (p.related || []).map((c) => mapCard(c, flash)),
    categoryPath: (p.breadcrumb || []).map(categoryRef),
  };
}

// --- flash-sale pages ----------------------------------------------------------------------------

export async function getFlashSales({ home = false } = {}) {
  const [raw, flash] = await Promise.all([rawFlashSales({ home }), liveFlash()]);
  const sales = raw.map((sale) => mapSale(sale, flash));
  return {
    live: sales.filter((s) => s.status === "live"),
    upcoming: sales.filter((s) => s.status === "scheduled"),
  };
}

export async function getFlashSale(slug) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug)) || String(slug).length > 120) return null;
  try {
    const [answer, flash] = await Promise.all([erpGet(erpPath(`/flash-sales/${slug}`)), liveFlash()]);
    return answer.flashSale ? mapSale(answer.flashSale, flash) : null;
  } catch (error) {
    if (error instanceof ErpError && error.status === 404) return null;
    throw error;
  }
}

// --- campaign links (?cu=, M35b, D-551) ----------------------------------------------------------

/** A live campaign link by its five-digit code, or null (unknown, switched off). */
export async function getCustomLink(code) {
  if (!CAMPAIGN_CODE.test(String(code))) return null;
  try {
    const [answer, flash] = await Promise.all([erpGet(erpPath(`/custom-links/${code}`)), liveFlash()]);
    return mapCustomLink(answer, flash);
  } catch (error) {
    if (error instanceof ErpError && error.status === 404) return null;
    throw error;
  }
}

/** One more visit of a campaign link, counted by the ERP (never cached, not idempotent). */
export async function countCustomLinkView(code) {
  if (!CAMPAIGN_CODE.test(String(code))) return false;
  try {
    await erpPost(erpPath(`/custom-links/${code}/views`), {});
    return true;
  } catch (error) {
    if (error instanceof ErpError && error.status === 404) return false;
    throw error;
  }
}

// --- tracking (M35b, D-552) --------------------------------------------------------------------

/**
 * What the browser's tracking helper may load and fire, from the ERP's Website →
 * Tracking (cached like the catalog). Off when the ERP says so, cannot be read,
 * or answers anything unexpected.
 */
export async function getTrackingConfig() {
  return soft(async () => mapTrackingConfig(await erpGet(erpPath("/tracking/config"))), TRACKING_OFF);
}

// --- geography ---------------------------------------------------------------------------------

export async function getDistricts() {
  const answer = await erpGet(erpPath("/geo/districts"));
  return (answer.items || [])
    .map((d) => ({ id: d.id, name: d.nameEn, nameBn: d.nameBn }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getThanas(districtId) {
  const answer = await erpGet(erpPath("/geo/thanas", { districtId }));
  return (answer.items || [])
    .map((t) => ({ id: t.id, districtId: t.districtId, name: t.nameEn, nameBn: t.nameBn }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- orders, as a shopper sees them ------------------------------------------------------------

// The ERP's shopper words, onto the statuses this site's trackers draw.
const STATUS = {
  placed: "pending",
  processing: "processing",
  shipped: "shipped",
  delivered: "delivered",
  partly_delivered: "partly_delivered",
  returned: "returned",
  cancelled: "cancelled",
  exchanged: "exchanged",
};

const PAYMENT_STATUS = {
  cash_on_delivery: "pending",
  awaiting_payment: "pending",
  paid: "paid",
  refund_due: "refund_due",
};

export function mapOrder(order) {
  const shipTo = order.shipTo || {};
  const lines = order.lines || [];
  return {
    _id: order.orderNo,
    orderNumber: order.orderNo,
    createdAt: order.placedAt,
    status: order.status,
    statusLabel: order.statusLabel || null,
    orderStatus: STATUS[order.status] || order.status,
    paymentMethod: order.paymentMethod || order.payment?.method || "cod",
    paymentStatus: PAYMENT_STATUS[order.payment?.status] || "pending",
    paymentState: order.payment?.status || null,
    paidOnline: taka(order.payment?.paidOnline) ?? 0,
    items: lines.map((line) => ({
      skuId: line.skuId,
      sku: line.sku,
      name: line.name,
      quantity: line.qty,
      price: taka(line.unitPrice) ?? 0,
      lineTotal: taka(line.lineTotal) ?? 0,
    })),
    itemCount: order.itemCount ?? lines.reduce((n, l) => n + (l.qty || 0), 0),
    subtotal: taka(order.items) ?? 0,
    discount: taka(order.discount) ?? 0,
    shippingFee: taka(order.delivery) ?? 0,
    paid: taka(order.paid) ?? 0,
    dueOnDelivery: taka(order.dueOnDelivery) ?? 0,
    totalAmount: taka(order.total) ?? 0,
    shippingAddress: {
      name: shipTo.name || "",
      phone: shipTo.phone || "",
      street: [shipTo.addressLine, shipTo.area].filter(Boolean).join(", "),
      city: shipTo.thana?.nameEn || "",
      state: shipTo.district?.nameEn || "",
    },
    tracking: order.tracking || null,
    dates: {
      confirmedAt: order.confirmedAt || null,
      shippedAt: order.shippedAt || null,
      deliveredAt: order.deliveredAt || null,
      cancelledAt: order.cancelledAt || null,
    },
  };
}

/** A guest's order by its view token, or a signed-in shopper's own order. */
export async function getShopperOrder(orderNo, { token = null, accountId = null } = {}) {
  if (!/^[A-Z0-9-]{3,40}$/.test(String(orderNo))) return null;
  const attempts = [];
  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) attempts.push(erpPath(`/orders/${orderNo}`, { token }));
  if (accountId) attempts.push(erpPath(`/accounts/${accountId}/orders/${orderNo}`));
  for (const path of attempts) {
    try {
      const answer = await erpGet(path, { cache: false });
      if (answer?.order) return mapOrder(answer.order);
    } catch (error) {
      if (error instanceof ErpError && (error.status === 404 || error.status === 400)) continue;
      throw error;
    }
  }
  return null;
}

/** A signed-in shopper's orders, newest first (every page of them, up to 200). */
export async function getAccountOrders(accountId) {
  const items = [];
  let cursor;
  for (let page = 0; page < 4; page += 1) {
    const answer = await erpGet(erpPath(`/accounts/${accountId}/orders`, { limit: 50, cursor }), { cache: false });
    items.push(...(answer.items || []));
    cursor = answer.nextCursor;
    if (!cursor) break;
  }
  return items.map(mapOrder);
}

export async function getAccount(accountId) {
  const answer = await erpGet(erpPath(`/accounts/${accountId}`), { cache: false });
  return answer.account;
}

/** The contact details the legal pages print (phone, email, address), from the ERP. */
export async function getSiteInfo() {
  const { normalizeSiteInfo } = await import("@/lib/siteInfo");
  const site = await getSite();
  return normalizeSiteInfo(site.siteInfo, site.socialLinks);
}
