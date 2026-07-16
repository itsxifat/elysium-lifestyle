// Turns a public landing offer (from publicOffers) into the content payload
// Meta/GA4 expect. Every landing event goes through here so ViewContent,
// AddToCart, InitiateCheckout and Purchase all describe the same cart in the
// same shape — which is what lets Meta attribute them to one another.
//
// Ids are product ids, matching what the storefront sends for ViewContent /
// AddToCart (see ProductDetailClient) so a landing page and the catalog report
// the same product to the same pixel.

const unitPrice = (sizes, chosen) => (sizes?.find((s) => s.size === chosen) ?? sizes?.[0])?.price ?? 0;

/**
 * Everything the offer *can* sell — what ViewContent reports, before the
 * customer has chosen anything. Fixed offers carry their real line quantities;
 * a collection/à la carte pool is reported one-of-each, since at page load the
 * customer hasn't picked yet.
 */
export function offerCatalogContents(offer) {
  if (!offer) return [];
  const lines = (offer.kind === "collection" || offer.kind === "alacarte" ? offer.pool : offer.items) || [];
  return lines.map((line) => ({
    id: line.productId,
    name: line.name,
    quantity: line.quantity || 1,
    item_price: unitPrice(line.sizes, line.pinnedSize),
  }));
}

/**
 * What the customer has actually selected — for AddToCart / InitiateCheckout /
 * Purchase. `sizes` is the fixed-offer size map (line index → size); `picks` is
 * the pool cart (productId → { size, qty }). Mirrors how the order form and
 * lib/landing.js each read a selection, so the tracked cart matches the priced one.
 */
export function offerContents(offer, { sizes = {}, picks = {} } = {}) {
  if (!offer) return [];

  if (offer.kind === "collection" || offer.kind === "alacarte") {
    return (offer.pool || [])
      .filter((p) => picks[p.productId]?.qty > 0)
      .map((p) => ({
        id: p.productId,
        name: p.name,
        quantity: picks[p.productId].qty,
        item_price: unitPrice(p.sizes, picks[p.productId].size),
      }));
  }

  return (offer.items || []).map((line, i) => ({
    id: line.productId,
    name: line.name,
    quantity: line.quantity,
    item_price: unitPrice(line.sizes, line.pinnedSize || sizes[i]),
  }));
}

/**
 * The customData block for a landing event. `value` is passed in rather than
 * derived, because what an event is worth depends on the event: ViewContent is
 * the offer's headline price, Purchase is the total actually payable.
 */
export function landingCustomData(offer, { value = 0, contents = [] } = {}) {
  return {
    currency: "BDT",
    value: Number(value) || 0,
    content_type: "product",
    content_name: offer?.label || "",
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: contents.reduce((n, c) => n + (c.quantity || 0), 0),
  };
}
