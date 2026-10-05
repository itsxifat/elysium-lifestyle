import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { E2E_MEASUREMENT_ID, adminSession, call, setTracking, trackingLog } from "./erp-console.mjs";

// What the ERP gained after the website was first converted, against the same
// local preview ERP as storefront.spec.mjs (e2e/erp-setup.mjs prepares it):
//   - M39b: a regular ("was") price struck through on the card, the product page
//     and in the bag; the shop's "On Sale" filter is the ERP's own; a product's
//     photos follow the colour a shopper picks;
//   - M35b: a campaign link (?cu=) shows its banner, pop-up and highlighted
//     product and counts one visit; tracking off loads nothing, tracking on loads
//     the proxied pixel and gtag, forwards browser events to the ERP's log under
//     the pixel's own event ids, and leaves Purchase to the ERP
//     (`purchase_<orderNo>`), with the browser ids sent at checkout.

test.describe.configure({ mode: "serial" });

const state = JSON.parse(readFileSync(new URL("./.state/erp.json", import.meta.url), "utf8"));

async function trackingEnabled(request) {
  const res = await request.get("/api/tracking/config", { headers: { "Cache-Control": "no-cache" } });
  return (await res.json()).enabled;
}

test.afterAll(async () => {
  // Leave the brand as the setup left it: tracking off.
  await adminSession();
  await setTracking(false);
});

test("a regular price is struck through on the card, the product page and in the bag", async ({ page }) => {
  await page.goto("/shop?category=shirts");
  const card = page.getByTestId("product-card").filter({ hasText: "Linen Casual Shirt" });
  await expect(card.getByTestId("price-now")).toHaveText("Tk 1,450");
  await expect(card.getByTestId("price-was")).toHaveText("Regular price Tk 1,800");
  await expect(card).toContainText("-19%");
  // A product without one has nothing struck through.
  await expect(page.getByTestId("product-card").filter({ hasText: "Two-Tone Oxford" }).getByTestId("price-was")).toHaveCount(0);

  await page.goto("/shop/linen-casual-shirt");
  const price = page.getByTestId("product-price");
  await expect(price).toContainText("Tk 1,450");
  await expect(price.getByTestId("price-was")).toHaveText("Regular price Tk 1,800");
  const size = page.getByRole("button", { name: /^M\s/ });
  await expect(size).toContainText("Tk 1,800");
  await size.click();
  await expect(price).toContainText("-19%");
  await expect(price.getByTestId("price-was")).toHaveText("Regular price Tk 1,800");
  await page.getByRole("button", { name: /Add to Bag/ }).click();
  await expect(page.getByText("Your Bag (1)")).toBeVisible();

  await page.goto("/cart");
  // The bag is priced by the ERP's quote: Tk 1,450 charged, Tk 1,800 struck through.
  await expect(page.getByRole("main").getByTestId("price-was")).toHaveText("Regular price Tk 1,800");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("Tk 1,450");
});

test("On Sale is the ERP's filter: a regular price or a live flash price", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("contentinfo").getByRole("link", { name: "On Sale" });
  await expect(link).toHaveAttribute("href", "/shop?onSale=true");
  await link.click();
  await expect(page).toHaveURL(/\/shop\?onSale=true$/);
  await expect(page.getByRole("heading", { name: "On Sale" })).toBeVisible();
  const cards = page.getByTestId("product-card");
  await expect(cards.filter({ hasText: "Linen Casual Shirt" })).toBeVisible();
  await expect(cards.filter({ hasText: "Slim Fit Denim" })).toBeVisible();
  await expect(cards.filter({ hasText: "Premium Polo Shirt" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "On Sale" }).first()).toBeChecked();
});

test("picking a colour switches the gallery to that colour's photos", async ({ page }) => {
  const { slug, photos } = state.coloured;
  await page.goto(`/shop/${slug}`);
  const main = page.getByTestId("gallery-main");
  await expect(page.getByRole("button", { name: /^Red/, pressed: true })).toBeVisible();
  await expect(main).toHaveAttribute("src", new RegExp(photos.red));
  // The colour's own photo, then the one for every colour; not the other colour's.
  await expect(page.getByRole("button", { name: "Two-Tone Oxford view 2" }).locator("img")).toHaveAttribute("src", new RegExp(photos.common));
  await expect(page.getByRole("button", { name: "Two-Tone Oxford view 3" })).toHaveCount(0);

  await page.getByRole("button", { name: /^Blue/ }).click();
  await expect(page.getByRole("button", { name: /^Blue/, pressed: true })).toBeVisible();
  await expect(main).toHaveAttribute("src", new RegExp(photos.blue));
  await expect(page.getByRole("button", { name: "Two-Tone Oxford view 2" }).locator("img")).toHaveAttribute("src", new RegExp(photos.common));
  // The sizes are the chosen colour's, named by size alone.
  await expect(page.getByRole("button", { name: /^M\s/ })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^L\s/ })).toHaveCount(1);
});

