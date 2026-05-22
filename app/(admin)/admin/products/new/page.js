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
  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-brown mb-6">Add New Product</h1>
      <ProductForm categories={categories} />
    </div>
  );
}
