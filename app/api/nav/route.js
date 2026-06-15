// Must run per-request — otherwise Next statically caches this and the storefront
// navbar freezes on the first response, ignoring admin nav changes.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import Category from "@/models/Category";

// Build a tree of children up to maxDepth levels
function buildChildren(allCats, parentId, maxDepth, depth = 0) {
  if (depth >= maxDepth) return [];
  const pid = parentId.toString();
  return allCats
    .filter((c) => c.parent?.toString() === pid && c.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((c) => ({
      _id: c._id.toString(),
      name: c.name,
      slug: c.slug,
      href: `/shop?category=${c.slug}`,
      children: buildChildren(allCats, c._id, maxDepth, depth + 1),
    }));
}

export async function GET() {
  try {
    await connectDB();

    const [settings, allCats] = await Promise.all([
      Settings.findOne({}).lean(),
      Category.find({}).lean(),
    ]);

    const rawItems = settings?.navItems ?? [];
    const active = rawItems
      .filter((item) => item.isActive)
      .sort((a, b) => a.order - b.order);

    const navItems = active.map((item) => {
      if (item.type === "category" && item.categoryId) {
        const cat = allCats.find(
          (c) => c._id.toString() === item.categoryId.toString()
        );
        return {
          _id: item._id.toString(),
          type: "category",
          label: item.label || cat?.name || "",
          href:
            item.href && item.href !== "/"
              ? item.href
              : cat
              ? `/shop?category=${cat.slug}`
              : "/shop",
          highlighted: item.highlighted,
          children: cat ? buildChildren(allCats, cat._id, 2) : [],
        };
      }
      return {
        _id: item._id.toString(),
        type: "custom",
        label: item.label,
        href: item.href || "/",
        highlighted: item.highlighted,
        children: [],
      };
    });

    const announcement = settings?.announcementBar ?? {
      enabled: true,
      text: "Free shipping on orders over Tk 1500 · Cash on Delivery Available",
      link: "",
    };

    return NextResponse.json({ navItems, announcement });
  } catch {
    return NextResponse.json({ navItems: [], announcement: { enabled: true, text: "", link: "" } });
  }
}
