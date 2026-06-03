"use client";

import { useState, useCallback, useRef } from "react";
import Image from "next/image";
import Cropper from "react-easy-crop";
import { Camera, X, Check, ZoomIn, ZoomOut } from "lucide-react";
import toast from "react-hot-toast";
import { shouldUnoptimizeImage } from "@/lib/utils";

async function getCroppedBlob(imageSrc, croppedAreaPixels) {
  const image = await new Promise((resolve, reject) => {
    const img = new window.Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", reject);
    img.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  const size = 400;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();

  ctx.drawImage(
    image,
    croppedAreaPixels.x, croppedAreaPixels.y,
    croppedAreaPixels.width, croppedAreaPixels.height,
    0, 0, size, size
  );

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

export default function AvatarUpload({ currentImage, name, onUpdate }) {
  const fileRef = useRef(null);
  const [rawSrc, setRawSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_, pixels) => setCroppedAreaPixels(pixels), []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setRawSrc(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(rawSrc, croppedAreaPixels);
      const form = new FormData();
      form.append("file", blob, "avatar.jpg");
      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || "Upload failed");

      const profileRes = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: uploadData.url }),
      });
      if (!profileRes.ok) throw new Error("Profile update failed");

      onUpdate(uploadData.url);
      setRawSrc(null);
      toast.success("Profile picture updated");
    } catch (err) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const initials = name?.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";

  return (
    <>
      {/* Avatar button */}
      <div className="relative inline-block group">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative w-20 h-20 rounded-full overflow-hidden ring-2 ring-brand-tan/20 hover:ring-brand-terracotta/40 transition-all"
        >
          {currentImage ? (
            <Image src={currentImage} alt={name || ""} fill className="object-cover" unoptimized={shouldUnoptimizeImage(currentImage)} />
          ) : (
            <div className="w-full h-full bg-brand-brown flex items-center justify-center text-brand-cream text-xl font-semibold">
              {initials}
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera size={18} className="text-white" strokeWidth={1.5} />
          </div>
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="absolute -bottom-1 -right-1 w-6 h-6 bg-brand-terracotta rounded-full flex items-center justify-center shadow"
        >
          <Camera size={11} className="text-white" strokeWidth={2} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {/* Crop modal */}
      {rawSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-sm">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-brand-tan/20">
              <p className="text-[13px] font-medium text-brand-brown">Crop Profile Picture</p>
              <button onClick={() => setRawSrc(null)} className="text-brand-tan hover:text-brand-brown transition-colors">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>

            {/* Cropper */}
            <div className="relative w-full" style={{ height: 300, background: "#111" }}>
              <Cropper
                image={rawSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>

            {/* Zoom slider */}
            <div className="px-5 py-4 border-b border-brand-tan/10">
              <div className="flex items-center gap-3">
                <ZoomOut size={14} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
                <input
                  type="range"
                  min={1} max={3} step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-brand-terracotta h-1 cursor-pointer"
                />
                <ZoomIn size={14} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-5 py-4">
              <button
                onClick={() => setRawSrc(null)}
                className="flex-1 border border-brand-tan/30 text-brand-brown py-2.5 text-[12px] uppercase tracking-wider hover:bg-brand-cream transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1 bg-brand-brown text-brand-cream py-2.5 text-[12px] uppercase tracking-wider hover:bg-brand-terracotta transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? "Saving…" : <><Check size={13} strokeWidth={2} /> Apply</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
