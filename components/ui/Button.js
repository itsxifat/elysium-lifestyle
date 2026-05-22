import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-brand-terracotta text-white hover:bg-brand-terracotta-dark",
  outline: "border border-brand-brown text-brand-brown hover:bg-brand-brown hover:text-brand-cream",
  ghost: "text-brand-brown hover:text-brand-terracotta hover:bg-brand-cream-dark",
  danger: "bg-red-600 text-white hover:bg-red-700",
  light: "bg-brand-cream text-brand-brown border border-brand-tan hover:bg-brand-cream-dark",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-6 py-3 text-sm",
  lg: "px-8 py-4 text-base",
};

export default function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  disabled,
  loading,
  ...props
}) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium tracking-wide uppercase transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {children}
        </span>
      ) : children}
    </button>
  );
}
