"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { ChevronDown, Star, Check } from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";
import { youtubeId } from "@/lib/landing-blocks";

// Renderers for every landing-page block except the order form (which needs the
// offer/checkout state and lives in LandingOrderForm).
//
// The same components draw the public /lp/<code> page and the admin editor's
// live preview, so what an admin arranges is literally what a customer sees.
// Theme colours arrive as the CSS variables --lp-accent / --lp-text set by the
// wrapper in LandingPageView.

const HERO_HEIGHTS = {
  small: "min-h-[280px] sm:min-h-[340px]",
  medium: "min-h-[380px] sm:min-h-[480px]",
  large: "min-h-[480px] sm:min-h-[620px]",
  full: "min-h-[85vh]",
};

const SPACING = { small: "py-4", medium: "py-10", large: "py-20" };

const ALIGN = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

// Every block sits in the same centred column so the page reads as one design.
function Section({ children, className = "", full = false }) {
  if (full) return <section className={className}>{children}</section>;
  return (
    <section className={`px-4 sm:px-6 ${className}`}>
      <div className="max-w-5xl mx-auto">{children}</div>
    </section>
  );
}

function Heading({ children, className = "" }) {
  if (!children) return null;
  return (
    <h2 className={`text-2xl sm:text-3xl font-bold tracking-tight text-[color:var(--lp-text)] ${className}`}>
      {children}
    </h2>
  );
}

function Img({ src, alt = "", ...rest }) {
  if (!src) return null;
  return <Image src={src} alt={alt} unoptimized={shouldUnoptimizeImage(src)} {...rest} />;
}

// ── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ data, onCta }) {
  const { image, mobileImage, eyebrow, title, subtitle, ctaText, align = "center", overlay = 40, height = "large" } = data;
  const hasImage = !!image || !!mobileImage;

  return (
    <section className={`relative flex flex-col justify-center ${HERO_HEIGHTS[height] || HERO_HEIGHTS.large} overflow-hidden`}>
      {hasImage && (
        <>
          {mobileImage && (
            <div className="absolute inset-0 sm:hidden">
              <Img src={mobileImage} fill className="object-cover" sizes="100vw" priority />
            </div>
          )}
          <div className={`absolute inset-0 ${mobileImage ? "hidden sm:block" : ""}`}>
            <Img src={image || mobileImage} fill className="object-cover" sizes="100vw" priority />
          </div>
          <div className="absolute inset-0 bg-black" style={{ opacity: Math.min(90, Math.max(0, overlay)) / 100 }} />
        </>
      )}

      <div className="relative px-4 sm:px-6 w-full">
        <div className={`max-w-3xl mx-auto flex flex-col gap-4 ${ALIGN[align] || ALIGN.center}`}>
          {eyebrow && (
            <span
              className="inline-block text-[11px] uppercase tracking-[3px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "var(--lp-accent)", color: "#fff" }}
            >
              {eyebrow}
            </span>
          )}
          {title && (
            <h1
              className={`text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1] ${
                hasImage ? "text-white" : "text-[color:var(--lp-text)]"
              }`}
            >
              {title}
            </h1>
          )}
          {subtitle && (
            <p className={`text-base sm:text-lg max-w-xl ${hasImage ? "text-white/85" : "text-[color:var(--lp-text)]/70"}`}>
              {subtitle}
            </p>
          )}
          {ctaText && (
            <button
              type="button"
              onClick={onCta}
              className="mt-2 px-8 py-3.5 rounded-full text-white font-semibold text-sm tracking-wide shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99]"
              style={{ background: "var(--lp-accent)" }}
            >
              {ctaText}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Text ─────────────────────────────────────────────────────────────────────
function RichText({ data }) {
  const paragraphs = String(data.body || "").split(/\n{2,}/).filter(Boolean);
  return (
    <Section className="py-10">
      <div className={data.align === "center" ? "text-center max-w-2xl mx-auto" : ""}>
        <Heading className="mb-4">{data.title}</Heading>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-[color:var(--lp-text)]/75 mb-3 whitespace-pre-line">
            {p}
          </p>
        ))}
      </div>
    </Section>
  );
}

// ── Image / Gallery ──────────────────────────────────────────────────────────
const IMG_MAXW = { small: 320, medium: 520, large: 760, full: 9999 };
const IMG_ASPECT = {
  auto: "", // natural height
  square: "aspect-square",
  landscape: "aspect-[4/3]",
  portrait: "aspect-[3/4]",
  wide: "aspect-[16/9]",
};
const IMG_JUSTIFY = { left: "justify-start", center: "justify-center", right: "justify-end" };

