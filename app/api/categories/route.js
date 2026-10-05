export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCategoryTree, flattenCategories } from "@/lib/storefront";

// The visible category tree from the brand ERP, flattened with parent links
// (the shop's filter builds its own tree from it).
export async function GET() {
  const tree = await getCategoryTree();
  return NextResponse.json(flattenCategories(tree));
}
