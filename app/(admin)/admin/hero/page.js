"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Trash2, Plus, MoveUp, MoveDown, Upload, Monitor, Smartphone, ImageOff, Layers } from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";
import { PageHeader, Button } from "@/components/admin/ui";

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Serialize slides for dirty-checking, ignoring the client-only _uid.
const serialize = (arr) => JSON.stringify(arr.map(({ _uid, ...s }) => s));

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

function deleteFromCDN(url) {
  return fetch("/api/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => {});
}

function ImageUploadZone({ url, preview, className, sizes, onSelect, onClear }) {
  const fileRef = useRef(null);
  const src = preview || url;

  return (
    <div className={`group relative overflow-hidden border border-brand-tan/25 bg-brand-cream/40 ${className}`}>
      {src ? (
        <>
          {preview ? (
            // Local, not-yet-uploaded file — plain <img> (blob URL).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <Image src={url} alt="" fill sizes={sizes} className="object-cover" unoptimized={shouldUnoptimizeImage(url)} />
          )}

          {preview && (
            <span className="absolute top-1.5 left-1.5 z-10 bg-brand-terracotta text-white text-[9px] uppercase tracking-wider px-1.5 py-0.5">
              Not saved
            </span>
          )}

          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-brand-brown/0 group-hover:bg-brand-brown/55 transition-colors">
            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="bg-white/95 text-brand-brown px-3 py-1.5 text-[11px] uppercase tracking-wider hover:bg-white transition-colors"
              >
                Replace
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
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-2 text-brand-tan hover:text-brand-brown hover:bg-brand-cream/70 transition-colors"
        >
          <Upload size={18} strokeWidth={1.5} />
          <span className="text-[11px] uppercase tracking-wider">Upload</span>
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function AdminHeroPage() {
  const [slides, setSlides] = useState([]);
  const [pending, setPending] = useState({}); // `${_uid}_${type}` -> { file, preview }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savedSnapshot = useRef("[]");
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  useEffect(() => {
    fetch("/api/admin/hero")
      .then((r) => r.json())
      .then((data) => {
        const arr = (data.heroSlides || []).map((s) => ({
          _uid: uid(),
          imageDesktop: s.imageDesktop || "",
          imageMobile: s.imageMobile || "",
          href: s.href || "/",
        }));
        setSlides(arr);
        savedSnapshot.current = serialize(arr);
      })
      .catch(() => toast.error("Failed to load slides"))
      .finally(() => setLoading(false));
    // Revoke any leftover preview URLs when leaving the page.
    return () => Object.values(pendingRef.current).forEach((p) => URL.revokeObjectURL(p.preview));
  }, []);

  const dirty = serialize(slides) !== savedSnapshot.current || Object.keys(pending).length > 0;
  const fieldOf = (type) => (type === "desktop" ? "imageDesktop" : "imageMobile");

  const addSlide = () => setSlides((prev) => [...prev, { _uid: uid(), imageDesktop: "", imageMobile: "", href: "/" }]);

  const removeSlide = (i) => {
    const s = slides[i];
    if (
      (s.imageDesktop || s.imageMobile) &&
      !window.confirm("Remove this slide? Its saved images will be deleted from the CDN when you save.")
    ) return;
    // Drop any pending previews for this slide.
    ["desktop", "mobile"].forEach((t) => {
      const p = pending[`${s._uid}_${t}`];
      if (p) URL.revokeObjectURL(p.preview);
    });
    setPending((prev) => {
      const next = { ...prev };
      delete next[`${s._uid}_desktop`];
      delete next[`${s._uid}_mobile`];
      return next;
    });
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

  // Stage a file locally — does NOT touch the CDN until Save.
  const selectImage = (slideUid, type, file) => {
    const preview = URL.createObjectURL(file);
    setPending((prev) => {
      const key = `${slideUid}_${type}`;
      if (prev[key]) URL.revokeObjectURL(prev[key].preview);
      return { ...prev, [key]: { file, preview } };
    });
  };

  const clearImage = (slideUid, type) => {
    const key = `${slideUid}_${type}`;
    if (pending[key]) URL.revokeObjectURL(pending[key].preview);
    setPending((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    // Clear any saved URL too; the server diff deletes it from the CDN on save.
    setSlides((prev) => prev.map((s) => (s._uid === slideUid ? { ...s, [fieldOf(type)]: "" } : s)));
  };

  const saveSlides = async () => {
    setSaving(true);
    const uploadedThisSave = []; // for rollback if the save fails
    try {
      // 1. Upload every staged file now.
      const urlByKey = {};
      for (const [key, { file }] of Object.entries(pending)) {
        const url = await uploadFile(file);
        uploadedThisSave.push(url);
        urlByKey[key] = url;
      }

      // 2. Build the final slides using freshly-uploaded URLs where present.
      const merged = slides.map((s) => ({
        _uid: s._uid,
        imageDesktop: urlByKey[`${s._uid}_desktop`] ?? s.imageDesktop,
        imageMobile: urlByKey[`${s._uid}_mobile`] ?? s.imageMobile,
        href: s.href || "/",
      }));

      // 3. Persist (the route deletes any images this replaced/removed).
      const res = await fetch("/api/admin/hero", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heroSlides: merged.map(({ _uid, ...s }) => s) }),
      });
      if (!res.ok) throw new Error("save failed");

      Object.values(pending).forEach((p) => URL.revokeObjectURL(p.preview));
      setPending({});
      setSlides(merged);
      savedSnapshot.current = serialize(merged);
      toast.success("Hero slides saved");
    } catch {
      // Roll back anything uploaded during this failed attempt — no orphans.
      await Promise.all(uploadedThisSave.map((url) => deleteFromCDN(url)));
      toast.error("Failed to save — no changes were kept");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-brand-tan py-10">Loading…</div>;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <PageHeader
        icon={Layers}
        title="Hero Slider"
        subtitle={`Full-width homepage banners · ${slides.length} slide${slides.length !== 1 ? "s" : ""}`}
        actions={
          <>
            {dirty && (
              <span className="text-[11px] uppercase tracking-wider text-brand-terracotta flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-terracotta animate-pulse" />
                Unsaved changes
              </span>
            )}
            <Button onClick={saveSlides} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </>
        }
      />

      {/* Compact size guidance */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 mb-6 bg-brand-cream/50 border border-brand-tan/15 text-[11px] text-brand-tan">
        <span className="font-semibold uppercase tracking-wider text-brand-brown/70">Recommended</span>
        <span className="flex items-center gap-1.5">
          <Monitor size={13} strokeWidth={1.5} /> Desktop
          <b className="text-brand-terracotta font-mono font-medium">1920×750</b>
        </span>
        <span className="flex items-center gap-1.5">
          <Smartphone size={13} strokeWidth={1.5} /> Mobile
          <b className="text-brand-terracotta font-mono font-medium">750×1000</b>
        </span>
        <span>JPEG / WebP · keep under 500&nbsp;KB</span>
      </div>

      {/* Slides */}
      {slides.length === 0 ? (
        <div className="bg-white border border-dashed border-brand-tan/30 px-6 py-14 text-center">
          <ImageOff size={30} className="text-brand-tan/40 mx-auto mb-3" strokeWidth={1} />
          <p className="text-sm font-medium text-brand-brown">No slides</p>
          <p className="text-[13px] text-brand-tan mt-1">
            The homepage hero is empty. Add a slide below{dirty ? ", then save" : ""}.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {slides.map((slide, i) => (
            <div key={slide._uid} className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)]">
              {/* Card toolbar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-tan/15 bg-brand-cream/30">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-brand-brown text-brand-cream text-[11px] font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-[11px] uppercase tracking-widest text-brand-tan font-medium">Slide</span>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveSlide(i, -1)}
                    disabled={i === 0}
                    title="Move up"
                    className="p-1.5 text-brand-tan/60 hover:text-brand-brown disabled:opacity-20 transition-colors"
                  >
                    <MoveUp size={15} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(i, 1)}
                    disabled={i === slides.length - 1}
                    title="Move down"
                    className="p-1.5 text-brand-tan/60 hover:text-brand-brown disabled:opacity-20 transition-colors"
                  >
                    <MoveDown size={15} strokeWidth={1.5} />
                  </button>
                  <div className="w-px h-4 bg-brand-tan/20 mx-1.5" />
                  <button
                    type="button"
                    onClick={() => removeSlide(i)}
                    title="Delete slide"
                    className="p-1.5 text-brand-tan/60 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Card body */}
              <div className="p-4 md:p-5">
                <div className="flex flex-col lg:flex-row gap-5">
                  {/* Desktop — shown at the real banner aspect ratio */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-brand-tan mb-2 flex items-center gap-1.5">
                      <Monitor size={11} strokeWidth={1.5} /> Desktop · 1920 × 750
                    </p>
                    <ImageUploadZone
                      url={slide.imageDesktop}
                      preview={pending[`${slide._uid}_desktop`]?.preview}
                      className="w-full aspect-[2.56/1]"
                      sizes="(max-width: 1024px) 100vw, 640px"
                      onSelect={(file) => selectImage(slide._uid, "desktop", file)}
                      onClear={() => clearImage(slide._uid, "desktop")}
                    />
                  </div>

                  {/* Mobile — portrait */}
                  <div className="lg:w-40 shrink-0">
                    <p className="text-[10px] uppercase tracking-widest text-brand-tan mb-2 flex items-center gap-1.5">
                      <Smartphone size={11} strokeWidth={1.5} /> Mobile · 750 × 1000
                    </p>
                    <ImageUploadZone
                      url={slide.imageMobile}
                      preview={pending[`${slide._uid}_mobile`]?.preview}
                      className="w-full lg:w-40 aspect-[3/4]"
                      sizes="160px"
                      onSelect={(file) => selectImage(slide._uid, "mobile", file)}
                      onClear={() => clearImage(slide._uid, "mobile")}
                    />
                    <p className="text-[10px] text-brand-tan/60 leading-relaxed mt-1.5">
                      Optional — falls back to the desktop image if empty.
                    </p>
                  </div>
                </div>

                {/* Link */}
                <div className="mt-5 pt-4 border-t border-brand-tan/10">
                  <label className="block text-[10px] uppercase tracking-widest text-brand-tan mb-1.5">
                    Click link <span className="normal-case tracking-normal opacity-60">— where this slide links to</span>
                  </label>
                  <input
                    type="text"
                    value={slide.href || ""}
                    onChange={(e) => updateSlide(i, "href", e.target.value)}
                    placeholder="/shop?gender=women"
                    className="w-full max-w-md rounded-lg border border-brand-tan/30 bg-transparent px-3 py-2.5 text-sm text-brand-brown placeholder:text-brand-tan/40 focus:outline-none focus:border-brand-brown transition-colors"
                  />
                  <p className="text-[10px] text-brand-tan/50 mt-1">Leave as “/” or empty to make the slide non-clickable</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add slide */}
      <button
        type="button"
        onClick={addSlide}
        className="mt-5 w-full flex items-center justify-center gap-2 border border-dashed border-brand-tan/40 py-4 text-[12px] uppercase tracking-widest text-brand-tan hover:text-brand-brown hover:border-brand-brown hover:bg-brand-cream/40 transition-colors"
      >
        <Plus size={15} strokeWidth={2} />
        Add Slide
      </button>
    </div>
  );
}
