"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.5;
const DOUBLE_TAP_MS = 300;

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function touchDistance(touches) {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export default function ImageGallery({ images = [], name }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false);

  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const touchStartRef = useRef(null);
  const lastTapRef = useRef(0);

  const displayImages = images.length > 0 ? images : [];
  const src = displayImages[activeIndex];

  const resetZoom = useCallback(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    setInteracting(false);
    dragRef.current = null;
    pinchRef.current = null;
  }, []);

  const openViewer = useCallback((index = activeIndex, nextZoom = MIN_ZOOM) => {
    setActiveIndex(index);
    setViewerOpen(true);
    setZoom(clampZoom(nextZoom));
    setPan({ x: 0, y: 0 });
    setInteracting(false);
  }, [activeIndex]);

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    resetZoom();
  }, [resetZoom]);

  const switchImage = useCallback((i) => {
    setActiveIndex(i);
    resetZoom();
  }, [resetZoom]);

  const moveImage = useCallback((direction) => {
    if (displayImages.length <= 1) return;
    setActiveIndex((current) => (current + direction + displayImages.length) % displayImages.length);
    resetZoom();
  }, [displayImages.length, resetZoom]);

  const zoomBy = useCallback((amount) => {
    setZoom((current) => clampZoom(current + amount));
  }, []);

  const toggleZoom = useCallback(() => {
    if (zoom > MIN_ZOOM) {
      resetZoom();
      return;
    }
    setZoom(2.5);
  }, [resetZoom, zoom]);

  useEffect(() => {
    if (zoom <= MIN_ZOOM) {
      setPan({ x: 0, y: 0 });
    }
  }, [zoom]);

  useEffect(() => {
    if (activeIndex >= displayImages.length) {
      setActiveIndex(0);
      resetZoom();
    }
  }, [activeIndex, displayImages.length, resetZoom]);

  useEffect(() => {
    if (!viewerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(e) {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft") moveImage(-1);
      if (e.key === "ArrowRight") moveImage(1);
      if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      if (e.key === "-") zoomBy(-ZOOM_STEP);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeViewer, moveImage, viewerOpen, zoomBy]);

  const handleViewerWheel = useCallback((e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  }, [zoomBy]);

  const handleMouseDown = useCallback((e) => {
    if (zoom <= MIN_ZOOM || e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      pan,
    };
    setInteracting(true);
  }, [pan, zoom]);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    setPan({
      x: dragRef.current.pan.x + dx,
      y: dragRef.current.pan.y + dy,
    });
  }, []);

  const stopMousePan = useCallback(() => {
    dragRef.current = null;
    setInteracting(false);
  }, []);

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      pinchRef.current = {
        distance: touchDistance(e.touches),
        zoom,
      };
      dragRef.current = null;
      setInteracting(true);
      return;
    }

    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };

    if (zoom > MIN_ZOOM) {
      dragRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        pan,
      };
      setInteracting(true);
    }
  }, [pan, zoom]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const nextZoom = pinchRef.current.zoom * (touchDistance(e.touches) / pinchRef.current.distance);
      setZoom(clampZoom(nextZoom));
      return;
    }

    if (e.touches.length !== 1 || !dragRef.current || zoom <= MIN_ZOOM) return;

    e.preventDefault();
    const touch = e.touches[0];
    const dx = touch.clientX - dragRef.current.x;
    const dy = touch.clientY - dragRef.current.y;
    setPan({
      x: dragRef.current.pan.x + dx,
      y: dragRef.current.pan.y + dy,
    });
  }, [zoom]);

  const handleTouchEnd = useCallback((e) => {
    if (pinchRef.current) {
      if (e.touches.length < 2) {
        pinchRef.current = null;
        setInteracting(false);
      }
      return;
    }

    const started = touchStartRef.current;
    touchStartRef.current = null;
    dragRef.current = null;
    setInteracting(false);

    if (!started || !e.changedTouches.length) return;

    const touch = e.changedTouches[0];
    const moved = Math.hypot(touch.clientX - started.x, touch.clientY - started.y);
    const duration = Date.now() - started.time;
    if (moved > 8 || duration > 260) return;

    const now = Date.now();
    if (now - lastTapRef.current <= DOUBLE_TAP_MS) {
      e.preventDefault();
      lastTapRef.current = 0;
      toggleZoom();
      return;
    }
    lastTapRef.current = now;
  }, [toggleZoom]);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={!src}
        onClick={() => src && openViewer(activeIndex)}
        onDoubleClick={() => src && openViewer(activeIndex, 2.5)}
        className={[
          "relative block w-full overflow-hidden select-none bg-brand-cream-dark text-left",
          "h-[min(60vh,480px)]",
          "md:h-auto md:aspect-[3/4]",
          src ? "cursor-zoom-in focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-brown" : "cursor-default",
        ].join(" ")}
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        {src ? (
          <Image
            src={src}
            alt={name}
            fill
            priority
            unoptimized={shouldUnoptimizeImage(src)}
            sizes="(max-width: 768px) 100vw, 55vw"
            draggable={false}
            className="object-cover pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-brand-tan/40 text-sm">
            No image
          </div>
        )}

        {src && (
          <div className="absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center border border-white/50 bg-white/80 text-brand-brown/60 backdrop-blur-sm pointer-events-none">
            <Maximize2 size={13} strokeWidth={1.5} />
          </div>
        )}

        {displayImages.length > 1 && (
          <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-sm text-brand-brown/60 text-[10px] tracking-wider px-2 py-1 pointer-events-none">
            {activeIndex + 1} / {displayImages.length}
          </div>
        )}
      </button>

      {displayImages.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {displayImages.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => switchImage(i)}
              style={{ WebkitTapHighlightColor: "transparent" }}
              className={[
                "relative flex-shrink-0 w-[72px] h-[90px] overflow-hidden bg-brand-cream-dark transition-all duration-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-brown",
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
                draggable={false}
                className="object-cover"
                sizes="80px"
              />
            </button>
          ))}
        </div>
      )}

      {viewerOpen && src && (
        <div className="fixed inset-0 z-[70] bg-black text-white">
          <div className="absolute left-4 top-4 z-20 bg-white/10 px-2.5 py-1 text-[11px] tracking-wider text-white/80 backdrop-blur-sm">
            {activeIndex + 1} / {displayImages.length}
          </div>

          <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
            <button
              type="button"
              title="Zoom out"
              aria-label="Zoom out"
              onClick={() => zoomBy(-ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-35"
            >
              <Minus size={17} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              title="Zoom in"
              aria-label="Zoom in"
              onClick={() => zoomBy(ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-35"
            >
              <Plus size={17} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              title="Close"
              aria-label="Close gallery"
              onClick={closeViewer}
              className="flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20"
            >
              <X size={18} strokeWidth={1.7} />
            </button>
          </div>

          {displayImages.length > 1 && (
            <>
              <button
                type="button"
                title="Previous image"
                aria-label="Previous image"
                onClick={() => moveImage(-1)}
                className="absolute left-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/15 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 md:left-5"
              >
                <ChevronLeft size={22} strokeWidth={1.7} />
              </button>
              <button
                type="button"
                title="Next image"
                aria-label="Next image"
                onClick={() => moveImage(1)}
                className="absolute right-3 top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-white/15 bg-white/10 text-white backdrop-blur-sm transition hover:bg-white/20 md:right-5"
              >
                <ChevronRight size={22} strokeWidth={1.7} />
              </button>
            </>
          )}

          <div
            className="absolute inset-0 flex items-center justify-center overflow-hidden px-4 py-16 md:px-16"
            style={{ touchAction: "none", cursor: zoom > MIN_ZOOM ? "grab" : "zoom-in" }}
            onDoubleClick={toggleZoom}
            onWheel={handleViewerWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={stopMousePan}
            onMouseLeave={stopMousePan}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div
              className="relative h-full w-full"
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                transition: interacting ? "none" : "transform 160ms ease",
                willChange: "transform",
              }}
            >
              <Image
                src={src}
                alt={name}
                fill
                priority
                unoptimized={shouldUnoptimizeImage(src)}
                sizes="100vw"
                draggable={false}
                className="object-contain pointer-events-none"
              />
            </div>
          </div>

          {displayImages.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100vw-24px)] -translate-x-1/2 gap-2 overflow-x-auto px-1 pb-1">
              {displayImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  title={`${name} view ${i + 1}`}
                  aria-label={`${name} view ${i + 1}`}
                  onClick={() => switchImage(i)}
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  className={[
                    "relative h-16 w-12 flex-shrink-0 overflow-hidden border bg-white/10 transition focus:outline-none focus-visible:ring-1 focus-visible:ring-white md:h-20 md:w-16",
                    activeIndex === i
                      ? "border-white opacity-100"
                      : "border-white/20 opacity-55 hover:opacity-100",
                  ].join(" ")}
                >
                  <Image
                    src={img}
                    alt={`${name} view ${i + 1}`}
                    fill
                    unoptimized={shouldUnoptimizeImage(img)}
                    draggable={false}
                    className="object-cover"
                    sizes="64px"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
