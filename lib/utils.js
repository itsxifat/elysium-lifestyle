export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Convert Bangla (০–৯) and Arabic-Indic (٠–٩) numerals to ASCII 0–9. Bengali
// customers often write phone numbers in Bangla digits; the ERP accepts only
// ASCII digits, so normalise before sending.
export function toEnglishDigits(input) {
  if (input == null) return "";
  return String(input).replace(/[০-৯٠-٩]/g, (d) => {
    const code = d.codePointAt(0);
    const base = code >= 0x09e6 ? 0x09e6 : 0x0660; // Bengali (higher block) vs Arabic-Indic
    return String(code - base);
  });
}

// Normalise a Bangladeshi phone number: Bangla→English digits, drop spaces /
// dashes / +, and reduce a +880 / 880 / 0088 country code to the local
// 11-digit 01XXXXXXXXX form. Best-effort — the ERP has the final word.
export function normalizeBdPhone(raw) {
  let s = toEnglishDigits(raw).replace(/[^\d+]/g, "");
  s = s.replace(/^\+/, "").replace(/^00/, "");
  if (s.startsWith("880")) s = "0" + s.slice(3);
  if (s.length === 10 && s.startsWith("1")) s = "0" + s;
  return s;
}

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A display price in taka (the ERP's `taka` figure as a number). */
export function formatPrice(amount) {
  const n = Number(amount);
  return `Tk ${(Number.isFinite(n) ? n : 0).toLocaleString("en-BD")}`;
}

/** An ERP money object (`{ poisha, taka }`) as a display price. */
export function formatMoney(money) {
  return formatPrice(money?.taka ?? 0);
}

export function truncate(str, maxLength = 100) {
  if (!str) return "";
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength).trim() + "...";
}

export function calculateDiscount(price, salePrice) {
  if (!salePrice || salePrice >= price) return 0;
  return Math.round(((price - salePrice) / price) * 100);
}

export const PLACEHOLDER_IMAGE = "/placeholder.svg";

export function getImageUrl(url) {
  return url || PLACEHOLDER_IMAGE;
}

// Local SVGs (the placeholder) are not run through the image optimiser.
export function shouldUnoptimizeImage(src) {
  if (typeof src !== "string") return false;
  try {
    return new URL(src, "http://localhost").pathname.endsWith(".svg");
  } catch {
    return false;
  }
}
