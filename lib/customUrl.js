// Shared helpers for the "Custom URL" marketing campaigns.
import CustomUrl from "@/models/CustomUrl";

/** Generate a unique unused 5-digit code (10000–99999). */
export async function generateUniqueCode() {
  for (let i = 0; i < 40; i++) {
    const code = String(Math.floor(10000 + Math.random() * 90000));
    // eslint-disable-next-line no-await-in-loop
    const exists = await CustomUrl.exists({ code });
    if (!exists) return code;
  }
  throw new Error("Could not allocate a unique campaign code");
}

/**
 * The base storefront path a campaign points at, WITHOUT the ?cu suffix.
 * `doc.category` may be a populated category doc (with slug) or null.
 */
export function buildBasePath(doc) {
  if (doc.baseType === "category" && doc.category?.slug) {
    return `/shop?category=${doc.category.slug}`;
  }
  if (doc.baseType === "custom" && doc.customPath) {
    return doc.customPath.startsWith("/") ? doc.customPath : `/${doc.customPath}`;
  }
  return "/shop";
}

/** Full shareable path: base + `cu=<code>` suffix (correct ? vs & joiner). */
export function buildFullPath(doc) {
  const base = buildBasePath(doc);
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}cu=${doc.code}`;
}
