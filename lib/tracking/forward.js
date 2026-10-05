// What the website's server forwards to the brand ERP's tracking
// (POST /storefront/v1/events and the checkout's `tracking`, M35b, D-552): the
// browser's events reduced to exactly the fields the ERP accepts. The ERP's
// schema is strict (an unknown field, a non-https page or an over-long value
// refuses the whole batch), so everything is checked here and anything doubtful
// is left out rather than sent. Pure functions: unit-tested in
// tests/tracking.test.mjs.

/** At most this many events per call to the ERP. */
export const MAX_EVENTS = 20;

/** Purchase is the ERP's own (sent when the order is placed or paid): never forwarded. */
export const SERVER_ONLY_EVENTS = new Set(["Purchase"]);

const EVENT_NAME = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const EVENT_ID = /^[!-~]{1,100}$/;
const USER_KEYS = ["email", "phone", "firstName", "lastName", "city", "state", "zip", "country", "externalId", "fbp", "fbc"];
const ACTION_SOURCES = new Set(["website", "app", "email", "phone_call", "chat", "physical_store", "system_generated", "other"]);
const MAX_CUSTOM_DATA_CHARS = 2500;
/** A forwarded batch stays well under the ERP's (and a keepalive request's) 64 KiB. */
export const MAX_BATCH_CHARS = 48_000;
const SEVEN_DAYS = 7 * 24 * 3600;

function shortText(value, max) {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text && text.length <= max ? text : undefined;
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * A page address the ERP accepts: https, no spaces or control characters, no
 * credentials, at most 500 characters (its link rule). A long address loses its
 * query string first; anything else is left out.
 */
export function httpsPage(value) {
  if (typeof value !== "string" || !value.startsWith("https://")) return undefined;
  if (/[\s\u0000-\u001f\u007f\\]/.test(value)) return undefined;
  let url;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return undefined;
  url.hash = "";
  const full = url.toString();
  if (full.length <= 500) return full;
  const bare = `${url.origin}${url.pathname}`;
  return bare.length <= 500 ? bare : undefined;
}

function userDataOf(raw) {
  const source = plainObject(raw);
  if (!source) return undefined;
  const out = {};
  for (const key of USER_KEYS) {
    const value = shortText(source[key], 200);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function customDataOf(raw) {
  const source = plainObject(raw);
  if (!source) return undefined;
  try {
    const text = JSON.stringify(source);
    if (!text || text === "{}" || text.length > MAX_CUSTOM_DATA_CHARS) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function ga4Of(raw) {
  const source = plainObject(raw);
  if (!source) return undefined;
  const out = {};
  const clientId = shortText(source.clientId, 100);
  const sessionId = shortText(source.sessionId, 100);
  if (clientId) out.clientId = clientId;
  if (sessionId) out.sessionId = sessionId;
  const params = plainObject(source.params);
  if (params) {
    const kept = {};
    for (const [key, value] of Object.entries(params).slice(0, 25)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key)) continue;
      if (typeof value === "string" && value.length <= 200) kept[key] = value;
      else if (typeof value === "number" && Number.isFinite(value)) kept[key] = value;
      else if (typeof value === "boolean") kept[key] = value;
    }
    if (Object.keys(kept).length) out.params = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

/** One browser event as the ERP takes it, or null when it must not be forwarded. */
export function toErpEvent(raw, { now = Date.now() } = {}) {
  const source = plainObject(raw);
  if (!source) return null;
  const eventName = typeof source.eventName === "string" ? source.eventName : "";
  if (!EVENT_NAME.test(eventName) || SERVER_ONLY_EVENTS.has(eventName)) return null;
  const event = { eventName };
  if (typeof source.eventId === "string" && EVENT_ID.test(source.eventId)) event.eventId = source.eventId;
  const nowSeconds = Math.floor(now / 1000);
  // The browser sends its queue within seconds, so a time in the future or more
  // than a week back is the shopper's clock being wrong: the ERP's clock is used.
  const time = Number(source.eventTime);
  if (Number.isInteger(time) && time > nowSeconds - SEVEN_DAYS) event.eventTime = Math.min(time, nowSeconds);
  const page = httpsPage(source.eventSourceUrl);
  if (page) event.eventSourceUrl = page;
  event.actionSource = ACTION_SOURCES.has(source.actionSource) ? source.actionSource : "website";
  const userData = userDataOf(source.userData);
  if (userData) event.userData = userData;
  const customData = customDataOf(source.customData);
  if (customData) event.customData = customData;
  const ga4 = ga4Of(source.ga4);
  if (ga4) event.ga4 = ga4;
  return event;
}

/**
 * The browser's batch (`{ events: [...] }`, an array, or one event) as the
 * ERP's: at most twenty, Purchase and anything malformed left out.
 */
export function toErpEvents(payload, options = {}) {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.events)
      ? payload.events
      : payload
        ? [payload]
        : [];
  const events = [];
  let size = 0;
  for (const raw of list.slice(0, MAX_EVENTS)) {
    const event = toErpEvent(raw, options);
    if (!event) continue;
    size += JSON.stringify(event).length + 1;
    if (size > MAX_BATCH_CHARS) break;
    events.push(event);
  }
  return events;
}

/**
 * The checkout's `tracking`: what only the browser knows about a purchase, so
 * the ERP's own Purchase carries Meta's browser ids and GA4's client id.
 */
export function purchaseTrackingOf(raw) {
  const source = plainObject(raw);
  if (!source) return undefined;
  const out = {};
  const fbp = shortText(source.fbp, 200);
  const fbc = shortText(source.fbc, 200);
  const page = httpsPage(source.eventSourceUrl);
  const gaClientId = shortText(source.gaClientId, 100);
  const gaSessionId = shortText(source.gaSessionId, 100);
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  if (page) out.eventSourceUrl = page;
  if (gaClientId) out.gaClientId = gaClientId;
  if (gaSessionId) out.gaSessionId = gaSessionId;
  return Object.keys(out).length ? out : undefined;
}

// --- GA4's cookies --------------------------------------------------------------------------------

/** GA4's client id from the `_ga` cookie ("GA1.1.<cid>.<ts>" → "<cid>.<ts>"), or "". */
export function gaClientIdFrom(cookie) {
  const parts = String(cookie || "").split(".");
  if (parts.length < 4) return "";
  const id = parts.slice(-2).join(".");
  return /^\d+\.\d+$/.test(id) ? id : "";
}

/**
 * GA4's session id from the `_ga_<container>` cookie: "GS1.1.<sid>.…" or the
 * newer "GS2.1.s<sid>$o…$g…", or "".
 */
export function gaSessionIdFrom(cookie) {
  const parts = String(cookie || "").split(".");
  if (parts.length < 3) return "";
  const third = parts[2];
  const modern = /^s(\d+)/.exec(third);
  if (modern) return modern[1];
  return /^\d+$/.test(third) ? third : "";
}
