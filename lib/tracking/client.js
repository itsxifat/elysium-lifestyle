"use client";

// First-party browser tracking helper. It:
//  1. loads the Meta pixel + GA4 gtag from your *proxied* first-party paths
//     (so ad blockers don't see connect.facebook.net / googletagmanager.com),
//  2. fires the client-side pixel/gtag event, AND
//  3. posts the same event (with a SHARED event_id) to /api/events so the
//     server fires CAPI/MP — giving Meta browser+server deduplication and
//     recovering events from blocked/again-prevented browsers.

import { STANDARD_EVENTS, toGa4EventName } from "./constants";

const STD = new Set(STANDARD_EVENTS);
let configPromise = null;
let initialized = false;

function getConfig() {
  if (!configPromise) {
    configPromise = fetch("/api/tracking/config", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => null);
  }
  return configPromise;
}

function getCookie(name) {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : "";
}

function uuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}.${Math.random().toString(36).slice(2)}`;
}

// GA4 client_id from the _ga cookie ("GA1.1.<cid>.<ts>" -> "<cid>.<ts>").
function gaClientId() {
  const ga = getCookie("_ga");
  if (ga) {
    const parts = ga.split(".");
    if (parts.length >= 4) return parts.slice(-2).join(".");
  }
  let cid = localStorage.getItem("eltrk_cid");
  if (!cid) {
    cid = `${Math.floor(Math.random() * 1e9)}.${Math.floor(Date.now() / 1000)}`;
    localStorage.setItem("eltrk_cid", cid);
  }
  return cid;
}

// GA4 session_id from the _ga_<CONTAINER> cookie ("GS1.1.<sid>....").
function gaSessionId(measurementId) {
  if (!measurementId) return "";
  const container = measurementId.replace(/^G-/, "");
  const c = getCookie(`_ga_${container}`);
  if (c) {
    const parts = c.split(".");
    if (parts.length >= 3) return parts[2];
  }
  return "";
}

// Build the _fbc value from the fbclid URL param if the cookie isn't set yet.
function deriveFbc() {
  const existing = getCookie("_fbc");
  if (existing) return existing;
  if (typeof window === "undefined") return "";
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : "";
}

function injectMetaPixel(pixelId, scriptPath) {
  if (window.fbq) return;
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", scriptPath);
  /* eslint-enable */
  window.fbq("init", pixelId);
}

function injectGtag(measurementId, scriptPath, transportPath) {
  if (window.gtag) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `${scriptPath}?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    // Official first-party endpoint override — gtag POSTs to
    // `${transport_url}/g/collect`, which Nginx proxies to GA.
    transport_url: window.location.origin + transportPath,
    first_party_collection: true,
  });
}

/** Load the proxied pixel/gtag once. Safe to call repeatedly. */
export async function initTracking() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  const cfg = await getConfig();
  if (!cfg) return;
  if (cfg.meta?.pixelEnabled && cfg.meta.pixelId) {
    injectMetaPixel(cfg.meta.pixelId, cfg.proxy.metaScriptPath);
  }
  if (cfg.ga4?.clientEnabled && cfg.ga4.measurementId) {
    injectGtag(cfg.ga4.measurementId, cfg.proxy.ga4ScriptPath, cfg.proxy.ga4CollectPath);
  }
  // Fire the initial PageView through the unified path (shared event_id).
  trackEvent("PageView");
}

function mapGtagParams(eventName, customData, eventId) {
  const p = { event_id: eventId };
  if (customData.value != null) p.value = Number(customData.value);
  if (customData.currency) p.currency = customData.currency;
  if (customData.order_id) p.transaction_id = String(customData.order_id);
  if (customData.search_string) p.search_term = String(customData.search_string);
  const contents = customData.contents || customData.items;
  if (Array.isArray(contents)) {
    p.items = contents.map((c) => ({
      item_id: c.id || c.item_id || "",
      item_name: c.name || c.item_name || "",
      price: Number(c.item_price ?? c.price ?? 0),
      quantity: Number(c.quantity ?? 1),
    }));
  }
  return p;
}

/**
 * Track an event: fires client pixel + gtag AND posts to /api/events with the
 * shared event_id. Returns the event_id.
 *
 * @param {string} eventName
 * @param {object} [opts]
 * @param {object} [opts.customData]  value, currency, contents, order_id, ...
 * @param {object} [opts.userData]    email/phone/etc. if known in the browser
 * @param {object} [opts.ga4Params]   extra GA4 params
 */
export async function trackEvent(eventName, opts = {}) {
  const cfg = await getConfig();
  if (!cfg) return null;

  // Accept a caller-supplied id (e.g. `purchase_<orderId>`) so the browser and
  // server fire the SAME event_id and Meta deduplicates them.
  const eventId = opts.eventId || uuid();
  const customData = opts.customData || {};
  const ev = (cfg.events || []).find((e) => e.name === eventName);
  const clientOn = ev ? ev.enabled && ev.client : true;

  // Client pixel
  if (clientOn && cfg.meta?.pixelEnabled && window.fbq) {
    window.fbq(STD.has(eventName) ? "track" : "trackCustom", eventName, customData, { eventID: eventId });
  }
  // Client gtag
  if (clientOn && cfg.ga4?.clientEnabled && window.gtag) {
    window.gtag("event", toGa4EventName(eventName), {
      ...mapGtagParams(eventName, customData, eventId),
      ...(opts.ga4Params || {}),
    });
  }

  // Always forward to the server (CAPI/MP) with the shared id + match signals.
  try {
    const body = JSON.stringify({
      eventName,
      eventId,
      source: "client",
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
      actionSource: "website",
      userData: {
        ...(opts.userData || {}),
        fbp: getCookie("_fbp") || undefined,
        fbc: deriveFbc() || undefined,
      },
      customData,
      ga4: {
        clientId: gaClientId(),
        sessionId: gaSessionId(cfg.ga4?.measurementId),
        params: opts.ga4Params,
      },
    });
    // keepalive so the request survives a page navigation (e.g. on Purchase).
    fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body,
    }).catch(() => {});
  } catch {
    /* never let tracking break the page */
  }

  return eventId;
}

// Convenience wrappers for the standard events.
export const track = {
  pageView: (o) => trackEvent("PageView", o),
  viewContent: (o) => trackEvent("ViewContent", o),
  addToCart: (o) => trackEvent("AddToCart", o),
  initiateCheckout: (o) => trackEvent("InitiateCheckout", o),
  addPaymentInfo: (o) => trackEvent("AddPaymentInfo", o),
  purchase: (o) => trackEvent("Purchase", o),
  search: (o) => trackEvent("Search", o),
  lead: (o) => trackEvent("Lead", o),
  completeRegistration: (o) => trackEvent("CompleteRegistration", o),
  custom: (name, o) => trackEvent(name, o),
};
