"use client";

// First-party browser tracking, run by the brand ERP's Website → Tracking
// (M35b, D-552; docs/storefront-api.md → Tracking). It:
//  1. reads what to load from /api/tracking/config (the ERP's pixel id, GA4
//     measurement id and this site's proxy paths; never a secret). When the ERP
//     has the pixel and gtag both off, nothing below happens: no script, no
//     cookie, no event leaves the page;
//  2. loads the Meta pixel and GA4's gtag from this site's own proxied paths
//     (nginx forwards them, docs/nginx-tracking.conf), so ad blockers that match
//     on connect.facebook.net / googletagmanager.com do not see them;
//  3. fires each event in the browser (when the ERP's routing says `client`) and
//     queues the same event, with the SAME event id, for /api/events, which
//     forwards batches of up to twenty to the ERP; the ERP sends them again from
//     its server (Conversions API, Measurement Protocol) and Meta keeps one.
//
// Purchase is the ERP's own: it sends it when the order is placed (cash on
// delivery) or paid, as `purchase_<orderNo>`. The confirmation page fires the
// browser's pixel with that same id and never forwards it.

import { STANDARD_EVENTS, toGa4EventName } from "./constants";
import { SERVER_ONLY_EVENTS, MAX_EVENTS, MAX_BATCH_CHARS, gaClientIdFrom, gaSessionIdFrom } from "./forward";

const STD = new Set(STANDARD_EVENTS);
const FLUSH_MS = 1500;
let configPromise = null;
let initialized = false;

