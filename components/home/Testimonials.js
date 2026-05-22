"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/pagination";
import { Star, Quote } from "lucide-react";

function getInitials(name) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export default function Testimonials({ testimonials = [] }) {
  if (testimonials.length === 0) return null;

  return (
    <section className="py-20 bg-brand-cream overflow-hidden">
      <div className="container-custom">
        <div className="text-center mb-14">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="w-12 h-px bg-brand-tan/40" />
            <p className="section-subtitle">What People Say</p>
            <div className="w-12 h-px bg-brand-tan/40" />
          </div>
          <h2 className="section-title">Customer Stories</h2>
        </div>

        <Swiper
          modules={[Autoplay, Pagination]}
          autoplay={{ delay: 4500, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          spaceBetween={24}
          slidesPerView={1}
          breakpoints={{
            768: { slidesPerView: 2 },
            1024: { slidesPerView: 3 },
          }}
          className="pb-12"
        >
          {testimonials.map((t, i) => (
            <SwiperSlide key={t._id || i}>
              <div className="bg-white border border-brand-tan/15 p-8 flex flex-col h-full relative overflow-hidden group hover:border-brand-tan/30 transition-colors duration-300">
                <div className="absolute top-5 right-6 text-brand-cream-dark">
                  <Quote size={48} strokeWidth={1} className="fill-brand-cream-dark text-brand-cream-dark" />
                </div>

                <div className="flex gap-0.5 mb-5">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      size={14}
                      className={j < (t.rating || 5) ? "fill-brand-terracotta text-brand-terracotta" : "text-brand-tan/30 fill-brand-tan/30"}
                    />
                  ))}
                </div>

                <p className="text-brand-brown/70 text-[13px] leading-relaxed flex-1 mb-7 relative z-10">
                  &ldquo;{t.text}&rdquo;
                </p>

                <div className="flex items-center gap-3 pt-5 border-t border-brand-tan/10">
                  <div className="w-10 h-10 bg-brand-brown flex items-center justify-center text-brand-cream font-bold text-[12px] flex-shrink-0 tracking-wide">
                    {getInitials(t.name)}
                  </div>
                  <div>
                    <p className="font-semibold text-brand-brown text-[13px]">{t.name}</p>
                    <p className="text-brand-tan text-[11px] mt-0.5">{t.location} · Verified Purchase</p>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
}
