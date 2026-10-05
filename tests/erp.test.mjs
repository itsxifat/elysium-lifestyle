// Unit tests for lib/erp.js: the request signature (docs/storefront-api.md in
// the ERP repo), the read cache's respect for ETag / Cache-Control, the typed
// errors, and idempotent retries. Run: `npm test` (node --test with the
// react-server condition, so `server-only` resolves as it does in Next).

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";

import { ErpError, erpGet, erpPath, erpPost, forgetReads, signRequest } from "../lib/erp.js";

const SECRET = "sk_test_secret";
const realFetch = globalThis.fetch;
let calls;

function answer(status, body, headers = {}) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function respondWith(...responses) {
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(url, init) : next;
  };
}

beforeEach(() => {
  process.env.ERP_API_URL = "http://erp.test";
  process.env.ERP_SITE_KEY_ID = "pk_test";
  process.env.ERP_SITE_SECRET = SECRET;
  forgetReads();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a GET is signed over timestamp.GET.path?query exactly as sent", async () => {
  respondWith(answer(200, { ok: true }, { "cache-control": "no-store" }));
  const path = erpPath("/catalog/products", { category: "menswear", sort: "newest" });
  assert.equal(path, "/storefront/v1/catalog/products?category=menswear&sort=newest");
  await erpGet(path);
  const { url, init } = calls[0];
  assert.equal(url, `http://erp.test${path}`);
  const ts = init.headers["X-Api-Timestamp"];
  assert.match(ts, /^\d+$/);
  const expected = createHmac("sha256", SECRET).update(`${ts}.GET.${path}`).digest("hex");
  assert.equal(init.headers["X-Api-Signature"], `sha256=${expected}`);
  assert.equal(init.headers["X-Api-Key"], "pk_test");
});

test("a POST signs the idempotency key and the exact body bytes it sends", async () => {
  respondWith(answer(201, { order: { orderNo: "WEB-1" } }));
  const body = { lines: [{ skuId: "a", qty: 2 }], note: "বাংলা" };
  await erpPost("/storefront/v1/checkout", body, { idempotencyKey: "key-12345678" });
  const { init } = calls[0];
  assert.equal(init.body, JSON.stringify(body));
  assert.equal(init.headers["Idempotency-Key"], "key-12345678");
  const ts = init.headers["X-Api-Timestamp"];
  const expected = createHmac("sha256", SECRET)
    .update(`${ts}.POST./storefront/v1/checkout.key-12345678.${init.body}`)
    .digest("hex");
  assert.equal(init.headers["X-Api-Signature"], `sha256=${expected}`);
});

test("a write without a key signs an empty key between the dots", () => {
  const headers = signRequest({ method: "PATCH", pathAndQuery: "/storefront/v1/accounts/x", rawBody: "{}", keyId: "k", secret: SECRET, now: 1_780_000_000_000 });
  const expected = createHmac("sha256", SECRET).update("1780000000.PATCH./storefront/v1/accounts/x..{}").digest("hex");
  assert.equal(headers["X-Api-Signature"], `sha256=${expected}`);
});

test("reads are cached for max-age, then revalidated with If-None-Match", async () => {
  respondWith(
    answer(200, { n: 1 }, { "cache-control": "private, max-age=0, stale-while-revalidate=300", etag: '"v1"' }),
  );
  // max-age=0: nothing kept.
  await erpGet("/storefront/v1/site");
  respondWith(answer(200, { n: 1 }, { "cache-control": "private, max-age=30, stale-while-revalidate=300", etag: '"v1"' }));
  const first = await erpGet("/storefront/v1/site");
  const again = await erpGet("/storefront/v1/site");
  assert.deepEqual(first, { n: 1 });
  assert.deepEqual(again, { n: 1 });
  assert.equal(calls.length, 1, "the second read came from the cache");
});

test("a stale copy is revalidated: 304 keeps the body", async () => {
  const realNow = Date.now;
  try {
    respondWith(answer(200, { n: 1 }, { "cache-control": "private, max-age=30, stale-while-revalidate=300", etag: '"v1"' }));
    await erpGet("/storefront/v1/catalog/categories");
    Date.now = () => realNow() + 31_000;
    respondWith(answer(304, null, { "cache-control": "private, max-age=30, stale-while-revalidate=300" }));
    const body = await erpGet("/storefront/v1/catalog/categories");
    assert.deepEqual(body, { n: 1 });
    assert.equal(calls[0].init.headers["If-None-Match"], '"v1"');
  } finally {
    Date.now = realNow;
  }
});

test("when the ERP is down, a copy inside stale-while-revalidate is served", async () => {
  const realNow = Date.now;
  try {
    respondWith(answer(200, { n: 7 }, { "cache-control": "private, max-age=30, stale-while-revalidate=300", etag: '"v7"' }));
    await erpGet("/storefront/v1/geo/districts");
    Date.now = () => realNow() + 60_000;
    respondWith(new TypeError("fetch failed"));
    assert.deepEqual(await erpGet("/storefront/v1/geo/districts"), { n: 7 });
    Date.now = () => realNow() + 400_000;
    respondWith(new TypeError("fetch failed"));
    await assert.rejects(erpGet("/storefront/v1/geo/districts"), (error) => error instanceof ErpError && error.code === "ERP_UNREACHABLE");
  } finally {
    Date.now = realNow;
  }
});

test("personal answers are never cached, whatever the headers say", async () => {
  respondWith(
    answer(200, { account: { id: "a" } }, { "cache-control": "private, max-age=30" }),
    answer(200, { account: { id: "a" } }, { "cache-control": "private, max-age=30" }),
  );
  await erpGet("/storefront/v1/accounts/a");
  await erpGet("/storefront/v1/accounts/a");
  assert.equal(calls.length, 2);
});

test("problem+json becomes an ErpError carrying the code and the extra members", async () => {
  respondWith(
    answer(409, { type: "x", title: "Conflict", status: 409, code: "CART_REPRICED", detail: "moved", quote: { total: { poisha: "1" } } }),
  );
  await assert.rejects(
    erpPost("/storefront/v1/checkout", {}, { idempotencyKey: "key-12345678" }),
    (error) => error instanceof ErpError && error.status === 409 && error.code === "CART_REPRICED" && error.problem.quote.total.poisha === "1",
  );
  assert.equal(calls.length, 1, "a refusal is not retried");
});

test("an idempotent write is retried with the same key after a dropped connection", async () => {
  respondWith(new TypeError("socket hang up"), answer(201, { order: { orderNo: "WEB-2" } }, { "idempotency-replayed": "true" }));
  const result = await erpPost("/storefront/v1/checkout", { a: 1 }, { idempotencyKey: "key-abcdefgh" });
  assert.equal(result.body.order.orderNo, "WEB-2");
  assert.equal(result.replayed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers["Idempotency-Key"], "key-abcdefgh");
});

test("a write without a key is sent once", async () => {
  respondWith(new TypeError("socket hang up"));
  await assert.rejects(erpPost("/storefront/v1/accounts/register", { a: 1 }), (error) => error.code === "ERP_UNREACHABLE");
  assert.equal(calls.length, 1);
});

test("ERP_API_URL must be an origin", async () => {
  process.env.ERP_API_URL = "http://erp.test/api";
  await assert.rejects(erpGet("/storefront/v1/site"), (error) => error.code === "ERP_NOT_CONFIGURED");
});
