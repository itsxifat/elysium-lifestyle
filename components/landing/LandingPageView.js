"use client";

import { useCallback } from "react";
import Block from "./blocks";
import LandingOrderForm from "./LandingOrderForm";
import { landingFontVars } from "./fonts";
import { landingFontFamily } from "@/lib/landing-fonts";

// Composes a landing page from its blocks. Used verbatim by the public
// /lp/<code> route and by the admin editor's live preview — `preview` only
// disables the submit button, so an admin is always looking at the real page.
//
// Theme colours become CSS variables here; every block reads --lp-accent /
// --lp-text rather than a brand class, which is what makes a page re-skinnable.
export default function LandingPageView({ page, offers = [], shipping, preview = false }) {
  const theme = page.theme || {};

  const scrollToOrder = useCallback(() => {
    document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // A background image sits under the whole page; the solid colour is its
  // fallback (shown while it loads, and around a `contain`-style image).
  const bgStyle = theme.backgroundImage
    ? {
        backgroundColor: theme.background || "#FDFBF7",
        backgroundImage: `url("${theme.backgroundImage}")`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }
    : { background: theme.background || "#FDFBF7" };

  return (
    <div
      // landingFontVars declares every --font-* variable on this element; the
      // selected one is applied as the page's font-family, so every block (and
      // the order form) inherits it. All options cover Bengali + Latin.
      className={`${landingFontVars} min-h-screen`}
      style={{
        "--lp-accent": theme.accent || "#B85C3A",
        "--lp-text": theme.text || "#2C1810",
        color: theme.text || "#2C1810",
        fontFamily: landingFontFamily(theme.font),
        ...bgStyle,
      }}
    >
      {(page.blocks || [])
        .filter((b) => b.enabled !== false)
        .map((block) =>
          block.type === "orderform" ? (
            <LandingOrderForm
              key={block.key}
              code={page.code}
              offers={offers}
              form={page.form || {}}
              shipping={shipping}
              preview={preview}
            />
          ) : (
            <Block key={block.key} block={block} onCta={scrollToOrder} />
          )
        )}
    </div>
  );
}
