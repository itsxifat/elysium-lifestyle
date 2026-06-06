"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Edit, Trash2, Eye, EyeOff, Search, Package } from "lucide-react";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";
import toast from "react-hot-toast";
import { Card, TextInput, Pill, EmptyState, TableWrap } from "@/components/admin/ui";

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
      setProducts((prev) => prev.map((p) => (p._id === product._id ? { ...p, isPublished: !product.isPublished } : p)));
      toast.success(product.isPublished ? "Product unpublished" : "Product published");
    } else {
      toast.error("Failed to update product");
    }
  };

  const meta = (product) => {
    const totalStock = product.variants?.reduce((s, v) => s + v.stock, 0) ?? 0;
    const prices = (product.variants || []).map((v) => v.price).filter((p) => Number.isFinite(p));
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const priceLabel = minPrice === maxPrice ? formatPrice(minPrice) : `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`;
    const stockTone = totalStock === 0 ? "text-red-500" : totalStock < 5 ? "text-orange-500" : "text-emerald-600";
    return { totalStock, priceLabel, stockTone, image: product.images?.[0] || "/placeholder.jpg" };
  };

  const Actions = ({ product }) => (
    <div className="flex items-center gap-1">
      <button onClick={() => handleTogglePublish(product)} className="p-1.5 rounded-md text-brand-tan hover:text-brand-brown hover:bg-brand-cream/70 transition-colors" title={product.isPublished ? "Unpublish" : "Publish"}>
        {product.isPublished ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
      <Link href={`/admin/products/${product._id}/edit`} className="p-1.5 rounded-md text-brand-tan hover:text-brand-brown hover:bg-brand-cream/70 transition-colors" title="Edit">
        <Edit size={15} />
      </Link>
      <button onClick={() => handleDelete(product._id)} className="p-1.5 rounded-md text-brand-tan hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
        <Trash2 size={15} />
      </button>
    </div>
  );

  return (
    <Card padded={false}>
      <div className="p-4 border-b border-brand-tan/12">
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan" />
          <TextInput placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="No products found" hint={search ? "Try a different search." : "Add your first product to get started."} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <TableWrap>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-brand-cream/40">
                    {["Product", "Category", "Price", "Stock", "Status", ""].map((h, i) => (
                      <th key={i} className={`px-4 py-2.5 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const m = meta(product);
                    return (
                      <tr key={product._id} className="border-t border-brand-tan/10 hover:bg-brand-cream/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="relative w-10 h-12 flex-shrink-0 bg-brand-cream-dark rounded-md overflow-hidden">
                              <Image src={m.image} alt={product.name} fill sizes="40px" unoptimized={shouldUnoptimizeImage(m.image)} className="object-cover" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-brand-brown line-clamp-1">{product.name}</p>
                              <p className="text-xs text-brand-tan">{product.slug}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-brand-brown/70 whitespace-nowrap">{product.category?.name || "—"}</td>
                        <td className="px-4 py-3 font-medium text-brand-brown whitespace-nowrap">{m.priceLabel}</td>
                        <td className="px-4 py-3"><span className={`font-semibold ${m.stockTone}`}>{m.totalStock}</span></td>
                        <td className="px-4 py-3"><Pill tone={product.isPublished ? "green" : "gray"}>{product.isPublished ? "Published" : "Draft"}</Pill></td>
                        <td className="px-4 py-3"><div className="flex justify-end"><Actions product={product} /></div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-brand-tan/10">
            {filtered.map((product) => {
              const m = meta(product);
              return (
                <div key={product._id} className="flex gap-3 p-4">
                  <div className="relative w-14 h-16 flex-shrink-0 bg-brand-cream-dark rounded-md overflow-hidden">
                    <Image src={m.image} alt={product.name} fill sizes="56px" unoptimized={shouldUnoptimizeImage(m.image)} className="object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-brand-brown line-clamp-1">{product.name}</p>
                      <Actions product={product} />
                    </div>
                    <p className="text-xs text-brand-tan mt-0.5">{product.category?.name || "Uncategorized"}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-sm font-semibold text-brand-brown">{m.priceLabel}</span>
                      <span className="text-brand-tan/40">·</span>
                      <span className={`text-xs font-medium ${m.stockTone}`}>{m.totalStock} in stock</span>
                      <Pill tone={product.isPublished ? "green" : "gray"} className="ml-auto">{product.isPublished ? "Live" : "Draft"}</Pill>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
