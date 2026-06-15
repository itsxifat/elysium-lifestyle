"use client";

// Self-contained Code 39 barcode (SVG). No external dependency. Code 39 needs no
// checksum and is read by virtually every scanner — ideal for courier CN /
// tracking codes (uppercase alphanumerics).

const CODE39 = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw",
  C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww",
  O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw",
  W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
  $: "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn",
};

export default function Barcode({ value, height = 48, narrow = 2, className }) {
  const text = String(value || "")
    .toUpperCase()
    .replace(/[^0-9A-Z\-. $/+%]/g, "");
  if (!text) return null;

  const wide = narrow * 3;
  const data = `*${text}*`;
  const rects = [];
  let x = 0;

  for (let ci = 0; ci < data.length; ci++) {
    const pat = CODE39[data[ci]];
    if (!pat) continue;
    for (let i = 0; i < 9; i++) {
      const w = pat[i] === "w" ? wide : narrow;
      if (i % 2 === 0) {
        rects.push(<rect key={`${ci}-${i}`} x={x} y={0} width={w} height={height} fill="#000" />);
      }
      x += w;
    }
    x += narrow; // inter-character gap
  }

  return (
    <svg
      className={className}
      width="100%"
      height={height}
      viewBox={`0 0 ${x} ${height}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}
