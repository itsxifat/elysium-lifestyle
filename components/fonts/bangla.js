import { Hind_Siliguri } from "next/font/google";

// Self-hosted Bangla typeface for pages that print Bangla text (the returns
// policy). next/font downloads it at build time and serves it from
// /_next/static/media, so the CSP's `font-src 'self'` covers it. Only fetched on
// a page that applies it.
const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Arial", "sans-serif"],
  variable: "--font-hind-siliguri",
});

/** Put on an element whose descendants use `BANGLA_FONT_FAMILY`. */
export const banglaFontVars = hindSiliguri.variable;

export const BANGLA_FONT_FAMILY = "var(--font-hind-siliguri), system-ui, Arial, sans-serif";
