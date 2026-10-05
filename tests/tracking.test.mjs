// Unit tests for lib/tracking/forward.js: browser events reduced to exactly what
// the ERP's POST /storefront/v1/events accepts (its schema is strict: one bad
// field refuses the whole batch), never Purchase, at most twenty; the checkout's
// `tracking`; GA4's cookie formats.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_BATCH_CHARS,
  MAX_EVENTS,
  gaClientIdFrom,
  gaSessionIdFrom,
  httpsPage,
  purchaseTrackingOf,
  toErpEvent,
  toErpEvents,
} from "../lib/tracking/forward.js";

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const NOW_S = Math.floor(NOW / 1000);

const browserEvent = (patch = {}) => ({
  eventName: "AddToCart",
  eventId: "6b0f9c1e-1d2f-4f53-9d55-0d1c4f3b2a10",
  eventTime: NOW_S - 5,
  source: "client",
  eventSourceUrl: "https://demo.elysium-lifestyle.bd/shop/linen-casual-shirt?cu=48213#top",
  actionSource: "website",
  userData: { fbp: "fb.1.1.2", fbc: "", nickname: "x", email: 42 },
  customData: { currency: "BDT", value: 1450, content_ids: ["p1"] },
  ga4: { clientId: "123.456", sessionId: "789", params: { item_id: "LP-M", bad: { a: 1 }, "1x": "no" } },
  ...patch,
});

test("an event keeps only the fields the ERP accepts", () => {
  const event = toErpEvent(browserEvent(), { now: NOW });
  assert.deepEqual(event, {
    eventName: "AddToCart",
    eventId: "6b0f9c1e-1d2f-4f53-9d55-0d1c4f3b2a10",
    eventTime: NOW_S - 5,
    eventSourceUrl: "https://demo.elysium-lifestyle.bd/shop/linen-casual-shirt?cu=48213",
    actionSource: "website",
    userData: { fbp: "fb.1.1.2" },
    customData: { currency: "BDT", value: 1450, content_ids: ["p1"] },
    ga4: { clientId: "123.456", sessionId: "789", params: { item_id: "LP-M" } },
  });
});

test("Purchase is the ERP's own and is never forwarded", () => {
  assert.equal(toErpEvent(browserEvent({ eventName: "Purchase", eventId: "purchase_WEB-1" }), { now: NOW }), null);
});

test("a malformed name or id is refused or left out", () => {
  assert.equal(toErpEvent(browserEvent({ eventName: "add to cart" }), { now: NOW }), null);
  assert.equal(toErpEvent(browserEvent({ eventName: "" }), { now: NOW }), null);
  assert.equal(toErpEvent("AddToCart", { now: NOW }), null);
  const noId = toErpEvent(browserEvent({ eventId: "has space" }), { now: NOW });
  assert.equal(noId.eventId, undefined);
});

test("a wrong browser clock (ahead, or a week behind) gives way to the ERP's", () => {
  assert.equal(toErpEvent(browserEvent({ eventTime: NOW_S + 600 }), { now: NOW }).eventTime, NOW_S);
  assert.equal(toErpEvent(browserEvent({ eventTime: NOW_S - 8 * 86400 }), { now: NOW }).eventTime, undefined);
  assert.equal(toErpEvent(browserEvent({ eventTime: "soon" }), { now: NOW }).eventTime, undefined);
});

test("only https pages under 500 characters are sent", () => {
  assert.equal(httpsPage("http://localhost:3410/shop"), undefined);
  assert.equal(httpsPage("https://user:pw@site.test/"), undefined);
  assert.equal(httpsPage("https://site.test/a b"), undefined);
  assert.equal(httpsPage("javascript:alert(1)"), undefined);
  const long = `https://site.test/shop?search=${"x".repeat(600)}`;
  assert.equal(httpsPage(long), "https://site.test/shop");
  assert.equal(httpsPage(`https://site.test/${"y".repeat(600)}`), undefined);
  assert.equal(toErpEvent(browserEvent({ eventSourceUrl: "http://localhost/x" }), { now: NOW }).eventSourceUrl, undefined);
});

test("user data: known keys, short strings only", () => {
  const event = toErpEvent(browserEvent({ userData: { email: "a@b.test", phone: "x".repeat(201), city: "Dhaka", fbc: "fb.1.2.3" } }), { now: NOW });
  assert.deepEqual(event.userData, { email: "a@b.test", city: "Dhaka", fbc: "fb.1.2.3" });
});

test("custom data must be a small plain object", () => {
  assert.equal(toErpEvent(browserEvent({ customData: [1, 2] }), { now: NOW }).customData, undefined);
  assert.equal(toErpEvent(browserEvent({ customData: { blob: "z".repeat(3000) } }), { now: NOW }).customData, undefined);
  assert.equal(toErpEvent(browserEvent({ customData: {} }), { now: NOW }).customData, undefined);
});

test("a batch: the browser's { events }, an array or one event; at most twenty", () => {
  const many = Array.from({ length: 30 }, (_, i) => browserEvent({ eventId: `id_${i}` }));
  assert.equal(toErpEvents({ events: many }, { now: NOW }).length, MAX_EVENTS);
  assert.equal(toErpEvents(many.slice(0, 3), { now: NOW }).length, 3);
  assert.equal(toErpEvents(browserEvent(), { now: NOW }).length, 1);
  assert.deepEqual(toErpEvents(null), []);
  const mixed = toErpEvents({ events: [browserEvent(), browserEvent({ eventName: "Purchase" }), { nope: true }] }, { now: NOW });
  assert.deepEqual(mixed.map((e) => e.eventName), ["AddToCart"]);
});

test("a batch stays under the ERP's 64 KiB body limit", () => {
  const big = Array.from({ length: 20 }, (_, i) =>
    browserEvent({ eventId: `big_${i}`, customData: { note: "n".repeat(2400) }, userData: { email: `${"e".repeat(190)}@x.test` } })
  );
  const events = toErpEvents({ events: big }, { now: NOW });
  assert.ok(events.length > 0 && events.length < 20);
  assert.ok(JSON.stringify({ events }).length <= MAX_BATCH_CHARS + 100);
});

test("the checkout's tracking: the browser ids and an https page", () => {
  assert.deepEqual(
    purchaseTrackingOf({ fbp: "fb.1.1.2", fbc: "", eventSourceUrl: "https://demo.elysium-lifestyle.bd/checkout", gaClientId: "1.2", gaSessionId: "3", extra: "x" }),
    { fbp: "fb.1.1.2", eventSourceUrl: "https://demo.elysium-lifestyle.bd/checkout", gaClientId: "1.2", gaSessionId: "3" }
  );
  assert.equal(purchaseTrackingOf({ eventSourceUrl: "http://localhost/checkout" }), undefined);
  assert.equal(purchaseTrackingOf(undefined), undefined);
});

test("GA4's cookies: the client id and both session id formats", () => {
  assert.equal(gaClientIdFrom("GA1.1.1234567890.1700000000"), "1234567890.1700000000");
  assert.equal(gaClientIdFrom("GA1.2.99.88"), "99.88");
  assert.equal(gaClientIdFrom("garbage"), "");
  assert.equal(gaSessionIdFrom("GS1.1.1700000000.3.1.1700000100.0.0.0"), "1700000000");
  assert.equal(gaSessionIdFrom("GS2.1.s1700000000$o3$g1$t1700000100$j0$l0$h0"), "1700000000");
  assert.equal(gaSessionIdFrom(""), "");
});
