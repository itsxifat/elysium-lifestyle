"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
const GENDERS = [
  { value: "men", label: "Men" },
  { value: "women", label: "Women" },
  { value: "kids", label: "Kids" },
];

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

export default function FilterSidebar({ categories = [], onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = (key, value) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    onClose?.();
  };

  const toggleParam = (key, value) => {
    const current = searchParams.get(key);
    updateParam(key, current === value ? null : value);
  };

  const clearAll = () => {
    router.push(pathname);
    onClose?.();
  };

  const currentGender = searchParams.get("gender");
  const currentSize = searchParams.get("size");
  const currentMinPrice = searchParams.get("minPrice");
  const currentMaxPrice = searchParams.get("maxPrice");
  const hasFilters = currentGender || currentSize || currentMinPrice || currentMaxPrice;

  return (
    <div className="bg-brand-cream">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-brand-brown uppercase tracking-wider">
          Filters
        </h3>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs text-brand-terracotta hover:underline flex items-center gap-1"
          >
            <X size={12} /> Clear all
          </button>
        )}
      </div>

      {/* Gender */}
      <FilterGroup title="Category">
        <div className="space-y-2">
          {GENDERS.map((g) => (
            <label key={g.value} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="gender"
                checked={currentGender === g.value}
                onChange={() => toggleParam("gender", g.value)}
                className="accent-brand-terracotta"
              />
              <span className="text-sm text-brand-brown group-hover:text-brand-terracotta transition-colors">
                {g.label}
              </span>
            </label>
          ))}
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
                currentSize === size
                  ? "bg-brand-brown text-brand-cream border-brand-brown"
                  : "border-brand-tan text-brand-brown hover:border-brand-brown"
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
            { label: "Under ৳500", min: "", max: "500" },
            { label: "৳500 – ৳1000", min: "500", max: "1000" },
            { label: "৳1000 – ৳2000", min: "1000", max: "2000" },
            { label: "৳2000+", min: "2000", max: "" },
          ].map((range) => {
            const isActive =
              currentMinPrice === range.min && currentMaxPrice === range.max;
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
                <span className="text-sm text-brand-brown group-hover:text-brand-terracotta transition-colors">
                  {range.label}
                </span>
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
              <span className="text-sm text-brand-brown group-hover:text-brand-terracotta transition-colors">
                {item.label}
              </span>
            </label>
          ))}
        </div>
      </FilterGroup>
    </div>
  );
}
