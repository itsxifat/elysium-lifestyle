"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/tracking/client";

// The browser's Purchase on the order-confirmation page, for the pixel and gtag
// only. The ERP sends the same Purchase from its server when the order is placed
// (cash on delivery) or paid (SSLCommerz), under the event id
// `purchase_<orderNo>` (D-552); the pixel is given that same id so Meta counts
// the order once, and GA4 deduplicates on the transaction id. It is never
// forwarded to /api/events (lib/tracking/client.js), and a browser fires it once
// per order however often the page is opened.
export default function PurchaseTracker({ order }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !order?.orderNumber) return;
    fired.current = true;
    const key = `ely_purchase_${order.orderNumber}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch { /* storage unavailable: fire once for this page */ }
    trackEvent("Purchase", {
      eventId: `purchase_${order.orderNumber}`,
      customData: {
        currency: order.currency || "BDT",
        value: order.value,
        order_id: order.orderNumber,
        content_ids: order.contentIds || [],
        num_items: order.numItems,
        content_type: "product",
      },
    }).then((eventId) => {
      if (!eventId) return;
      try {
        localStorage.setItem(key, "1");
      } catch { /* ignore */ }
    });
  }, [order]);

  return null;
}