function getConfig() {
  if (!configPromise) {
    configPromise = fetch("/api/tracking/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((cfg) => (cfg?.enabled ? cfg : null))
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

// GA4 client_id from the _ga cookie, else a stable id of our own.
function gaClientId() {
  const fromCookie = gaClientIdFrom(getCookie("_ga"));
  if (fromCookie) return fromCookie;
  try {
    let cid = localStorage.getItem("eltrk_cid");
    if (!cid) {
      cid = `${Math.floor(Math.random() * 1e9)}.${Math.floor(Date.now() / 1000)}`;
      localStorage.setItem("eltrk_cid", cid);
    }
    return cid;
  } catch {
    return "";
  }
}

// GA4 session_id from the _ga_<CONTAINER> cookie.
function gaSessionId(measurementId) {
  if (!measurementId) return "";
  return gaSessionIdFrom(getCookie(`_ga_${measurementId.replace(/^G-/, "")}`));
}

const FB_COOKIE_DAYS = 90; // Meta's own lifetime for _fbp/_fbc.

function setCookie(name, value, days) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Guarantee _fbc (the ad click id) and _fbp (a stable browser id) exist as
 * first-party cookies, in Meta's documented format, before the pixel loads (it
 * adopts what it finds). Only called while tracking is on.
 */
function ensureClickIds() {
  if (typeof window === "undefined") return { fbp: "", fbc: "" };

  let fbc = getCookie("_fbc");
  if (!fbc) {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
      setCookie("_fbc", fbc, FB_COOKIE_DAYS);
    }
  }

  let fbp = getCookie("_fbp");
  if (!fbp) {
    fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 1e10)}`;
    setCookie("_fbp", fbp, FB_COOKIE_DAYS);
  }

  return { fbp, fbc: fbc || "" };
}

/** Meta's browser ids, only while the brand runs the Meta pixel (no Meta cookie for GA4 alone). */
function metaIds(cfg) {
  return cfg.meta?.pixelEnabled ? ensureClickIds() : { fbp: "", fbc: "" };
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
    // gtag sends to `${transport_url}/g/collect`, which nginx proxies to GA.
    transport_url: window.location.origin + transportPath,
    first_party_collection: true,
    // page_view is fired through trackEvent, with the shared event id.
    send_page_view: false,
  });
}

/** Load the proxied pixel/gtag once, when the ERP has them on. Safe to call repeatedly. */
export async function initTracking() {
  if (typeof window === "undefined" || initialized) return;
  initialized = true;
  const cfg = await getConfig();
  if (!cfg) return;
  if (cfg.meta?.pixelEnabled && cfg.meta.pixelId) {
    // Before anything can block or fail: capture the click id off the URL and
    // pin a browser id. The pixel injected next reuses both.
    ensureClickIds();
    injectMetaPixel(cfg.meta.pixelId, cfg.proxy.metaScriptPath);
  }
  if (cfg.ga4?.clientEnabled && cfg.ga4.measurementId) {
    injectGtag(cfg.ga4.measurementId, cfg.proxy.ga4ScriptPath, cfg.proxy.ga4CollectPath);
  }
  // The first PageView, through the unified path (shared event id).
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

// --- the queue to /api/events --------------------------------------------------------------------

const queue = [];
let flushTimer = null;
let listening = false;

function flush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  while (queue.length) {
    // Up to twenty events, and well under the 64 KiB a keepalive request may carry.
    const events = [];
    let size = 0;
    while (queue.length && events.length < MAX_EVENTS) {
      const next = JSON.stringify(queue[0]).length + 1;
      if (events.length && size + next > MAX_BATCH_CHARS) break;
      size += next;
      events.push(queue.shift());
    }
    try {
      // keepalive: the request survives a navigation or the tab closing.
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ events }),
      }).catch(() => {});
    } catch {
      /* never let tracking break the page */
    }
  }
}

function enqueue(event) {
  if (!listening && typeof window !== "undefined") {
    listening = true;
    // Send what is waiting when the page is hidden or left.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  }
  queue.push(event);
  if (queue.length >= MAX_EVENTS) flush();
  else if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

/**
 * Track an event: the pixel and gtag fire it in the browser, and the same event
 * (same event id) is queued for the ERP. Returns the event id, or null when
 * tracking is off or the ERP's routing has the event switched off.
 *
 * @param {string} eventName
 * @param {object} [opts]
 * @param {string} [opts.eventId]     a fixed id (Purchase: `purchase_<orderNo>`)
 * @param {object} [opts.customData]  value, currency, contents, order_id, ...
 * @param {object} [opts.userData]    email/phone/etc. if known in the browser
 * @param {object} [opts.ga4Params]   extra GA4 params
 */
export async function trackEvent(eventName, opts = {}) {
  const cfg = await getConfig();
  if (!cfg) return null;

  const route = (cfg.events || []).find((e) => e.name === eventName);
  if (route && !route.enabled) return null;
  const clientOn = route ? route.client : true;

  const eventId = opts.eventId || uuid();
  const customData = opts.customData || {};

  if (clientOn && cfg.meta?.pixelEnabled && window.fbq) {
    window.fbq(STD.has(eventName) ? "track" : "trackCustom", eventName, customData, { eventID: eventId });
  }
  if (clientOn && cfg.ga4?.clientEnabled && window.gtag) {
    window.gtag("event", toGa4EventName(eventName), {
      ...mapGtagParams(eventName, customData, eventId),
      ...(opts.ga4Params || {}),
    });
  }

  if (!SERVER_ONLY_EVENTS.has(eventName)) {
    try {
      const ids = metaIds(cfg);
      enqueue({
        eventName,
        eventId,
        eventTime: Math.floor(Date.now() / 1000),
        // The ERP takes an https page only; the server drops anything else.
        eventSourceUrl: window.location.href,
        actionSource: "website",
        userData: { ...(opts.userData || {}), fbp: ids.fbp || undefined, fbc: ids.fbc || undefined },
        customData,
        ga4: {
          clientId: gaClientId() || undefined,
          sessionId: gaSessionId(cfg.ga4?.measurementId) || undefined,
          params: opts.ga4Params,
        },
      });
    } catch {
      /* never let tracking break the page */
    }
  }

  return eventId;
}

/**
 * What only the browser knows about this purchase, sent with the checkout so the
 * ERP's own Purchase carries the browser ids (`tracking` on POST /checkout).
 * Nothing while tracking is off.
 */
export async function checkoutTracking() {
  // Never hold up an order for tracking: the config is normally read long before.
  const cfg = await Promise.race([getConfig(), new Promise((resolve) => setTimeout(() => resolve(null), 1500))]);
  if (!cfg) return undefined;
  const ids = metaIds(cfg);
  return {
    fbp: ids.fbp || undefined,
    fbc: ids.fbc || undefined,
    eventSourceUrl: window.location.href,
    gaClientId: gaClientId() || undefined,
    gaSessionId: gaSessionId(cfg.ga4?.measurementId) || undefined,
  };
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
