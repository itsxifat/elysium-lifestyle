// The ERP's storefront answers, shaped for this site's components: pure
// functions with no I/O, so the browser bundle, the server and the unit tests
// (tests/storefront-map.test.mjs) can all use them. lib/storefront.js does the
// reading; this file only maps.
//
// Prices (M39b, D-640, docs/storefront-api.md in the ERP repo):
//   - `price` is what a shopper pays now: a live flash price when one undercuts
//     the shelf price, else the shelf price. The cart's quote charges the same.
//   - `compareAt` is the figure struck through beside it: with a flash price the
//     higher of the shelf and the regular price, without one the regular ("was")
//     price, else nothing.
// The site never works a price out itself; it shows the ERP's two figures, and
// only decides how to draw them (a flash sale keeps its countdown and badge).

/** A display amount in taka from an ERP money object, or null. */
export function taka(money) {
  if (!money || money.taka === undefined || money.taka === null) return null;
  const n = Number(money.taka);
  return Number.isFinite(n) ? n : null;
}

export function imageUrl(image, size = "card") {
  if (!image?.urls) return null;
  return image.urls[size] || image.urls.card || image.urls.full || image.urls.thumb || null;
}

export function discountPercent(regular, sale) {
  if (!(regular > 0) || !(sale > 0) || sale >= regular) return 0;
  return Math.round(((regular - sale) / regular) * 100);
}

/** The struck-through figure, only when it is really above the price. */
function struck(compareAt, price) {
  return compareAt !== null && price !== null && compareAt > price ? compareAt : null;
}

export function categoryRef(category) {
  return category ? { _id: category.id, id: category.id, slug: category.slug, name: category.name } : null;
}

// --- flash sales ---------------------------------------------------------------------------------

/**
 * The live flash offers from `GET /flash-sales`, indexed by SKU and by product:
 * which sale a size's flash price comes from (its title, end and units left),
 * for the countdown strip and the "only N left at this price" line. The price
 * itself is the catalog's (`variant.price`).
 */
export function indexFlash(sales = []) {
  const bySku = new Map();
  const byProduct = new Map();
  for (const sale of sales) {
    if (sale?.status !== "live") continue;
    const ref = { _id: sale.id, slug: sale.slug, title: sale.title, endsAt: sale.endsAt || null };
    for (const item of sale.items || []) {
      const price = taka(item.price);
      const shelf = taka(item.compareAt);
      if (price === null || shelf === null || !(price < shelf)) continue;
      if (item.unitsLeft !== null && item.unitsLeft !== undefined && item.unitsLeft <= 0) continue;
      const offer = { price, remaining: item.unitsLeft ?? null, sale: ref };
      const current = bySku.get(item.skuId);
      if (!current || offer.price < current.price) bySku.set(item.skuId, offer);
      const productId = item.product?.id;
      if (productId) byProduct.set(productId, [...(byProduct.get(productId) || []), offer]);
    }
  }
  return { bySku, byProduct };
}

// --- product cards -------------------------------------------------------------------------------

/**
 * A product card from the list, search, related or campaign answers.
 * `minPrice`/`maxPrice` are what a shopper pays now across the sizes;
 * `compareAt` is struck through beside the lowest; `flash` marks a product a
 * live flash sale covers (the zap badge).
 */
export function mapCard(card, flash = null) {
  const images = (card.images?.length ? card.images : card.image ? [card.image] : [])
    .map((img) => imageUrl(img, "card"))
    .filter(Boolean);
  const minPrice = taka(card.price?.min) ?? 0;
  const maxPrice = taka(card.price?.max) ?? minPrice;
  const compareAt = struck(taka(card.compareAt), minPrice);
  const offers = flash?.byProduct?.get(card.id) || [];
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
    minPrice,
    maxPrice,
    compareAt,
    discount: compareAt === null ? 0 : discountPercent(compareAt, minPrice),
    onSale: !!card.onSale || compareAt !== null,
    sizes: card.sizes || [],
    inStock: !!card.inStock,
    flash: offers.length > 0 && card.onSale !== false ? { sale: offers.reduce((a, b) => (b.price < a.price ? b : a)).sale } : null,
  };
}

