"use client";

import { useEffect, useRef } from "react";
import { initTracking, trackEvent } from "@/lib/tracking/client";
import { offerCatalogContents, landingCustomData } from "@/lib/landing-tracking";

// Opens the tracking funnel on a public /lp/<code> page.
//
// Landing pages sit outside the (store) layout on purpose, which also meant
// they never mounted TrackingBootstrap: no pixel, no PageView, and no _fbc from
// the fbclid the ad appended — on a page whose entire audience arrives from an
// ad. initTracking() captures the click ids first, then loads the same
// first-party pixel/gtag the storefront uses and fires PageView.
//
// The rest of the funnel (AddToCart / InitiateCheckout / Purchase) belongs to
// LandingOrderForm, which is the only thing that knows what the customer chose.
//
// Mounted only for published pages — a staff draft preview isn't ad traffic.
export default function LandingTracking({ page, offers = [] }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    initTracking(); // click ids + pixel/gtag + PageView

    // ViewContent describes the offer the page opens on, priced at its headline
    // price (for a pool offer that's the "from" price, same as the page shows).
    const offer = offers.find((o) => o.isDefault) || offers[0];
    if (!offer) return;

    trackEvent("ViewContent", {
      customData: {
        ...landingCustomData(offer, { value: offer.price, contents: offerCatalogContents(offer) }),
        content_category: "landing_page",
      },
      ga4Params: { landing_page: page.code, landing_page_name: page.name },
    });
  }, [page, offers]);

  return null;
}
