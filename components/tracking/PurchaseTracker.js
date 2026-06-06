"use client";

import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/tracking/client";

// Fires the client-side Purchase on the order-confirmation page using a
// deterministic event_id (`purchase_<orderId>`) so Meta deduplicates it against
// the server-side Purchase fired from the order/payment success handler.
export default function PurchaseTracker({ order }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !order) return;
    fired.current = true;
    trackEvent("Purchase", {
      eventId: `purchase_${order.id}`,
      customData: {
        currency: order.currency || "BDT",
        value: order.value,
        order_id: order.orderNumber,
        content_ids: order.contentIds || [],
        num_items: order.numItems,
        content_type: "product",
      },
      userData: order.userData || {},
    });
  }, [order]);

  return null;
}
