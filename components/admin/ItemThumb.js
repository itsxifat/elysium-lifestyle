"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";

// One thumbnail that shows the picture whatever shop the item came from.
//
// Our own photos are stored as relative /api/img/... paths; an item from a
// partner order (ncom.bd) carries an absolute URL on a host nobody whitelisted,
// which both the CSP and next/image refuse — so those go through the staff-only
// same-origin proxy instead. See app/api/admin/remote-image.
//
// A plain <img> on purpose: these are 48px admin thumbnails from arbitrary
// hosts, and next/image would demand every one of those hosts be declared in
// next.config at build time — which is exactly the thing we cannot know.
export function thumbSrc(src) {
  if (typeof src !== "string" || !src.trim()) return "";
  const url = src.trim();
  if (/^data:image\//i.test(url)) return url; // inline preview, allowed by CSP
  if (/^https?:\/\//i.test(url)) return `/api/admin/remote-image?url=${encodeURIComponent(url)}`;
  return url; // relative / same-origin (/api/img/…, /uploads/…, /placeholder.jpg)
}

export default function ItemThumb({ src, alt = "", className = "", size = 48, rounded = "rounded" }) {
  const [broken, setBroken] = useState(false);
  const resolved = thumbSrc(src);
  const show = resolved && !broken;

  return (
    <span
      className={`relative block flex-shrink-0 overflow-hidden bg-brand-cream-dark border border-brand-tan/15 ${rounded} ${className}`}
      style={className.includes("w-") ? undefined : { width: size, height: size }}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolved}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        // Says "there is no picture" rather than leaving a grey hole that reads
        // as a still-loading image.
        <span className="w-full h-full flex items-center justify-center text-brand-tan/40">
          <ImageOff size={Math.max(12, Math.round(size / 3))} strokeWidth={1.6} />
        </span>
      )}
    </span>
  );
}
