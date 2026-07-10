import Product from "@/models/Product";
import Category from "@/models/Category";
import { getSubtreeIds } from "@/lib/categories";
import { buildProductSearchFilter } from "@/lib/search";

// Backs every admin "pick a product" browser (custom-url highlights, landing-page
// offers). Two modes, combinable:
//   • category browse — products in one category node, or its whole subtree
//   • search — free text across name/sku/size/tags/category
//
// `withVariants` additionally returns each product's sizes + stock, which the
// landing-page offer builder needs to pin a size.
export const PICKER_PAGE_SIZE = 40;

export async function searchPickerProducts({ categoryId, subtree, q, page = 1, withVariants = false }) {
  const skip = (Math.max(1, page) - 1) * PICKER_PAGE_SIZE;
  const filter = {};

  if (categoryId) {
    let ids = [categoryId];
    if (subtree) {
      const allCats = await Category.find({}).select("_id parent").lean();
      ids = getSubtreeIds(allCats, categoryId);
    }
    filter.category = { $in: ids };
  }

  if (q) {
    const sf = await buildProductSearchFilter(q);
    if (sf.$and) filter.$and = sf.$and;
  }

  // Fetch one extra to know if a further page exists without a count().
  const docs = await Product.find(filter)
    .select("name images variants slug skuBase")
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(PICKER_PAGE_SIZE + 1)
    .lean();

  const hasMore = docs.length > PICKER_PAGE_SIZE;
  const products = (hasMore ? docs.slice(0, PICKER_PAGE_SIZE) : docs).map((p) => {
    const item = {
      _id: p._id.toString(),
      name: p.name,
      sku: p.skuBase || "",
      image: p.images?.[0] || "",
      price: p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : 0,
    };
    if (withVariants) {
      item.variants = (p.variants || []).map((v) => ({ size: v.size, price: v.price, stock: v.stock }));
    }
    return item;
  });

  return { products, page, hasMore };
}

// Parse the shared query-string contract used by the picker endpoints.
export function pickerParamsFrom(request) {
  const { searchParams } = new URL(request.url);
  return {
    categoryId: searchParams.get("category") || "",
    subtree: searchParams.get("subtree") === "1",
    q: (searchParams.get("q") || "").trim(),
    page: Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1),
  };
}
