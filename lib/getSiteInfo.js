import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { normalizeSiteInfo, SITE_INFO_FALLBACK } from "@/lib/siteInfo";

// Server-side fetch of normalized company contact details, for server components
// (e.g. the legal pages). Client components should use useSettings() instead.
export async function getSiteInfo() {
  try {
    await connectDB();
    const s = await Settings.findOne({}).select("siteInfo socialLinks").lean();
    return normalizeSiteInfo(s?.siteInfo, s?.socialLinks);
  } catch {
    return { ...SITE_INFO_FALLBACK, social: { facebook: "", instagram: "", tiktok: "" } };
  }
}
