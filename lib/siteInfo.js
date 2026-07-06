// Client-safe site-info helpers (no DB imports) — used by both the client Footer
// and the server-side getSiteInfo() below.

// Last-resort display values so the footer / legal pages never render blank
// contact details before an admin has filled Settings in. Real settings always
// override these.
export const SITE_INFO_FALLBACK = {
  siteName: "Elysium Lifestyle",
  phone: "+880 1700-000000",
  email: "hello@elysiumlifestyle.com",
  address: "Dhaka, Bangladesh",
};

// Turn a display phone ("+880 1700-000000", "8801700000000", …) into a tel:
// href — strip everything but digits and a leading +, and ensure the + is there.
export function telHref(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/[^\d]/g, "");
  if (!digits) return "";
  return `tel:+${digits}`;
}

// Normalize the raw `siteInfo`/`socialLinks` from settings into the display
// fields the storefront shows. `phone` falls back to the WhatsApp number, then
// the static default, so the number an admin enters is always what shows.
export function normalizeSiteInfo(siteInfo = {}, socialLinks = {}) {
  return {
    siteName: siteInfo.siteName || SITE_INFO_FALLBACK.siteName,
    phone: siteInfo.phone || siteInfo.whatsappNumber || SITE_INFO_FALLBACK.phone,
    email: siteInfo.email || SITE_INFO_FALLBACK.email,
    address: siteInfo.address || SITE_INFO_FALLBACK.address,
    social: {
      facebook: socialLinks.facebook || "",
      instagram: socialLinks.instagram || "",
      tiktok: socialLinks.tiktok || "",
    },
  };
}
