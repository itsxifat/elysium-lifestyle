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

export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatPrice(amount) {
  return `৳${Number(amount).toLocaleString("en-BD")}`;
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
