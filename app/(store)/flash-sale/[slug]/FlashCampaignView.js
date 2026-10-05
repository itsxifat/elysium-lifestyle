"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Zap, ArrowRight, Package, TrendingDown, Flame, SlidersHorizontal, Eye } from "lucide-react";
import { cn, shouldUnoptimizeImage } from "@/lib/utils";
import { CountdownBoxes, CountdownText } from "@/components/flash/Countdown";
import FlashDealGrid from "@/components/flash/FlashDealGrid";

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "discount", label: "Biggest discount" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "almost-gone", label: "Almost gone" },
];

// A deal with no unit limit (`remaining` null) is never "almost gone"; a sale
// that has not started has no price yet, so it sorts by the shelf price.
const left = (item) => (item.remaining === null ? Number.MAX_SAFE_INTEGER : item.remaining);
const priceOf = (item) => item.price ?? item.regularPrice ?? 0;
const COMPARE = {
  discount: (a, b) => b.maxDiscount - a.maxDiscount,
  "price-asc": (a, b) => priceOf(a) - priceOf(b),
  "price-desc": (a, b) => priceOf(b) - priceOf(a),
  "almost-gone": (a, b) => left(a) - left(b),
};

// How often a live sale re-reads what is left, while the tab is in view.
const REFRESH_MS = 45000;

// Letter sizes in wearing order, then numeric sizes ascending, then anything
// else alphabetically — so the size filter reads S M L XL, not first-seen.
const LETTER_SIZES = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL"];
function sizeKey(size) {
  const s = String(size).trim().toUpperCase();
  const letter = LETTER_SIZES.indexOf(s);
  if (letter >= 0) return [0, s === "2XL" ? LETTER_SIZES.indexOf("XXL") : s === "3XL" ? LETTER_SIZES.indexOf("XXXL") : letter, ""];
  const n = parseFloat(s);
  return Number.isFinite(n) ? [1, n, ""] : [2, 0, s];
}
function compareSizes(a, b) {
  const [ga, na, sa] = sizeKey(a);
  const [gb, nb, sb] = sizeKey(b);
  return ga - gb || na - nb || sa.localeCompare(sb);
}

function Stat({ icon: Icon, children, accent }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px]",
        accent ? "bg-brand-terracotta font-semibold" : "bg-white/12 border border-white/15"
      )}
    >
      <Icon size={12} /> {children}
    </span>
  );
}

