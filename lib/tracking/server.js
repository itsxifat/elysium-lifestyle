import { dispatchEvent, newEventId } from "./dispatch";
import { getClientIp } from "@/lib/rate-limit";

// Server-side tracking entry point. Call this directly from backend handlers
// (order/payment success, registration, etc.) to fire an unblockable signal —
// no browser involved. It never throws.

/** Pull the real client IP + UA from a Request (handles the Nginx proxy chain). */
export function extractClientMeta(request) {
  if (!request) return { ip: "", userAgent: "" };
  const ip = getClientIp(request);
  const userAgent =
    (request.headers?.get && request.headers.get("user-agent")) ||
    request.headers?.["user-agent"] ||
    "";
  return { ip: ip === "unknown" ? "" : ip, userAgent };
}

/**
 * Fire a server-side event.
 * @param {string} eventName
 * @param {object} [opts]
 * @param {string} [opts.eventId]      pass the browser's event_id to dedup
 * @param {object} [opts.userData]     raw PII (email, phone, firstName, ...), fbp, fbc
 * @param {object} [opts.customData]   value, currency, contents, order_id, ...
 * @param {object} [opts.ga4]          { clientId, sessionId, userId, params }
 * @param {string} [opts.eventSourceUrl]
 * @param {string} [opts.actionSource] Meta action_source (default "website")
 * @param {Request} [opts.request]     to auto-extract ip/ua
 * @param {string} [opts.ip]           explicit override
 * @param {string} [opts.userAgent]    explicit override
 * @param {boolean} [opts.testMode]
 */
export async function trackServerEvent(eventName, opts = {}) {
  try {
    const { ip, userAgent } = opts.request
      ? extractClientMeta(opts.request)
      : { ip: opts.ip || "", userAgent: opts.userAgent || "" };

    return await dispatchEvent({
      eventName,
      eventId: opts.eventId || newEventId(),
      source: "server",
      eventTime: opts.eventTime,
      eventSourceUrl: opts.eventSourceUrl,
      actionSource: opts.actionSource || "website",
      userData: opts.userData || {},
      customData: opts.customData || {},
      ga4: opts.ga4 || {},
      ip: opts.ip || ip,
      userAgent: opts.userAgent || userAgent,
      testMode: opts.testMode,
    });
  } catch (err) {
    console.error("[tracking] trackServerEvent failed:", err?.message);
    return { status: "error", error: err?.message };
  }
}

/**
 * Convenience: fire a Purchase from a Mongo Order doc with full match data.
 * This is the primary, unblockable purchase signal — wire it into your COD and
 * gateway success handlers.
 *
 * @param {object} order               an Order document/object
 * @param {object} [opts]
 * @param {string} [opts.eventId]      reuse the browser InitiateCheckout/Purchase id for dedup
 * @param {object} [opts.userData]     extra signals from the browser (fbp, fbc, externalId)
 * @param {Request} [opts.request]
 */
export async function trackPurchaseFromOrder(order, opts = {}) {
  if (!order) return { status: "error", error: "no order" };
  const addr = order.shippingAddress || {};
  const [firstName, ...rest] = String(addr.name || "").trim().split(/\s+/);
  const lastName = rest.join(" ");

  const contents = (order.items || []).map((i) => ({
    id: i.product ? String(i.product) : i.name,
    quantity: i.quantity,
    item_price: i.price,
    name: i.name,
  }));

  const customData = {
    currency: opts.currency || "BDT",
    value: order.totalAmount,
    order_id: order.orderNumber || String(order._id || ""),
    content_type: "product",
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: contents.reduce((s, c) => s + (c.quantity || 0), 0),
  };

  const userData = {
    email: addr.email || order.guestEmail || opts.email,
    phone: addr.phone,
    firstName,
    lastName,
    city: addr.city,
    state: addr.state,
    zip: addr.postalCode,
    country: addr.country || "BD",
    externalId: order.user ? String(order.user) : undefined,
    ...(opts.userData || {}),
  };

  return trackServerEvent("Purchase", {
    // Deterministic id so the confirmation-page client Purchase (which uses the
    // same `purchase_<orderId>`) is deduplicated by Meta against this one.
    eventId: opts.eventId || `purchase_${order._id || order.orderNumber}`,
    userData,
    customData,
    ga4: opts.ga4,
    eventSourceUrl: opts.eventSourceUrl,
    request: opts.request,
    ip: opts.ip,
    userAgent: opts.userAgent,
  });
}
