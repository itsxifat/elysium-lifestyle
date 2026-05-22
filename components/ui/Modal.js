"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Modal({ isOpen, onClose, title, children, className }) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-brand-brown/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative bg-brand-cream w-full max-w-lg shadow-2xl animate-slide-up",
          className
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-tan/30">
          {title && (
            <h3 className="text-lg font-semibold text-brand-brown">{title}</h3>
          )}
          <button
            onClick={onClose}
            className="ml-auto text-brand-tan hover:text-brand-brown transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
