"use client";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const Select = forwardRef(function Select(
  { label, error, className, children, ...props },
  ref
) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-brand-brown mb-1">
          {label}
        </label>
      )}
      <select
        ref={ref}
        className={cn(
          "w-full border bg-white px-4 py-3 text-brand-brown focus:outline-none transition-colors duration-200 text-sm appearance-none cursor-pointer",
          error
            ? "border-red-400 focus:border-red-500"
            : "border-brand-tan focus:border-brand-terracotta",
          className
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});

export default Select;
