# First-Party Server-Side Tracking

Unblockable, first-party event tracking to **Meta Conversions API** and **GA4
Measurement Protocol**, with a browser pixel/gtag layer for deduplicated
client+server coverage. All config and logs live in MongoDB and are managed at
**`/admin/tracking`** — no env files, no GTM, no third-party services.

## Architecture

```
Browser  ──fbq/gtag (proxied via Nginx) ─────────────►  Meta /tr , GA /g/collect
   │  lib/tracking/client.js  (same event_id)
   └──POST /api/events ──► dispatchEvent() ─┬─► Meta CAPI (graph.facebook.com)
                                            └─► GA4 MP   (google-analytics.com/mp)
Server (order success, etc.)
   └── trackServerEvent() ──► dispatchEvent() ──► (same two APIs)  ← unblockable
                                            └─► TrackingEvent log (Mongo) → admin
```

- **Dedup:** browser and server send the **same `event_id`**; Meta merges them.
- **Match data:** PII (email, phone, name, city…) is SHA-256 hashed per Meta
  spec before sending; `fbp`/`fbc`/IP/UA are passed through. See
  [lib/tracking/hash.js](lib/tracking/hash.js).
- **Resilience:** one platform failing never blocks the other; failed sends are
  logged and **retried** (auto once, plus a manual retry button in the admin).

## 1. Turn it on (admin)

1. Go to **`/admin/tracking` → Configuration**.
2. Meta: paste **Pixel ID** + **CAPI access token** (Events Manager → Settings →
   Conversions API). Toggle **Browser Pixel** and **Conversions API** on.
3. GA4: paste **Measurement ID** (`G-…`) + **API Secret** (Admin → Data Streams
   → Measurement Protocol API secrets). Toggle **gtag.js** and **Measurement
   Protocol** on.
4. Set per-event routing in the matrix (e.g. AddToCart client-only).
5. **Save.** Changes take effect within ~30 s (config is cached briefly).

Secrets are stored in Mongo and shown masked (`••••••••`); re-saving without
changing them keeps the stored value.

## 2. Server events (the unblockable signal)

Purchase is **already wired** into both completion paths:

- COD — [app/api/orders/route.js](app/api/orders/route.js)
- SSLCommerz — [app/api/payment/sslcommerz/success/route.js](app/api/payment/sslcommerz/success/route.js)

Both call `trackPurchaseFromOrder(order, { request })`. The `request` lets it
read the real client IP/UA from the Nginx `X-Forwarded-For` chain.

Fire any other event from the backend:

```js
import { trackServerEvent } from "@/lib/tracking/server";

await trackServerEvent("CompleteRegistration", {
  request,                         // to capture real IP + UA
  userData: { email, phone, firstName, lastName, city, country: "BD" },
  customData: { value: 0, currency: "BDT" },
  eventId,                         // optional: pass the browser's id to dedup
});
```

It never throws — a tracking failure can't break your handler.

## 3. Client events

The store layout mounts [TrackingBootstrap](components/tracking/TrackingBootstrap.js),
which loads the proxied pixel/gtag and fires **PageView** on every route change.
Fire the rest from your components:

```js
import { track } from "@/lib/tracking/client";

// product page
track.viewContent({ customData: { value: price, currency: "BDT",
  content_ids: [productId], content_type: "product", content_name: name } });

// add to cart
track.addToCart({ customData: { value: price, currency: "BDT",
  content_ids: [productId], contents: [{ id: productId, quantity: 1, item_price: price }] } });

// checkout start
track.initiateCheckout({ customData: { value: subtotal, currency: "BDT", num_items } });

// search
track.search({ customData: { search_string: query } });

// arbitrary custom event
track.custom("NewsletterSignup", { customData: { source: "footer" } });
```

Each call fires the pixel + gtag **and** POSTs to `/api/events` with a shared
`event_id`. Purchase on the confirmation page is handled by
[PurchaseTracker](components/tracking/PurchaseTracker.js) using
`purchase_<orderId>` so it dedups with the server Purchase.

## 4. Nginx (full unblockability)

Add [docs/nginx-tracking.conf](docs/nginx-tracking.conf) inside your `server {}`
block, then `sudo nginx -t && sudo systemctl reload nginx`. It serves:

| First-party path | Proxies |
|---|---|
| `/e1/s.js` | Meta `fbevents.js` (hostnames rewritten to first-party) |
| `/e1/t` | Meta event beacon `facebook.com/tr` |
| `/e2/s.js` | GA4 `gtag.js` |
| `/e2/g/collect` | GA4 `google-analytics.com/g/collect` |

These paths match `TrackingConfig.proxy` defaults; rename both together. The
client loads scripts from these paths automatically (it reads the paths from
`/api/tracking/config`). GA4 uses gtag's official `transport_url` override;
Meta uses Nginx `sub_filter` to rewrite the hardcoded hostnames.

## 5. Admin panel (`/admin/tracking`)

- **Dashboard** — volume (client vs server), match-quality coverage (EMQ
  inputs), per-platform success/latency, Today/7d/30d cards.
- **Live Events** — filterable table (event, platform, status, source, search),
  expandable rows with the exact request/response JSON per platform, a **Dedup**
  view (confirms browser+server `event_id` pairs), an **Errors** view with a
  **Retry** button.
- **Configuration** — all toggles/credentials, per-event routing, proxy paths,
  retention, and a **Fire test event** tool.

## 6. End-to-end testing

### Meta Test Events
1. Events Manager → your pixel → **Test Events**, copy the `TEST…` code.
2. Admin → Configuration → paste **Test Event Code**, toggle **Test Mode** on,
   Save.
3. Click **Fire test event** (or do a real action on the site). The event
   appears in Meta Test Events within seconds; the admin shows the exact CAPI
   request/response.
4. Browse the site with Test Mode on — pixel + CAPI events should show **once
   each, deduplicated** (same `event_id`) in Test Events, and as **Deduped ✓**
   in the admin Dedup view.
5. Turn **Test Mode off** for production.

### GA4 DebugView
1. With **Test Mode on**, server events use GA4's `/debug/mp/collect`; the admin
   test tool surfaces `validationMessages` (empty array = valid).
2. GA4 → Admin → **DebugView**. Fire events; they appear in real time.
3. For the browser side, the GA Debugger extension or `?gtm_debug=x` forces
   debug. Confirm `purchase`, `add_to_cart`, etc. arrive with `value`/`items`.
4. Realtime report (Reports → Realtime) confirms production traffic once live.

## Notes & limitations

- **GA4 MP IP/geo:** GA4 does not support overriding the client IP over MP — geo
  on server events reflects the server's region. We set the request `User-Agent`
  to the client UA (device is correct) and pass the IP as a param for your logs.
  Meta CAPI *does* accept `client_ip_address`, so Meta geo is accurate.
- **Proxied pixel IP:** beacons proxied through Nginx reach Meta with the server
  IP; the deduped CAPI event carries the real client IP, so EMQ is preserved.
- **Retention:** logs auto-expire after `logRetentionDays` (default 30) via a
  Mongo TTL index on `expireAt`.
