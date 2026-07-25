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
