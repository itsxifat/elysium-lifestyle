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
| `lib/storefront.js` | Reads the ERP for the pages: the shop (with the ERP's own `onSale` filter), the product page, flash sales, campaign links, the tracking config, the site frame (menu, announcement, contact, WhatsApp, shipping rule, payment methods), geography, a shopper's orders. |
| `lib/storefront-map.js` | The ERP's answers shaped for the components, as pure functions (unit-tested): cards and sizes show what a shopper pays **now** (`price`, a live flash price included) with the regular price struck through (`compareAt`, M39b); the product's photos by colour (`galleries`); campaign links; the tracking config. Money is the ERP's own `taka` figure for display; nothing the site adds up is ever charged. |
| `lib/cart.js`, `app/api/cart/*`, `app/api/checkout` | The cart is priced by the ERP's quote. "Place order" sends the quote's figures as `expected` with a fresh `Idempotency-Key` per press; `409 CART_REPRICED` shows the new figures, `409 OUT_OF_STOCK` heals the bag. The order holds its stock from that moment. |
| `lib/order-token.js` | A guest's order view token, kept per order in an HttpOnly cookie so the order page opens after the SSLCommerz round trip; email links carry their own token. |
| `lib/payment-return.js`, `app/api/payment/sslcommerz/*` | SSLCommerz: the ERP opens the payment page; the gateway's success/fail/cancel return is relayed to the ERP, which validates it. The site never marks anything paid. |
| `lib/auth.js` | next-auth for shoppers only: email and password are checked by the ERP; Google's ID token is verified by next-auth and its claims sent to the ERP. The session holds the ERP account id. |
| `lib/shopper.js` | The shopper's address (`X-Real-IP`, set by nginx) sent as `client` on account and checkout writes and with forwarded tracking events, so the ERP's limits count shoppers, not this server, and its server-side events carry the shopper's address and browser. |
| `middleware.js` | The per-request CSP (nonce; `img-src` includes `ERP_MEDIA_ORIGINS`) and the `/admin` → `ERP_ADMIN_URL` redirect. |
| `app/api/custom-url/[code]` (+ `/views`) | Campaign links (`?cu=<five digits>`, the ERP's Website → Campaign links): the banner, the pop-up and the highlighted products (`components/layout/CustomUrlExperience.js`, the shop), and one visit counted per browser session. |
| `app/api/tracking/config`, `app/api/events`, `lib/tracking/*` | Tracking run by the ERP's Website → Tracking: the browser loads the Meta pixel and gtag from this site's proxied paths only when the ERP has them on, fires events with an event id, and batches the same events (up to 20, never `Purchase`) to `/api/events`, which forwards them to the ERP with the shopper's address and browser. The checkout sends the browser ids as `tracking`; the confirmation page fires the browser's Purchase as `purchase_<orderNo>`, the id of the ERP's own server-side Purchase. See [`docs/TRACKING.md`](docs/TRACKING.md). |

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

Scripts: `npm run build`, `npm run lint`, `npm test` (the ERP client: signatures, the read cache, errors, retries; the answer mappers: prices, photos by colour, campaign links, the tracking config; the event forwarder), `npm run check:no-database`.

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

`e2e/erp-features.spec.mjs` covers what the ERP gained later (M39b, M35b): a regular price
struck through on the card, the product page and in the bag; the shop's "On Sale" filter;
picking a colour switches the photos; a campaign link's banner, pop-up and highlighted product,
and its visit counted once; tracking off loads nothing, tracking on (the ERP's `fake` provider)
loads the proxied pixel and gtag, puts the browser's events in the ERP's tracking log under the
pixel's own event ids, and leaves `Purchase` to the ERP (`purchase_<orderNo>`). The setup
script prepares all of it (a regular price, a two-colour product with a photo per colour, a
campaign link, tracking off); the ERP needs `STOREFRONT_CREDENTIALS_KEY` for the tracking log.

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
                         # pictures, a flash sale, a menu, a renamed product, a regular price,
                         # a two-colour product, a campaign link, tracking off) and writes
                         # .env.e2e.local with a fresh website key
ERP_MEDIA_ORIGINS=http://localhost:3000 npm run build
npm run e2e              # starts the built site on :3410 and the mail sink, one worker
```

`e2e:setup` refuses anything but a `localhost` ERP. It signs in as the preview's org admin and
sets up its two-step login the first time (the secret stays in `e2e/.state/`, gitignored).

## Changes since the first deploy (2026-10-06)

The website now uses what the ERP gained after it was converted (M39b, M35b):

- **Prices**: every card, the product page (per size and colour), the quick add, the search box
  and the bag show the ERP's price now with its regular price struck through (`compareAt`) and
  the saving; a flash sale keeps its zap, countdown and "only N left". The prices are the ERP's
  own: the site no longer works a flash price out from the sales list.
- **On Sale** (footer, shop filter) is the ERP's `onSale` filter: a regular price above the
  price, or a live flash price. The flash sales keep their own pages.
- **Photos by colour**: a product in more than one colour gets a colour picker; the gallery
  shows that colour's photos, then the photos for every colour (all photos when the colour has
  none of its own). The bag's line keeps the chosen colour's photo.
- **Campaign links** (`?cu=`): read from the ERP's real answer (the old guess is gone), one
  visit counted per browser session, the banner kept below the header, also on the home page.
- **Tracking**: wired to the ERP (above). Off unless the ERP switches the pixel or gtag on.
- The search box's thumbnails go through `next/image` (the last lint warning).

## Deploy

`Dockerfile` (standalone output), `deploy/compose.demo.yml` (127.0.0.1 only, host network),
`deploy/nginx/demo.elysium-lifestyle.bd.conf` and the step-by-step in
[`docs/deploy-demo.md`](docs/deploy-demo.md).

## The packing scanner

`scanner-app/` (Capacitor, Android) now talks to the ERP: its default server is
`https://erp.elysium-lifestyle.bd` and its routes are the ERP's `/v1/scanner/*` (M35b). See
[`docs/scanner-app.md`](docs/scanner-app.md).
