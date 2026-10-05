# Deploying the website at demo.elysium-lifestyle.bd

The converted website (M36) runs first at `https://demo.elysium-lifestyle.bd`, beside
Elysium's brand ERP at `https://erp.elysium-lifestyle.bd`, both on the brands server
(103.129.209.29, D-581). The live site on `elysium-lifestyle.bd` is not touched; the domains
change later (M37).

The website has **no database and no admin panel**. It is one Next.js process that calls the
ERP's signed storefront API from its own server. Staff work only in the ERP.

```
 shopper ──https──► Cloudflare ──► nginx (demo.elysium-lifestyle.bd)
                                     │  X-Real-IP = visitor
                                     ▼
                        website  127.0.0.1:3601   (docker, host network)
                                     │  signed /storefront/v1/* over loopback
                                     ▼
                        ERP API  127.0.0.1:3501   (Elysium's brand compose)
 staff ──https──► erp.elysium-lifestyle.bd (console, API, /media/ images)
```

## Why the website calls the ERP over loopback

`ERP_API_URL=http://127.0.0.1:3501`, not `https://erp.elysium-lifestyle.bd`:

- every page makes a few server-side reads; over loopback they skip TLS, Cloudflare and
  nginx, so a page is not two internet round trips slower;
- Cloudflare's bot rules, rate limits or an outage at the edge cannot stop the website from
  reading its own ERP;
- the request is authenticated by the HMAC signature either way (the secret never travels;
  only signatures do), and it never leaves the machine;
- the signed path reaches the API exactly as sent (no proxy in between to rewrite it).

Shoppers' **browsers** never call the ERP: product images are the ERP's public
`https://erp.elysium-lifestyle.bd/media/…` URLs, fetched by the website's image optimiser
(and, for a few thumbnails, by the browser), which is why `ERP_MEDIA_ORIGINS` is the public
host. SSLCommerz's IPN goes to the ERP's public host directly (the ERP sets it).

If the website ever runs on another machine, set `ERP_API_URL=https://erp.elysium-lifestyle.bd`
(nginx already passes `/storefront/` through unchanged) — nothing else changes.

## Before you start (once)

1. **DNS** (the owner, on Cloudflare): an `A` record `demo` → `103.129.209.29`, proxied.
2. **Elysium's ERP** is deployed and reachable at `https://erp.elysium-lifestyle.bd`, its
   API published on `127.0.0.1:3501` (`BRAND_API_PORT` in its `.env.brand`), with
   `BRAND_BEHIND_CLOUDFLARE=true` so `/etc/nginx/snippets/erp-cloudflare-realip.conf` exists.
3. In the **ERP console** (org admin or marketing, then org admin for the credentials):
   - **Website → Settings**: site name, contact details, WhatsApp, the announcement, the
     shipping rule, payment methods, the web stock locations, and **Site URL =
     `https://demo.elysium-lifestyle.bd`** — the ERP builds the links in its emails (order
     page, password reset) and the SSLCommerz return URLs from it.
   - **Website → Connection → Issue a key**, label "demo website". Copy the key id and the
     secret: the secret is shown once.
   - **Website → Email** (org admin): the shop's SMTP server, or shoppers get no sign-up
     codes or reset links. Needs `STOREFRONT_CREDENTIALS_KEY` in the ERP's environment.
   - **Website → Payments** (org admin, optional): SSLCommerz store id and password,
     sandbox or live. A sandbox store takes no money unless the ERP runs with
     `STOREFRONT_SSLCOMMERZ_ALLOW_SANDBOX=true` (never on a live server).
   - Products: upload them with pictures and stock (M38a) and switch **On the website** on
     for each; categories and the menu on Catalog setup and Website → Menu.
4. **Google sign-in** (optional): an OAuth client for the demo host, authorised redirect URI
   `https://demo.elysium-lifestyle.bd/api/auth/callback/google`. Without one the button is
   simply not shown.

## Deploy

As the deploy user on the server (`enfinito`), with Docker and nginx as for the ERP:

```sh
# 1. The code (the erp-storefront branch until it is merged).
sudo mkdir -p /srv/elysium-web && sudo chown "$USER" /srv/elysium-web
git clone --branch erp-storefront <repo-url> /srv/elysium-web
cd /srv/elysium-web

# 2. The environment, readable by root only. Fill it from .env.example.
sudo mkdir -p /etc/elysium-web
sudo install -m 600 /dev/null /etc/elysium-web/demo.env
sudoedit /etc/elysium-web/demo.env
#   ERP_API_URL=http://127.0.0.1:3501
#   ERP_SITE_KEY_ID=pk_…   ERP_SITE_SECRET=sk_…        (from Website → Connection)
#   ERP_ADMIN_URL=https://erp.elysium-lifestyle.bd
#   ERP_MEDIA_ORIGINS=https://erp.elysium-lifestyle.bd
#   NEXT_PUBLIC_SITE_URL=https://demo.elysium-lifestyle.bd
#   NEXTAUTH_URL=https://demo.elysium-lifestyle.bd
#   NEXTAUTH_SECRET=$(openssl rand -base64 48)
#   GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=           (optional)

# 3. Build and start (binds 127.0.0.1:3601 only; host network to reach the ERP's loopback).
sudo docker compose -f deploy/compose.demo.yml --env-file /etc/elysium-web/demo.env up -d --build

# 4. Is it up, and can it read the ERP with its key?
curl -s http://127.0.0.1:3601/api/health          # {"ok":true}
curl -s 'http://127.0.0.1:3601/api/health?erp=1'  # {"ok":true,"erp":"ok"}
```

