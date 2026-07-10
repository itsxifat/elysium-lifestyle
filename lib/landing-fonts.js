// Catalog of fonts a landing page may use. Pure data (NO next/font import) so the
// admin editor and the API validator can pull it freely. The actual font files
// are loaded and self-hosted by components/landing/fonts.js, whose next/font
// loaders declare the matching `--font-*` CSS variables named here.
//
// Every font below carries BOTH the Bengali and Latin scripts, so a page that
// mixes বাংলা and English renders in one consistent typeface — no per-glyph
// fallback to whatever the visitor's device happens to have.

export const LANDING_FONTS = {
  hind_siliguri: {
    label: "Hind Siliguri",
    cssVar: "--font-hind-siliguri",
    group: "Sans-serif",
    desc: "Clean and highly readable — the default for Bangla body text.",
  },
  noto_sans_bengali: {
    label: "Noto Sans Bengali",
    cssVar: "--font-noto-sans-bengali",
    group: "Sans-serif",
    desc: "Neutral and comprehensive.",
  },
  anek_bangla: {
    label: "Anek Bangla",
    cssVar: "--font-anek-bangla",
    group: "Sans-serif",
    desc: "Modern and geometric.",
  },
  baloo_da_2: {
    label: "Baloo Da 2",
    cssVar: "--font-baloo-da-2",
    group: "Display",
    desc: "Rounded and friendly — great for bold headlines and offers.",
  },
  tiro_bangla: {
    label: "Tiro Bangla",
    cssVar: "--font-tiro-bangla",
    group: "Serif",
    desc: "Elegant serif for an editorial feel.",
  },
  galada: {
    label: "Galada",
    cssVar: "--font-galada",
    group: "Display",
    desc: "Decorative — best for short, playful headlines.",
  },
};

export const LANDING_FONT_KEYS = Object.keys(LANDING_FONTS);
export const DEFAULT_LANDING_FONT = "hind_siliguri";

// A key → the CSS value to drop into `font-family`. Unknown/blank falls back to
// the default so an older page (or one saved before fonts existed) still renders.
export function landingFontFamily(key) {
  const f = LANDING_FONTS[key] || LANDING_FONTS[DEFAULT_LANDING_FONT];
  return `var(${f.cssVar}), system-ui, Arial, sans-serif`;
}

// Preview strings shown in the font picker, in both scripts the pages use.
export const FONT_SAMPLE_BN = "আপনার অর্ডার এখনই নিশ্চিত করুন";
export const FONT_SAMPLE_EN = "Order now — cash on delivery";
