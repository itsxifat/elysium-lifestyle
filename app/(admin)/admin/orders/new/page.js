"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import toast from "react-hot-toast";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, ShoppingCart,
  Share2, Camera, MessageCircle, Phone, Store, MoreHorizontal,
  Loader2,
} from "lucide-react";
import { formatPrice, shouldUnoptimizeImage, normalizeBdPhone } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import {
  PageHeader, Card, Button, Field, TextInput, Select, Toggle, SectionTitle,
} from "@/components/admin/ui";

const SOURCE_OPTIONS = [
  { value: "facebook", label: "Facebook", icon: Share2 },
  { value: "instagram", label: "Instagram", icon: Camera },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "phone", label: "Phone Call", icon: Phone },
  { value: "offline", label: "Walk-in", icon: Store },
  { value: "other", label: "Other", icon: MoreHorizontal },
];

const PAYMENT_OPTIONS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
];

const ZONE_OPTIONS = [
  { value: "inside_dhaka", label: "Inside Dhaka" },
  { value: "suburbs", label: "Dhaka Suburbs" },
  { value: "outside_dhaka", label: "Outside Dhaka" },
];

const STATUS_OPTIONS = ["pending", "processing", "shipped", "delivered"];

// Small selectable chip used for channel + payment pickers.
function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium border transition-colors ${
        active
          ? "border-brand-terracotta bg-brand-terracotta/10 text-brand-terracotta"
          : "border-brand-tan/30 text-brand-brown/70 hover:border-brand-brown/40 hover:text-brand-brown"
      }`}
    >
      {children}
    </button>
  );
}

export default function NewOrderPage() {
  const router = useRouter();
  const { settings } = useSettings();

  // ── Product search (paginated + infinite scroll) ────────────────────────────
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false); // first page of a query
  const [loadingMore, setLoadingMore] = useState(false); // subsequent pages
  const [hasMore, setHasMore] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef(null);
  const searchBox = useRef(null);
  const scrollRef = useRef(null); // dropdown scroll container (observer root)
  const sentinelRef = useRef(null); // bottom marker that triggers the next page

  // Refs mirror the latest values so the IntersectionObserver callback and the
  // load-more guard never read stale state.
  const seqRef = useRef(0); // bumps per fresh query → ignore late stale responses
  const pageRef = useRef(1);
  const queryRef = useRef("");
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);

  const runSearch = useCallback(async (q, page) => {
    const isFirst = page === 1;
    // A fresh query (page 1) invalidates any in-flight load-more.
    const mySeq = isFirst ? ++seqRef.current : seqRef.current;
    loadingRef.current = true;
    if (isFirst) setSearching(true);
    else setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/orders/search-products?q=${encodeURIComponent(q)}&page=${page}`
      );
      const data = await res.json();
      if (mySeq !== seqRef.current) return; // a newer query superseded this one
      const list = data.products || [];
      setResults((prev) => (isFirst ? list : [...prev, ...list]));
      hasMoreRef.current = Boolean(data.hasMore);
      setHasMore(Boolean(data.hasMore));
      pageRef.current = page;
      queryRef.current = q;
    } catch {
      if (mySeq === seqRef.current && isFirst) {
        setResults([]);
        setHasMore(false);
        hasMoreRef.current = false;
      }
    } finally {
      if (mySeq === seqRef.current) {
        setSearching(false);
        setLoadingMore(false);
      }
      loadingRef.current = false;
    }
  }, []);

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;
    runSearch(queryRef.current, pageRef.current + 1);
  }, [runSearch]);

  const onQueryChange = (val) => {
    setQuery(val);
    setShowResults(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(val, 1), 250);
  };

  // Pre-load some products on focus so the list isn't empty.
  const onSearchFocus = () => {
    setShowResults(true);
    if (results.length === 0) runSearch(query, 1);
  };

  // Close dropdown on outside click.
  useEffect(() => {
    const onClick = (e) => {
      if (searchBox.current && !searchBox.current.contains(e.target)) setShowResults(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Infinite scroll: watch a sentinel at the bottom of the dropdown and pull the
  // next page as it nears view. Re-attaches when the list grows so the freshly
  // rendered sentinel is always observed.
  useEffect(() => {
    if (!showResults || !hasMore) return;
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { root, rootMargin: "160px" }
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [showResults, hasMore, results.length, loadMore]);

  // ── Cart ──────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState([]); // {productId,name,image,size,price,quantity,stock,sku}

  const addItem = (product, variant) => {
    setCart((prev) => {
      const key = `${product._id}-${variant.size}`;
      const idx = prev.findIndex((i) => `${i.productId}-${i.size}` === key);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          image: product.image,
          size: variant.size,
          price: variant.price,
          quantity: 1,
          stock: variant.stock,
          sku: variant.sku,
        },
      ];
    });
    toast.success(`Added ${product.name} (${variant.size})`, { duration: 1200 });
  };

  const setQty = (key, delta) =>
    setCart((prev) =>
      prev
        .map((i) =>
          `${i.productId}-${i.size}` === key ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i
        )
    );

  const removeItem = (key) =>
    setCart((prev) => prev.filter((i) => `${i.productId}-${i.size}` !== key));

  // ── Customer + meta ─────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", street: "", city: "", state: "" });
  const setCust = (k, v) => setCustomer((p) => ({ ...p, [k]: v }));

  const [source, setSource] = useState("facebook");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [markPaid, setMarkPaid] = useState(false);
  const [orderStatus, setOrderStatus] = useState("processing");
  const [shippingZone, setShippingZone] = useState("inside_dhaka");
  const [shippingOverride, setShippingOverride] = useState(""); // "" = auto
  const [discount, setDiscount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Totals (mirrors storefront shipping rules so the staff sees the truth) ──
  const s = settings?.shipping || {};
  const zoneFees = {
    inside_dhaka: s.insideDhaka ?? 60,
    suburbs: s.suburbs ?? 100,
    outside_dhaka: s.outsideDhaka ?? 130,
  };
  const freeShippingEnabled = s.freeShippingEnabled ?? false;
  const freeThreshold = s.freeShippingThreshold ?? settings?.siteInfo?.freeShippingThreshold ?? 1500;

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const autoShipping =
    freeShippingEnabled || (freeThreshold > 0 && subtotal >= freeThreshold)
      ? 0
      : zoneFees[shippingZone] ?? 60;
  const shipping = shippingOverride !== "" ? Math.max(0, Number(shippingOverride) || 0) : autoShipping;
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal + shipping - discountNum);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (cart.length === 0) return toast.error("Add at least one product");
    if (!customer.name.trim() || !customer.phone.trim()) return toast.error("Customer name & phone are required");
    if (!customer.street.trim() || !customer.city.trim()) return toast.error("Customer address is required");

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity })),
          customer,
          source,
          paymentMethod,
          markPaid,
          orderStatus,
          shippingZone,
          shippingFee: shipping,
          discount: discountNum,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create order");
        return;
      }
      toast.success(`Order ${data.orderNumber} created`);
      router.push(`/admin/orders/${data.orderId}`);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-brand-tan/30 text-brand-tan hover:text-brand-brown hover:bg-white transition-colors flex-shrink-0"
        >
          <ArrowLeft size={16} />
        </button>
        <PageHeader title="Create Order" subtitle="Manual / POS sale — Facebook, Instagram, phone or walk-in" icon={ShoppingCart} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: products + cart ─────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Product search */}
          <Card>
            <SectionTitle>Add Products</SectionTitle>
            <div className="relative" ref={searchBox}>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan/60" strokeWidth={1.5} />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={onSearchFocus}
                placeholder="Search products by name or SKU…"
                className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-brand-tan/30 text-sm text-brand-brown bg-white focus:outline-none focus:border-brand-brown transition-colors"
              />
              {searching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tan animate-spin" />}

              {showResults && (
                <div
                  ref={scrollRef}
                  className="absolute z-30 left-0 right-0 mt-1 bg-white border border-brand-tan/25 rounded-lg shadow-xl max-h-[360px] overflow-y-auto"
                >
                  {results.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-brand-tan">
                      {searching ? "Searching…" : "No products found"}
                    </p>
                  ) : (
                    <>
                      {results.map((p) => (
                        <div key={p._id} className="flex items-start gap-3 px-3 py-2.5 border-b border-brand-tan/10 last:border-0">
                          <div className="relative w-10 h-12 flex-shrink-0 bg-brand-cream-dark rounded overflow-hidden">
                            <Image
                              src={p.image || "/placeholder.jpg"}
                              alt={p.name}
                              fill
                              sizes="40px"
                              unoptimized={shouldUnoptimizeImage(p.image)}
                              className="object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-brand-brown line-clamp-1">{p.name}</p>
                            {p.sku && (
                              <p className="text-[10px] font-mono text-brand-tan/80 mt-0.5 line-clamp-1">{p.sku}</p>
                            )}
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              {p.variants.length === 0 && <span className="text-[11px] text-brand-tan">No sizes</span>}
                              {p.variants.map((v) => (
                                <button
                                  key={v.size}
                                  type="button"
                                  onClick={() => addItem(p, v)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-brand-tan/30 text-[11px] text-brand-brown hover:border-brand-terracotta hover:text-brand-terracotta transition-colors"
                                  title={v.sku ? `Add ${v.size} · ${v.sku}` : `Add ${v.size}`}
                                >
                                  <Plus size={10} /> {v.size} · {formatPrice(v.price)}
                                  <span className={v.stock <= 0 ? "text-red-500" : "text-brand-tan/70"}>
                                    ({v.stock})
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Infinite-scroll sentinel + loader */}
                      {hasMore && (
                        <div ref={sentinelRef} className="flex items-center justify-center gap-2 px-4 py-3 text-[11px] text-brand-tan">
                          <Loader2 size={13} className="animate-spin" />
                          Loading more…
                        </div>
                      )}
                      {!hasMore && !loadingMore && (
                        <p className="px-4 py-2.5 text-center text-[11px] text-brand-tan/60">
                          End of results · {results.length} product{results.length === 1 ? "" : "s"}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Cart */}
          <Card padded={false}>
            <div className="px-4 sm:px-5 py-3 border-b border-brand-tan/10 flex items-center justify-between">
              <SectionTitle className="mb-0">Order Items ({cart.length})</SectionTitle>
              {cart.length > 0 && (
                <button onClick={() => setCart([])} className="text-[11px] text-red-500 hover:text-red-700 transition-colors">
                  Clear all
                </button>
              )}
            </div>
            {cart.length === 0 ? (
              <div className="text-center py-12 px-4">
                <ShoppingCart size={28} className="mx-auto text-brand-tan/40 mb-2" strokeWidth={1.5} />
                <p className="text-sm text-brand-tan">No items yet. Search and add products above.</p>
              </div>
            ) : (
              <div className="divide-y divide-brand-tan/10">
                {cart.map((i) => {
                  const key = `${i.productId}-${i.size}`;
                  return (
                    <div key={key} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                      <div className="relative w-11 h-13 flex-shrink-0 bg-brand-cream-dark rounded overflow-hidden" style={{ height: 52 }}>
                        <Image
                          src={i.image || "/placeholder.jpg"}
                          alt={i.name}
                          fill
                          sizes="44px"
                          unoptimized={shouldUnoptimizeImage(i.image)}
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-brand-brown line-clamp-1">{i.name}</p>
                        <p className="text-[11px] text-brand-tan mt-0.5">
                          Size {i.size} · {formatPrice(i.price)}
                          {i.stock <= 0 && <span className="text-red-500"> · out of stock</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setQty(key, -1)} className="w-7 h-7 flex items-center justify-center rounded border border-brand-tan/30 text-brand-tan hover:text-brand-brown transition-colors">
                          <Minus size={12} />
                        </button>
                        <span className="w-7 text-center text-[13px] font-medium text-brand-brown">{i.quantity}</span>
                        <button onClick={() => setQty(key, 1)} className="w-7 h-7 flex items-center justify-center rounded border border-brand-tan/30 text-brand-tan hover:text-brand-brown transition-colors">
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="w-20 text-right text-[13px] font-semibold text-brand-brown flex-shrink-0 hidden sm:block">
                        {formatPrice(i.price * i.quantity)}
                      </div>
                      <button onClick={() => removeItem(key)} className="text-brand-tan hover:text-red-500 transition-colors flex-shrink-0">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Customer */}
          <Card>
            <SectionTitle>Customer</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Full name *">
                <TextInput value={customer.name} onChange={(e) => setCust("name", e.target.value)} placeholder="e.g. Rahim Uddin" />
              </Field>
              <Field label="Phone *">
                <TextInput
                  value={customer.phone}
                  onChange={(e) => setCust("phone", e.target.value)}
                  onBlur={(e) => setCust("phone", normalizeBdPhone(e.target.value))}
                  placeholder="01XXXXXXXXX"
                />
              </Field>
              <Field label="Email (optional)" className="sm:col-span-2">
                <TextInput type="email" value={customer.email} onChange={(e) => setCust("email", e.target.value)} placeholder="customer@email.com" />
              </Field>
              <Field label="Address *" className="sm:col-span-2">
                <TextInput value={customer.street} onChange={(e) => setCust("street", e.target.value)} placeholder="House, road, area" />
              </Field>
              <Field label="City *">
                <TextInput value={customer.city} onChange={(e) => setCust("city", e.target.value)} placeholder="e.g. Dhaka" />
              </Field>
              <Field label="State / District">
                <TextInput value={customer.state} onChange={(e) => setCust("state", e.target.value)} placeholder="optional" />
              </Field>
            </div>
          </Card>
        </div>

        {/* ── Right: channel, payment, summary ──────────────────────────────── */}
        <div className="space-y-5">
          {/* Channel */}
          <Card>
            <SectionTitle>Sales Channel</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {SOURCE_OPTIONS.map((o) => (
                <Chip key={o.value} active={source === o.value} onClick={() => setSource(o.value)}>
                  <o.icon size={13} /> {o.label}
                </Chip>
              ))}
            </div>
          </Card>

          {/* Payment */}
          <Card>
            <SectionTitle>Payment</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_OPTIONS.map((o) => (
                <Chip key={o.value} active={paymentMethod === o.value} onClick={() => setPaymentMethod(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </div>
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-brand-tan/10">
              <div>
                <p className="text-[13px] font-medium text-brand-brown">Payment received</p>
                <p className="text-[11px] text-brand-tan">Mark this order as already paid</p>
              </div>
              <Toggle checked={markPaid} onChange={setMarkPaid} />
            </div>
          </Card>

          {/* Fulfilment + adjustments */}
          <Card className="space-y-3">
            <SectionTitle>Fulfilment</SectionTitle>
            <Field label="Order status">
              <Select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st} className="capitalize">{st}</option>
                ))}
              </Select>
            </Field>
            <Field label="Shipping zone">
              <Select value={shippingZone} onChange={(e) => setShippingZone(e.target.value)}>
                {ZONE_OPTIONS.map((z) => (
                  <option key={z.value} value={z.value}>{z.label}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shipping fee" hint="blank = auto">
                <TextInput
                  type="number"
                  value={shippingOverride}
                  onChange={(e) => setShippingOverride(e.target.value)}
                  placeholder={String(autoShipping)}
                />
              </Field>
              <Field label="Discount">
                <TextInput type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </Field>
            </div>
            <Field label="Notes (internal)">
              <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. customer prefers evening delivery" />
            </Field>
          </Card>

          {/* Summary */}
          <Card className="lg:sticky lg:top-4">
            <SectionTitle>Summary</SectionTitle>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-brand-tan">
                <span>Subtotal ({cart.reduce((n, i) => n + i.quantity, 0)} items)</span>
                <span className="text-brand-brown">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-brand-tan">
                <span>Shipping</span>
                <span className="text-brand-brown">{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
              </div>
              {discountNum > 0 && (
                <div className="flex justify-between text-brand-tan">
                  <span>Discount</span>
                  <span className="text-emerald-600">− {formatPrice(discountNum)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-brand-brown text-base pt-2 border-t border-brand-tan/15 mt-2">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>
            <Button onClick={submit} disabled={submitting} className="w-full mt-4">
              {submitting ? "Creating…" : "Create Order"}
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