/** One row of the search box. */
export function mapSearchResult(card) {
  const price = taka(card.price?.min) ?? 0;
  return {
    _id: card.id,
    name: card.name,
    slug: card.slug,
    image: imageUrl(card.image, "thumb"),
    price,
    compareAt: struck(taka(card.compareAt), price),
  };
}

// --- the product page ----------------------------------------------------------------------------

/** A variant's label within its product: its size, with the colour when sizes repeat. */
export function variantLabels(variants) {
  const colours = new Set(variants.map((v) => v.colour).filter(Boolean));
  const sizes = variants.map((v) => v.size);
  const repeated = new Set(sizes.filter((s, i) => s && sizes.indexOf(s) !== i));
  return variants.map((v) => {
    if (v.size && v.colour && (colours.size > 1 || repeated.has(v.size))) return `${v.size} / ${v.colour}`;
    return v.size || v.colour || v.sku;
  });
}

/**
 * The product answer (`GET /catalog/products/{slug}` → `product`) for the
 * product page and quick add. Each variant carries its own `price`, `compareAt`
 * and, when a live flash sale prices it, `flash` ({ sale, remaining }).
 * `galleries` are the ERP's photos by colour (D-643), every-colour photos first.
 */
export function mapProduct(p, flash = null) {
  const labels = variantLabels(p.variants || []);
  const variants = (p.variants || []).map((v, i) => {
    const price = taka(v.price) ?? 0;
    const compareAt = struck(taka(v.compareAt), price);
    const stock = Math.max(0, Number(v.availableQty) || 0);
    const offer = flash?.bySku?.get(v.skuId);
    // The size is on the flash sale only when the catalog charges that sale's price.
    const onFlash = !!offer && Math.abs(offer.price - price) < 0.005;
    return {
      skuId: v.skuId,
      sku: v.sku,
      size: labels[i],
      sizeOnly: v.size || null,
      colour: v.colour || null,
      price,
      compareAt,
      discount: compareAt === null ? 0 : discountPercent(compareAt, price),
      stock,
      flash: onFlash
        ? { sale: offer.sale, remaining: offer.remaining === null ? stock : Math.min(offer.remaining, stock) }
        : null,
    };
  });

  const onFlash = variants.filter((v) => v.flash && v.stock > 0);
  const images = (p.images || []).map((img) => imageUrl(img, "full")).filter(Boolean);
  const galleries = (p.galleries?.length ? p.galleries : [{ colour: null, images: p.images || [] }])
    .map((g) => ({ colour: g.colour ?? null, images: (g.images || []).map((img) => imageUrl(img, "full")).filter(Boolean) }))
    .filter((g) => g.images.length);

  return {
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
    images,
    galleries,
    ogImage: imageUrl(p.images?.[0] || p.image, "full"),
    sizeChart: p.sizeChart ? { _id: p.sizeChart.id, name: p.sizeChart.name, columns: p.sizeChart.columns || [], rows: p.sizeChart.rows || [] } : null,
    variants,
    flash: onFlash.length
      ? { sale: onFlash.reduce((a, b) => (b.price < a.price ? b : a)).flash.sale, discount: Math.max(...onFlash.map((v) => v.discount)) }
      : null,
  };
}

/** The colours a product comes in, in the order its variants list them. */
export function coloursOf(product) {
  return [...new Set((product?.variants || []).map((v) => v.colour).filter(Boolean))];
}

function sameColour(a, b) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/**
 * The photos to show for a colour: that colour's own photos, then the photos
 * for every colour; with no colour picked, or none of its own, every photo.
 */
export function galleryFor(product, colour) {
  const all = product?.images || [];
  if (!colour) return all;
  const galleries = product?.galleries || [];
  const own = galleries.find((g) => g.colour !== null && sameColour(g.colour, colour))?.images || [];
  if (!own.length) return all;
  const common = galleries.find((g) => g.colour === null)?.images || [];
  return [...own, ...common];
}

/**
 * The price line for a set of variants (all of a product's, or one colour's):
 * the lowest price now, the highest, the lowest one's own struck-through figure,
 * and the largest saving among them.
 */