function SingleImage({ data }) {
  if (!data.image) return null;
  const full = data.width === "full";
  const size = data.size || "large";
  const aspect = IMG_ASPECT[data.aspect] ?? "";
  const fit = data.fit === "contain" ? "object-contain" : "object-cover";
  const rounded = data.rounded !== false && !full ? "rounded-2xl" : "";

  // "auto" shape → let the image set its own height (no fill); otherwise the
  // aspect box + object-fit crops/letterboxes it.
  const inner = aspect ? (
    <div className={`relative w-full ${aspect} overflow-hidden ${rounded}`}>
      <Img src={data.image} fill className={fit} sizes="100vw" />
    </div>
  ) : (
    <Img
      src={data.image}
      width={1600}
      height={1200}
      className={`w-full h-auto ${fit === "object-contain" ? "object-contain" : ""} ${rounded}`}
      sizes="100vw"
    />
  );

  if (full) {
    return (
      <Section full>
        {inner}
        {data.caption && <p className="text-center text-[12px] text-[color:var(--lp-text)]/50 mt-3 px-4">{data.caption}</p>}
      </Section>
    );
  }

  return (
    <Section className="py-10">
      <div className={`flex ${IMG_JUSTIFY[data.align] || "justify-center"}`}>
        <div className="w-full" style={{ maxWidth: IMG_MAXW[size] || 760 }}>
          {inner}
          {data.caption && <p className="text-center text-[12px] text-[color:var(--lp-text)]/50 mt-3">{data.caption}</p>}
        </div>
      </div>
    </Section>
  );
}

