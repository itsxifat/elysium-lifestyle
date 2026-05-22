"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ShoppingBag, Search, User, Menu, X,
  ChevronRight, ChevronDown, LogOut, Package, Settings,
} from "lucide-react";
import { useCart } from "@/context/CartContext";

let _navCache = null;
let _navCacheTs = 0;

// ─── Desktop nav item ─────────────────────────────────────────────────────────

function DesktopNavItem({ item }) {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(null);
  const timer = useRef(null);
  const hasChildren = item.children?.length > 0;

  const onEnter = () => { clearTimeout(timer.current); setOpen(true); };
  const onLeave = () => { timer.current = setTimeout(() => { setOpen(false); setSubOpen(null); }, 120); };

  const linkClass = `relative flex items-center gap-1 px-3 py-2 text-[12px] uppercase tracking-[1.5px] font-medium whitespace-nowrap ${
    item.highlighted
      ? ""
      : "text-brand-brown hover:text-brand-terracotta transition-colors duration-150"
  }`;

  return (
    <div className="relative" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <Link href={item.href} className={linkClass}>
        {item.highlighted ? (
          <span
            className="animate-nav-shimmer"
            style={{
              background: "linear-gradient(to right, #B85C3A 30%, #E8956B 50%, #B85C3A 70%)",
              backgroundSize: "200% auto",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              display: "inline-block",
            }}
          >
            {item.label}
          </span>
        ) : (
          item.label
        )}
        {hasChildren && (
          <ChevronDown size={12} strokeWidth={2} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
        )}
      </Link>

      {open && hasChildren && (
        <div className="absolute top-full left-0 bg-white border border-brand-tan/15 shadow-xl min-w-[200px] py-2 z-50 animate-fade-in">
          {item.children.map((child) => {
            const hasSubs = child.children?.length > 0;
            return (
              <div
                key={child._id}
                className="relative"
                onMouseEnter={() => setSubOpen(child._id)}
                onMouseLeave={() => setSubOpen(null)}
              >
                <Link
                  href={child.href}
                  className="flex items-center justify-between px-4 py-2.5 text-[13px] text-brand-brown hover:text-brand-terracotta hover:bg-brand-cream transition-colors"
                >
                  {child.name}
                  {hasSubs && <ChevronRight size={13} strokeWidth={1.5} className="text-brand-tan" />}
                </Link>
                {hasSubs && subOpen === child._id && (
                  <div className="absolute left-full top-0 bg-white border border-brand-tan/15 shadow-xl min-w-[180px] py-2 z-50 animate-fade-in">
                    {child.children.map((gc) => (
                      <Link
                        key={gc._id}
                        href={gc.href}
                        className="block px-4 py-2.5 text-[13px] text-brand-brown hover:text-brand-terracotta hover:bg-brand-cream transition-colors"
                      >
                        {gc.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mobile nav item ──────────────────────────────────────────────────────────

function MobileNavItem({ item, onClose }) {
  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(null);
  const hasChildren = item.children?.length > 0;

  const shimmerStyle = {
    background: "linear-gradient(to right, #B85C3A 30%, #E8956B 50%, #B85C3A 70%)",
    backgroundSize: "200% auto",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    display: "inline-block",
  };

  const Label = () => item.highlighted ? (
    <span className="text-[14px] font-medium animate-nav-shimmer" style={shimmerStyle}>
      {item.label}
    </span>
  ) : (
    <span className="text-[14px] font-medium text-brand-brown">{item.label}</span>
  );

  if (!hasChildren) {
    return (
      <Link
        href={item.href}
        onClick={onClose}
        className="flex items-center justify-between py-3 border-b border-brand-tan/10"
      >
        <Label />
      </Link>
    );
  }

  return (
    <div className="border-b border-brand-tan/10">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full py-3 text-left"
      >
        <Label />
        <ChevronDown
          size={16} strokeWidth={1.5}
          className={`text-brand-tan transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="pl-3 pb-2 space-y-0.5">
          <Link href={item.href} onClick={onClose} className="block py-2 text-[13px] text-brand-tan hover:text-brand-terracotta transition-colors">
            All {item.label}
          </Link>
          {item.children.map((child) => {
            const hasSubs = child.children?.length > 0;
            return (
              <div key={child._id}>
                <button
                  onClick={() => setSubOpen(subOpen === child._id ? null : child._id)}
                  className="flex items-center justify-between w-full py-2 text-left"
                >
                  <span className="text-[13px] text-brand-brown hover:text-brand-terracotta">{child.name}</span>
                  {hasSubs && (
                    <ChevronDown size={13} strokeWidth={1.5} className={`text-brand-tan transition-transform ${subOpen === child._id ? "rotate-180" : ""}`} />
                  )}
                </button>
                {hasSubs && subOpen === child._id && (
                  <div className="pl-3 pb-1 space-y-0.5">
                    {child.children.map((gc) => (
                      <Link key={gc._id} href={gc.href} onClick={onClose} className="block py-1.5 text-[12px] text-brand-tan hover:text-brand-terracotta transition-colors">
                        {gc.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Search results list (shared desktop + mobile) ────────────────────────────

function SearchResults({ query, results, loading, onClose }) {
  const router = useRouter();

  if (!query || query.length < 2) return null;

  const goToAll = () => {
    router.push(`/shop?search=${encodeURIComponent(query.trim())}`);
    onClose();
  };

  return (
    <div className="bg-white border border-brand-tan/15 shadow-xl overflow-hidden">
      {loading ? (
        <div className="px-4 py-4 text-[12px] text-brand-tan">Searching…</div>
      ) : results.length === 0 ? (
        <div className="px-4 py-4 text-[12px] text-brand-tan">{`No products found for "${query}"`}</div>
      ) : (
        <div>
          {results.map((product) => (
            <Link
              key={product._id}
              href={`/shop/${product.slug}`}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-brand-cream transition-colors border-b border-brand-tan/5 last:border-0"
            >
              <div className="w-10 h-10 bg-brand-tan/10 flex-shrink-0 overflow-hidden">
                {product.image
                  ? <img src={product.image} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-brand-brown truncate">{product.name}</p>
                <p className="text-[11px] text-brand-tan mt-0.5">৳{product.price.toLocaleString()}</p>
              </div>
            </Link>
          ))}
          <button
            onClick={goToAll}
            className="flex items-center justify-between w-full px-4 py-3 text-[12px] text-brand-terracotta hover:bg-brand-cream/60 transition-colors border-t border-brand-tan/10"
          >
            <span>{`View all results for "${query}"`}</span>
            <ChevronRight size={13} strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────────────────────────

export default function Navbar() {
  const { itemCount, openDrawer } = useCart();
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [navItems, setNavItems] = useState([]);
  const [announcement, setAnnouncement] = useState({ enabled: true, text: "", link: "" });

  const accountRef = useRef(null);
  const headerRef = useRef(null);
  const searchInputRef = useRef(null);
  const searchTimer = useRef(null);

  // Fetch nav + announcement
  useEffect(() => {
    const now = Date.now();
    if (_navCache && now - _navCacheTs < 60_000) {
      setNavItems(_navCache.navItems || []);
      setAnnouncement(_navCache.announcement || { enabled: true, text: "", link: "" });
      return;
    }
    fetch("/api/nav")
      .then((r) => r.json())
      .then((data) => {
        _navCache = data;
        _navCacheTs = Date.now();
        setNavItems(data.navItems || []);
        setAnnouncement(data.announcement || { enabled: true, text: "", link: "" });
      })
      .catch(() => {});
  }, []);

  // Live search
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [searchQuery]);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 60);
    else { setSearchQuery(""); setSearchResults([]); }
  }, [searchOpen]);

  // Scroll shadow
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close account dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) setAccountOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close everything on route change
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      router.push(`/shop?search=${encodeURIComponent(q)}`);
      closeSearch();
    }
  };

  return (
    <>
      {/* ── Fixed header ─────────────────────────────────────────────────────── */}
      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-40 bg-brand-cream transition-shadow duration-300 ${
          isScrolled ? "shadow-md" : ""
        }`}
      >
        {/* Announcement bar */}
        {announcement.enabled && announcement.text && (
          <div className="bg-brand-brown text-brand-cream text-[10px] md:text-[11px] tracking-[0.15em] text-center py-2.5 px-4 uppercase font-light">
            {announcement.link ? (
              <Link href={announcement.link} className="hover:underline">
                {announcement.text}
              </Link>
            ) : (
              announcement.text
            )}
          </div>
        )}

        {/* Logo row */}
        <div className="border-b border-brand-tan/15 relative">
          <div className="container-custom">
            <div className="flex items-center justify-between h-[70px] md:h-[80px]">

              {/* Left — expands to fill row when desktop search is open */}
              <div className="flex items-center gap-3 min-w-0 lg:w-1/3">
                {/* Mobile hamburger */}
                <button
                  className="lg:hidden p-2 -ml-2 text-brand-brown hover:text-brand-terracotta transition-colors rounded-full hover:bg-brand-tan/10 flex-shrink-0"
                  onClick={() => setMobileOpen(true)}
                  aria-label="Open menu"
                >
                  <Menu size={22} strokeWidth={1.5} />
                </button>

                {/* Desktop: search icon when closed */}
                {!searchOpen && (
                  <button
                    className="hidden lg:flex p-2 -ml-2 text-brand-brown hover:text-brand-terracotta transition-colors rounded-full hover:bg-brand-tan/10"
                    onClick={() => setSearchOpen(true)}
                    aria-label="Search"
                  >
                    <Search size={19} strokeWidth={1.5} />
                  </button>
                )}

                {/* Desktop: expanding search form when open */}
                {searchOpen && (
                  <form
                    onSubmit={handleSearchSubmit}
                    className="hidden lg:flex flex-1 items-center gap-3 min-w-0"
                  >
                    <Search size={16} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                      placeholder="Search products…"
                      className="flex-1 min-w-0 bg-transparent text-sm text-brand-brown placeholder-brand-tan/40 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="text-brand-tan/50 hover:text-brand-brown transition-colors flex-shrink-0"
                      >
                        <X size={14} strokeWidth={2} />
                      </button>
                    )}
                    <div className="w-px h-4 bg-brand-tan/20 flex-shrink-0" />
                    <button
                      type="button"
                      onClick={closeSearch}
                      className="flex-shrink-0 text-[11px] uppercase tracking-wider text-brand-tan hover:text-brand-brown transition-colors font-medium"
                    >
                      Close
                    </button>
                  </form>
                )}
              </div>

              {/* Center logo — always visible */}
              <div className="absolute left-1/2 -translate-x-1/2 lg:static lg:translate-x-0 lg:flex lg:justify-center lg:w-1/3">
                <Link href="/" aria-label="Elysium Lifestyle">
                  <Image
                    src="/logo-black.png"
                    alt="Elysium Lifestyle"
                    width={200}
                    height={60}
                    className="h-12 md:h-14 w-auto object-contain"
                    priority
                  />
                </Link>
              </div>

              {/* Right */}
              <div className="flex items-center justify-end gap-1 md:gap-2 lg:w-1/3">
                <button
                  className="lg:hidden p-2 text-brand-brown hover:text-brand-terracotta transition-colors rounded-full hover:bg-brand-tan/10"
                  onClick={() => setSearchOpen((v) => !v)}
                  aria-label="Search"
                >
                  <Search size={20} strokeWidth={1.5} />
                </button>

                {/* Account */}
                <div className="relative" ref={accountRef}>
                  <button
                    className="p-1.5 text-brand-brown hover:text-brand-terracotta transition-colors rounded-full hover:bg-brand-tan/10"
                    onClick={() => setAccountOpen((v) => !v)}
                    aria-label="Account"
                  >
                    {session?.user?.image
                      ? <Image src={session.user.image} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover ring-1 ring-brand-tan/30" />
                      : <User size={20} strokeWidth={1.5} />}
                  </button>

                  {accountOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-brand-tan/20 shadow-lg z-50 animate-fade-in overflow-hidden">
                      {session ? (
                        <>
                          <div className="px-5 py-4 bg-brand-cream-dark/30 border-b border-brand-tan/10 flex items-center gap-3">
                            {session.user.image
                              ? <Image src={session.user.image} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                              : <div className="w-9 h-9 rounded-full bg-brand-brown flex items-center justify-center text-brand-cream text-sm font-semibold flex-shrink-0">{session.user.name?.charAt(0)?.toUpperCase()}</div>
                            }
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-brand-brown truncate">{session.user.name}</p>
                              <p className="text-xs text-brand-tan truncate">{session.user.email}</p>
                            </div>
                          </div>
                          <div className="py-2">
                            <Link href="/account" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-5 py-2.5 text-sm text-brand-brown hover:bg-brand-cream transition-colors">
                              <User size={16} strokeWidth={1.5} className="text-brand-tan" /> My Profile
                            </Link>
                            <Link href="/account/orders" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-5 py-2.5 text-sm text-brand-brown hover:bg-brand-cream transition-colors">
                              <Package size={16} strokeWidth={1.5} className="text-brand-tan" /> Order History
                            </Link>
                            {session.user.role === "admin" && (
                              <Link href="/admin" onClick={() => setAccountOpen(false)} className="flex items-center gap-3 px-5 py-2.5 text-sm text-brand-terracotta font-medium hover:bg-brand-cream transition-colors">
                                <Settings size={16} strokeWidth={1.5} /> Admin Dashboard
                              </Link>
                            )}
                          </div>
                          <div className="border-t border-brand-tan/10 py-1">
                            <button onClick={() => { signOut({ callbackUrl: "/" }); setAccountOpen(false); }} className="flex w-full items-center gap-3 px-5 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                              <LogOut size={16} strokeWidth={1.5} /> Sign Out
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="py-2">
                          <div className="px-5 pb-3 pt-2">
                            <p className="text-xs text-brand-tan mb-3">Sign in to access your orders and saved items.</p>
                            <Link href="/auth/login" onClick={() => setAccountOpen(false)} className="btn-primary w-full text-center py-2 text-xs block">Sign In</Link>
                          </div>
                          <div className="border-t border-brand-tan/10 pt-2 pb-1 px-5">
                            <span className="text-xs text-brand-tan mr-2">New here?</span>
                            <Link href="/auth/register" onClick={() => setAccountOpen(false)} className="text-xs text-brand-terracotta font-medium hover:underline">Create account</Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Cart */}
                <button
                  className="p-2 -mr-2 text-brand-brown hover:text-brand-terracotta transition-colors rounded-full hover:bg-brand-tan/10 relative"
                  onClick={openDrawer}
                  aria-label="Cart"
                >
                  <ShoppingBag size={20} strokeWidth={1.5} />
                  {itemCount > 0 && (
                    <span className="absolute top-1 right-0.5 bg-brand-terracotta text-white text-[9px] font-bold w-[18px] h-[18px] flex items-center justify-center rounded-full leading-none shadow-sm animate-fade-in">
                      {itemCount > 9 ? "9+" : itemCount}
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Desktop search results — drops down from below the logo row */}
          {searchOpen && searchQuery.trim().length >= 2 && (
            <div className="hidden lg:block absolute left-0 right-0 top-full z-50">
              <div className="container-custom">
                <SearchResults
                  query={searchQuery.trim()}
                  results={searchResults}
                  loading={searchLoading}
                  onClose={closeSearch}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Desktop nav bar ───────────────────────────────────────────────── */}
        <div className="hidden lg:block border-b border-brand-tan/10">
          <div className="container-custom">
            <nav className="flex items-center justify-center gap-1 h-11">
              {navItems.map((item) => (
                <DesktopNavItem key={item._id} item={item} />
              ))}
            </nav>
          </div>
        </div>

        {/* ── Mobile search row — inside header, slides in ──────────────────── */}
        {searchOpen && (
          <div className="lg:hidden border-t border-brand-tan/10 animate-fade-in">
            <div className="container-custom">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-3 h-12">
                <Search size={15} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
                  placeholder="Search products…"
                  className="flex-1 bg-transparent text-sm text-brand-brown placeholder-brand-tan/40 focus:outline-none"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery("")} className="text-brand-tan/60 hover:text-brand-brown transition-colors">
                    <X size={14} strokeWidth={2} />
                  </button>
                )}
                <button type="button" onClick={closeSearch} className="text-brand-tan hover:text-brand-brown transition-colors">
                  <X size={16} strokeWidth={1.5} />
                </button>
              </form>
            </div>

            {/* Mobile search results */}
            {searchQuery.trim().length >= 2 && (
              <div className="container-custom pb-2">
                <SearchResults
                  query={searchQuery.trim()}
                  results={searchResults}
                  loading={searchLoading}
                  onClose={closeSearch}
                />
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── Mobile drawer backdrop ───────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] bg-brand-brown/40 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={closeMobile}
        />
      )}

      {/* ── Mobile drawer panel ──────────────────────────────────────────────── */}
      <div
        className={`fixed inset-y-0 left-0 z-[70] w-[300px] bg-brand-cream shadow-2xl lg:hidden flex flex-col transform transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-brand-tan/15">
          <Link href="/" onClick={closeMobile}>
            <Image src="/logo-black.png" alt="Elysium Lifestyle" width={140} height={42} className="h-9 w-auto object-contain" />
          </Link>
          <button onClick={closeMobile} className="p-2 -mr-2 text-brand-brown hover:text-brand-terracotta rounded-full hover:bg-brand-tan/10 transition-colors">
            <X size={22} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pb-10">
          <div className="px-6 py-5 space-y-8">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-brand-tan mb-3">Menu</p>
              <nav className="space-y-0">
                {navItems.map((item) => (
                  <MobileNavItem key={item._id} item={item} onClose={closeMobile} />
                ))}
              </nav>
            </div>

            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] font-medium text-brand-tan mb-3">Account</p>
              {session ? (
                <div className="space-y-1">
                  <div className="bg-brand-cream-dark/40 p-4 mb-3 border border-brand-tan/10">
                    <p className="text-xs text-brand-tan mb-1">Signed in as</p>
                    <p className="text-sm font-semibold text-brand-brown">{session.user.name}</p>
                  </div>
                  <Link href="/account" onClick={closeMobile} className="flex items-center gap-3 py-2.5 text-sm text-brand-brown hover:text-brand-terracotta transition-colors">
                    <User size={16} strokeWidth={1.5} className="text-brand-tan" /> My Profile
                  </Link>
                  <Link href="/account/orders" onClick={closeMobile} className="flex items-center gap-3 py-2.5 text-sm text-brand-brown hover:text-brand-terracotta transition-colors">
                    <Package size={16} strokeWidth={1.5} className="text-brand-tan" /> Order History
                  </Link>
                  {session.user.role === "admin" && (
                    <Link href="/admin" onClick={closeMobile} className="flex items-center gap-3 py-2.5 text-sm text-brand-terracotta font-medium">
                      <Settings size={16} strokeWidth={1.5} /> Admin Dashboard
                    </Link>
                  )}
                  <button onClick={() => { signOut({ callbackUrl: "/" }); closeMobile(); }} className="flex items-center gap-3 py-2.5 text-sm text-red-600 w-full text-left mt-1 border-t border-brand-tan/10 pt-3">
                    <LogOut size={16} strokeWidth={1.5} /> Sign Out
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Link href="/auth/login" onClick={closeMobile} className="btn-primary text-center py-3.5 text-xs block">Sign In</Link>
                  <Link href="/auth/register" onClick={closeMobile} className="btn-outline text-center py-3.5 text-xs bg-white block">Create Account</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
