# Elysium Lifestyle — the website

The shop at `elysium-lifestyle.bd` (first at `demo.elysium-lifestyle.bd`), as a **headless
storefront**: Next.js 14 with no database and no admin panel. Products, stock, prices, flash
sales, discounts, orders, customers, shopper accounts, emails, payments and the website's look
all live in **Elysium's brand ERP**; this site's server reads and writes them through the ERP's
signed storefront API. Staff never sign in here: `/admin` sends them to the ERP's console.

```
browser ──► this site (pages + /api routes, Next.js server) ──signed──► ERP /storefront/v1/*
                    │                                                    (catalog, site, geo,
                    └── next-auth (shopper session cookie only)           cart quote, checkout,
                                                                          accounts, orders,
browser ──► ERP /media/<org>/<file>/<size>  (public product pictures)    SSLCommerz, flash sales)
```

The API is described in the ERP repository's `docs/storefront-api.md`.

## How it is put together

| Where | What |
| --- | --- |
| `lib/erp.js` | **The only way to the ERP.** Server-only (`import "server-only"`). Signs every request with the website key (`X-Api-Key`, `X-Api-Timestamp`, `X-Api-Signature`: HMAC-SHA256 over `ts.GET.path?query`, or `ts.METHOD.path.idempotencyKey.rawBody` for writes), keeps GET answers in a short in-process cache that follows the ERP's `ETag` / `Cache-Control` (fresh 30 s, stale-while-revalidate when the ERP is down), turns problem+json into `ErpError` with the ERP's `code`, and retries an idempotent checkout with the same key. |
| `lib/storefront.js` | The ERP's answers shaped for the existing components: cards, product page (sizes with live stock, size chart, related, old-address redirects), flash sales (live prices overlaid on cards and sizes), the site frame (menu, announcement, contact, WhatsApp, shipping rule, payment methods), geography, a shopper's orders. Money is the ERP's own `taka` figure for display; nothing the site adds up is ever charged. |
| `lib/cart.js`, `app/api/cart/*`, `app/api/checkout` | The cart is priced by the ERP's quote. "Place order" sends the quote's figures as `expected` with a fresh `Idempotency-Key` per press; `409 CART_REPRICED` shows the new figures, `409 OUT_OF_STOCK` heals the bag. The order holds its stock from that moment. |
| `lib/order-token.js` | A guest's order view token, kept per order in an HttpOnly cookie so the order page opens after the SSLCommerz round trip; email links carry their own token. |
| `lib/payment-return.js`, `app/api/payment/sslcommerz/*` | SSLCommerz: the ERP opens the payment page; the gateway's success/fail/cancel return is relayed to the ERP, which validates it. The site never marks anything paid. |
| `lib/auth.js` | next-auth for shoppers only: email and password are checked by the ERP; Google's ID token is verified by next-auth and its claims sent to the ERP. The session holds the ERP account id. |
| `lib/shopper.js` | The shopper's address (`X-Real-IP`, set by nginx) sent as `client` on account and checkout writes, so the ERP's limits count shoppers, not this server. |
| `middleware.js` | The per-request CSP (nonce; `img-src` includes `ERP_MEDIA_ORIGINS`) and the `/admin` → `ERP_ADMIN_URL` redirect. |
| `app/api/custom-url`, `app/api/tracking/config`, `app/api/events` | Campaign links (`?cu=`) and tracking, calling the ERP routes M35b adds; until then they answer "none" and drop events quietly. |

Removed with the database: the admin panel and its API, every Mongo model, `mongoose`, the
demo mode (`@enfinito/demo-kit`, which sandboxed Mongo databases), Cloudinary and the CDN
upload/image proxy, the ncom.bd connector routes and webhook, the Steadfast webhook and
courier sync, the fraud check, the scanner endpoints, and the landing pages (`/lp/*`; the
owner decided the new website has none). `npm run check:no-database` fails if any of it
comes back.

## Environment

