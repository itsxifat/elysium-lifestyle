import { cn } from "@/lib/utils";

const variants = {
  sale: "bg-brand-terracotta text-white",
  new: "bg-brand-brown text-white",
  out: "bg-brand-tan text-white",
  featured: "bg-brand-tan text-white",
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

export default function Badge({ children, variant = "sale", className }) {
  return (
    <span
      className={cn(
        "text-xs font-bold px-2 py-1 uppercase tracking-wide inline-block",
        variants[variant] || variants.sale,
        className
      )}
    >
      {children}
    </span>
  );
}
