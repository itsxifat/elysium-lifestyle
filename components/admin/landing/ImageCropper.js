"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, Crop, Check, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/admin/ui";

// A self-contained crop + downscale tool shown after an image is chosen, before
// it uploads. No external library (the strict CSP blocks CDN scripts): the crop
// box is plain pointer maths and the output is produced with a <canvas>.
//
// Two ways out: "Use original" uploads the file untouched, "Apply" exports the
// selected region, downscaled so the long edge never exceeds MAX_EDGE — which
// doubles as the "resize" the spec asks for even when you don't crop.

const MAX_EDGE = 1600;
const HANDLE = 14; // px hit area for a corner

const ASPECTS = [
  { label: "Free", value: 0 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// A centred crop box of the given aspect that fits inside w×h.
function centeredBox(w, h, aspect) {
  if (!aspect) return { x: 0, y: 0, w, h };
  let bw = w;
  let bh = w / aspect;
  if (bh > h) {
    bh = h;
    bw = h * aspect;
  }
  return { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh };
}

export default function ImageCropper({ file, onCancel, onDone }) {
  const url = useRef(null);
  if (!url.current) url.current = URL.createObjectURL(file);
  useEffect(() => () => URL.revokeObjectURL(url.current), []);

  const imgRef = useRef(null);
  const stageRef = useRef(null);
  const drag = useRef(null);

  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [disp, setDisp] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState(null);
  const [aspect, setAspect] = useState(0);
  const [busy, setBusy] = useState(false);

  const fitDisplay = useCallback((iw, ih) => {
    // Fit within the stage width and a sensible max height.
    const maxW = stageRef.current?.clientWidth || 460;
    const maxH = 420;
    const scale = Math.min(1, maxW / iw, maxH / ih);
    return { w: Math.round(iw * scale), h: Math.round(ih * scale) };
  }, []);

  function onImgLoad(e) {
    const iw = e.target.naturalWidth;
    const ih = e.target.naturalHeight;
    const d = fitDisplay(iw, ih);
    setNat({ w: iw, h: ih });
    setDisp(d);
    setCrop({ x: 0, y: 0, w: d.w, h: d.h });
  }

  function applyAspect(a) {
    setAspect(a);
    setCrop(centeredBox(disp.w, disp.h, a));
  }

  function reset() {
    setAspect(0);
    setCrop({ x: 0, y: 0, w: disp.w, h: disp.h });
  }

  // ── Drag / resize ──────────────────────────────────────────────────────────
  const onPointerDown = (mode, corner) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, corner, startX: e.clientX, startY: e.clientY, box: { ...crop } };
  };

  const onPointerMove = useCallback(
    (e) => {
      if (!drag.current) return;
      const { mode, corner, startX, startY, box } = drag.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (mode === "move") {
        setCrop({
          ...box,
          x: clamp(box.x + dx, 0, disp.w - box.w),
          y: clamp(box.y + dy, 0, disp.h - box.h),
        });
        return;
      }

      // Resize from a corner: the OPPOSITE corner stays fixed.
      const right = box.x + box.w;
      const bottom = box.y + box.h;
      let nx = box.x;
      let ny = box.y;
      let nw = box.w;
      let nh = box.h;
      const MIN = 32;

      const movingLeft = corner === "nw" || corner === "sw";
      const movingTop = corner === "nw" || corner === "ne";

      if (movingLeft) {
        nx = clamp(box.x + dx, 0, right - MIN);
        nw = right - nx;
      } else {
        nw = clamp(box.w + dx, MIN, disp.w - box.x);
      }
      if (movingTop) {
        ny = clamp(box.y + dy, 0, bottom - MIN);
        nh = bottom - ny;
      } else {
        nh = clamp(box.h + dy, MIN, disp.h - box.y);
      }

      if (aspect) {
        // Keep ratio: derive height from width, then re-anchor if it overflowed.
        nh = nw / aspect;
        if (movingTop) ny = bottom - nh;
        if (ny < 0 || nh > disp.h) {
          nh = movingTop ? bottom : disp.h - box.y;
          nw = nh * aspect;
          if (movingLeft) nx = right - nw;
        }
      }

      setCrop({ x: nx, y: ny, w: nw, h: nh });
    },
    [aspect, disp]
  );

  const onPointerUp = useCallback(() => {
    drag.current = null;
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  // ── Export ───────────────────────────────────────────────────────────────
  async function apply() {
    if (!crop || !nat.w) return;
    setBusy(true);
    try {
      const sx = (crop.x / disp.w) * nat.w;
      const sy = (crop.y / disp.h) * nat.h;
      const sw = (crop.w / disp.w) * nat.w;
      const sh = (crop.h / disp.h) * nat.h;

      // Downscale so the long edge ≤ MAX_EDGE (this is the "resize").
      let ow = sw;
      let oh = sh;
      const long = Math.max(ow, oh);
      if (long > MAX_EDGE) {
        const k = MAX_EDGE / long;
        ow = Math.round(ow * k);
        oh = Math.round(oh * k);
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(ow));
      canvas.height = Math.max(1, Math.round(oh));
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("Could not process image");
      const name = (file.name || "image").replace(/\.[^.]+$/, "") + ".jpg";
      await onDone(new File([blob], name, { type: "image/jpeg" }));
    } finally {
      setBusy(false);
    }
  }

  const corners = ["nw", "ne", "sw", "se"];
  const cornerStyle = (c) => ({
    left: c === "nw" || c === "sw" ? -HANDLE / 2 : "auto",
    right: c === "ne" || c === "se" ? -HANDLE / 2 : "auto",
    top: c === "nw" || c === "ne" ? -HANDLE / 2 : "auto",
    bottom: c === "sw" || c === "se" ? -HANDLE / 2 : "auto",
    cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize",
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-brand-tan/15">
          <div className="flex items-center gap-2 text-brand-brown font-semibold text-[14px]">
            <Crop size={15} /> Crop &amp; resize
          </div>
          <button onClick={onCancel} className="text-brand-tan hover:text-brand-brown">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          {/* Aspect presets */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {ASPECTS.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => applyAspect(a.value)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                  aspect === a.value ? "bg-brand-terracotta text-white" : "bg-brand-cream-dark/70 text-brand-brown hover:bg-brand-cream-dark"
                }`}
              >
                {a.label}
              </button>
            ))}
            <button type="button" onClick={reset} className="ml-auto flex items-center gap-1 text-[12px] text-brand-tan hover:text-brand-brown">
              <RotateCcw size={12} /> Reset
            </button>
          </div>

          {/* Stage */}
          <div ref={stageRef} className="flex justify-center bg-brand-cream/40 rounded-lg overflow-hidden select-none">
            <div className="relative" style={{ width: disp.w || "auto", height: disp.h || "auto", touchAction: "none" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={url.current}
                alt=""
                onLoad={onImgLoad}
                draggable={false}
                className="block max-w-none"
                style={{ width: disp.w || "auto", height: disp.h || "auto" }}
              />
              {crop && (
                <>
                  {/* dim outside the crop with four bands */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute bg-black/45" style={{ left: 0, top: 0, width: "100%", height: crop.y }} />
                    <div className="absolute bg-black/45" style={{ left: 0, top: crop.y + crop.h, width: "100%", bottom: 0 }} />
                    <div className="absolute bg-black/45" style={{ left: 0, top: crop.y, width: crop.x, height: crop.h }} />
                    <div className="absolute bg-black/45" style={{ left: crop.x + crop.w, top: crop.y, right: 0, height: crop.h }} />
                  </div>
                  {/* crop rectangle */}
                  <div
                    className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                    style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, cursor: "move", touchAction: "none" }}
                    onPointerDown={onPointerDown("move")}
                  >
                    {corners.map((c) => (
                      <span
                        key={c}
                        onPointerDown={onPointerDown("resize", c)}
                        className="absolute bg-white border border-brand-terracotta rounded-sm"
                        style={{ width: HANDLE, height: HANDLE, ...cornerStyle(c), touchAction: "none" }}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="text-[11px] text-brand-tan mt-2 text-center">
            Drag the box to crop. Large images are automatically shrunk to {MAX_EDGE}px.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-brand-tan/15 bg-brand-cream/30">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="outline" size="sm" onClick={() => onDone(file)} disabled={busy}>
            Use original
          </Button>
          <Button size="sm" onClick={apply} disabled={busy || !crop}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
