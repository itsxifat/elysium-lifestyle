import {
  Hind_Siliguri,
  Noto_Sans_Bengali,
  Anek_Bangla,
  Baloo_Da_2,
  Tiro_Bangla,
  Galada,
} from "next/font/google";

// Self-hosted landing-page fonts. next/font downloads these at build time and
// serves them from /_next/static/media (same-origin), so the strict CSP's
// `font-src 'self'` covers them with no allowlist change.
//
// preload: false is deliberate — a page uses only ONE of these, and preloading
// all six (each carrying the sizeable Bengali script) would waste bandwidth on
// every landing page and in the editor. Only the font actually applied via
// font-family gets fetched; the rest just declare an unused @font-face.
//
// NOTE: next/font requires each call's argument to be an inline object literal
// with static values — no spreads, no shared variables — hence the repetition.
// The `variable` names MUST match LANDING_FONTS[*].cssVar in lib/landing-fonts.js.

const hindSiliguri = Hind_Siliguri({
  subsets: ["bengali", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Arial", "sans-serif"],
  variable: "--font-hind-siliguri",
});

const notoSansBengali = Noto_Sans_Bengali({
  subsets: ["bengali", "latin"],
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Arial", "sans-serif"],
  variable: "--font-noto-sans-bengali",
});

const anekBangla = Anek_Bangla({
  subsets: ["bengali", "latin"],
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Arial", "sans-serif"],
  variable: "--font-anek-bangla",
});

const balooDa2 = Baloo_Da_2({
  subsets: ["bengali", "latin"],
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Arial", "sans-serif"],
  variable: "--font-baloo-da-2",
});

const tiroBangla = Tiro_Bangla({
  subsets: ["bengali", "latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Georgia", "serif"],
  variable: "--font-tiro-bangla",
});

const galada = Galada({
  subsets: ["bengali", "latin"],
  weight: ["400"],
  display: "swap",
  preload: false,
  fallback: ["system-ui", "Arial", "sans-serif"],
  variable: "--font-galada",
});

// One className that declares every `--font-*` variable. Put it on any element
// that (or whose descendants) reference the fonts — the landing page wrapper and
// the editor root both do.
export const landingFontVars = [
  hindSiliguri,
  notoSansBengali,
  anekBangla,
  balooDa2,
  tiroBangla,
  galada,
]
  .map((f) => f.variable)
  .join(" ");
