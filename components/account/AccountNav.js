"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { User, Package, LogOut } from "lucide-react";
import Image from "next/image";

const navItems = [
  { href: "/account", label: "Profile", icon: User },
  { href: "/account/orders", label: "Orders", icon: Package },
];

export default function AccountNav({ name, email, initials, image }) {
  const path = usePathname();

  return (
    <div className="bg-white p-6 flex flex-col gap-6">
      <div className="flex items-center gap-4 pb-6 border-b border-stone-100">
        <div className="w-11 h-11 rounded-full shrink-0 overflow-hidden bg-brand-brown flex items-center justify-center text-brand-cream text-sm font-semibold relative">
          {image ? (
            <Image src={image} alt={name || ""} fill className="object-cover" unoptimized />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-brand-brown truncate">{name}</p>
          <p className="text-[11px] text-brand-tan mt-0.5 truncate">{email}</p>
        </div>
      </div>

      <nav className="space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 text-[13px] transition-all border-l-[1.5px]
                ${active
                  ? "border-brand-terracotta text-brand-brown font-medium bg-brand-cream/60"
                  : "border-transparent text-brand-tan hover:text-brand-brown hover:bg-brand-cream/30"
                }`}
            >
              <Icon size={14} strokeWidth={active ? 2 : 1.5} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="pt-2 border-t border-stone-100">
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-3 px-3 py-2.5 text-[13px] text-brand-tan hover:text-red-400 transition-colors w-full"
        >
          <LogOut size={14} strokeWidth={1.5} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