function OtherSaleCard({ sale }) {
  const thumbs = sale.items.map((i) => i.product.images?.[0]).filter(Boolean).slice(0, 3);
  return (
    <Link
      href={`/flash-sale/${sale.slug}`}
      className="group flex items-center gap-4 bg-white rounded-xl border border-brand-tan/15 p-3 pr-4 transition-shadow hover:shadow-[0_10px_30px_-12px_rgba(44,24,16,0.25)]"
    >
      <div className="flex -space-x-3 flex-shrink-0">
        {thumbs.map((src) => (
          <div key={src} className="relative w-12 h-16 rounded-md overflow-hidden border-2 border-white bg-brand-cream-dark">
            <Image src={src} alt="" fill unoptimized={shouldUnoptimizeImage(src)} className="object-cover" sizes="48px" />
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-brand-brown truncate group-hover:text-brand-terracotta transition-colors">{sale.title}</p>
        <p className="text-[11px] text-brand-tan mt-0.5">
          {sale.stats.count} deal{sale.stats.count === 1 ? "" : "s"}
          {sale.stats.maxDiscount > 0 && <> · up to {sale.stats.maxDiscount}% off</>}
        </p>
        {sale.endsAt && (
          <p className="text-[11px] text-brand-tan mt-0.5">
            Ends in <CountdownText target={sale.endsAt} className="font-semibold text-brand-terracotta" />
          </p>
        )}
      </div>
      <ArrowRight size={16} className="text-brand-tan group-hover:text-brand-terracotta transition-colors flex-shrink-0" />
    </Link>
  );
}

export default function FlashCampaignView({ sale: initial, others = [], preview = false }) {
  const router = useRouter();
  const [sale, setSale] = useState(initial);
  const [status, setStatus] = useState(initial.status);
  const [sort, setSort] = useState("featured");
  const [size, setSize] = useState("");
  const [hideSoldOut, setHideSoldOut] = useState(false);

  // A server refresh (the sale going live) hands us a new sale.
  useEffect(() => {
    setSale(initial);
    setStatus(initial.status);
  }, [initial]);

  // Keep "X left" honest while people are buying.
  useEffect(() => {
    if (status !== "live" || preview) return;
    const id = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/flash-sale?slug=${encodeURIComponent(initial.slug)}`, { cache: "no-store" });
        const data = await res.json();
        if (data.sale) {
          setSale(data.sale);
          // Ended early (the end time moved up) — stop selling on this page too.
          if (data.sale.status !== "live") setStatus(data.sale.status);
        }
      } catch {}
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [status, preview, initial.slug]);

  // Every size any deal covers.
  const sizes = useMemo(() => {
    const seen = new Set();
    for (const it of sale.items) for (const s of it.sizes) seen.add(s.size);
    return [...seen].sort(compareSizes);
  }, [sale.items]);

  const items = useMemo(() => {
    let list = sale.items;
    if (size) list = list.filter((it) => it.sizes.some((s) => s.size === size && (s.remaining === null || s.remaining > 0 || status !== "live")));
    if (hideSoldOut) list = list.filter((it) => !it.soldOut);
    const compare = COMPARE[sort];
    const sorted = compare ? [...list].sort(compare) : [...list];
    // Whatever the order, what can still be bought comes first.
    return sorted.sort((a, b) => Number(a.soldOut) - Number(b.soldOut));
  }, [sale.items, size, hideSoldOut, sort, status]);

  const { stats } = sale;
  const mode = preview ? "preview" : status === "scheduled" ? "upcoming" : status === "live" ? "live" : "ended";

  return (
    <div className="bg-brand-cream min-h-screen">
      {preview && (
        <div className="bg-amber-100 text-amber-900 text-center text-[12px] py-2 px-4 flex items-center justify-center gap-2">
          <Eye size={14} /> Preview — this sale is switched off, so only staff can see this page.
        </div>
      )}

      {/* Hero */}
      <section className="relative isolate overflow-hidden text-white">
        {sale.bannerImage ? (
          <>
            <Image
              src={sale.bannerImage}
              alt=""
              fill
              priority
              unoptimized={shouldUnoptimizeImage(sale.bannerImage)}
              className="object-cover -z-10"
              sizes="100vw"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-r from-brand-brown/95 via-brand-brown/75 to-brand-brown/35" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-brand-brown via-[#4a2518] to-brand-terracotta" />
        )}

        <div className="container-custom py-10 sm:py-16">
          <nav className="flex items-center gap-1.5 text-[10px] uppercase tracking-[2px] text-white/55 mb-6 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/flash-sale" className="hover:text-white transition-colors">Flash Sale</Link>
            <span>/</span>
            <span className="text-white/85 normal-case tracking-normal text-[11px] truncate max-w-[200px]">{sale.title}</span>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[3px] text-brand-terracotta-light font-semibold">
                <Zap size={13} fill="currentColor" /> Flash sale
              </p>
              <h1 className="text-3xl sm:text-5xl font-bold mt-3 tracking-tight leading-[1.1]">{sale.title}</h1>
              {sale.subtitle && <p className="text-white/80 mt-3 text-[15px] max-w-2xl">{sale.subtitle}</p>}
              {sale.description && (
                <p className="text-white/65 mt-3 text-[13px] leading-relaxed max-w-2xl whitespace-pre-line">{sale.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-5">
                <Stat icon={Package}>{stats.count} deal{stats.count === 1 ? "" : "s"}</Stat>
                {stats.maxDiscount > 0 && <Stat icon={TrendingDown} accent>Up to {stats.maxDiscount}% off</Stat>}
                {status === "live" && stats.sold > 0 && <Stat icon={Flame}>{stats.sold} sold</Stat>}
              </div>
            </div>

            <div className="lg:text-right">
              {status === "live" && sale.endsAt ? (
                <>
                  <p className="text-[10px] uppercase tracking-[2px] text-white/70 mb-2">Ends in</p>
                  <CountdownBoxes target={sale.endsAt} tone="light" size="lg" onDone={() => setStatus("ended")} className="lg:justify-end" />
                </>
              ) : status === "live" ? (
                <p className="text-[12px] uppercase tracking-[2px] text-white/80">While stocks last</p>
              ) : status === "scheduled" ? (
                <>
                  <p className="text-[10px] uppercase tracking-[2px] text-white/70 mb-2">Starts in</p>
                  <CountdownBoxes target={sale.startsAt} tone="light" size="lg" onDone={() => router.refresh()} className="lg:justify-end" />
                  <p className="text-[11px] text-white/60 mt-3">Prices go live the moment the countdown ends.</p>
                </>
              ) : status === "ended" ? (
                <div>
                  <p className="text-lg font-semibold">This sale has ended</p>
                  <Link href="/flash-sale" className="inline-flex items-center gap-1.5 mt-2 text-[12px] text-brand-terracotta-light hover:text-white transition-colors">
                    See the live flash sales <ArrowRight size={13} />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="container-custom py-8 sm:py-10">
        {mode !== "ended" && (
          <>
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4 pb-4 border-b border-brand-tan/20">
              <p className="text-sm text-brand-tan">
                {items.length === sale.items.length
                  ? `${items.length} deal${items.length === 1 ? "" : "s"}`
                  : `${items.length} of ${sale.items.length} deals`}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {mode === "live" && (
                  <label className="inline-flex items-center gap-2 text-[12px] text-brand-brown cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideSoldOut}
                      onChange={(e) => setHideSoldOut(e.target.checked)}
                      className="accent-brand-terracotta w-4 h-4"
                    />
                    Hide sold out
                  </label>
                )}
                <label className="inline-flex items-center gap-2 text-[12px] text-brand-tan">
                  <SlidersHorizontal size={14} />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    aria-label="Sort deals"
                    className="border border-brand-tan/50 bg-white text-brand-brown text-[13px] px-3 py-2 focus:outline-none focus:border-brand-terracotta"
                  >
                    {SORTS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {sizes.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-6">
                <span className="text-[11px] uppercase tracking-[2px] text-brand-tan mr-1">Size</span>
                {["", ...sizes].map((s) => (
                  <button
                    key={s || "all"}
                    type="button"
                    onClick={() => setSize(s)}
                    aria-pressed={size === s}
                    className={cn(
                      "min-w-[40px] px-3 py-1.5 text-[12px] border transition-colors",
                      size === s
                        ? "bg-brand-brown border-brand-brown text-brand-cream"
                        : "bg-white border-brand-tan/30 text-brand-brown hover:border-brand-brown"
                    )}
                  >
                    {s || "All"}
                  </button>
                ))}
              </div>
            )}

            {items.length ? (
              <FlashDealGrid items={items} mode={mode} />
            ) : (
              <div className="text-center py-16">
                <p className="text-brand-brown font-medium">
                  {sale.items.length ? "No deals match these filters." : "There are no deals in this sale right now."}
                </p>
                {sale.items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setSize(""); setHideSoldOut(false); }}
                    className="mt-3 text-[12px] text-brand-terracotta hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {others.length > 0 && (
          <section className={cn(mode !== "ended" && "mt-14 pt-10 border-t border-brand-tan/15")}>
            <div className="flex items-center justify-between gap-3 mb-5">
              <h2 className="text-xl sm:text-2xl font-bold text-brand-brown">More flash sales</h2>
              <Link href="/flash-sale" className="text-[11px] uppercase tracking-[2px] text-brand-tan hover:text-brand-terracotta transition-colors inline-flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((s) => (
                <OtherSaleCard key={s._id} sale={s} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
