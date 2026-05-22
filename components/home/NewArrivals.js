import Link from "next/link";
import ProductCard from "@/components/shop/ProductCard";

export default function NewArrivals({ products = [] }) {
  if (products.length === 0) return null;

  return (
    <section className="py-20 bg-brand-cream">
      <div className="container-custom">
        {/* Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-6 h-px bg-brand-tan" />
              <p className="section-subtitle">Just Dropped</p>
            </div>
            <h2 className="section-title">New Arrivals</h2>
          </div>
          <Link
            href="/shop?newArrival=true"
            className="hidden sm:inline-flex items-center gap-2 text-[11px] uppercase tracking-[2px] text-brand-tan hover:text-brand-terracotta transition-colors border-b border-brand-tan/30 hover:border-brand-terracotta pb-0.5"
          >
            View All
            <span>→</span>
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
          {products.slice(0, 8).map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>

        <div className="text-center mt-12">
          <Link href="/shop?newArrival=true" className="btn-primary">
            Shop New Arrivals
          </Link>
        </div>
      </div>
    </section>
  );
}
