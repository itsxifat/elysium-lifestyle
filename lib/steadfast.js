import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import Order from "@/models/Order";
import { normalizeBdPhone } from "@/lib/utils";

// Steadfast Courier (Packzy) order-placement API client.
// Docs: https://portal.packzy.com/api/v1  (create_order, status, balance, webhook)
//
// Distinct from lib/fraud.js (courier-history lookups via the steadfast-fraud
// package). This module places real consignments using the portal Api-Key /
// Secret-Key configured in Settings → steadfast.

export async function getSteadfastConfig() {
  await connectDB();
  const settings = await Settings.findOne({}).select("steadfast").lean();
  return settings?.steadfast || {};
}

export function steadfastConfigured(cfg) {
  return Boolean(cfg?.enabled && cfg?.apiKey && cfg?.secretKey);
}

async function callSteadfast(cfg, path, { method = "GET", body } = {}) {
  const base = (cfg.baseUrl || "https://portal.packzy.com/api/v1").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Api-Key": cfg.apiKey,
      "Secret-Key": cfg.secretKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || `Steadfast API error (${res.status})`;
    const err = new Error(msg);
    err.response = data;
    throw err;
  }
  return data;
}

// Status vocabulary + mapping live in a client-safe module (no db imports) and
// are re-exported here so server callers can keep importing from one place.
export {
  COURIER_STATUS_LABELS,
  COURIER_SETTLED_STATUSES,
  courierStatusLabel,
  isCourierSettled,
  mapSteadfastStatus,
} from "./steadfast-status";

// COD amount to collect on delivery: nothing if already paid online, else the
// current order total (after any returns).
function codAmountFor(order) {
  if (order.paymentStatus === "paid") return 0;
  return Math.max(0, Number(order.totalAmount) || 0);
}

/**
 * Create the consignment for an order on Steadfast and store the result on the
 * order. Idempotent: skips if a consignment already exists. Never throws —
 * records any error on order.courier.error.
 */
export async function sendOrderToCourier(orderId, { force = false } = {}) {
  await connectDB();
  const order = await Order.findById(orderId);
  if (!order) return { ok: false, error: "Order not found" };
  if (!force && order.courier?.consignmentId) {
    return { ok: true, already: true, consignmentId: order.courier.consignmentId };
  }

  const cfg = await getSteadfastConfig();
  if (!steadfastConfigured(cfg)) {
    order.courier.error = "Steadfast is not configured";
    await order.save();
    return { ok: false, error: "Steadfast is not configured" };
  }

  const a = order.shippingAddress || {};
  const itemDesc = (order.items || [])
    .map((i) => `${i.name} (${i.size}) x${i.quantity}`)
    .join(", ")
    .slice(0, 250);

  // Steadfast only accepts an 11-digit local number in ASCII digits — convert
  // any Bangla numerals / country code before sending (old orders may have a
  // Bangla phone stored from before input was normalised).
  const recipientPhone = normalizeBdPhone(a.phone).slice(0, 11);
  if (!/^01\d{9}$/.test(recipientPhone)) {
    order.courier.error = `Invalid recipient phone "${a.phone}" — Steadfast needs an 11-digit number (01XXXXXXXXX).`;
    await order.save();
    return { ok: false, error: order.courier.error };
  }

  const payload = {
    invoice: order.orderNumber,
    recipient_name: (a.name || "Customer").slice(0, 100),
    recipient_phone: recipientPhone,
    recipient_address: [a.street, a.city, a.state].filter(Boolean).join(", ").slice(0, 250),
    cod_amount: codAmountFor(order),
    note: order.notes || "",
    item_description: itemDesc,
    total_lot: (order.items || []).reduce((n, i) => n + i.quantity, 0),
    delivery_type: 0,
  };
  if (a.email) payload.recipient_email = a.email;

  try {
    const data = await callSteadfast(cfg, "/create_order", { method: "POST", body: payload });
    const c = data?.consignment || {};
    order.courier.consignmentId = c.consignment_id || null;
    order.courier.trackingCode = c.tracking_code || "";
    order.courier.status = c.status || "in_review";
    order.courier.sentAt = new Date();
    order.courier.error = "";
    await order.save();
    return { ok: true, consignmentId: c.consignment_id, trackingCode: c.tracking_code };
  } catch (err) {
    order.courier.error = err.message || "Failed to create consignment";
    await order.save();
    return { ok: false, error: order.courier.error };
  }
}

/**
 * Called when an order transitions to "processing". Sends it to the courier if
 * Steadfast is enabled and auto-send is on. Fire-and-forget safe.
 */
export async function maybeAutoSendToCourier(orderId) {
  try {
    const cfg = await getSteadfastConfig();
    if (!steadfastConfigured(cfg) || cfg.autoSendOnProcessing === false) return;
    await sendOrderToCourier(orderId);
  } catch {
    /* never block the order flow */
  }
}

export async function getCourierBalance() {
  const cfg = await getSteadfastConfig();
  if (!steadfastConfigured(cfg)) throw new Error("Steadfast is not configured");
  return callSteadfast(cfg, "/get_balance");
}

// The three status lookups Steadfast offers. Each takes an optional pre-loaded
// config: a bulk sync resolves the credentials once and then makes hundreds of
// calls, and re-reading Settings for every parcel would be a query per order.
async function resolveCfg(cfg) {
  const resolved = cfg || (await getSteadfastConfig());
  if (!steadfastConfigured(resolved)) throw new Error("Steadfast is not configured");
  return resolved;
}

export async function getCourierStatusByCid(cid, cfg) {
  return callSteadfast(await resolveCfg(cfg), `/status_by_cid/${cid}`);
}

export async function getCourierStatusByTrackingCode(code, cfg) {
  return callSteadfast(await resolveCfg(cfg), `/status_by_trackingcode/${encodeURIComponent(code)}`);
}

export async function getCourierStatusByInvoice(invoice, cfg) {
  return callSteadfast(await resolveCfg(cfg), `/status_by_invoice/${encodeURIComponent(invoice)}`);
}

/**
 * Ask Steadfast where one consignment currently is.
 *
 * Prefers the consignment id, falls back to the tracking code, and only then to
 * our own invoice number — in that order because the first two identify the
 * parcel in THEIR system, while an invoice lookup relies on them having stored
 * our order number, which is true only for consignments we created.
 *
 * Returns the raw lowercase status string, or null if they had no answer.
 */
export async function fetchCourierStatus(order, cfg) {
  const c = order?.courier || {};
  let data;
  if (c.consignmentId) data = await getCourierStatusByCid(c.consignmentId, cfg);
  else if (c.trackingCode) data = await getCourierStatusByTrackingCode(c.trackingCode, cfg);
  else if (order?.orderNumber) data = await getCourierStatusByInvoice(order.orderNumber, cfg);
  else throw new Error("Order has no consignment to look up");

  const raw = String(data?.delivery_status || data?.status || "").toLowerCase();
  // Their status endpoint answers 200 with `status: 200` plus the delivery
  // status; a numeric "status" alone means they found nothing to report.
  return raw && !/^\d+$/.test(raw) ? raw : null;
}
