export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Product from "@/models/Product";
import "@/models/Category";
import { serializeDoc } from "@/lib/utils";
import Link from "next/link";
import { Plus, Package } from "lucide-react";
import AdminProductsClient from "./AdminProductsClient";
import { PageHeader, Button } from "@/components/admin/ui";

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
      <PageHeader
        title="Products"
        subtitle={`${products.length} product${products.length === 1 ? "" : "s"} total`}
        icon={Package}
        actions={
          <Button as={Link} href="/admin/products/new">
            <Plus size={15} /> Add Product
          </Button>
        }
      />
      <AdminProductsClient initialProducts={products} />
    </div>
  );
}
