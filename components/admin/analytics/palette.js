// Chart palette for the Analytics page. Its own module (no "use client") so
// both the server-rendered pieces and the interactive charts can read it.
//
// Validated against the white card surface:
//   strong  #B85C3A  brand terracotta — the certain money (delivered/collected)
//   soft    #D99878  same hue, one step lighter — the uncertain money (in flight)
// One hue, two shades: both segments are the SAME measure at different levels of
// certainty, so this is an ordinal ramp rather than two identities. It clears
// the ordinal checks on white (ΔL 0.16, light end 2.41:1 contrast).
export const VIZ = {
  strong: "#B85C3A",
  soft: "#D99878",
  grid: "#E7E0D6", // one step off the surface — recessive gridlines
  surface: "#FFFFFF",
};

// Reserved status colours — never reused as generic series colours. Every
// status mark is rendered beside its label, so hue never carries identity alone.
export const STATUS_COLORS = {
  pending: "#D97706",
  processing: "#2563EB",
  shipped: "#7C3AED",
  delivered: "#059669",
  cancelled: "#DC2626",
};

// ── Sales-channel families ────────────────────────────────────────────────────
// A CATEGORICAL palette: each hue is an identity (which channel), not a level,
// so no two of them may be read as "more" or "less" than each other. Hues are
// assigned in this fixed order and never cycled or re-sorted — a filter that
// drops a family must not repaint the survivors.
//
// The order below is also the stacking order in the channel-mix chart, so the
// pairs that ever touch are the consecutive ones. Validated on the white card
// surface in exactly that order:
//
//   validate_palette.js "#B85C3A,#7A44D9,#0089AD,#C08A00,#C2185B" \
//     --mode light --surface "#FFFFFF"
//   → all checks pass; worst adjacent pair ΔE 12.0 (deutan), 21.1 normal vision.
//
// Read as an unordered legend (all pairs rather than touching ones) terracotta
// and gold sit closer than the 15 ΔE comfort floor, which is why every channel
// mark on the page is rendered beside its own written label and the chart ships
// a table view — hue never has to carry identity on its own.
export const CHANNEL_COLORS = {
  storefront: "#B85C3A", // brand terracotta — the shop's own checkout
  campaign: "#7A44D9", // violet, matching the "Landing page" tag on the orders list
  social: "#0089AD",
  direct: "#C08A00",
  partner: "#C2185B",
};

// Per-source marks, so a source row in the detail table carries the same hue as
// the family band it belongs to. Falls back with the family, never generated.
export const SOURCE_COLORS = {
  website: CHANNEL_COLORS.storefront,
  landing_page: CHANNEL_COLORS.campaign,
  facebook: CHANNEL_COLORS.social,
  instagram: CHANNEL_COLORS.social,
  whatsapp: CHANNEL_COLORS.social,
  phone: CHANNEL_COLORS.direct,
  offline: CHANNEL_COLORS.direct,
  other: CHANNEL_COLORS.direct,
  ncom: CHANNEL_COLORS.partner,
};