test("a campaign link shows its banner, pop-up and highlighted product, and counts one visit", async ({ page }) => {
  const { id, code, banner, modal } = state.campaign;
  await adminSession();
  const views = async () => (await call("GET", `/v1/storefront/campaign-links/${id}`)).body.link.views;
  const before = await views();

  await page.goto(`/shop?cu=${code}`);
  await expect(page.getByTestId("campaign-banner")).toHaveText(banner);
  const popup = page.getByRole("dialog", { name: modal });
  await expect(popup).toBeVisible();
  await expect(popup.getByText("Our Eid range is here.")).toBeVisible();
  await popup.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Featured" })).toBeVisible();
  await expect(page.getByTestId("product-card").filter({ hasText: "Premium Polo Shirt" }).first()).toBeVisible();
  await expect.poll(views, { timeout: 15_000 }).toBe(before + 1);

  // The same visit: the banner stays, the pop-up does not come back, no second count.
  await page.reload();
  await expect(page.getByTestId("campaign-banner")).toHaveText(banner);
  await expect(page.getByRole("dialog", { name: modal })).toHaveCount(0);
  await page.waitForTimeout(2_000);
  expect(await views()).toBe(before + 1);
});

test("tracking off in the ERP: no pixel, no gtag, no cookie, no events", async ({ page, request }) => {
  await expect.poll(() => trackingEnabled(request), { timeout: 60_000 }).toBe(false);
  const forwarded = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/events")) forwarded.push(r.url());
  });
  await page.goto("/shop/premium-polo-shirt");
  await expect(page.getByRole("heading", { name: "Premium Polo Shirt" })).toBeVisible();
  await page.waitForTimeout(2_500);
  await expect(page.locator('script[src^="/e1/"], script[src^="/e2/"]')).toHaveCount(0);
  expect(await page.evaluate(() => [typeof window.fbq, typeof window.gtag])).toEqual(["undefined", "undefined"]);
  expect(await page.evaluate(() => document.cookie)).not.toContain("_fbp");
  expect(forwarded).toHaveLength(0);
});

test("tracking on: the proxied pixel and gtag, events in the ERP's log under the pixel's ids, and Purchase left to the ERP", async ({ page, request }) => {
  await adminSession();
  expect(await setTracking(true)).toBe("fake");
  await expect.poll(() => trackingEnabled(request), { timeout: 60_000 }).toBe(true);

  const bodies = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/events")) bodies.push(r.postData() || "");
  });

  await page.goto("/shop/premium-polo-shirt");
  await expect(page.locator('script[src="/e1/s.js"]')).toHaveCount(1);
  await expect(page.locator(`script[src="/e2/s.js?id=${E2E_MEASUREMENT_ID}"]`)).toHaveCount(1);
  // The pixel's own call (its script is not served here, so its queue holds it).
  const viewContentId = await (
    await page.waitForFunction(() => {
      const call = (window.fbq?.queue || []).map((a) => Array.from(a)).find((a) => a[0] === "track" && a[1] === "ViewContent");
      return call?.[3]?.eventID || false;
    })
  ).jsonValue();

  // The same event, forwarded in a batch, is in the ERP's log under the same id,
  // with the browser id, the shopper's address and browser.
  await expect
    .poll(async () => (await trackingLog("ViewContent")).find((e) => e.eventId === viewContentId)?.source ?? null, { timeout: 30_000 })
    .toBe("client");
  const logged = (await trackingLog("ViewContent")).find((e) => e.eventId === viewContentId);
  expect(logged.matchKeys).toMatchObject({ fbp: true, ip: true, userAgent: true });

  // A cash-on-delivery order: the ERP sends Purchase as purchase_<orderNo>, the
  // browser's pixel fires with the same id, and the browser forwards none.
  await page.getByRole("button", { name: /^XL\s/ }).click();
  await page.getByRole("button", { name: /Add to Bag/ }).click();
  await expect(page.getByText(/Your Bag \(\d+\)/)).toBeVisible();
  await page.goto("/checkout");
  await page.getByLabel("Full Name *").fill("Tania Tracked");
  await page.getByLabel("Phone Number *").fill("01912345678");
  await page.getByLabel("District *").selectOption({ label: "Dhaka" });
  await page.getByLabel("Thana / Upazila *").selectOption({ label: "Savar" });
  await page.getByLabel("Street Address *").fill("House 9, Road 1");
  await expect(page.getByTestId("delivery-fee")).toHaveText("Tk 60");
  await page.getByRole("button", { name: /Place Order/ }).click();
  await expect(page.getByRole("heading", { name: "Order Placed Successfully!" })).toBeVisible();
  const orderNo = (await page.getByTestId("order-number").innerText()).trim();
  const purchaseId = `purchase_${orderNo}`;

  await page.waitForFunction(
    (id) => (window.fbq?.queue || []).some((a) => a[0] === "track" && a[1] === "Purchase" && a[3]?.eventID === id),
    purchaseId
  );
  expect(
    await page.evaluate(
      (id) => (window.dataLayer || []).some((a) => a[0] === "event" && a[1] === "purchase" && a[2]?.event_id === id),
      purchaseId
    )
  ).toBe(true);

  await expect
    .poll(async () => (await trackingLog("Purchase")).filter((e) => e.eventId === purchaseId).map((e) => e.source), { timeout: 30_000 })
    .toEqual(["server"]);
  const purchase = (await trackingLog("Purchase")).find((e) => e.eventId === purchaseId);
  // The checkout's `tracking` carried the browser id; `client` the shopper's address.
  expect(purchase.matchKeys).toMatchObject({ fbp: true, ip: true, phone: true });

  await page.waitForTimeout(2_000);
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.some((b) => b.includes('"Purchase"'))).toBe(false);
  for (const body of bodies) expect(JSON.parse(body).events.length).toBeLessThanOrEqual(20);
});
