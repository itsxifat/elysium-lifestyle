export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import "@/models/Category";
import { serializeDoc, formatPrice } from "@/lib/utils";
import Link from "next/link";
import { Plus } from "lucide-react";
import AdminProductsClient from "./AdminProductsClient";

async function getProducts() {
  await connectDB();
  const products = await Product.find()
    .populate("category", "name")
    .sort({ createdAt: -1 })
    .lean();
  return serializeDoc(products);
}

export default async function AdminProductsPage() {
  const products = await getProducts();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Products</h1>
          <p className="text-brand-tan text-sm mt-1">
            {products.length} products total
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={16} />
          Add Product
        </Link>
      </div>
      <AdminProductsClient initialProducts={products} />
    </div>
  );
}
