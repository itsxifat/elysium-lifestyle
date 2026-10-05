import "server-only";

import { erpPath, erpPost } from "@/lib/erp";
import { taka } from "@/lib/storefront";

// The cart as the ERP prices it (POST /storefront/v1/cart/quote, D-520). The
// browser keeps the cart; every figure a shopper is asked to pay comes from here.

export const MAX_LINES = 50;
export const MAX_QTY = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The cart's lines as the ERP takes them: SKU ids and whole quantities, merged. */
export function quoteLines(items) {
  const merged = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const skuId = String(item?.skuId || "");
    const qty = Math.floor(Number(item?.qty ?? item?.quantity) || 0);
    if (!UUID.test(skuId) || qty < 1) continue;
    merged.set(skuId, Math.min(MAX_QTY, (merged.get(skuId) || 0) + qty));
  }
  return [...merged].slice(0, MAX_LINES).map(([skuId, qty]) => ({ skuId, qty }));
}

function area(address) {
  const districtId = Number(address?.districtId);
  const thanaId = Number(address?.thanaId);
  if (!Number.isInteger(districtId) || districtId <= 0 || !Number.isInteger(thanaId) || thanaId <= 0) return undefined;
  return { districtId, thanaId };
}

function codesOf(codes) {
  return (Array.isArray(codes) ? codes : [])
    .map((c) => String(c || "").trim().toUpperCase())
    .filter((c) => c.length >= 3 && c.length <= 40)
    .slice(0, 5);
}

/** The ERP's quote for these lines (and address, codes, shopper), or throws its refusal. */
export async function quoteCart({ lines, address, codes, accountId, phone }) {
  const body = { lines };
  const where = area(address);
  if (where) body.address = where;
  const typed = codesOf(codes);
  if (typed.length) body.codes = typed;
  if (accountId) body.accountId = accountId;
  else if (phone && String(phone).trim().length >= 6) body.phone = String(phone).trim().slice(0, 32);
  const { body: answer } = await erpPost(erpPath("/cart/quote"), body);
  return answer.quote;
}

/**
 * What the cart page needs to heal a stored cart: per line, whether it can
 * still be bought, how many are left, and its price now.
 */
export function reconcileLines(items, quote) {
  const priced = new Map((quote.lines || []).map((l) => [l.skuId, l]));
  const missing = new Map((quote.unavailable || []).filter((u) => u.skuId).map((u) => [u.skuId, u]));
  return items
    .filter((item) => item && item.skuId)
    .map((item) => {
      const requested = Math.floor(Number(item.quantity) || 0);
      const base = { skuId: item.skuId, requested };
      const label = `${item.name || "An item"}${item.size ? ` (${item.size})` : ""}`;
      const line = priced.get(item.skuId);
      if (line) {
        const price = taka(line.unitPrice);
        const regularPrice = taka(line.compareAt);
        const shown = Number(item.price);
        const moved = Number.isFinite(shown) && price !== null && Math.abs(shown - price) >= 0.01;
        return {
          ...base,
          name: line.name,
          sku: line.sku,
          price,
          regularPrice: regularPrice !== null && regularPrice > price ? regularPrice : null,
          available: Math.min(MAX_QTY, line.availableQty),
          status: moved ? "repriced" : "ok",
          reason: moved ? `${label} is now Tk ${price.toLocaleString("en-BD")}.` : undefined,
        };
      }
      const gone = missing.get(item.skuId);
      if (!gone) return { ...base, status: "ok" };
      if (gone.reason === "not_enough_stock" && gone.availableQty > 0) {
        return {
          ...base,
          available: gone.availableQty,
          status: "limited",
          reason: `Only ${gone.availableQty} left of ${label}.`,
        };
      }
      return {
        ...base,
        available: 0,
        status: "gone",
        reason: gone.reason === "sold_out" || gone.reason === "not_enough_stock"
          ? `${label} is sold out.`
          : `${label} is no longer available.`,
      };
    });
}
