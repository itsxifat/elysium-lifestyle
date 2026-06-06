import { toGa4EventName } from "./constants";

// Build + send a single event to the GA4 Measurement Protocol.
// Returns a structured result (never throws).
//
// NOTE on IP/UA: GA4 MP derives device from the request's User-Agent header
// (which we set to the client's UA below). It does NOT support overriding the
// client IP/geo over MP — geo is taken from the request's source IP (your
// server). We still pass the client IP as a param for your own records and set
// the UA header so device/browser reporting is accurate. This is a documented
// GA4 limitation, unlike Meta which accepts client_ip_address directly.

const COLLECT = "https://www.google-analytics.com/mp/collect";
const DEBUG = "https://www.google-analytics.com/debug/mp/collect";

export function buildGa4Payload({
  eventName,
  clientId,
  sessionId,
  userId,
  eventId,
  customData = {},
  extraParams = {},
  clientIp,
}) {
  const params = {
    // engagement_time_msec + session_id make events show in realtime reports.
    engagement_time_msec: 100,
    ...(sessionId ? { session_id: String(sessionId) } : {}),
    ...(eventId ? { event_id: eventId } : {}),
    ...(clientIp ? { client_ip: clientIp } : {}),
    ...mapGa4Params(customData),
    ...extraParams,
  };

  const event = { name: toGa4EventName(eventName), params };

  const payload = {
    client_id: clientId || `${Date.now()}.${Math.floor(Math.random() * 1e9)}`,
    ...(userId ? { user_id: String(userId) } : {}),
    timestamp_micros: Date.now() * 1000,
    events: [event],
  };
  return payload;
}

// Translate our generic custom_data into GA4 ecommerce params (value, currency,
// items). Passes through any other primitive params untouched.
function mapGa4Params(customData = {}) {
  const out = {};
  if (customData.value != null) out.value = Number(customData.value);
  if (customData.currency) out.currency = customData.currency;
  if (customData.order_id) out.transaction_id = String(customData.order_id);
  if (customData.search_string) out.search_term = String(customData.search_string);
  if (customData.num_items != null) out.quantity = Number(customData.num_items);

  // contents: [{ id, quantity, item_price }] -> GA4 items.
  const contents = customData.contents || customData.items;
  if (Array.isArray(contents)) {
    out.items = contents.map((c) => ({
      item_id: c.id || c.item_id || c.content_id || "",
      item_name: c.name || c.item_name || "",
      price: Number(c.item_price ?? c.price ?? 0),
      quantity: Number(c.quantity ?? 1),
    }));
  } else if (Array.isArray(customData.content_ids)) {
    out.items = customData.content_ids.map((id) => ({ item_id: String(id) }));
  }

  // Pass through any remaining scalar params (custom dimensions etc.).
  for (const [k, v] of Object.entries(customData)) {
    if (["value", "currency", "order_id", "search_string", "num_items", "contents", "items", "content_ids", "content_type", "content_name"].includes(k)) continue;
    if (v == null) continue;
    if (typeof v === "object") continue;
    out[k] = v;
  }
  return out;
}

export async function sendToGa4({ config, payload, userAgent, debug = false }) {
  const endpoint = debug ? DEBUG : COLLECT;
  const url = `${endpoint}?measurement_id=${encodeURIComponent(
    config.ga4.measurementId
  )}&api_secret=${encodeURIComponent(config.ga4.apiSecret)}`;

  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward the client UA so GA4 attributes the correct device/browser.
        ...(userAgent ? { "User-Agent": userAgent } : {}),
      },
      body: JSON.stringify(payload),
    });
    const latencyMs = Date.now() - started;
    // Production /mp/collect returns 204 with no body. /debug returns 200 + JSON
    // validationMessages. Treat 2xx as success; surface debug validation errors.
    let response = null;
    if (debug) {
      response = await res.json().catch(() => ({}));
    } else {
      const text = await res.text().catch(() => "");
      response = text ? { raw: text } : { status: res.status };
    }
    const validationErrors = debug && Array.isArray(response?.validationMessages) && response.validationMessages.length;
    const ok = res.status >= 200 && res.status < 300 && !validationErrors;
    return {
      attempted: true,
      status: ok ? "success" : "error",
      httpStatus: res.status,
      latencyMs,
      request: payload,
      response,
      error: ok ? "" : validationErrors ? JSON.stringify(response.validationMessages) : `HTTP ${res.status}`,
      endpoint,
    };
  } catch (err) {
    return {
      attempted: true,
      status: "error",
      httpStatus: 0,
      latencyMs: Date.now() - started,
      request: payload,
      response: null,
      error: err?.message || "Network error",
      endpoint,
    };
  }
}
