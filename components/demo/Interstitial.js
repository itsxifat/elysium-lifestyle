// Shared frame for the demo's own screens. Matches the admin panel's dark
// treatment so it reads as part of Elysium, not a generic error page.
export function Interstitial({ eyebrow, title, children, actions }) {
  return (
    <div>
      <div className="w-8 h-[2px] bg-brand-terracotta mb-6" />
      <p className="text-[10px] uppercase tracking-[3px] text-white/30 mb-3">{eyebrow}</p>
      <h1 className="text-white/90 text-3xl font-display font-light leading-tight tracking-wide mb-4">
        {title}
      </h1>
      <div className="text-white/40 text-[13px] leading-relaxed space-y-3">{children}</div>
      <div className="flex flex-wrap gap-3 mt-8">{actions}</div>
    </div>
  );
}

export function DemoButton({ href, children, primary = false }) {
  const base =
    "inline-flex items-center gap-2 px-5 py-3 text-[11px] uppercase tracking-[3px] transition-colors duration-200";
  return (
    <a
      href={href}
      className={
        primary
          ? `${base} bg-brand-terracotta hover:bg-brand-terracotta-dark text-white`
          : `${base} border border-white/10 text-white/60 hover:text-white hover:border-white/25`
      }
    >
      {children}
    </a>
  );
}
