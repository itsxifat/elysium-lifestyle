"use client";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";

const Input = forwardRef(function Input(
  { label, error, className, type = "text", ...props },
  ref
) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-brand-brown mb-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        type={type}
        className={cn(
          "w-full border bg-white px-4 py-3 text-brand-brown placeholder-brand-tan focus:outline-none transition-colors duration-200 text-sm",
          error
            ? "border-red-400 focus:border-red-500"
            : "border-brand-tan focus:border-brand-terracotta",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});

export default Input;
