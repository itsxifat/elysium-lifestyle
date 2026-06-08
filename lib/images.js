import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import User from "@/models/User";
import Settings from "@/models/Settings";
import ImageHash from "@/models/ImageHash";
import { deleteFromCDN } from "@/lib/cdn";

// Images are SHARED now (upload de-duplicates identical files, and product
// duplication copies image references). So a CDN file must only be deleted once
// NOTHING references it anymore — otherwise removing one product would break the
// image on its duplicates / on a category / on a hero slide.

export async function isImageReferenced(value) {
  if (!value) return true;
  await connectDB();
  const [inProducts, inCategories, inUsers] = await Promise.all([
    Product.countDocuments({ images: value }),
    Category.countDocuments({ image: value }),
    User.countDocuments({ image: value }),
  ]);
  if (inProducts || inCategories || inUsers) return true;

  const s = await Settings.findOne({}).select("heroSlides siteInfo").lean();
  if (s?.siteInfo?.logo === value) return true;
  if ((s?.heroSlides || []).some((h) => h.imageDesktop === value || h.imageMobile === value)) return true;

  return false;
}

/**
 * Delete an image from the CDN only if no entity still references it, and drop
 * its dedup record. Call AFTER the referencing doc has been updated/removed.
 * Never throws.
 */
export async function deleteImageIfUnreferenced(value) {
  try {
    if (!value) return;
    if (await isImageReferenced(value)) return; // still in use — keep it
    await deleteFromCDN(value);
    await ImageHash.deleteOne({ value }).catch(() => {});
  } catch (err) {
    console.error("[images] cleanup failed:", err.message);
  }
}
