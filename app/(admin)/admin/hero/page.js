"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Trash2, Plus, MoveUp, MoveDown, Upload, Monitor, Smartphone } from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

function ImageUploadZone({ image, uploading, containerClass, onUpload, onClear }) {
  const fileRef = useRef(null);

  return (
    <div className={`relative overflow-hidden border border-brand-tan/20 bg-brand-cream/40 ${containerClass}`}>
      {image ? (
        <>
          <Image src={image} alt="" fill className="object-cover" unoptimized={shouldUnoptimizeImage(image)} />
          <div className="absolute inset-0 bg-black/0 hover:bg-black/50 transition-colors group flex items-center justify-center">
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="bg-white text-brand-brown px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-brand-cream transition-colors disabled:opacity-60"
              >
                {uploading ? "Uploading…" : "Replace"}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="bg-red-500 text-white px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-red-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 text-brand-tan hover:text-brand-brown hover:bg-brand-cream/60 transition-colors disabled:opacity-60"
        >
          {uploading ? (
            <div className="w-5 h-5 border-2 border-brand-tan/30 border-t-brand-terracotta rounded-full animate-spin" />
          ) : (
            <>
              <Upload size={18} strokeWidth={1.5} />
              <span className="text-[11px] uppercase tracking-wider">Upload Image</span>
            </>
          )}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
    </div>
  );
}

export default function AdminHeroPage() {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({});

  useEffect(() => {
    fetch("/api/admin/hero")
      .then((r) => r.json())
      .then((data) => setSlides(data.heroSlides || []))
      .catch(() => toast.error("Failed to load slides"))
      .finally(() => setLoading(false));
  }, []);

  const addSlide = () => {
    setSlides((prev) => [...prev, { imageDesktop: "", imageMobile: "", href: "/" }]);
  };

  const removeSlide = (i) => {
    setSlides((prev) => prev.filter((_, idx) => idx !== i));
  };

  const moveSlide = (i, dir) => {
    setSlides((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const updateSlide = (i, field, value) => {
    setSlides((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };

  const handleImageUpload = async (i, type, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const key = `${i}_${type}`;
    setUploading((prev) => ({ ...prev, [key]: true }));
    try {
      const url = await uploadFile(file);
      updateSlide(i, type === "desktop" ? "imageDesktop" : "imageMobile", url);
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
      e.target.value = "";
    }
  };

  const saveSlides = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/hero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroSlides: slides }),
      });
      if (res.ok) toast.success("Hero slides saved!");
      else toast.error("Failed to save");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-brand-tan py-10">Loading…</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Hero Slider</h1>
          <p className="text-sm text-brand-tan mt-1">Manage the full-width banner images on the homepage</p>
        </div>
        <button
          onClick={saveSlides}
          disabled={saving || slides.length === 0}
          className="btn-primary text-[11px] tracking-[2px] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Size guidance */}
      <div className="bg-white border border-brand-tan/20 p-4 mb-6">
        <p className="text-[10px] uppercase tracking-[2px] text-brand-tan mb-3 font-medium">Required Image Sizes</p>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-9 h-9 bg-brand-cream flex items-center justify-center flex-shrink-0">
              <Monitor size={16} className="text-brand-tan" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-brand-brown">Desktop / Tablet</p>
              <p className="text-[12px] text-brand-terracotta font-mono mt-0.5">1920 × 750 px</p>
              <p className="text-[11px] text-brand-tan mt-0.5">Aspect ratio 2.56:1 (landscape banner)</p>
            </div>
          </div>
          <div className="w-px bg-brand-tan/15 hidden sm:block" />
          <div className="flex items-start gap-3 flex-1">
            <div className="w-9 h-9 bg-brand-cream flex items-center justify-center flex-shrink-0">
              <Smartphone size={16} className="text-brand-tan" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-[12px] font-semibold text-brand-brown">Mobile</p>
              <p className="text-[12px] text-brand-terracotta font-mono mt-0.5">750 × 1000 px</p>
              <p className="text-[11px] text-brand-tan mt-0.5">Aspect ratio 3:4 (portrait banner)</p>
            </div>
          </div>
          <div className="w-px bg-brand-tan/15 hidden sm:block" />
          <div className="flex items-start gap-3 flex-1">
            <div className="w-9 h-9 bg-brand-cream flex items-center justify-center flex-shrink-0">
              <span className="text-brand-tan text-[11px] font-bold">jpg</span>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-brand-brown">Format</p>
              <p className="text-[12px] text-brand-tan mt-0.5">JPEG or WebP recommended</p>
              <p className="text-[11px] text-brand-tan mt-0.5">Keep under 500 KB for fast load</p>
            </div>
          </div>
        </div>
      </div>

      {/* Slides list */}
      <div className="space-y-4">
        {slides.length === 0 && (
          <div className="bg-white border border-dashed border-brand-tan/30 p-10 text-center">
            <Monitor size={28} className="text-brand-tan/40 mx-auto mb-3" strokeWidth={1} />
            <p className="text-sm text-brand-tan">No slides yet. Add your first slide below.</p>
          </div>
        )}

        {slides.map((slide, i) => (
          <div key={i} className="bg-white border border-brand-tan/20 p-5">
            {/* Slide header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 bg-brand-cream text-brand-tan text-[11px] font-bold flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-[11px] uppercase tracking-widest text-brand-tan font-medium">Slide {i + 1}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveSlide(i, -1)}
                  disabled={i === 0}
                  title="Move up"
                  className="p-1.5 text-brand-tan/50 hover:text-brand-brown disabled:opacity-20 transition-colors"
                >
                  <MoveUp size={15} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => moveSlide(i, 1)}
                  disabled={i === slides.length - 1}
                  title="Move down"
                  className="p-1.5 text-brand-tan/50 hover:text-brand-brown disabled:opacity-20 transition-colors"
                >
                  <MoveDown size={15} strokeWidth={1.5} />
                </button>
                <div className="w-px h-4 bg-brand-tan/20 mx-1" />
                <button
                  type="button"
                  onClick={() => removeSlide(i)}
                  title="Delete slide"
                  className="p-1.5 text-brand-tan/50 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={15} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            {/* Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Desktop */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-brand-tan mb-2 flex items-center gap-1.5">
                  <Monitor size={11} strokeWidth={1.5} /> Desktop — 1920 × 750 px
                </p>
                <ImageUploadZone
                  image={slide.imageDesktop}
                  uploading={uploading[`${i}_desktop`]}
                  containerClass="w-full h-28"
                  onUpload={(e) => handleImageUpload(i, "desktop", e)}
                  onClear={() => updateSlide(i, "imageDesktop", "")}
                />
              </div>

              {/* Mobile */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-brand-tan mb-2 flex items-center gap-1.5">
                  <Smartphone size={11} strokeWidth={1.5} /> Mobile — 750 × 1000 px
                </p>
                <div className="flex gap-3 items-start">
                  <ImageUploadZone
                    image={slide.imageMobile}
                    uploading={uploading[`${i}_mobile`]}
                    containerClass="w-20 h-28 flex-shrink-0"
                    onUpload={(e) => handleImageUpload(i, "mobile", e)}
                    onClear={() => updateSlide(i, "imageMobile", "")}
                  />
                  <p className="text-[10px] text-brand-tan/60 leading-relaxed pt-1">
                    Upload a separate portrait image optimised for phones. If left empty, the desktop image will be used on mobile.
                  </p>
                </div>
              </div>
            </div>

            {/* Link */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-brand-tan mb-1.5">
                Click link <span className="normal-case tracking-normal opacity-60">(optional — where should clicking this slide go?)</span>
              </label>
              <input
                type="text"
                value={slide.href || ""}
                onChange={(e) => updateSlide(i, "href", e.target.value)}
                placeholder="/shop?gender=women"
                className="w-full border border-brand-tan/30 bg-transparent px-3 py-2.5 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors"
              />
              <p className="text-[10px] text-brand-tan/50 mt-1">Leave as / or empty to make the slide non-clickable</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="flex items-center gap-3 mt-5">
        <button
          type="button"
          onClick={addSlide}
          className="btn-outline text-[11px] tracking-[2px] flex items-center gap-2"
        >
          <Plus size={14} strokeWidth={2} />
          Add Slide
        </button>
        {slides.length > 0 && (
          <button
            onClick={saveSlides}
            disabled={saving}
            className="btn-primary text-[11px] tracking-[2px] disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        )}
      </div>
    </div>
  );
}
