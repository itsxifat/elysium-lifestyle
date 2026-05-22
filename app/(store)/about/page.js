export const metadata = {
  title: "About Us — Elysium Lifestyle",
  description: "Learn about Elysium Lifestyle — our story, values, and commitment to premium fashion for Bangladesh.",
};

const VALUES = [
  {
    title: "Quality First",
    desc: "Every piece in our collection is carefully selected and quality-checked before it reaches your wardrobe. We believe great fashion should last.",
  },
  {
    title: "Timeless Design",
    desc: "We curate styles that transcend seasons — classic silhouettes with a modern sensibility that works for every occasion.",
  },
  {
    title: "Inclusive Fashion",
    desc: "From toddlers to adults, Elysium dresses every member of the family with the same commitment to style, comfort, and quality.",
  },
  {
    title: "Rooted in Bangladesh",
    desc: "Proudly Bangladeshi, we understand our customer's lifestyle, climate, and taste. Every collection is designed with you in mind.",
  },
];

const STATS = [
  { value: "5,000+", label: "Happy Customers" },
  { value: "500+", label: "Products" },
  { value: "64", label: "Districts Served" },
  { value: "2022", label: "Founded" },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-[#1E0E08] py-24 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none opacity-[0.03]">
          <span className="text-[160px] md:text-[200px] font-display font-bold text-white leading-none whitespace-nowrap">
            ELYSIUM
          </span>
        </div>
        <div className="container-custom relative text-center">
          <p className="text-brand-terracotta text-[10px] uppercase tracking-[4px] mb-5">Our Story</p>
          <h1 className="font-display text-5xl md:text-7xl font-semibold text-white leading-tight mb-6">
            Dressed for
            <br />
            <span className="text-brand-cream/50">every moment.</span>
          </h1>
          <p className="text-white/45 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Elysium Lifestyle was born from a simple belief — that everyone deserves to look and feel their best, every single day.
          </p>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 bg-white">
        <div className="container-custom">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20 items-center max-w-5xl mx-auto">
            <div>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-6 h-px bg-brand-tan" />
                <p className="text-brand-tan text-[10px] uppercase tracking-[3px]">Who We Are</p>
              </div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-brown mb-5 leading-tight">
                Premium fashion,<br />made for Bangladesh.
              </h2>
              <div className="space-y-4 text-brand-tan text-[14px] leading-relaxed">
                <p>
                  Elysium Lifestyle started as a passion project — a small team of fashion enthusiasts in Dhaka who believed that quality, stylish clothing shouldn&apos;t be a luxury reserved for the few.
                </p>
                <p>
                  We&apos;ve built our brand around the idea that great fashion tells a story. Every fabric, every cut, and every stitch is chosen with intention — to help our customers feel confident and express their unique identity.
                </p>
                <p>
                  Today, we deliver across all 64 districts of Bangladesh, serving thousands of customers who trust us to curate their wardrobe with care.
                </p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              {STATS.map(({ value, label }) => (
                <div key={label} className="bg-brand-cream border border-brand-tan/15 p-6 text-center">
                  <p className="font-display text-4xl font-bold text-brand-brown mb-1">{value}</p>
                  <p className="text-brand-tan text-[11px] uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-brand-cream">
        <div className="container-custom">
          <div className="text-center mb-14">
            <div className="flex items-center justify-center gap-4 mb-4">
              <div className="w-10 h-px bg-brand-tan/40" />
              <p className="text-brand-tan text-[10px] uppercase tracking-[3px]">What We Stand For</p>
              <div className="w-10 h-px bg-brand-tan/40" />
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-brand-brown">Our Values</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {VALUES.map(({ title, desc }, i) => (
              <div key={title} className="bg-white border border-brand-tan/15 p-7">
                <div className="w-9 h-9 bg-brand-terracotta/10 flex items-center justify-center mb-5">
                  <span className="font-display text-lg font-bold text-brand-terracotta">0{i + 1}</span>
                </div>
                <h3 className="font-semibold text-brand-brown text-[15px] mb-3">{title}</h3>
                <p className="text-brand-tan text-[13px] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white">
        <div className="container-custom text-center">
          <h2 className="font-display text-3xl font-semibold text-brand-brown mb-4">
            Ready to explore?
          </h2>
          <p className="text-brand-tan text-[14px] mb-8 max-w-md mx-auto">
            Discover our latest collections and find pieces that speak to your style.
          </p>
          <a href="/shop" className="btn-primary">
            Shop the Collection
          </a>
        </div>
      </section>
    </>
  );
}