`?erp=1` answering `"erp":"UNAUTHENTICATED"` means the key id or secret is wrong, the key was
revoked, or the server's clock is more than five minutes off. `ERP_UNREACHABLE` means the ERP
is not listening on `ERP_API_URL`.

```sh
# 5. nginx, once.
sudo cp deploy/nginx/demo.elysium-lifestyle.bd.conf /etc/nginx/sites-available/elysium-web-demo.conf
sudo ln -s /etc/nginx/sites-available/elysium-web-demo.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d demo.elysium-lifestyle.bd     # adds the 443 server and the redirect
```

With Cloudflare in front, set the zone's SSL mode to **Full (strict)** (certbot's certificate
is a real one).

## Check it

1. `https://demo.elysium-lifestyle.bd/` shows the ERP's menu, announcement and products.
2. `https://demo.elysium-lifestyle.bd/admin` lands on `https://erp.elysium-lifestyle.bd/`.
3. Register with a real inbox: the six-digit code arrives from the shop's address.
4. Place a cash-on-delivery order; it appears in the ERP's order desk as a **website** order,
   pending, its stock held. Cancel it there.
5. If SSLCommerz is on (sandbox): pay a small order with a sandbox card; the order page says
   paid, and the ERP shows the advance.

## Update, roll back, logs

```sh
cd /srv/elysium-web && git pull
sudo docker tag elysium-web:demo elysium-web:previous      # keep the running image
sudo docker compose -f deploy/compose.demo.yml --env-file /etc/elysium-web/demo.env up -d --build

# Roll back: run the previous image again.
sudo docker tag elysium-web:previous elysium-web:demo
sudo docker compose -f deploy/compose.demo.yml --env-file /etc/elysium-web/demo.env up -d --no-build

sudo docker compose -f deploy/compose.demo.yml --env-file /etc/elysium-web/demo.env logs -f --tail=200
```

nginx limits each visitor address on `/api/` (30 a second, bursts of 100) and on the sign-in,
sign-up, code and reset routes (60 a minute, bursts of 30), generous because mobile carriers put
many shoppers behind one address; the ERP counts each shopper too (D-534). A 429 from nginx in
the logs is that limit.

The logs never carry a shopper's email, phone, password or an order's view token: the ERP
client logs a method, a path without its query, and the ERP's error code.

**Rotating the website key:** issue a new key in the ERP, put it in `demo.env`, `up -d`, then
revoke the old key in the ERP.

## Campaign links

Made on the ERP's **Website → Campaign links** (a five-digit code). Share the link the console
shows (`https://demo.elysium-lifestyle.bd/shop?cu=48213`, or the category or path it opens
on): the page shows the link's banner and pop-up, the shop lists its highlighted products
first, and the ERP counts one visit per browser session (the count is in the console). Nothing
to set up on the website or in nginx.

## Tracking (the Meta pixel, Conversions API, GA4)

Off until the ERP switches it on: with the pixel and gtag off in Website → Tracking the site
loads no script and sends no event. To switch it on (details in
[`TRACKING.md`](TRACKING.md)):

1. nginx, once: the proxy paths the pixel and gtag load from.

   ```sh
   sudo cp /srv/elysium-web/docs/nginx-tracking.conf /etc/nginx/snippets/elysium-tracking-proxy.conf
   sudoedit /etc/nginx/sites-available/elysium-web-demo.conf   # uncomment the tracking include
   sudo nginx -t && sudo systemctl reload nginx
   curl -sI https://demo.elysium-lifestyle.bd/e1/s.js | head -1   # HTTP/2 200
   ```

2. The ERP, **Website → Tracking** (org admin): the Meta pixel id and **Browser pixel** on; the
   Conversions API access token and **Conversions API** on; for GA4 the measurement id and
   **gtag**, and the Measurement Protocol API secret if wanted. The proxy paths stay at their
   defaults (`/e1/s.js`, `/e1/t`, `/e2/s.js`, `/e2`), which the nginx file serves. Use test
   mode with Meta's test event code first.
3. The ERP's server must have `STOREFRONT_CREDENTIALS_KEY` (to keep the token) and, to really
   send, `STOREFRONT_TRACKING_PROVIDER=live` with `STOREFRONT_TRACKING_ENABLED=true` (D-552);
   with the default `fake` provider events are logged in Website → Tracking and sent nowhere.

The website needs no new environment for either: it reads both from the ERP with its key.

## Updating to the 2026-10-06 version

Regular prices, the "On Sale" filter, photos by colour, campaign links and tracking (README →
"Changes since the first deploy") need the ERP at M39b and M35b (integration-wave2, live on
`erp.elysium-lifestyle.bd`), no new environment and no nginx change (the tracking include is
optional, above). Update as under "Update, roll back, logs".

## Not part of this deploy

- The switch of `elysium-lifestyle.bd` to this site (M37).
- ncom.bd's connector: the nginx file has the `/api/ncom/` forward commented out.
- Landing pages: none on the new website (the owner's decision of 2026-10-05).
- The old site's demo mode (`@enfinito/demo-kit`, sandboxed Mongo databases) went with the
  database.
