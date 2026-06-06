export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Category from "@/models/Category";
import { serializeDoc } from "@/lib/utils";
import ProductForm from "./ProductForm";

async function getCategories() {
  await connectDB();
  const cats = await Category.find({ isActive: true }).lean();
  return serializeDoc(cats);
}

export default async function NewProductPage() {
  const categories = await getCategories();
  return <ProductForm categories={categories} />;
}
