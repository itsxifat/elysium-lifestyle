import { cn, formatPrice } from "@/lib/utils";

// The regular ("was") price, struck through beside what a shopper pays now: the
// ERP's `compareAt` (M39b, D-640). Screen readers hear "Regular price Tk 1,800"
// rather than a bare second figure.
export default function WasPrice({ amount, className }) {
  if (!(amount > 0)) return null;
  return (
    <s data-testid="price-was" className={cn("text-brand-tan tabular-nums", className)}>
      <span className="sr-only">Regular price </span>
      {formatPrice(amount)}
    </s>
  );
}
