"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronRight, X } from "lucide-react";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];

function buildTree(cats, parentId = null) {
  return cats
    .filter((c) => String(c.parent || "") === String(parentId || ""))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    .map((c) => ({ ...c, children: buildTree(cats, c._id) }));
}

function FilterGroup({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-brand-tan/20 py-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-sm font-semibold text-brand-brown uppercase tracking-wider"
      >
        {title}
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

function CatNode({ cat, depth, current, onPick }) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = cat.children?.length > 0;
  const active = current === cat.slug;
  return (
    <div>
      <div className="flex items-center" style={{ paddingLeft: depth * 10 }}>
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="p-0.5 text-brand-tan hover:text-brand-brown">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[18px] flex-shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onPick(cat.slug)}
          className={`flex-1 text-left text-[13px] py-1 transition-colors ${active ? "text-brand-terracotta font-semibold" : "text-brand-brown hover:text-brand-terracotta"}`}
        >
          {cat.name}
        </button>
      </div>
      {hasChildren && open && cat.children.map((ch) => (
        <CatNode key={ch._id} cat={ch} depth={depth + 1} current={current} onPick={onPick} />
      ))}
    </div>
  );
}

export default function FilterSidebar({ categories = [], onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tree = buildTree(categories);

  const updateParam = (key, value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    onClose?.();
  };

  const toggleParam = (key, value) => {
    const current = searchParams.get(key);
    updateParam(key, current === value ? null : value);
  };

  const pickCategory = (slug) => {
    const current = searchParams.get("category");
    updateParam("category", current === slug ? null : slug);
  };

  const clearAll = () => {
    router.push(pathname);
    onClose?.();
  };

  const currentCategory = searchParams.get("category");
  const currentSize = searchParams.get("size");
  const currentMinPrice = searchParams.get("minPrice");
  const currentMaxPrice = searchParams.get("maxPrice");
  const hasFilters = currentCategory || currentSize || currentMinPrice || currentMaxPrice;

  return (
    <div className="bg-brand-cream">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-brand-brown uppercase tracking-wider">Filters</h3>
        {hasFilters && (
          <button onClick={clearAll} className="text-xs text-brand-terracotta hover:underline flex items-center gap-1">
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Categories (tree) */}
      <FilterGroup title="Categories">
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => updateParam("category", null)}
            className={`text-[13px] py-1 ${!currentCategory ? "text-brand-terracotta font-semibold" : "text-brand-tan hover:text-brand-brown"}`}
          >
            All Products
          </button>
          {tree.map((cat) => (
            <CatNode key={cat._id} cat={cat} depth={0} current={currentCategory} onPick={pickCategory} />
          ))}
          {tree.length === 0 && <p className="text-[12px] text-brand-tan/60">No categories yet.</p>}
        </div>
      </FilterGroup>

      {/* Size */}
      <FilterGroup title="Size">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((size) => (
            <button
              key={size}
              onClick={() => toggleParam("size", size)}
              className={`px-3 py-1.5 text-xs border font-medium transition-colors ${
                currentSize === size ? "bg-brand-brown text-brand-cream border-brand-brown" : "border-brand-tan text-brand-brown hover:border-brand-brown"
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </FilterGroup>

      {/* Price */}
      <FilterGroup title="Price Range">
        <div className="space-y-3">
          {[
            { label: "Under Tk 500", min: "", max: "500" },
            { label: "Tk 500 – Tk 1000", min: "500", max: "1000" },
            { label: "Tk 1000 – Tk 2000", min: "1000", max: "2000" },
            { label: "Tk 2000+", min: "2000", max: "" },
          ].map((range) => {
            const isActive = currentMinPrice === range.min && currentMaxPrice === range.max;
            return (
              <label key={range.label} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="price"
                  checked={isActive}
                  onChange={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    if (isActive) {
                      params.delete("minPrice");
                      params.delete("maxPrice");
                    } else {
                      if (range.min) params.set("minPrice", range.min);
                      else params.delete("minPrice");
                      if (range.max) params.set("maxPrice", range.max);
                      else params.delete("maxPrice");
                    }
                    params.set("page", "1");
                    router.push(`${pathname}?${params.toString()}`);
                  }}
                  className="accent-brand-terracotta"
                />
                <span className="text-sm text-brand-brown group-hover:text-brand-terracotta transition-colors">{range.label}</span>
              </label>
            );
          })}
        </div>
      </FilterGroup>

      {/* On Sale / New Arrivals */}
      <FilterGroup title="Special" defaultOpen={false}>
        <div className="space-y-2">
          {[
            { key: "onSale", label: "On Sale" },
            { key: "newArrival", label: "New Arrivals" },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={searchParams.get(item.key) === "true"}
                onChange={() => {
                  const current = searchParams.get(item.key);
                  updateParam(item.key, current === "true" ? null : "true");
                }}
                className="accent-brand-terracotta"
              />
              <span className="text-sm text-brand-brown group-hover:text-brand-terracotta transition-colors">{item.label}</span>
            </label>
          ))}
        </div>
      </FilterGroup>
    </div>
  );
}
