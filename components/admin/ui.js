"use client";

import { cn } from "@/lib/utils";

// Shared admin UI kit — warm refined (brand cream/terracotta/brown).
// Small, composable primitives so every admin page is consistent, premium and
// responsive. Import what you need: PageHeader, Card, StatCard, Button, Field,
// TextInput, Select, TableWrap, EmptyState, Toolbar, Pill, SectionTitle.

export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="hidden sm:flex w-10 h-10 rounded-lg bg-brand-terracotta/10 text-brand-terracotta items-center justify-center flex-shrink-0">
            <Icon size={18} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-brand-brown tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-[13px] text-brand-tan mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function Card({ className, children, padded = true, as: Comp = "div", ...props }) {
  return (
    <Comp
      className={cn(
        "bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)]",
        padded && "p-4 sm:p-5",
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export function SectionTitle({ children, className }) {
  return (
    <h2 className={cn("text-[11px] font-semibold uppercase tracking-[1.5px] text-brand-tan mb-3", className)}>
      {children}
    </h2>
  );
}

export function StatCard({ label, value, icon: Icon, hint, accent, className }) {
  return (
    <Card className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-brand-tan font-medium truncate">{label}</p>
        <p className={cn("text-xl sm:text-2xl font-bold mt-1 text-brand-brown", accent)}>{value}</p>
        {hint && <p className="text-[11px] text-brand-tan mt-0.5 truncate">{hint}</p>}
      </div>
      {Icon && (
        <div className="w-9 h-9 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
          <Icon size={17} />
        </div>
      )}
    </Card>
  );
}

const BTN_SIZES = {
  sm: "text-[12px] px-3 py-1.5 gap-1.5",
  md: "text-[13px] px-4 py-2 gap-2",
  lg: "text-sm px-5 py-2.5 gap-2",
  icon: "p-2",
};
const BTN_VARIANTS = {
  primary: "bg-brand-terracotta text-white hover:bg-brand-terracotta-dark",
  secondary: "bg-brand-brown text-white hover:opacity-90",
  outline: "border border-brand-tan/40 text-brand-brown hover:bg-brand-cream/70",
  ghost: "text-brand-tan hover:text-brand-brown hover:bg-brand-cream/70",
  danger: "bg-red-600 text-white hover:bg-red-700",
  "danger-ghost": "text-red-500 hover:text-red-700 hover:bg-red-50",
};

export function Button({ variant = "primary", size = "md", as: Comp = "button", className, children, ...props }) {
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
        BTN_SIZES[size],
        BTN_VARIANTS[variant],
        className
      )}
      {...props}
    >
      {children}
    </Comp>
  );
}

export const inputClass =
  "w-full px-3 py-2 rounded-lg border border-brand-tan/30 bg-white text-[13px] text-brand-brown placeholder:text-brand-tan/50 focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-terracotta/15 transition-shadow";

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cn("block", className)}>
      {label && <span className="block text-[12px] font-medium text-brand-brown mb-1.5">{label}</span>}
      {children}
      {error ? (
        <span className="block text-[11px] text-red-600 mt-1">{error}</span>
      ) : (
        hint && <span className="block text-[11px] text-brand-tan mt-1">{hint}</span>
      )}
    </label>
  );
}

export function TextInput({ className, ...props }) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cn(inputClass, "appearance-none bg-no-repeat pr-9", className)} {...props}>
      {children}
    </select>
  );
}

// Horizontal-scroll wrapper so dense tables stay usable on phones.
export function TableWrap({ children, className }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <div className="min-w-[560px]">{children}</div>
    </div>
  );
}

export function Toolbar({ children, className }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
}

const PILL_TONES = {
  gray: "bg-brand-cream-dark text-brand-tan",
  brown: "bg-brand-brown/10 text-brand-brown",
  terracotta: "bg-brand-terracotta/12 text-brand-terracotta",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
};

export function Pill({ tone = "gray", children, className }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide", PILL_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, hint, action, className }) {
  return (
    <div className={cn("text-center py-14 px-4", className)}>
      {Icon && <Icon size={30} className="mx-auto text-brand-tan/40 mb-3" strokeWidth={1.5} />}
      <p className="text-brand-brown font-medium">{title}</p>
      {hint && <p className="text-[13px] text-brand-tan mt-1 max-w-sm mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
