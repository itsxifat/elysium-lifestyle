export const dynamic = "force-dynamic";

import Link from "next/link";
import { Zap, CalendarClock, ShoppingBag } from "lucide-react";
import { getFlashSales } from "@/lib/storefront";
import FlashCampaignBlock from "@/components/flash/FlashCampaignBlock";
import UpcomingSaleCard from "@/components/flash/UpcomingSaleCard";
import { CountdownText } from "@/components/flash/Countdown";

export const metadata = {
  title: "Flash Sale",
  description: "Limited-time prices on limited stock at Elysium Lifestyle. When a deal's gone, it's gone.",
};

// Live and scheduled sales from the brand ERP (GET /storefront/v1/flash-sales).
async function getData() {
  try {
    return await getFlashSales();
  } catch (err) {
    console.error("GET /flash-sale error:", err?.code || err?.message);
    return { live: [], upcoming: [] };
  }
}

// Every live flash sale on one page, each with a two-row preview that can be
// bought from directly and a button into the campaign's own page. Campaigns
// switched on for later appear underneath as "coming soon".
export default async function FlashSaleHubPage() {
  const { live, upcoming } = await getData();
  const deals = live.reduce((n, s) => n + s.stats.count, 0);
  const maxDiscount = live.reduce((m, s) => Math.max(m, s.stats.maxDiscount), 0);

  return (
    <div className="bg-brand-cream">
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-brown text-brand-cream">
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-brand-terracotta/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-32 -left-16 w-72 h-72 rounded-full bg-brand-terracotta-light/15 blur-3xl" aria-hidden />
        <div className="container-custom relative py-12 sm:py-16">
          <nav className="flex items-center gap-1.5 text-[10px] uppercase tracking-[2px] text-brand-cream/50 mb-6">
            <Link href="/" className="hover:text-brand-cream transition-colors">Home</Link>
            <span>/</span>
            <span className="text-brand-cream/80">Flash Sale</span>
          </nav>
          <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[3px] text-brand-terracotta-light font-semibold">
            <Zap size={14} fill="currentColor" /> Flash Sale
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold mt-3 tracking-tight">Deals that won&apos;t wait</h1>
          <p className="text-brand-cream/70 mt-3 max-w-xl text-[15px]">
            Limited-time prices on limited stock. When a deal&apos;s gone, it&apos;s gone.
          </p>

          {live.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              <span className="rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-[12px]">
                {live.length} live sale{live.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-white/10 border border-white/15 px-3.5 py-1.5 text-[12px]">
                {deals} deal{deals === 1 ? "" : "s"}
              </span>
              {maxDiscount > 0 && (
                <span className="rounded-full bg-brand-terracotta px-3.5 py-1.5 text-[12px] font-semibold">Up to {maxDiscount}% off</span>
              )}
            </div>
          )}

          {/* Jump to a campaign */}
          {live.length > 1 && (
            <div className="flex gap-2 mt-8 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {live.map((s) => (
                <a
                  key={s._id}
                  href={`#${s.slug}`}
                  className="flex-shrink-0 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] border border-white/10 px-4 py-2.5 transition-colors"
                >
                  <span className="block text-[13px] font-semibold">{s.title}</span>
                  <span className="block text-[11px] text-brand-cream/60 mt-0.5">
                    {s.endsAt ? (
                      <>Ends in <CountdownText target={s.endsAt} className="text-brand-terracotta-light font-medium" /></>
                    ) : (
                      "While stocks last"
                    )}
                  </span>
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="container-custom py-10 sm:py-14 space-y-10 sm:space-y-14">
        {live.map((sale) => (
          <FlashCampaignBlock key={sale._id} sale={sale} />
        ))}

        {!live.length && (
          <div className="text-center py-14 bg-white rounded-2xl border border-brand-tan/15">
            <Zap size={32} strokeWidth={1.5} className="mx-auto text-brand-tan/40 mb-3" />
            <p className="text-lg font-semibold text-brand-brown">No flash sale running right now</p>
            <p className="text-[13px] text-brand-tan mt-1 max-w-sm mx-auto">
              {upcoming.length ? "The next one is on its way — see what's coming below." : "Check back soon — new deals drop regularly."}
            </p>
            <Link href="/shop" className="btn-outline inline-flex items-center gap-2 mt-6 text-[11px] tracking-[2px]">
              <ShoppingBag size={14} /> Browse the shop
            </Link>
          </div>
        )}

        {upcoming.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-5">
              <CalendarClock size={18} className="text-brand-terracotta" />
              <h2 className="text-xl sm:text-2xl font-bold text-brand-brown">Coming soon</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((sale) => (
                <UpcomingSaleCard key={sale._id} sale={sale} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
