import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import Order from "@/models/Order";

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

// Map a Steadfast delivery status → our orderStatus (and whether it's terminal).
// Steadfast "pending" means the courier has the parcel in hand → we ship.
export function mapSteadfastStatus(raw) {
  switch ((raw || "").toLowerCase()) {
    case "pending":
      return "shipped";
    case "delivered":
    case "delivered_approval_pending":
      return "delivered";
    case "partial_delivered":
    case "partial_delivered_approval_pending":
      return "delivered"; // partial → delivered + needs a manual return entry
    case "cancelled":
    case "cancelled_approval_pending":
      return "cancelled";
    default:
      return null; // in_review / hold / unknown → leave our status unchanged
  }
}

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

  const payload = {
    invoice: order.orderNumber,
    recipient_name: (a.name || "Customer").slice(0, 100),
    recipient_phone: (a.phone || "").replace(/\D/g, "").slice(0, 11),
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

export async function getCourierStatusByCid(cid) {
  const cfg = await getSteadfastConfig();
  if (!steadfastConfigured(cfg)) throw new Error("Steadfast is not configured");
  return callSteadfast(cfg, `/status_by_cid/${cid}`);
}
