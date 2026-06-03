"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ZoomIn } from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";

export default function ImageGallery({ images = [], name }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });


  const displayImages = images.length > 0 ? images : [];
  const src = displayImages[activeIndex];

  // ── Desktop: hover zoom ─────────────────────────────────────────────────────
  // Note: changing transformOrigin is instant (no CSS transition fires on it),
  // so scale animates on enter/leave but panning while zoomed is frame-perfect.
  const handleMouseEnter = useCallback(() => setZoomed(true), []);
  const handleMouseLeave = useCallback(() => {
    setZoomed(false);
    setOrigin({ x: 50, y: 50 });
  }, []);
  const handleMouseMove = useCallback((e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }, []);

  // ── Mobile: press & hold = zoom, move finger = pan, lift = zoom out ────────
  // Mirrors desktop hover exactly — origin tracks finger position directly.
  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: Math.max(0, Math.min(100, ((t.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((t.clientY - r.top) / r.height) * 100)),
    });
    setZoomed(true);
  }, []);

  const handleTouchMove = useCallback((e) => {
    const t = e.touches[0];
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin({
      x: Math.max(0, Math.min(100, ((t.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((t.clientY - r.top) / r.height) * 100)),
    });
  }, []);

  const handleTouchEnd = useCallback(() => {
    setZoomed(false);
    setOrigin({ x: 50, y: 50 });
  }, []);

  const switchImage = useCallback((i) => {
    setActiveIndex(i);
    setZoomed(false);
    setOrigin({ x: 50, y: 50 });
  }, []);

  return (
    <div className="space-y-3">
      {/* ── Main image ──────────────────────────────────────────────────────── */}
      <div
        className={[
          "relative overflow-hidden select-none bg-brand-cream-dark",
          // Mobile: fit comfortably on screen below navbar (no vh calc needed)
          "h-[min(60vh,480px)]",
          // Desktop: natural portrait ratio
          "md:h-auto md:aspect-[3/4]",
        ].join(" ")}
        style={{
          cursor: zoomed ? "zoom-out" : "zoom-in",
          // Always none so the browser never hijacks touch for scrolling
          touchAction: "none",
        }}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {src ? (
          <Image
            src={src}
            alt={name}
            fill
            priority
            unoptimized={shouldUnoptimizeImage(src)}
            sizes="(max-width: 768px) 100vw, 55vw"
            className="object-cover pointer-events-none"
            style={{
              transform: zoomed ? "scale(2.2)" : "scale(1)",
              transformOrigin: `${origin.x}% ${origin.y}%`,
              // Only the scale property transitions; origin changes are instant
              transition: "transform 0.22s ease",
              willChange: "transform",
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-brand-tan/40 text-sm">
            No image
          </div>
        )}

        {/* Zoom hint — disappears when zoomed */}
        {src && !zoomed && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/80 backdrop-blur-sm text-brand-brown/50 text-[9px] uppercase tracking-[2px] px-2.5 py-1.5 pointer-events-none">
            <ZoomIn size={10} strokeWidth={1.5} />
            <span className="hidden md:inline">Hover to zoom</span>
            <span className="md:hidden">Tap to zoom</span>
          </div>
        )}

        {/* Counter badge */}
        {displayImages.length > 1 && (
          <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-sm text-brand-brown/60 text-[10px] tracking-wider px-2 py-1 pointer-events-none">
            {activeIndex + 1} / {displayImages.length}
          </div>
        )}
      </div>

      {/* ── Thumbnails ─────────────────────────────────────────────────────── */}
      {displayImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {displayImages.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => switchImage(i)}
              className={[
                "relative flex-shrink-0 w-[72px] h-[90px] overflow-hidden bg-brand-cream-dark transition-all duration-200",
                activeIndex === i
                  ? "ring-1 ring-offset-2 ring-brand-brown"
                  : "opacity-50 hover:opacity-100",
              ].join(" ")}
            >
              <Image
                src={img}
                alt={`${name} view ${i + 1}`}
                fill
                unoptimized={shouldUnoptimizeImage(img)}
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
