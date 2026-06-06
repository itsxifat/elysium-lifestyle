"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { initTracking, trackEvent } from "@/lib/tracking/client";

// Mounted once in the store layout. Loads the proxied pixel/gtag and fires a
// PageView on every client-side route change (initTracking fires the first one).
export default function TrackingBootstrap() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    initTracking();
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    trackEvent("PageView");
  }, [pathname]);

  return null;
}
