export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import Category from "@/models/Category";
import { serializeDoc } from "@/lib/utils";
import { notFound } from "next/navigation";
import ProductForm from "../../new/ProductForm";

async function getData(id) {
  await connectDB();
  const [product, categories] = await Promise.all([
    Product.findById(id).lean(),
    Category.find({ isActive: true }).lean(),
  ]);
  return { product: serializeDoc(product), categories: serializeDoc(categories) };
}

export default async function EditProductPage({ params }) {
  const { product, categories } = await getData(params.id);
  if (!product) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-brown mb-6">Edit Product</h1>
      <ProductForm
        categories={categories}
        defaultValues={product}
        isEdit
        productId={params.id}
      />
    </div>
  );
}
