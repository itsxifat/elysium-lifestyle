"use client";

import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import Image from "next/image";
import Link from "next/link";

// Shown only when no slides are configured in the admin
const PLACEHOLDER = [
  { imageDesktop: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1920&q=80", imageMobile: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=750&q=80", href: "/shop" },
  { imageDesktop: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1920&q=80", imageMobile: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=750&q=80", href: "/shop" },
];

export default function HeroSlider({ slides }) {
  const items = slides?.length ? slides : PLACEHOLDER;

  return (
    <section className="w-full">
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        navigation
        pagination={{ clickable: true }}
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        loop={items.length > 1}
        className="w-full"
      >
        {items.map((slide, i) => {
          const inner = (
            <>
              {/* Desktop image — 1920×750 (2.56:1) */}
              <div className="hidden md:block w-full aspect-[1920/750] relative">
                <Image
                  src={slide.imageDesktop || slide.imageMobile}
                  alt=""
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
              {/* Mobile image — 750×1000 (3:4) */}
              <div className="block md:hidden w-full aspect-[3/4] relative">
                <Image
                  src={slide.imageMobile || slide.imageDesktop}
                  alt=""
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            </>
          );

          return (
            <SwiperSlide key={i}>
              {slide.href && slide.href !== "/" ? (
                <Link href={slide.href} className="block">{inner}</Link>
              ) : (
                <div>{inner}</div>
              )}
            </SwiperSlide>
          );
        })}
      </Swiper>
    </section>
  );
}
