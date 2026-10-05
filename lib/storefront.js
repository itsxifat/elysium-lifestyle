import "server-only";

import { ErpError, erpGet, erpPath } from "@/lib/erp";

// The ERP's storefront answers, shaped for this site's pages and components.
//
// Money arrives as `{ poisha, taka }` strings. Pages only *display* it, so a
// display figure is the ERP's own `taka` string as a number; nothing here adds
// or multiplies money that is then sent back — the cart quote and the checkout
// are priced by the ERP, and the checkout is sent the quote's own poisha.

// --- small helpers -----------------------------------------------------------------------------

/** A display amount in taka from an ERP money object, or null. */
export function taka(money) {
  if (!money || money.taka === undefined || money.taka === null) return null;
  const n = Number(money.taka);
  return Number.isFinite(n) ? n : null;
}

function imageUrl(image, size = "card") {
  if (!image?.urls) return null;
  return image.urls[size] || image.urls.card || image.urls.full || image.urls.thumb || null;
}

function discountPercent(regular, sale) {
  if (!(regular > 0) || !(sale > 0) || sale >= regular) return 0;
  return Math.round(((regular - sale) / regular) * 100);
}

function categoryRef(category) {
  return category ? { _id: category.id, id: category.id, slug: category.slug, name: category.name } : null;
}

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
  siteInfo: { siteName: "Elysium Lifestyle", logo: null, whatsappNumber: "", phone: "", email: "", address: "" },
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
 * The live flash offers, indexed: by SKU (a size's flash price) and by product
 * (a card's headline). Only sales that are live and carry a price.
 */
export async function liveFlash() {
  const sales = await rawFlashSales();
  const bySku = new Map();
  const byProduct = new Map();
  for (const sale of sales) {
    if (sale.status !== "live") continue;
    const ref = { _id: sale.id, slug: sale.slug, title: sale.title, endsAt: sale.endsAt || null };
    for (const item of sale.items || []) {
      const price = taka(item.price);
      const regular = taka(item.compareAt);
      if (price === null || regular === null || !(price < regular)) continue;
      if (item.unitsLeft !== null && item.unitsLeft !== undefined && item.unitsLeft <= 0) continue;
      const offer = { price, regularPrice: regular, remaining: item.unitsLeft ?? null, discount: discountPercent(regular, price), sale: ref };
      const current = bySku.get(item.skuId);
      if (!current || offer.price < current.price) bySku.set(item.skuId, offer);
      const list = byProduct.get(item.product.id) || [];
      list.push(offer);
      byProduct.set(item.product.id, list);
    }
  }
  return { bySku, byProduct };
}

function cardFlash(productId, flash) {
  const offers = flash?.byProduct.get(productId);
  if (!offers?.length) return null;
  const best = offers.reduce((a, b) => (b.price < a.price ? b : a));
  return {
    price: best.price,
    regularPrice: best.regularPrice,
    discount: offers.reduce((m, o) => Math.max(m, o.discount), 0),
    sale: best.sale,
  };
}

// --- products ------------------------------------------------------------------------------------

/** A product card from the list, search or related answers. */
export function mapCard(card, flash = null) {
  const images = (card.images?.length ? card.images : card.image ? [card.image] : [])
    .map((img) => imageUrl(img, "card"))
    .filter(Boolean);
  return {
    _id: card.id,
    id: card.id,
    slug: card.slug,
    name: card.name,
    category: categoryRef(card.category),
    gender: card.gender || null,
    tags: card.tags || [],
    featured: !!card.featured,
    isNewArrival: !!card.newArrival,
    images,
    minPrice: taka(card.price?.min) ?? 0,
    maxPrice: taka(card.price?.max) ?? taka(card.price?.min) ?? 0,
    sizes: card.sizes || [],
    inStock: !!card.inStock,
    flash: cardFlash(card.id, flash),
  };
}

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
  return (answer.items || []).map((card) => ({
    _id: card.id,
    name: card.name,
    slug: card.slug,
    image: imageUrl(card.image, "thumb"),
    price: taka(card.price?.min) ?? 0,
  }));
}

/** A variant's label within its product: its size, with the colour when sizes repeat. */
function variantLabels(variants) {
  const colours = new Set(variants.map((v) => v.colour).filter(Boolean));
  const sizes = variants.map((v) => v.size);
  const repeated = new Set(sizes.filter((s, i) => s && sizes.indexOf(s) !== i));
  return variants.map((v) => {
    if (v.size && v.colour && (colours.size > 1 || repeated.has(v.size))) return `${v.size} / ${v.colour}`;
    return v.size || v.colour || v.sku;
  });
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
  const labels = variantLabels(p.variants || []);
  const variants = (p.variants || []).map((v, i) => {
    const listed = taka(v.price) ?? 0;
    const compareAt = taka(v.compareAt);
    return {
      skuId: v.skuId,
      sku: v.sku,
      size: labels[i],
      sizeOnly: v.size,
      colour: v.colour,
      // The shelf price: what a flash price is struck through against.
      price: compareAt !== null && compareAt > listed ? compareAt : listed,
      listed,
      stock: Math.max(0, Number(v.availableQty) || 0),
    };
  });

  // A size on a live flash sale sells at its flash price (the quote has the last word).
  const sizes = {};
  for (const v of variants) {
    const offer = flash.bySku.get(v.skuId);
    const listedDeal = v.listed < v.price ? { price: v.listed, regularPrice: v.price, remaining: null, discount: discountPercent(v.price, v.listed), sale: null } : null;
    const deal = offer && (!listedDeal || offer.price <= listedDeal.price) ? offer : listedDeal;
    if (deal && v.stock > 0) {
      sizes[v.size] = { ...deal, remaining: deal.remaining === null ? v.stock : Math.min(deal.remaining, v.stock) };
    }
  }
  const deals = Object.values(sizes);
  const headline = deals.reduce((best, s) => (!best || s.price < best.price ? s : best), null);

  const gallery = (p.images || []).map((img) => imageUrl(img, "full")).filter(Boolean);
  const product = {
    _id: p.id,
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description || "",
    material: p.material || "",
    careInstructions: p.careInstructions || "",
    seoTitle: p.seoTitle || "",
    seoDescription: p.seoDescription || "",
    tags: p.tags || [],
    featured: !!p.featured,
    isNewArrival: !!p.newArrival,
    category: categoryRef(p.category),
    images: gallery,
    ogImage: imageUrl(p.images?.[0] || p.image, "full"),
    sizeChart: p.sizeChart ? { _id: p.sizeChart.id, name: p.sizeChart.name, columns: p.sizeChart.columns || [], rows: p.sizeChart.rows || [] } : null,
    variants,
    flash: headline
      ? {
          price: headline.price,
          regularPrice: headline.regularPrice,
          discount: deals.reduce((m, s) => Math.max(m, s.discount), 0),
          sale: headline.sale,
          sizes,
        }
      : null,
  };
  return {
    product,
    related: (p.related || []).map((c) => mapCard(c, flash)),
    categoryPath: (p.breadcrumb || []).map(categoryRef),
  };
}

// --- flash-sale pages ----------------------------------------------------------------------------

/** A sale in the shape the flash-sale components draw: one entry per product, sizes inside. */
export function mapSale(sale) {
  const live = sale.status === "live";
  const groups = new Map();
  for (const item of sale.items || []) {
    const key = item.product.id;
    if (!groups.has(key)) {
      groups.set(key, {
        product: {
          _id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          images: [imageUrl(item.image, "card")].filter(Boolean),
        },
        lines: [],
      });
    }
    groups.get(key).lines.push(item);
  }
  const items = [...groups.values()].map(({ product, lines }) => {
    const colours = new Set(lines.map((l) => l.colour).filter(Boolean));
    const sizes = lines.map((l) => {
      const price = taka(l.price);
      const regularPrice = taka(l.compareAt);
      return {
        skuId: l.skuId,
        size: l.size && l.colour && colours.size > 1 ? `${l.size} / ${l.colour}` : l.size || l.colour || l.sku,
        price,
        regularPrice,
        discount: price === null ? 0 : discountPercent(regularPrice, price),
        remaining: l.unitsLeft ?? null,
      };
    });
    const open = sizes.filter((s) => s.remaining === null || s.remaining > 0);
    const priced = (open.length ? open : sizes).filter((s) => s.price !== null);
    const headline = priced.reduce((best, s) => (!best || s.price < best.price ? s : best), null);
    const prices = sizes.map((s) => s.price).filter((n) => n !== null);
    const limited = sizes.every((s) => s.remaining !== null);
    return {
      product,
      price: headline?.price ?? null,
      regularPrice: headline?.regularPrice ?? sizes[0]?.regularPrice ?? null,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      maxDiscount: sizes.reduce((m, s) => Math.max(m, s.discount), 0),
      remaining: limited ? sizes.reduce((n, s) => n + s.remaining, 0) : null,
      sold: null,
      soldPct: null,
      soldOut: live && limited && sizes.every((s) => s.remaining <= 0),
      sizes,
    };
  });
  return {
    _id: sale.id,
    slug: sale.slug,
    title: sale.title || "Flash Sale",
    subtitle: sale.subtitle || "",
    description: sale.description || "",
    bannerImage: imageUrl(sale.banner, "full") || "",
    startsAt: sale.startsAt || null,
    endsAt: sale.endsAt || null,
    status: sale.status,
    showOnHome: !!sale.showOnHome,
    items,
    stats: {
      count: items.length,
      maxDiscount: items.reduce((m, i) => Math.max(m, i.maxDiscount), 0),
      remaining: items.every((i) => i.remaining !== null) ? items.reduce((n, i) => n + i.remaining, 0) : null,
      sold: 0,
    },
  };
}

export async function getFlashSales({ home = false } = {}) {
  const sales = (await rawFlashSales({ home })).map(mapSale);
  return {
    live: sales.filter((s) => s.status === "live"),
    upcoming: sales.filter((s) => s.status === "scheduled"),
  };
}

export async function getFlashSale(slug) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug)) || String(slug).length > 120) return null;
  try {
    const answer = await erpGet(erpPath(`/flash-sales/${slug}`));
    return answer.flashSale ? mapSale(answer.flashSale) : null;
  } catch (error) {
    if (error instanceof ErpError && error.status === 404) return null;
    throw error;
  }
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
