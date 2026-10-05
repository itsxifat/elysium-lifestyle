"use client";

import Link from "next/link";

// A storefront page whose data could not be read (the brand ERP is down or slow).
// The frame (navbar, footer) stays; the shopper can try again.
export default function StoreError({ reset }) {
  return (
    <div className="container-custom py-24 text-center">
      <p className="section-subtitle mb-2">Sorry</p>
      <h1 className="section-title mb-4">We couldn&apos;t load this page</h1>
      <p className="text-[13px] text-brand-tan mb-8">The shop is busy for a moment. Please try again.</p>
      <div className="flex items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-outline">
          Home
        </Link>
      </div>
    </div>
  );
}
