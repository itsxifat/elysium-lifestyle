import Link from "next/link";

function splitHeadline(headline) {
  const trimmed = (headline || "").trim();
  const lastSpace = trimmed.lastIndexOf(" ");
  if (lastSpace === -1) return { main: "", highlight: trimmed };
  return { main: trimmed.slice(0, lastSpace), highlight: trimmed.slice(lastSpace + 1) };
}

export default function PromoBanner({ promoBanner }) {
  if (!promoBanner?.enabled) return null;

  const { main, highlight } = splitHeadline(promoBanner.headline);

  return (
    <section className="relative overflow-hidden bg-[#1E0E08]">
      {promoBanner.decorativeText && (
        <div className="absolute right-0 top-1/2 -translate-y-1/2 select-none pointer-events-none hidden md:block">
          <span className="text-[220px] font-display font-bold text-white/[0.03] leading-none pr-8">
            {promoBanner.decorativeText}
          </span>
        </div>
      )}

      <div className="container-custom relative py-20 md:py-24">
        <div className="max-w-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-px bg-brand-terracotta" />
            <p className="text-brand-terracotta text-[10px] uppercase tracking-[4px] font-medium">
              Limited Time
            </p>
          </div>

          <h2 className="font-display text-5xl md:text-7xl font-semibold text-white leading-[1] mb-4">
            {main && <>{main}<br /></>}
            <span className="text-brand-terracotta">{highlight}</span>
          </h2>

          {promoBanner.subtext && (
            <p className="text-white/50 text-base md:text-lg mb-3 leading-relaxed">
              {promoBanner.subtext}
            </p>
          )}

          {promoBanner.note && (
            <p className="text-white/30 text-[12px] tracking-wide mb-8">
              {promoBanner.note}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {promoBanner.primaryLabel && promoBanner.primaryHref && (
              <Link
                href={promoBanner.primaryHref}
                className="inline-block bg-brand-terracotta text-white px-8 py-4 uppercase text-[11px] font-bold tracking-[3px] hover:bg-brand-terracotta-dark transition-colors duration-200"
              >
                {promoBanner.primaryLabel}
              </Link>
            )}
            {promoBanner.secondaryLabel && promoBanner.secondaryHref && (
              <Link
                href={promoBanner.secondaryHref}
                className="inline-block border border-white/20 text-white/70 px-8 py-4 uppercase text-[11px] tracking-[3px] hover:border-white/50 hover:text-white transition-all duration-200"
              >
                {promoBanner.secondaryLabel}
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
