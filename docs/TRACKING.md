# Tracking: the Meta pixel, Conversions API and GA4

Tracking is run by the brand ERP's **Website → Tracking** (M35b, D-552). The website has no
tracking settings, no secrets and no event log of its own: it loads the browser's pixel and
gtag from its own domain, fires events with an event id, and forwards the same events to the
ERP, which sends them again from its server under the same id. The ERP's API is described in
its repository's `docs/storefront-api.md` → Tracking.

```
browser ── fbq / gtag, loaded from /e1/s.js and /e2/s.js ─► nginx ─► connect.facebook.net,
   │        (hits to /e1/t and /e2/g/collect)                       googletagmanager.com, GA
   │  lib/tracking/client.js: the same event id for both
   └── POST /api/events (batches of 1–20) ─► this site's server ─► ERP POST /storefront/v1/events
                                                                     │ logged, then sent by its
checkout ─ POST /api/checkout { tracking } ─► ERP POST /checkout     │ worker: Conversions API,
                                               └─ Purchase, id       │ Measurement Protocol
                                                  purchase_<orderNo> ┘
```

## What the website does

- `GET /api/tracking/config` reads the ERP's `GET /storefront/v1/tracking/config` (cached 30
  seconds) and answers the browser: the pixel id, the GA4 measurement id, this site's proxy
  paths and which events fire in the browser. No secret is in it.
- **Off unless the ERP turns it on.** When the ERP has the pixel and gtag both off (or cannot
  be read), the browser loads no script, sets no cookie and sends no event.
- When on, `lib/tracking/client.js` writes Meta's `_fbp` (and `_fbc` from an ad's `fbclid`),
  loads the pixel from `metaScriptPath` and gtag from `ga4ScriptPath` with
  `transport_url = <site> + ga4CollectPath`, and fires PageView on every page,
  ViewContent on a product, AddToCart, InitiateCheckout and Search. An event the ERP's routing
  switches off is not fired; one marked browser-off is only forwarded.
- Each event is queued with its event id and sent to `/api/events` in batches of up to twenty
  (every 1.5 seconds, and when the page is hidden or left). The site's server reduces each one
  to the fields the ERP accepts (`lib/tracking/forward.js`: an https page only, known user
  fields, small custom data), adds the shopper's own address and browser as `client`, and
  forwards them. **Purchase is never forwarded**: it is the ERP's own.
- At checkout the browser's half of the Purchase goes with the order as `tracking` (`fbp`,
  `fbc`, the page, GA4's client and session ids). The ERP sends Purchase as
  `purchase_<orderNo>` when a cash-on-delivery order is placed, or when an online payment is
  booked; the confirmation page fires the browser's pixel and gtag with that same id (once per
  order in a browser, and only within a day of the order, so an emailed link opened later does
  not count it again), so Meta counts the order once and GA4 deduplicates on the transaction
  id.
- Meta's `_fbp`/`_fbc` cookies are written only while the Meta pixel is on (not for GA4 alone).
  A batch stays under 48 KB (the ERP and a keepalive request take 64 KiB).

## Switching it on (for the brand)

1. **nginx**: install the proxy paths once (they must exist before the pixel is switched on,
   or the browser loads nothing):

   ```sh
   sudo cp docs/nginx-tracking.conf /etc/nginx/snippets/elysium-tracking-proxy.conf
   # uncomment `include /etc/nginx/snippets/elysium-tracking-proxy.conf;` in the site file
   sudo nginx -t && sudo systemctl reload nginx
   curl -sI https://<site>/e1/s.js | head -1     # 200
   ```

   The file serves the ERP's default proxy paths: `/e1/s.js` (the pixel script), `/e1/t` (its
   hits), `/e2/s.js` (gtag) and `/e2` (gtag's `transport_url`; its hits arrive at
   `/e2/g/collect`). The website loads the scripts from the paths the ERP names, but the
   pixel's hit path is fixed by the file's `sub_filter` lines: if you change any path on
   Website → Tracking → proxy paths, change the file (locations and `sub_filter`) to match.

2. **The ERP** (org admin for the ids and secrets, marketing for the rest), Website →
   Tracking:
   - Meta: the pixel id, **Browser pixel** on; for the server side the Conversions API access
     token (Events Manager → Settings) and **Conversions API** on.
   - GA4: the measurement id (`G-…`), **gtag** on; for the server side the Measurement
     Protocol API secret and **Measurement Protocol** on.
   - Which events go where (browser, server, Meta, GA4), test mode and the test event code.
   - The ERP needs `STOREFRONT_CREDENTIALS_KEY` to keep the token and secret, and sends to Meta
     and Google only with `STOREFRONT_TRACKING_PROVIDER=live` **and**
     `STOREFRONT_TRACKING_ENABLED=true`; with the default `fake` provider it logs and sends
     nothing anywhere.

3. Within about a minute the website loads the pixel and gtag. The ERP's Website → Tracking log
   shows each event, its source (browser or server), its match keys (`fbp`, address, browser,
   …) and whether it was sent.

## Checking it

- Meta Events Manager → Test Events with the ERP's test mode and test event code: each browser
  event appears twice, browser and server, **deduplicated** (same event id).
- GA4 DebugView, or the Realtime report.
- Turning the pixel and gtag off in the ERP stops everything on the website within a minute.

## Limits

- The website forwards events only while the ERP has the pixel or gtag on: a brand that wants
  the Conversions API **without** a browser pixel gets no browser events forwarded, because the
  ERP's tracking config does not say whether the server side is on.
- A beacon proxied through nginx reaches Meta and Google from the server's address; the
  server-side copy carries the shopper's real address and browser, so match quality holds.
- The content security policy (`middleware.js`) is still report-only; the pixel and gtag load
  from this site's own origin, so nothing needs adding to it when it is enforced.
