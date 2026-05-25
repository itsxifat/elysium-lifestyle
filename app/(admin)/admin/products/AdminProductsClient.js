"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";
import toast from "react-hot-toast";
import Badge from "@/components/ui/Badge";

export default function AdminProductsClient({ initialProducts }) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id) => {
    if (!confirm("Delete this product?")) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (res.ok) {
      setProducts((prev) => prev.filter((p) => p._id !== id));
      toast.success("Product deleted");
    } else {
      toast.error("Failed to delete product");
    }
  };

  const handleTogglePublish = async (product) => {
    const res = await fetch(`/api/products/${product._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublished: !product.isPublished }),
    });
    if (res.ok) {
      setProducts((prev) =>
        prev.map((p) =>
          p._id === product._id
            ? { ...p, isPublished: !product.isPublished }
            : p
        )
      );
      toast.success(
        product.isPublished ? "Product unpublished" : "Product published"
      );
    } else {
      toast.error("Failed to update product");
    }
  };

  return (
    <div className="bg-white border border-brand-tan/20">
      <div className="p-4 border-b border-brand-tan/20">
        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-brand-tan bg-brand-cream px-4 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-terracotta w-full max-w-sm"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-tan/20 bg-brand-cream">
              <th className="text-left px-4 py-3 text-xs text-brand-tan uppercase tracking-wider font-medium">
                Product
              </th>
              <th className="text-left px-4 py-3 text-xs text-brand-tan uppercase tracking-wider font-medium">
                Category
              </th>
              <th className="text-left px-4 py-3 text-xs text-brand-tan uppercase tracking-wider font-medium">
                Price
              </th>
              <th className="text-left px-4 py-3 text-xs text-brand-tan uppercase tracking-wider font-medium">
                Stock
              </th>
              <th className="text-left px-4 py-3 text-xs text-brand-tan uppercase tracking-wider font-medium">
                Status
              </th>
              <th className="text-right px-4 py-3 text-xs text-brand-tan uppercase tracking-wider font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-tan/10">
            {filtered.map((product) => {
              const totalStock = product.variants?.reduce(
                (s, v) => s + v.stock,
                0
              );
              const image = product.images?.[0] || "/placeholder.jpg";
              return (
                <tr key={product._id} className="hover:bg-brand-cream/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-12 flex-shrink-0 bg-brand-cream-dark overflow-hidden">
                        <Image
                          src={image}
                          alt={product.name}
                          fill
                          unoptimized={shouldUnoptimizeImage(image)}
                          className="object-cover"
                        />
                      </div>
                      <div>
                        <p className="font-medium text-brand-brown line-clamp-1">
                          {product.name}
                        </p>
                        <p className="text-xs text-brand-tan">{product.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-brand-brown/70">
                    {product.category?.name || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      {product.salePrice ? (
                        <>
                          <span className="font-medium text-brand-terracotta">
                            {formatPrice(product.salePrice)}
                          </span>
                          <span className="text-xs text-brand-tan line-through ml-1">
                            {formatPrice(product.price)}
                          </span>
                        </>
                      ) : (
                        <span className="font-medium text-brand-brown">
                          {formatPrice(product.price)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-medium ${
                        totalStock === 0
                          ? "text-red-500"
                          : totalStock < 5
                          ? "text-orange-500"
                          : "text-green-600"
                      }`}
                    >
                      {totalStock}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={product.isPublished ? "delivered" : "cancelled"}
                    >
                      {product.isPublished ? "Published" : "Draft"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleTogglePublish(product)}
                        className="p-1.5 text-brand-tan hover:text-brand-brown transition-colors"
                        title={product.isPublished ? "Unpublish" : "Publish"}
                      >
                        {product.isPublished ? (
                          <EyeOff size={15} />
                        ) : (
                          <Eye size={15} />
                        )}
                      </button>
                      <Link
                        href={`/admin/products/${product._id}/edit`}
                        className="p-1.5 text-brand-tan hover:text-brand-brown transition-colors"
                        title="Edit"
                      >
                        <Edit size={15} />
                      </Link>
                      <button
                        onClick={() => handleDelete(product._id)}
                        className="p-1.5 text-brand-tan hover:text-red-500 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-brand-tan">
            No products found
          </div>
        )}
      </div>
    </div>
  );
}
