"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, Sparkles } from "lucide-react";
import ProductCard from "@/components/shop/ProductCard";
import FilterSidebar from "@/components/shop/FilterSidebar";
import Pagination from "@/components/shop/Pagination";
import Spinner from "@/components/ui/Spinner";
import { useCustomCampaign } from "@/hooks/useCustomCampaign";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
];

function ShopContent() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [categories, setCategories] = useState([]);

  const page = parseInt(searchParams.get("page") || "1");
  const sort = searchParams.get("sort") || "newest";

  // Custom-URL (?cu=) highlighted products, pinned above the listing.
  const campaign = useCustomCampaign(searchParams.get("cu"));
  const highlights = campaign?.highlightProducts || [];

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams(searchParams.toString());
    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchParams]);

  const categorySlug = searchParams.get("category");
  const searchQuery = searchParams.get("search");
  const activeCat = categories.find((c) => c.slug === categorySlug);
  const title = activeCat ? activeCat.name : searchQuery ? `“${searchQuery}”` : "All Products";

  return (
    <div className="container-custom py-10">
      {/* Page header */}
      <div className="mb-8">
        <p className="section-subtitle mb-1">Shop</p>
        <h1 className="section-title">{title}</h1>
      </div>

      {/* Highlighted products from a custom URL (?cu=) — pinned on top. */}
      {highlights.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-brand-terracotta/30">
            <Sparkles size={16} className="text-brand-terracotta" />
            <h2 className="text-sm font-semibold uppercase tracking-[2px] text-brand-terracotta">Featured</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {highlights.map((product) => (
              <ProductCard key={`hl-${product._id}`} product={product} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-8">
        {/* Desktop Filter sidebar */}
        <aside className="hidden lg:block w-60 flex-shrink-0">
          <FilterSidebar categories={categories} />
        </aside>

        {/* Products area */}
        <div className="flex-1 min-w-0">
          {/* Sort bar */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-brand-tan/20">
            <p className="text-sm text-brand-tan">
              {total} product{total !== 1 ? "s" : ""}
            </p>
            <div className="flex items-center gap-3">
              {/* Mobile filter toggle */}
              <button
                className="lg:hidden flex items-center gap-2 text-sm text-brand-brown border border-brand-tan px-3 py-2 hover:border-brand-brown transition-colors"
                onClick={() => setMobileFilterOpen(true)}
              >
                <SlidersHorizontal size={14} />
                Filter
              </button>

              {/* Sort */}
              <select
                value={sort}
                onChange={(e) => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("sort", e.target.value);
                  url.searchParams.set("page", "1");
                  window.location.href = url.toString();
                }}
                className="border border-brand-tan bg-white text-brand-brown text-sm px-3 py-2 focus:outline-none focus:border-brand-terracotta"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Products grid */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-brand-tan text-lg">No products found</p>
              <p className="text-brand-tan/60 text-sm mt-2">
                Try adjusting your filters
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {products.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
            </div>
          )}

          <Pagination page={page} totalPages={totalPages} />
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-brand-brown/50"
            onClick={() => setMobileFilterOpen(false)}
          />
          <div className="absolute left-0 top-0 bottom-0 w-80 bg-brand-cream p-6 overflow-y-auto animate-slide-in-left">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-brown uppercase text-sm tracking-wider">
                Filters
              </h3>
              <button onClick={() => setMobileFilterOpen(false)}>
                <X size={20} className="text-brand-tan" />
              </button>
            </div>
            <FilterSidebar categories={categories} onClose={() => setMobileFilterOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Spinner size="lg" /></div>}>
      <ShopContent />
    </Suspense>
  );
}
