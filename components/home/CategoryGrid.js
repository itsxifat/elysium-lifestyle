import Link from "next/link";
import Image from "next/image";

function CategoryCard({ cat, className = "", priority = false, size = "md" }) {
  const href =
    cat.gender && !cat.parent
      ? `/shop?gender=${cat.gender}`
      : `/shop?category=${cat.slug}`;

  return (
    <Link href={href} className={`group relative overflow-hidden flex flex-col ${className}`}>
      {/* Dark brand background is always visible — image loads on top */}
      <div className="absolute inset-0 bg-brand-brown" />

      {/* Optional texture gradient when no image */}
      {!cat.image && (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-brown via-[#3d2216] to-brand-terracotta/70" />
      )}

      {/* Image — only when available */}
      {cat.image && (
        <Image
          src={cat.image}
          alt={cat.name}
          fill
          priority={priority}
          unoptimized
          className="object-cover transition-transform duration-700 ease-out will-change-transform group-hover:scale-[1.04]"
          sizes="(max-width: 768px) 100vw, 50vw"
        />
      )}

      {/* Gradient overlay — always rendered so text is always legible */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />

      {/* Text content */}
      <div className="relative mt-auto p-6 md:p-8 translate-y-1 group-hover:translate-y-0 transition-transform duration-500 ease-out">
        {cat.description && (
          <p className="text-[10px] uppercase tracking-[3px] text-white/0 group-hover:text-white/55 transition-colors duration-300 mb-2">
            {cat.description}
          </p>
        )}
        <h3
          className={`font-display font-light text-white leading-none mb-4 ${
            size === "lg" ? "text-4xl md:text-5xl" : "text-3xl md:text-[2.2rem]"
          }`}
        >
          {cat.name}
        </h3>
        <div className="flex items-center gap-3">
          <span className="block h-px bg-white/50 w-4 group-hover:w-8 transition-all duration-500 ease-out" />
          <span className="text-[9px] uppercase tracking-[4px] text-white/50 group-hover:text-white/90 transition-colors duration-300">
            Explore
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function CategoryGrid({ categories = [] }) {
  if (categories.length === 0) return null;

  return (
    <section className="py-16 md:py-20 bg-brand-cream">
      <div className="container-custom">

        {/* Section label */}
        <div className="flex items-center gap-3 mb-8 md:mb-10">
          <span className="block w-[3px] h-4 bg-brand-terracotta flex-shrink-0" />
          <p className="text-[10px] uppercase tracking-[4px] text-brand-tan font-medium">
            Collections
          </p>
        </div>

        {/* 3-panel asymmetric editorial layout */}
        {categories.length >= 3 ? (
          <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-2 md:gap-2.5">
            {/* Big featured card — left */}
            <div className="aspect-[4/5] md:aspect-auto md:h-[640px]">
              <CategoryCard
                cat={categories[0]}
                className="w-full h-full"
                priority
                size="lg"
              />
            </div>
            {/* Two stacked — right */}
            <div className="grid grid-rows-[1fr_1fr] gap-2 md:gap-2.5 md:h-[640px]">
              <CategoryCard cat={categories[1]} className="w-full h-full" size="md" />
              <CategoryCard cat={categories[2]} className="w-full h-full" size="md" />
            </div>
          </div>
        ) : categories.length === 2 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-2.5">
            {categories.map((cat, i) => (
              <div key={cat._id || i} className="aspect-[3/4]">
                <CategoryCard cat={cat} className="w-full h-full" priority={i === 0} size="lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="aspect-[16/7]">
            <CategoryCard cat={categories[0]} className="w-full h-full" priority size="lg" />
          </div>
        )}
      </div>
    </section>
  );
}
