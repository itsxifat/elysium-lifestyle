export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Escape regex metacharacters and cap length before building a MongoDB $regex
// from user input — prevents ReDoS (catastrophic backtracking) and stray
// pattern injection. Returns "" for non-strings so callers can skip the filter.
export function escapeRegExp(input, maxLength = 50) {
  if (typeof input !== "string") return "";
  return input.slice(0, maxLength).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Convert Bangla (০–৯) and Arabic-Indic (٠–٩) numerals to ASCII 0–9. Bengali
// customers often write phone numbers in Bangla digits; couriers (Steadfast)
// and most numeric parsing only accept ASCII, so normalise before use.
export function toEnglishDigits(input) {
  if (input == null) return "";
  return String(input).replace(/[০-৯٠-٩]/g, (d) => {
    const code = d.codePointAt(0);
    const base = code >= 0x09e6 ? 0x09e6 : 0x0660; // Bengali (higher block) vs Arabic-Indic
    return String(code - base);
  });
}

// Normalise a Bangladeshi phone number for the courier API: Bangla→English
// digits, drop spaces/dashes/+, and reduce a +880 / 880 / 0088 country code to
// the local 11-digit 01XXXXXXXXX form. Best-effort — returns the cleaned digits
// even if they don't form a valid 11-digit number.
export function normalizeBdPhone(raw) {
  let s = toEnglishDigits(raw).replace(/[^\d+]/g, ""); // keep only digits and +
  s = s.replace(/^\+/, "").replace(/^00/, ""); // strip + / 00 international prefix
  if (s.startsWith("880")) s = "0" + s.slice(3); // 8801XXXXXXXXX → 01XXXXXXXXX
  if (s.length === 10 && s.startsWith("1")) s = "0" + s; // missing leading zero
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

export function formatPrice(amount) {
  const n = Number(amount);
  return `Tk ${(Number.isFinite(n) ? n : 0).toLocaleString("en-BD")}`;
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

export function serializeDoc(doc) {
  return JSON.parse(JSON.stringify(doc));
}

export function generateOrderNumber(count) {
  const year = new Date().getFullYear();
  return `ELY-${year}-${String(count + 1).padStart(5, "0")}`;
}

export function getImageUrl(url) {
  if (!url) return "/placeholder.jpg";
  return url;
}

export function shouldUnoptimizeImage(src) {
  if (typeof src !== "string") return false;

  try {
    return new URL(src, "http://localhost").pathname.startsWith("/uploads/");
  } catch {
    return false;
  }
}
