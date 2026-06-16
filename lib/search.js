import Category from "@/models/Category";
import { escapeRegExp } from "@/lib/utils";

// Split a search string into up to `max` regex-safe tokens (words). Each token
// becomes its own AND clause, so "blue cotton shirt" requires every word to
// match somewhere on the product — Google-style, order-independent matching.
function tokenize(q, max = 8) {
  return String(q || "")
    .trim()
    .split(/\s+/)
    .map((t) => escapeRegExp(t))
    .filter(Boolean)
    .slice(0, max);
}

// Build a MongoDB filter that matches a product by ANY meaningful field —
// name, description, tags, slug, SKU, size, gender, material, exact price, or
// its category's name/slug. Substring + case-insensitive, so partial words and
// any metric find the item. Async because category names live on another
// collection; pass a pre-fetched `categories` list to avoid a second query.
//
// Returns {} for an empty query so the caller keeps its own base filter.
export async function buildProductSearchFilter(rawQuery, { categories } = {}) {
  const tokens = tokenize(rawQuery);
  if (!tokens.length) return {};

  // Resolve category name/slug → ids once, then reuse for every token.
  const cats =
    categories || (await Category.find({}).select("_id name slug").lean());

  const and = tokens.map((tok) => {
    const rx = { $regex: tok, $options: "i" };
    const or = [
      { name: rx },
      { description: rx },
      { tags: rx },
      { slug: rx },
      { "variants.sku": rx },
      { "variants.size": rx },
      { gender: rx },
      { material: rx },
    ];

    // Numeric token → also match an exact variant price (e.g. "1418").
    if (/^\d+(\.\d+)?$/.test(tok)) or.push({ "variants.price": Number(tok) });

    // Category name / slug hit → include every product in those categories.
    const re = new RegExp(tok, "i");
    const catIds = cats
      .filter((c) => re.test(c.name || "") || re.test(c.slug || ""))
      .map((c) => c._id);
    if (catIds.length) or.push({ category: { $in: catIds } });

    return { $or: or };
  });

  return { $and: and };
}