export function priceSummary(variants = []) {
  if (!variants.length) return { min: 0, max: 0, compareAt: null, discount: 0, maxDiscount: 0 };
  let lowest = variants[0];
  let max = lowest.price;
  for (const v of variants) {
    if (v.price < lowest.price || (v.price === lowest.price && lowest.compareAt === null && v.compareAt !== null)) lowest = v;
    if (v.price > max) max = v.price;
  }
  return {
    min: lowest.price,
    max,
    compareAt: lowest.compareAt,
    discount: lowest.discount || 0,
    maxDiscount: variants.reduce((m, v) => Math.max(m, v.discount || 0), 0),
  };
}

// --- campaign links (`?cu=`, M35b, D-551) --------------------------------------------------------

/** The ERP's five-digit campaign code. */
export const CAMPAIGN_CODE = /^[1-9]\d{4}$/;

/**
 * `GET /custom-links/{code}` → what the banner, the pop-up and the shop's
 * highlighted strip draw.
 */
export function mapCustomLink(answer, flash = null) {
  const link = answer?.customLink;
  if (!link) return null;
  const banner = link.banner?.text
    ? { text: link.banner.text, bgColor: link.banner.bgColor || null, textColor: link.banner.textColor || null, link: link.banner.link || null }
    : null;
  const modal = link.modal
    ? {
        type: link.modal.type === "image" ? "image" : "text",
        title: link.modal.title || "",
        text: link.modal.text || "",
        image: imageUrl(link.modal.image, "full"),
        ctaText: link.modal.ctaText || "",
        ctaLink: link.modal.ctaLink || null,
      }
    : null;
  return {
    code: link.code,
    title: link.title || "",
    basePath: link.basePath || "/shop",
    banner,
    modal: modal && (modal.title || modal.text || modal.image || modal.ctaText) ? modal : null,
    highlightProducts: (link.highlightProducts || []).map((card) => mapCard(card, flash)),
  };
}

// --- tracking (M35b, D-552) ----------------------------------------------------------------------

export const TRACKING_OFF = Object.freeze({
  enabled: false,
  meta: { pixelEnabled: false, pixelId: "" },
  ga4: { clientEnabled: false, measurementId: "" },
  proxy: null,
  testMode: false,
  events: [],
});

const PIXEL_ID = /^\d{1,24}$/;
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;
// The proxy paths are the website's own: the ERP's rule for a path on the site
// (`sitePath`: starts with one /, at most 300 characters, no space, control
// character or backslash), so a path the ERP accepts is never refused here.
function sitePath(value) {
  return (
    typeof value === "string" &&
    value.length <= 300 &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\s\u0000-\u001f\u007f\\]/.test(value)
  );
}

/**
 * `GET /tracking/config` → what the browser helper reads from
 * `/api/tracking/config`. Tracking is on only when the ERP switches the pixel
 * or gtag on with an id; anything unexpected is off.
 */
export function mapTrackingConfig(answer) {
  const t = answer?.tracking;
  if (!t) return TRACKING_OFF;
  const pixelId = String(t.meta?.pixelId || "");
  const measurementId = String(t.ga4?.measurementId || "");
  const meta = { pixelEnabled: t.meta?.pixelEnabled === true && PIXEL_ID.test(pixelId), pixelId };
  const ga4 = { clientEnabled: t.ga4?.clientEnabled === true && MEASUREMENT_ID.test(measurementId), measurementId };
  if (!meta.pixelEnabled && !ga4.clientEnabled) return TRACKING_OFF;
  const proxy = t.proxy || {};
  const paths = ["metaScriptPath", "metaCollectPath", "ga4ScriptPath", "ga4CollectPath"];
  if (!paths.every((key) => sitePath(proxy[key]))) {
    return TRACKING_OFF;
  }
  return {
    enabled: true,
    meta,
    ga4,
    proxy: Object.fromEntries(paths.map((key) => [key, proxy[key]])),
    testMode: t.testMode === true,
    events: (Array.isArray(t.events) ? t.events : [])
      .filter((e) => e && typeof e.name === "string")
      .map((e) => ({ name: e.name, enabled: e.enabled !== false, client: e.client !== false })),
  };
}
