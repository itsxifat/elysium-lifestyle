import Link from "next/link";
import Image from "next/image";
import { Truck, RotateCcw, Shield, Package, MapPin, Phone, Mail } from "lucide-react";

const FacebookIcon = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon = () => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

const TikTokIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z" />
  </svg>
);

const VALUE_PROPS = [
  { icon: Truck, title: "Free Shipping", desc: "Orders over ৳1,500" },
  { icon: RotateCcw, title: "7-Day Returns", desc: "Hassle-free returns" },
  { icon: Shield, title: "Secure Payment", desc: "100% protected checkout" },
  { icon: Package, title: "Nationwide Delivery", desc: "Across Bangladesh" },
];

export default function Footer() {
  return (
    <footer>
      {/* Value propositions strip */}
      <div className="bg-brand-cream-dark border-t border-brand-tan/15">
        <div className="container-custom py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-6 gap-x-4">
            {VALUE_PROPS.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white border border-brand-tan/20 flex items-center justify-center flex-shrink-0">
                  <Icon size={17} className="text-brand-terracotta" strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-brand-brown uppercase tracking-wide">{title}</p>
                  <p className="text-[11px] text-brand-tan mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main footer */}
      <div className="bg-[#1E0E08] text-brand-cream">
        <div className="container-custom pt-14 pb-10">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">

            {/* Brand column */}
            <div className="lg:col-span-1">
              <Link href="/" className="inline-block mb-5">
                <Image
                  src="/logo-white.png"
                  alt="Elysium Lifestyle"
                  width={160}
                  height={50}
                  className="h-10 w-auto object-contain"
                />
              </Link>
              <p className="text-brand-cream/50 text-[13px] leading-relaxed mb-7 max-w-[240px]">
                Premium fashion for every lifestyle. Curated collections for men, women, and kids across Bangladesh.
              </p>
              <div className="flex items-center gap-2.5">
                {[
                  { icon: FacebookIcon, label: "Facebook" },
                  { icon: InstagramIcon, label: "Instagram" },
                  { icon: TikTokIcon, label: "TikTok" },
                ].map(({ icon: Icon, label }) => (
                  <a
                    key={label}
                    href="#"
                    aria-label={label}
                    className="w-9 h-9 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all duration-200"
                  >
                    <Icon />
                  </a>
                ))}
              </div>
            </div>

            {/* Shop */}
            <div>
              <h4 className="text-[9px] font-bold uppercase tracking-[3px] text-brand-tan/70 mb-5">Shop</h4>
              <ul className="space-y-3">
                {[
                  { label: "Women", href: "/shop?gender=women" },
                  { label: "Men", href: "/shop?gender=men" },
                  { label: "Kids", href: "/shop?gender=kids" },
                  { label: "New Arrivals", href: "/shop?newArrival=true" },
                  { label: "Sale", href: "/shop?onSale=true" },
                  { label: "All Products", href: "/shop" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-white/45 hover:text-white transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Help */}
            <div>
              <h4 className="text-[9px] font-bold uppercase tracking-[3px] text-brand-tan/70 mb-5">Help</h4>
              <ul className="space-y-3">
                {[
                  { label: "About Us", href: "/about" },
                  { label: "Track Order", href: "/account/orders" },
                  { label: "Returns & Exchanges", href: "/returns" },
                  { label: "Shipping Policy", href: "/shipping" },
                  { label: "Privacy Policy", href: "/privacy" },
                  { label: "Terms & Conditions", href: "/terms" },
                ].map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-white/45 hover:text-white transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-[9px] font-bold uppercase tracking-[3px] text-brand-tan/70 mb-5">Contact</h4>
              <ul className="space-y-4 mb-7">
                <li className="flex items-start gap-3">
                  <MapPin size={14} className="text-brand-terracotta mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-[13px] text-white/45 leading-relaxed">Dhaka, Bangladesh</span>
                </li>
                <li className="flex items-center gap-3">
                  <Phone size={14} className="text-brand-terracotta flex-shrink-0" strokeWidth={1.5} />
                  <a href="tel:+8801700000000" className="text-[13px] text-white/45 hover:text-white transition-colors">
                    +880 1700-000000
                  </a>
                </li>
                <li className="flex items-start gap-3">
                  <Mail size={14} className="text-brand-terracotta mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                  <a href="mailto:hello@elysiumlifestyle.com" className="text-[13px] text-white/45 hover:text-white transition-colors break-all">
                    hello@elysiumlifestyle.com
                  </a>
                </li>
              </ul>

              <p className="text-[9px] uppercase tracking-[2px] text-brand-tan/50 mb-3">We Accept</p>
              <div className="flex flex-wrap gap-1.5">
                {["bKash", "Nagad", "Visa", "Mastercard", "COD"].map((method) => (
                  <span
                    key={method}
                    className="text-[10px] border border-white/10 px-2.5 py-1 text-white/35 tracking-wide"
                  >
                    {method}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.06]">
          <div className="container-custom py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-[11px] text-white/25">
              © {new Date().getFullYear()} Elysium Lifestyle. All rights reserved.
            </p>
            <div className="flex items-center gap-5">
              {[
                { label: "About", href: "/about" },
                { label: "Privacy Policy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[11px] text-white/25 hover:text-white/60 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
