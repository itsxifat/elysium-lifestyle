"use client";

// QR replacement for the old Code 39 Barcode on shipping labels. Unlike a 1D
// barcode, a QR carries Reed–Solomon error correction (level "H" ≈ 30%), so a
// partly-smudged or mis-fed thermal print still scans cleanly — which is the
// whole reason we switched. Renders as crisp vector SVG so it stays sharp at any
// print scale.
//
// The value is uppercased to keep short order / tracking codes in QR's compact
// alphanumeric mode (smallest, densest-but-tiny, most robust symbol). Scan
// lookups are case-insensitive, so uppercasing never changes what matches.

import { QRCodeSVG } from "qrcode.react";

export default function QrCode({ value, size = 88, level = "H", className }) {
  const text = String(value || "").toUpperCase().trim();
  if (!text) return null;
  return (
    <QRCodeSVG
      value={text}
      size={size}
      level={level}
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#000000"
      className={className}
    />
  );
}
