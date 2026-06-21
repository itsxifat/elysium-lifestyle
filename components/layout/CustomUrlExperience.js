"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useCustomCampaign } from "@/hooks/useCustomCampaign";
import { shouldUnoptimizeImage } from "@/lib/utils";

// Reads the ?cu=<code> suffix and renders the campaign's top banner + pop-up
// modal on whatever storefront page the visitor landed on. (Highlighted products
// are rendered by the shop listing itself.)
export default function CustomUrlExperience() {
  const searchParams = useSearchParams();
  const code = searchParams.get("cu");
  const campaign = useCustomCampaign(code);
  const [showModal, setShowModal] = useState(false);

  const banner = campaign?.banner;
  const modal = campaign?.modal;

  // Show the modal once per browser session per campaign.
  useEffect(() => {
    if (!modal || !campaign?.code) return;
    const key = `cu-modal-${campaign.code}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* sessionStorage may be unavailable */ }
    setShowModal(true);
  }, [modal, campaign?.code]);

  if (!campaign) return null;

  const bannerInner = banner?.text ? (
    <div
      className="text-center text-[12px] md:text-[13px] font-medium px-4 py-2.5"
      style={{ background: banner.bgColor || "#B85C3A", color: banner.textColor || "#FFFFFF" }}
    >
      {banner.text}
    </div>
  ) : null;

  return (
    <>
      {/* Top offer banner */}
      {bannerInner && (
        banner.link
          ? <Link href={banner.link} className="block hover:opacity-95 transition-opacity">{bannerInner}</Link>
          : bannerInner
      )}

      {/* Pop-up modal */}
      {showModal && modal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-brand-brown/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)}>
          <div
            className="relative bg-brand-cream w-full max-w-md rounded-lg shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-2.5 right-2.5 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
              aria-label="Close"
            >
              <X size={16} />
            </button>

            {modal.type === "image" && modal.image && (
              <div className="relative w-full aspect-[4/3] bg-brand-cream-dark">
                <Image src={modal.image} alt={modal.title || ""} fill className="object-cover" unoptimized={shouldUnoptimizeImage(modal.image)} sizes="(max-width: 480px) 100vw, 448px" />
              </div>
            )}

            <div className="p-6 text-center">
              {modal.title && <h3 className="text-lg font-bold text-brand-brown mb-2">{modal.title}</h3>}
              {modal.text && <p className="text-[14px] text-brand-tan leading-relaxed whitespace-pre-line">{modal.text}</p>}
              {modal.ctaText && (
                modal.ctaLink ? (
                  <Link href={modal.ctaLink} onClick={() => setShowModal(false)} className="btn-primary inline-block mt-5 px-6 py-2.5 text-xs">
                    {modal.ctaText}
                  </Link>
                ) : (
                  <button onClick={() => setShowModal(false)} className="btn-primary mt-5 px-6 py-2.5 text-xs">
                    {modal.ctaText}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
