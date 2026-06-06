import { Truck, Wallet, RotateCcw, ShieldCheck } from "lucide-react";

// Trust / value strip shown right under the hero. Adds the "premium store" feel
// and stays visible even when product sections are sparse.
const ITEMS = [
  { icon: Truck, title: "Fast Delivery", sub: "Nationwide shipping" },
  { icon: Wallet, title: "Cash on Delivery", sub: "Pay when you receive" },
  { icon: RotateCcw, title: "Easy Returns", sub: "7-day return policy" },
  { icon: ShieldCheck, title: "100% Authentic", sub: "Guaranteed quality" },
];

export default function ValueProps() {
  return (
    <section className="bg-white border-y border-brand-tan/15">
      <div className="container-custom">
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-y-6 py-7 sm:py-8 divide-y divide-brand-tan/10 sm:divide-y-0 lg:divide-x lg:divide-brand-tan/10">
          {ITEMS.map((it, i) => (
            <li
              key={it.title}
              className={`flex items-center gap-3 justify-center lg:justify-start px-3 sm:px-6 ${i >= 2 ? "pt-6 sm:pt-0" : ""}`}
            >
              <span className="w-11 h-11 rounded-full bg-brand-cream flex items-center justify-center flex-shrink-0 text-brand-terracotta">
                <it.icon size={19} strokeWidth={1.6} />
              </span>
              <span>
                <span className="block text-[12.5px] sm:text-sm font-semibold text-brand-brown leading-tight">
                  {it.title}
                </span>
                <span className="block text-[10.5px] sm:text-[11px] text-brand-tan mt-0.5">
                  {it.sub}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