function Gallery({ data }) {
  const images = (data.images || []).filter((i) => i?.image);
  if (!images.length) return null;
  const cols = { 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" };
  return (
    <Section className="py-10">
      <Heading className="mb-6 text-center">{data.title}</Heading>
      <div className={`grid gap-3 ${cols[String(data.columns)] || cols["3"]}`}>
        {images.map((it, i) => (
          <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-black/5">
            <Img src={it.image} fill className="object-cover" sizes="(max-width: 640px) 50vw, 25vw" />
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Features ─────────────────────────────────────────────────────────────────
function Features({ data }) {
  const items = (data.items || []).filter((i) => i?.title || i?.text);
  if (!items.length) return null;
  const isGrid = data.layout !== "list";

  return (
    <Section className="py-12">
      <Heading className="mb-8 text-center">{data.title}</Heading>
      <div className={isGrid ? "grid gap-5 sm:grid-cols-2 lg:grid-cols-3" : "space-y-4 max-w-2xl mx-auto"}>
        {items.map((it, i) => (
          <div
            key={i}
            className={isGrid ? "rounded-xl border border-black/[0.07] bg-white/60 p-5" : "flex gap-3 items-start"}
          >
            <span
              className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mb-3"
              style={{ background: "var(--lp-accent)" }}
            >
              <Check size={13} strokeWidth={3} className="text-white" />
            </span>
            <div>
              {it.title && <p className="font-semibold text-[15px] text-[color:var(--lp-text)]">{it.title}</p>}
              {it.text && <p className="text-[13px] leading-relaxed text-[color:var(--lp-text)]/65 mt-1">{it.text}</p>}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Video ────────────────────────────────────────────────────────────────────
function Video({ data }) {
  const id = youtubeId(data.url);
  if (!id) return null;
  return (
    <Section className="py-10">
      <Heading className="mb-6 text-center">{data.title}</Heading>
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={data.title || "Video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 w-full h-full"
        />
      </div>
      {data.caption && <p className="text-center text-[12px] text-[color:var(--lp-text)]/50 mt-3">{data.caption}</p>}
    </Section>
  );
}

// ── Countdown ────────────────────────────────────────────────────────────────
function pad(n) {
  return String(n).padStart(2, "0");
}

function Countdown({ data }) {
  const target = data.endsAt ? new Date(data.endsAt).getTime() : 0;
  // Start at null and fill in on mount: the server has no idea what "now" is for
  // this visitor, and rendering a time on the server guarantees a hydration
  // mismatch (and a stale first paint).
  const [left, setLeft] = useState(null);

  useEffect(() => {
    if (!target) return;
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;

  const expired = left !== null && left <= 0;
  const s = Math.floor((left ?? 0) / 1000);
  const parts = [
    { label: "Days", value: Math.floor(s / 86400) },
    { label: "Hours", value: Math.floor((s % 86400) / 3600) },
    { label: "Mins", value: Math.floor((s % 3600) / 60) },
    { label: "Secs", value: s % 60 },
  ];

  return (
    <Section className="py-8">
      <div className="rounded-2xl px-6 py-8 text-center" style={{ background: "var(--lp-accent)" }}>
        {data.title && <p className="text-white/85 text-[12px] uppercase tracking-[3px] mb-4">{data.title}</p>}
        {expired ? (
          <p className="text-white font-semibold text-lg">{data.expiredText || "This offer has ended."}</p>
        ) : (
          <div className="flex justify-center gap-3 sm:gap-5">
            {parts.map((p) => (
              <div key={p.label} className="min-w-[62px] sm:min-w-[76px] rounded-xl bg-white/15 backdrop-blur px-2 py-3">
                <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
                  {left === null ? "--" : pad(p.value)}
                </p>
                <p className="text-[9px] uppercase tracking-[2px] text-white/70 mt-1">{p.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Testimonials ─────────────────────────────────────────────────────────────
function Testimonials({ data }) {
  const items = (data.items || []).filter((i) => i?.text);
  if (!items.length) return null;
  return (
    <Section className="py-12">
      <Heading className="mb-8 text-center">{data.title}</Heading>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-xl border border-black/[0.07] bg-white/60 p-5">
            <div className="flex gap-0.5 mb-3">
              {Array.from({ length: Math.min(5, Math.max(1, Number(it.rating) || 5)) }).map((_, k) => (
                <Star key={k} size={13} className="fill-amber-400 text-amber-400" />
              ))}
            </div>
            <p className="text-[13px] leading-relaxed text-[color:var(--lp-text)]/75">{it.text}</p>
            <div className="flex items-center gap-2.5 mt-4">
              {it.image ? (
                <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  <Img src={it.image} fill className="object-cover" sizes="32px" />
                </div>
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                  style={{ background: "var(--lp-accent)" }}
                >
                  {(it.name || "?").charAt(0).toUpperCase()}
                </div>
              )}
              <p className="text-[12px] font-medium text-[color:var(--lp-text)]">{it.name || "Verified buyer"}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Trust badges ─────────────────────────────────────────────────────────────
function Trust({ data }) {
  const items = (data.items || []).filter((i) => i?.text);
  if (!items.length) return null;
  return (
    <Section className="py-6">
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px] text-[color:var(--lp-text)]/70">
            <Check size={15} strokeWidth={2.5} style={{ color: "var(--lp-accent)" }} />
            {it.text}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
function Faq({ data }) {
  const items = (data.items || []).filter((i) => i?.q);
  const [open, setOpen] = useState(-1);
  if (!items.length) return null;

  return (
    <Section className="py-12">
      <Heading className="mb-6 text-center">{data.title}</Heading>
      <div className="max-w-2xl mx-auto divide-y divide-black/[0.07] border-y border-black/[0.07]">
        {items.map((it, i) => (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpen(open === i ? -1 : i)}
              className="w-full flex items-center justify-between gap-4 py-4 text-left"
              aria-expanded={open === i}
            >
              <span className="text-[14px] font-medium text-[color:var(--lp-text)]">{it.q}</span>
              <ChevronDown
                size={16}
                className={`flex-shrink-0 transition-transform text-[color:var(--lp-text)]/40 ${open === i ? "rotate-180" : ""}`}
              />
            </button>
            {open === i && (
              <p className="text-[13px] leading-relaxed text-[color:var(--lp-text)]/65 pb-4 whitespace-pre-line">{it.a}</p>
            )}
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── CTA / Order button ───────────────────────────────────────────────────────
// Scrolls to the order form. A page can carry as many of these as it likes —
// the "multiple Order Now buttons" the spec asks for.
function Cta({ data, onCta }) {
  if (!data.text) return null;
  const big = data.size !== "medium";
  const outline = data.style === "outline";
  return (
    <Section className="py-6">
      <div className={`flex flex-col ${ALIGN[data.align] || ALIGN.center}`}>
        <button
          type="button"
          onClick={onCta}
          className={`rounded-full font-semibold tracking-wide shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.99] ${
            big ? "px-9 py-4 text-[15px]" : "px-6 py-2.5 text-[13px]"
          }`}
          style={
            outline
              ? { border: "2px solid var(--lp-accent)", color: "var(--lp-accent)", background: "transparent" }
              : { background: "var(--lp-accent)", color: "#fff" }
          }
        >
          {data.text}
        </button>
        {data.note && <p className="text-[12px] text-[color:var(--lp-text)]/55 mt-2.5">{data.note}</p>}
      </div>
    </Section>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────
function Divider({ data }) {
  return (
    <div className={SPACING[data.size] || SPACING.medium}>
      {data.rule !== false && <div className="max-w-5xl mx-auto px-4 sm:px-6"><hr className="border-black/[0.08]" /></div>}
    </div>
  );
}

const RENDERERS = {
  hero: Hero,
  richtext: RichText,
  image: SingleImage,
  gallery: Gallery,
  features: Features,
  video: Video,
  countdown: Countdown,
  testimonials: Testimonials,
  trust: Trust,
  faq: Faq,
  cta: Cta,
  divider: Divider,
};

// Renders one block. The `orderform` type is not handled here — the caller swaps
// in LandingOrderForm so it can own the checkout state.
export default function Block({ block, onCta }) {
  const Renderer = RENDERERS[block.type];
  if (!Renderer) return null;
  return <Renderer data={block.data || {}} onCta={onCta} />;
}
