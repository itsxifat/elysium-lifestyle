import { expect, test } from "@playwright/test";

import { adminSession, call } from "./erp-console.mjs";

// The website's journeys against a local preview brand ERP (M36 check 3, as
// changed on 2026-10-05): browse, search, a product page, add to bag, a cash on
// delivery checkout that becomes a website order holding its stock in the ERP,
// sign up with the emailed code, sign in, a forgotten password, the account's
// orders, an old product address, and /admin sent to the ERP.
//
// Emails are read from the local mail sink (e2e/mail-sink.mjs), which the ERP's
// worker sends to. Each run uses fresh shopper addresses.

test.describe.configure({ mode: "serial" });

const RUN = Date.now().toString(36);
const SINK = `http://127.0.0.1:${process.env.MAIL_SINK_HTTP_PORT || 2580}`;
const PRODUCT = "premium-polo-shirt";
const OLD_SLUG = "classic-cotton-tee";
const NEW_SLUG = "classic-cotton-crew-tee";

const shopper = {
  name: "Rahima Test",
  email: `rahima.${RUN}@example.test`,
  phone: "01712345678",
  password: `first-pass-${RUN}`,
  newPassword: `second-pass-${RUN}`,
};

/** The newest email to an address whose text matches, waiting for the ERP's worker. */
async function mailTo(request, address, pattern, { timeoutMs = 45_000 } = {}) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const res = await request.get(`${SINK}/messages?to=${encodeURIComponent(address)}`);
    const messages = await res.json();
    const found = messages.find((m) => pattern.test(m.text));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No email to ${address} matching ${pattern} within ${timeoutMs} ms`);
}

async function stockOf(request, slug, size) {
  const res = await request.get(`/api/products/${slug}`);
  expect(res.ok()).toBeTruthy();
  const { product } = await res.json();
  return product.variants.find((v) => v.size === size).stock;
}

async function addToBag(page, slug, size) {
  await page.goto(`/shop/${slug}`);
  await page.getByRole("button", { name: new RegExp(`^${size}\\s`) }).first().click();
  await page.getByRole("button", { name: /Add to Bag/ }).click();
  await expect(page.getByText(/Your Bag \(\d+\)/)).toBeVisible();
}

async function fillAddress(page) {
  await page.getByLabel("District *").selectOption({ label: "Dhaka" });
  await page.getByLabel("Thana / Upazila *").selectOption({ label: "Savar" });
  await page.getByLabel("Street Address *").fill("House 5, Road 3");
  await expect(page.getByTestId("delivery-fee")).toHaveText("Tk 60");
}

test("browse: the home page, the menu and the shop come from the ERP", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Free shipping over Tk 3,000 · Cash on delivery")).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Flash Sale" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Featured Collection" })).toBeVisible();
  await expect(page.getByTestId("product-card").first()).toBeVisible();

  await page.goto("/shop");
  await expect(page.getByText(/^\d+ products?$/)).toBeVisible();
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Polo Shirts" }).first().click();
  await expect(page).toHaveURL(/category=polo-shirts/);
  await expect(page.getByTestId("product-card").filter({ hasText: "Premium Polo Shirt" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Polo Shirts" })).toBeVisible();
});

test("search: the search box and the shop's search use the ERP's search", async ({ page }) => {
  await page.goto("/");
  await page.locator('button[aria-label="Search"]:visible').click();
  await page.getByPlaceholder("Search products…").first().fill("polo");
  await expect(page.getByRole("link", { name: /Premium Polo Shirt/ }).first()).toBeVisible();
  await page.getByPlaceholder("Search products…").first().press("Enter");
  await expect(page).toHaveURL(/\/shop\?search=polo/);
  await expect(page.getByTestId("product-card").filter({ hasText: "Premium Polo Shirt" })).toBeVisible();
});

test("product page: sizes with live availability, then into the bag", async ({ page }) => {
  await page.goto(`/shop/${PRODUCT}`);
  await expect(page.getByRole("heading", { name: "Premium Polo Shirt" })).toBeVisible();
  await expect(page.getByText("Tk 1,250").first()).toBeVisible();
  await page.getByRole("button", { name: /^M\s/ }).click();
  await expect(page.getByText(/In stock|Only \d+ left/)).toBeVisible();
  await page.getByRole("button", { name: /Add to Bag/ }).click();
  await expect(page.getByText("Your Bag (1)")).toBeVisible();
  await expect(page.getByText("Size: M").first()).toBeVisible();
});

test("an old product address answers with a permanent redirect to the new one", async ({ page, request }) => {
  const res = await request.get(`/shop/${OLD_SLUG}`, { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers().location).toMatch(new RegExp(`/shop/${NEW_SLUG}$`));
  await page.goto(`/shop/${OLD_SLUG}`);
  await expect(page).toHaveURL(new RegExp(`/shop/${NEW_SLUG}$`));
  await expect(page.getByRole("heading", { name: "Classic Cotton Tee" })).toBeVisible();
});

test("/admin and everything under it go to the ERP's console", async ({ request }) => {
  for (const path of ["/admin", "/admin/orders", "/admin/products/new"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toBe(`${process.env.ERP_ADMIN_URL || "http://localhost:5373"}/`);
  }
});

test("checkout, cash on delivery: a website order in the ERP, holding its stock", async ({ page, request }) => {
  const before = await stockOf(request, PRODUCT, "M");
  await addToBag(page, PRODUCT, "M");
  await page.goto("/cart");
  await expect(page.getByTestId("cart-subtotal")).toHaveText("Tk 1,250");
  await page.getByRole("main").getByRole("link", { name: "Checkout" }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await page.getByLabel("Full Name *").fill("Karim Guest");
  await page.getByLabel("Phone Number *").fill("01812345678");
  await page.getByLabel("Email Address").fill(`guest.${RUN}@example.test`);
  await fillAddress(page);
  await expect(page.getByTestId("quote-total")).toHaveText("Tk 1,310");
  await page.getByRole("button", { name: /Place Order/ }).click();

  await expect(page).toHaveURL(/\/order-confirmation\/[A-Z0-9-]+$/);
  await expect(page.getByRole("heading", { name: "Order Placed Successfully!" })).toBeVisible();
  const orderNo = (await page.getByTestId("order-number").innerText()).trim();
  await expect(page.getByTestId("order-total")).toHaveText("Tk 1,310");

  // The bag is empty, and the size's availability went down by the unit now held.
  await expect.poll(() => stockOf(request, PRODUCT, "M")).toBe(before - 1);

  // In the ERP: a website order, pending, with its stock held at a web location.
  await adminSession();
  const { body } = await call("GET", `/v1/orders?q=${encodeURIComponent(orderNo)}&limit=5`);
  const order = (body.items || body).find((o) => o.orderNo === orderNo);
  expect(order, `order ${orderNo} in the ERP`).toBeTruthy();
  expect(order.channel).toBe("website");
  expect(order.status).toBe("pending");
  const { body: detail } = await call("GET", `/v1/orders/${order.id}`);
  const view = detail.order || detail;
  expect(view.locationId).toBeTruthy();
  expect(view.amounts.codAmountPoisha).toBe("131000");

  // The order page is not open to another browser without the token.
  const stranger = await request.get(`/order-confirmation/${orderNo}`, { headers: { cookie: "" } });
  expect(stranger.status()).toBe(404);

  // The shop's "order placed" email carries the order's own link.
  const mail = await mailTo(request, `guest.${RUN}@example.test`, new RegExp(orderNo));
  expect(mail.text).toMatch(new RegExp(`/order-confirmation/${orderNo}\\?token=[A-Za-z0-9_-]{43}`));
});

test("sign up: the emailed code verifies the account", async ({ page, request }) => {
  await page.goto("/auth/register");
  await page.locator('input[name="name"]').fill(shopper.name);
  await page.locator('input[name="email"]').fill(shopper.email);
  await page.locator('input[name="phone"]').fill(shopper.phone);
  await page.locator('input[name="password"]').fill(shopper.password);
  await page.locator('input[name="confirmPassword"]').fill(shopper.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page).toHaveURL(/\/auth\/verify-email\?email=/);

  const mail = await mailTo(request, shopper.email, /\b\d{6}\b/);
  const code = mail.text.match(/\b(\d{6})\b/)[1];
  const boxes = page.locator('input[inputmode="numeric"]');
  for (let i = 0; i < 6; i += 1) await boxes.nth(i).fill(code[i]);
  await page.getByRole("button", { name: "Verify Email" }).click();
  await expect(page).toHaveURL(/\/auth\/login\?verified=1/);
  await expect(page.getByText("Email verified! You can now sign in.")).toBeVisible();
});

test("sign in, check out as the account, and find the order under the account", async ({ page }) => {
  await page.goto("/auth/login");
  await page.locator('input[name="email"]').fill(shopper.email);
  await page.locator('input[name="password"]').fill(shopper.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/account");
  await expect(page.getByLabel("Full Name")).toHaveValue(shopper.name);

  await addToBag(page, PRODUCT, "L");
  await page.goto("/checkout");
  await expect(page.getByLabel("Full Name *")).toHaveValue(shopper.name);
  await expect(page.getByLabel("Phone Number *")).toHaveValue(shopper.phone);
  await fillAddress(page);
  await page.getByRole("button", { name: /Place Order/ }).click();
  await expect(page.getByRole("heading", { name: "Order Placed Successfully!" })).toBeVisible();
  const orderNo = (await page.getByTestId("order-number").innerText()).trim();

  await page.goto("/account/orders");
  await expect(page.getByText(orderNo)).toBeVisible();
  await page.getByRole("link", { name: /View/ }).first().click();
  await expect(page.getByRole("heading", { name: orderNo })).toBeVisible();
  await expect(page.getByText("Premium Polo Shirt")).toBeVisible();
  await expect(page.getByText("Cash on Delivery", { exact: true })).toBeVisible();
});

test("forgot password: the emailed link sets a new one, and the old one stops working", async ({ page, request, browser }) => {
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto("/auth/forgot-password");
  await guest.locator('input[name="email"]').fill(shopper.email);
  await guest.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(guest.getByText(/sent a password reset link/)).toBeVisible();

  const mail = await mailTo(request, shopper.email, /reset-password\?token=/);
  const token = mail.text.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)[1];
  await guest.goto(`/auth/reset-password?token=${token}`);
  await guest.locator('input[name="password"]').fill(shopper.newPassword);
  await guest.locator('input[name="confirmPassword"]').fill(shopper.newPassword);
  await guest.getByRole("button", { name: "Set New Password" }).click();
  await expect(guest).toHaveURL(/\/auth\/login/);

  await guest.locator('input[name="email"]').fill(shopper.email);
  await guest.locator('input[name="password"]').fill(shopper.password);
  await guest.getByRole("button", { name: "Sign In" }).click();
  await expect(guest.getByText("Invalid email or password")).toBeVisible();

  await guest.locator('input[name="password"]').fill(shopper.newPassword);
  await guest.getByRole("button", { name: "Sign In" }).click();
  await expect(guest).toHaveURL(/\/$/);
  await guest.goto("/account/orders");
  await expect(guest.getByText(/My Orders · \d+/)).toBeVisible();
  await context.close();
  void page;
});

test("pictures are the ERP's public media, served through the image optimiser", async ({ page }) => {
  await page.goto("/shop");
  const picture = page.getByTestId("product-card").first().locator("img").first();
  await expect(picture).toHaveAttribute("src", /\/_next\/image\?url=.*%2Fmedia%2F/);
  await expect.poll(() => picture.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test("flash sale: the home teaser, the hub, the sale's page, the product's sale price and the quote", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Weekend Flash" })).toBeVisible();

  await page.goto("/flash-sale");
  await expect(page.getByRole("heading", { name: "Deals that won't wait" })).toBeVisible();
  await expect(page.getByText("Weekend Flash").first()).toBeVisible();

  await page.goto("/flash-sale/e2e-flash");
  await expect(page.getByRole("heading", { name: "Weekend Flash" })).toBeVisible();
  await expect(page.getByText("Slim Fit Denim").first()).toBeVisible();
  await expect(page.getByText("Tk 1,500").first()).toBeVisible();

  await page.goto("/shop/slim-fit-denim");
  await expect(page.getByRole("link", { name: /Weekend Flash/ })).toBeVisible();
  await page.getByRole("button", { name: /^M\s/ }).click();
  await expect(page.getByText("Tk 1,500").first()).toBeVisible();
  await expect(page.getByText("Tk 1,850").first()).toBeVisible();
  await page.getByRole("button", { name: /Add to Bag/ }).click();
  await page.goto("/cart");
  // The ERP's quote charges the flash price (the line is priced by the sale).
  await expect(page.getByRole("main").getByRole("link", { name: "Slim Fit Denim" })).toBeVisible();
  await expect(page.getByTestId("cart-subtotal")).toHaveText("Tk 1,500");
});

test("an unknown product is not found", async ({ page }) => {
  const res = await page.goto("/shop/no-such-product-anywhere");
  expect(res.status()).toBe(404);
});