See `.env.example`. In short: `ERP_API_URL`, `ERP_SITE_KEY_ID`, `ERP_SITE_SECRET` (a website
key from the ERP's **Website → Connection**), `ERP_ADMIN_URL`, `ERP_MEDIA_ORIGINS` (build
time), `NEXT_PUBLIC_SITE_URL` (build time), `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and optionally
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. The old `MONGODB_URI`, `CDN_*`, `SSLCOMMERZ_*`,
`NCOM_*` and `FRAUDJS_SECRET` are no longer read.

## Develop

You need a brand ERP to talk to. Locally, the ERP repository's preview is the easiest:

```sh
# in the ERP repo
pnpm preview:local --brand elysium-lifestyle-bd     # API on :3000, console on :5173
```

Then issue a website key in its console (**Website → Connection**), or run this repo's setup
script (below), and:

```sh
npm install
cp .env.example .env.local        # ERP_API_URL=http://localhost:3000, the key, ERP_MEDIA_ORIGINS=http://localhost:3000
npm run dev                       # http://localhost:3000 — use -p 3100 if the ERP holds 3000
```

Scripts: `npm run build`, `npm run lint`, `npm test` (the ERP client: signatures, the read cache, errors, retries), `npm run check:no-database`.

## End-to-end tests

`e2e/storefront.spec.mjs` runs the shopper's journeys in a real browser against a local
**preview** ERP: browse, the menu, the shop's filter, search, a product page, add to bag,
pictures from the ERP's `/media/`, a flash sale (home teaser, hub, sale page, sale price in
the quote), a cash-on-delivery checkout that becomes a **website** order holding its stock in
the ERP (checked through the ERP's console API), sign up with the emailed code, sign in,
checkout as the account and its order history, forgot and reset password, the emailed order
link opened on another device (the token moves into a cookie, the address bar stays clean), an
SSLCommerz return the ERP refuses, sign-in refusing to send anyone off the site, an old product
address redirecting, and `/admin` going to the ERP.

The ERP sends email only over TLS, so the run brings a small SMTP sink (`e2e/mail-sink.mjs`)
with a self-signed certificate the ERP's worker is told to trust:

```sh
npm run e2e:cert                                   # once: e2e/.mail-sink/cert.pem

# in the ERP repo (any free ports; a database name starting with elysium_preview)
NODE_EXTRA_CA_CERTS=<this repo>/e2e/.mail-sink/cert.pem \
STOREFRONT_CREDENTIALS_KEY=$(openssl rand -base64 32) \
pnpm preview:local --brand elysium-lifestyle-bd

# here
export ERP_CONSOLE_API=http://localhost:3000 ERP_CONSOLE_ORIGIN=http://localhost:5173
export ERP_PREVIEW_CREDENTIALS=<ERP repo>/preview-credentials.local.md
npm run e2e:setup        # prepares the ERP (settings, email → sink, products on the website,
                         # pictures, a flash sale, a menu, a renamed product) and writes
                         # .env.e2e.local with a fresh website key
ERP_MEDIA_ORIGINS=http://localhost:3000 npm run build
npm run e2e              # starts the built site on :3410 and the mail sink, one worker
```

`e2e:setup` refuses anything but a `localhost` ERP. It signs in as the preview's org admin and
sets up its two-step login the first time (the secret stays in `e2e/.state/`, gitignored).

## Deploy

`Dockerfile` (standalone output), `deploy/compose.demo.yml` (127.0.0.1 only, host network),
`deploy/nginx/demo.elysium-lifestyle.bd.conf` and the step-by-step in
[`docs/deploy-demo.md`](docs/deploy-demo.md).

## The packing scanner

`scanner-app/` (Capacitor, Android) now talks to the ERP: its default server is
`https://erp.elysium-lifestyle.bd` and its routes are the ERP's `/v1/scanner/*` (M35b). See
[`docs/scanner-app.md`](docs/scanner-app.md).
