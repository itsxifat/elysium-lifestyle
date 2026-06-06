"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, ShoppingCart,
  Users, Settings, LogOut, Store, ChevronRight, Menu, X,
  Layers, FolderTree, Navigation, Truck, Ruler, TableProperties, Radio, ShieldAlert,
} from "lucide-react";
import { signOut } from "next-auth/react";

const navGroups = [
  {
    label: "Store",
    items: [
      { href: "/admin",           label: "Dashboard",  icon: LayoutDashboard, exact: true },
      { href: "/admin/products",  label: "Products",   icon: Package },
      { href: "/admin/orders",    label: "Orders",     icon: ShoppingCart },
      { href: "/admin/frauds",    label: "Fraud Check", icon: ShieldAlert },
      { href: "/admin/customers", label: "Users",      icon: Users },
    ],
  },
  {
    label: "Catalog",
    items: [
      { href: "/admin/categories",  label: "Categories",    icon: FolderTree },
      { href: "/admin/size-charts", label: "Size Charts",   icon: TableProperties },
      { href: "/admin/master-sizes",label: "Master Sizes",  icon: Ruler },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/hero",   label: "Hero Slides",   icon: Layers },
      { href: "/admin/navbar", label: "Navbar Config", icon: Navigation },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/admin/tracking", label: "Tracking",  icon: Radio },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/shipping", label: "Shipping",  icon: Truck },
      { href: "/admin/settings", label: "Settings",  icon: Settings },
    ],
  },
];

function NavItem({ item, pathname, onClick }) {
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`group flex items-center justify-between px-4 py-2.5 rounded-sm text-[13px] font-medium transition-all duration-150 ${
        isActive
          ? "bg-brand-terracotta text-white shadow-sm"
          : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex items-center gap-3">
        <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
        {item.label}
      </div>
      {isActive && <ChevronRight size={13} className="opacity-70" />}
    </Link>
  );
}

export default function AdminSidebar({ user }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-6 pt-7 pb-6 border-b border-white/[0.06]">
        <Link href="/admin" onClick={() => setMobileOpen(false)} className="block">
          <Image
            src="/logo-white.png"
            alt="Elysium"
            width={160}
            height={48}
            className="h-10 w-auto object-contain"
            priority
          />
        </Link>
        <p className="text-[9px] text-white/20 uppercase tracking-[3px] mt-3">Admin Panel</p>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="text-[9px] text-white/20 uppercase tracking-[3px] px-4 mb-2">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User + bottom */}
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-3 px-4 py-3 mb-1">
          <div className="w-9 h-9 rounded-full bg-brand-terracotta flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || "A"}
          </div>
          <div className="min-w-0">
            <p className="text-white/80 text-[12px] font-medium truncate">{user?.name || "Admin"}</p>
            <p className="text-white/25 text-[10px] truncate">{user?.email || ""}</p>
          </div>
        </div>
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-2.5 text-[12px] text-white/35 hover:text-white/70 transition-colors rounded-sm hover:bg-white/[0.04]"
        >
          <Store size={14} strokeWidth={1.5} /> View Store
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-[12px] text-white/35 hover:text-red-400 transition-colors rounded-sm hover:bg-white/[0.04] text-left"
        >
          <LogOut size={14} strokeWidth={1.5} /> Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[240px] xl:w-[260px] flex-shrink-0 bg-[#111111] flex-col h-screen sticky top-0">
        {sidebarContent}
      </aside>

      {/* Mobile topbar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-[#111111] z-40 flex items-center px-4 border-b border-white/[0.06]">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex items-center justify-center text-white/60 hover:text-white transition-colors"
        >
          <Menu size={20} strokeWidth={1.5} />
        </button>
        <div className="flex-1 flex justify-center">
          <Image
            src="/logo-white.png"
            alt="Elysium"
            width={110}
            height={36}
            className="h-7 w-auto object-contain"
          />
        </div>
        <div className="w-8 h-8 rounded-full bg-brand-terracotta flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
          {user?.name?.charAt(0)?.toUpperCase() || "A"}
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-[#111111] flex flex-col animate-slide-in-left">
            <button
              className="absolute top-4 right-4 text-white/40 hover:text-white/70 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              <X size={18} strokeWidth={1.5} />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
}
