"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldAlert, PackageCheck, Send, RotateCcw, X, Pencil, Plus, Minus, Trash2, Search, Clock, Rocket } from "lucide-react";
import { formatPrice, shouldUnoptimizeImage, normalizeBdPhone } from "@/lib/utils";
import { Button, Toggle, TextInput, Field, Select } from "@/components/admin/ui";
import { FraudStats } from "@/components/admin/FraudsClient";
import PinPrompt from "@/components/admin/PinPrompt";
import Badge from "@/components/ui/Badge";
import { getEffectivePermissions, isElevated } from "@/lib/permissions";
import toast from "react-hot-toast";

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];
const PIN_STATUSES = ["delivered", "cancelled"]; // status changes that require the PIN

const PAYMENT_OPTIONS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "sslcommerz", label: "SSLCommerz (online)" },
];
// Channels staff may assign by hand. "landing_page" is deliberately absent: it's
// set by the system when an order arrives from a /lp funnel and must never be
// reassigned (or silently overwritten) from this dropdown.
const SOURCE_OPTIONS = ["website", "facebook", "instagram", "whatsapp", "phone", "offline", "other"];

const SOURCE_LABELS = {
  website: "Website", landing_page: "Landing Page", facebook: "Facebook", instagram: "Instagram",
  whatsapp: "WhatsApp", phone: "Phone Call", offline: "Walk-in", other: "Manual",
};

const ACTION_LABELS = {
  edit: "Edited order", status_change: "Changed status", payment_update: "Updated payment",
  payment_change: "Changed payment method", return: "Recorded return", return_edit: "Edited return",
};

// Treat a PIN-related HTTP status as an inline PIN error so PinPrompt keeps the
// modal open for a retry instead of closing.
const PIN_HTTP = [403, 423, 428, 429];

// ── Edit order modal ─────────────────────────────────────────────────────────
function EditOrderModal({ order, pinRef, onClose, onDone }) {
  const [items, setItems] = useState(
    order.items.map((it) => ({
      productId: typeof it.product === "object" ? it.product?._id : it.product,
      name: it.name, image: it.image, sku: it.sku, size: it.size,
      color: it.color, price: it.price, quantity: it.quantity,
    }))
  );
  const [addr, setAddr] = useState({
    name: order.shippingAddress?.name || "", phone: order.shippingAddress?.phone || "",
    email: order.shippingAddress?.email || "", street: order.shippingAddress?.street || "",
    city: order.shippingAddress?.city || "", state: order.shippingAddress?.state || "",
  });
  const [shippingFee, setShippingFee] = useState(String(order.shippingFee ?? 0));
  const [discount, setDiscount] = useState(String(order.discount ?? 0));
  const [paymentMethod, setPaymentMethod] = useState(order.paymentMethod || "cod");
  const [source, setSource] = useState(order.source || "website");
  const [notes, setNotes] = useState(order.notes || "");
  const [saving, setSaving] = useState(false);
  const isLanding = order.source === "landing_page";

  // Product search for adding items.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef(null);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/orders/search-products?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      setResults(res.ok ? d.products || [] : []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  const onQuery = (v) => {
    setQuery(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => runSearch(v), 350);
  };

  const addVariant = (p, v) => {
    setItems((arr) => {
      const i = arr.findIndex((x) => x.productId === p._id && x.size === v.size);
      if (i >= 0) return arr.map((x, idx) => (idx === i ? { ...x, quantity: x.quantity + 1 } : x));
      return [...arr, { productId: p._id, name: p.name, image: p.image, sku: v.sku, size: v.size, price: v.price, quantity: 1 }];
    });
    setQuery(""); setResults([]);
  };

  const setQty = (i, q) => setItems((arr) => arr.map((x, idx) => (idx === i ? { ...x, quantity: Math.max(1, q) } : x)));
  const removeItem = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const total = Math.max(0, subtotal + (Number(shippingFee) || 0) - (Number(discount) || 0));

  const submit = async () => {
    if (items.length === 0) return toast.error("Order needs at least one item");
    if (!addr.name.trim() || !addr.phone.trim() || !addr.street.trim() || !addr.city.trim())
      return toast.error("Name, phone, street and city are required");

    setSaving(true);
    try {
      const result = await pinRef.current.run(async (pin) => {
        const res = await fetch(`/api/admin/orders/${order._id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pin,
            items: items.map((i) => ({ productId: i.productId, size: i.size, quantity: i.quantity, color: i.color })),
            shippingAddress: addr,
            shippingFee: Number(shippingFee) || 0,
            discount: Number(discount) || 0,
            paymentMethod, source, notes,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (PIN_HTTP.includes(res.status)) return { pinError: d.error || "Incorrect PIN" };
        if (!res.ok) throw new Error(d.error || "Failed to save");
        return d;
      });
      if (!result) { setSaving(false); return; } // cancelled
      toast.success("Order updated");
      onDone(result);
    } catch (e) {
      toast.error(e.message || "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
      <div className="relative min-h-full flex items-start justify-center p-4" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="relative bg-white w-full max-w-2xl my-8 rounded-xl shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-brand-tan/15 sticky top-0 bg-white rounded-t-xl">
            <h2 className="font-semibold text-brand-brown">Edit order · {order.orderNumber}</h2>
            <button onClick={onClose} className="text-brand-tan hover:text-brand-brown"><X size={18} /></button>
          </div>

          <div className="p-5 space-y-5">
            {/* Items */}
            <div>
              <p className="text-[11px] uppercase tracking-widest text-brand-tan mb-2">Items</p>
              <div className="space-y-2">
                {items.map((it, i) => (
                  <div key={`${it.productId}-${it.size}-${i}`} className="flex items-center gap-3 border border-brand-tan/15 rounded-lg p-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-brand-brown line-clamp-1">{it.name}</p>
                      <p className="text-[11px] text-brand-tan">{it.size}{it.sku ? ` · ${it.sku}` : ""} · {formatPrice(it.price)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setQty(i, it.quantity - 1)} className="w-7 h-7 rounded border border-brand-tan/30 text-brand-tan"><Minus size={12} className="mx-auto" /></button>
                      <span className="w-7 text-center text-[13px]">{it.quantity}</span>
                      <button onClick={() => setQty(i, it.quantity + 1)} className="w-7 h-7 rounded border border-brand-tan/30 text-brand-tan"><Plus size={12} className="mx-auto" /></button>
                      <button onClick={() => removeItem(i)} className="w-7 h-7 rounded border border-red-200 text-red-500 ml-1"><Trash2 size={12} className="mx-auto" /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add product */}
              <div className="relative mt-2">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan/60" />
                <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search products to add…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-brand-tan/30 text-[13px] text-brand-brown focus:outline-none focus:border-brand-brown" />
                {(searching || results.length > 0) && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-brand-tan/20 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {searching && <p className="px-3 py-2 text-[12px] text-brand-tan">Searching…</p>}
                    {!searching && results.map((p) => (
                      <div key={p._id} className="px-3 py-2 border-b border-brand-tan/10 last:border-0">
                        <p className="text-[12px] font-medium text-brand-brown line-clamp-1">{p.name}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.variants.map((v) => (
                            <button key={v.size} onClick={() => addVariant(p, v)}
                              className="text-[11px] px-2 py-0.5 rounded border border-brand-tan/30 text-brand-brown/80 hover:border-brand-terracotta hover:text-brand-terracotta">
                              {v.size} · {formatPrice(v.price)} · {v.stock} in stock
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Address */}
            <div>
              <p className="text-[11px] uppercase tracking-widest text-brand-tan mb-2">Shipping address</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name"><TextInput value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} /></Field>
                <Field label="Phone"><TextInput value={addr.phone} onChange={(e) => setAddr({ ...addr, phone: e.target.value })} onBlur={(e) => setAddr({ ...addr, phone: normalizeBdPhone(e.target.value) })} /></Field>
                <Field label="Street" className="col-span-2"><TextInput value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} /></Field>
                <Field label="City"><TextInput value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} /></Field>
                <Field label="State / Area"><TextInput value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} /></Field>
              </div>
            </div>

            {/* Money + meta */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Shipping fee (৳)"><TextInput type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} /></Field>
              <Field label="Discount (৳)"><TextInput type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
              <Field label="Payment method">
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field
                label="Sales channel"
                hint={isLanding ? "Locked — this order came from a landing page." : undefined}
              >
                {isLanding ? (
                  <TextInput value={SOURCE_LABELS.landing_page} disabled readOnly />
                ) : (
                  <Select value={source} onChange={(e) => setSource(e.target.value)}>
                    {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Notes" className="col-span-2"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="internal notes" /></Field>
            </div>

            <div className="bg-brand-cream/60 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-brand-tan"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div>
              <div className="flex justify-between text-brand-tan"><span>Shipping</span><span>{formatPrice(Number(shippingFee) || 0)}</span></div>
              <div className="flex justify-between text-brand-tan"><span>Discount</span><span>− {formatPrice(Number(discount) || 0)}</span></div>
              <div className="flex justify-between font-semibold text-brand-brown"><span>New total</span><span>{formatPrice(total)}</span></div>
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-brand-tan/15 sticky bottom-0 bg-white rounded-b-xl">
            <Button onClick={submit} disabled={saving} className="flex-1">{saving ? "Saving…" : "Save changes (PIN)"}</Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Return / partial-delivery modal ─────────────────────────────────────────
function ReturnModal({ order, pinRef, onClose, onDone }) {
  const [qty, setQty] = useState(order.items.map(() => 0));
  const [waive, setWaive] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const setQ = (i, v, max) => setQty((a) => a.map((x, idx) => (idx === i ? Math.max(0, Math.min(max, v)) : x)));

  const returnedValue = order.items.reduce((s, it, i) => s + qty[i] * it.price, 0);
  const keptSubtotal = order.items.reduce((s, it, i) => s + (it.quantity - (it.returnedQuantity || 0) - qty[i]) * it.price, 0);
  const origSubtotal = order.subtotal || 0;
  const effDiscount = origSubtotal > 0 ? (order.discount || 0) * (keptSubtotal / origSubtotal) : 0;
  const newTotal = Math.max(0, keptSubtotal - effDiscount + (waive ? 0 : (order.shippingFee || 0)));

  const submit = async () => {
    const items = qty.map((q, i) => ({ index: i, returnQuantity: q })).filter((x) => x.returnQuantity > 0);
    if (items.length === 0) return toast.error("Select at least one item to return");
    setSaving(true);
    try {
      const result = await pinRef.current.run(async (pin) => {
        const res = await fetch(`/api/admin/orders/${order._id}/return`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items, deliveryChargeWaived: waive, note, pin }),
        });
        const d = await res.json().catch(() => ({}));
        if (PIN_HTTP.includes(res.status)) return { pinError: d.error || "Incorrect PIN" };
        if (!res.ok) throw new Error(d.error || "Failed");
        return d;
      });
      if (!result) { setSaving(false); return; }
      toast.success("Return recorded");
      onDone(result);
    } catch (e) {
      toast.error(e.message || "Something went wrong");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
      <div className="relative min-h-full flex items-start justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative bg-white w-full max-w-lg my-8 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-tan/15">
          <h2 className="font-semibold text-brand-brown">Record Return</h2>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-[12px] text-brand-tan">Pick how many of each item the customer returned. Stock is restored automatically. Requires your PIN.</p>
          {order.items.map((it, i) => {
            const remaining = it.quantity - (it.returnedQuantity || 0);
            return (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-brand-tan/10 pb-2">
                <div className="min-w-0">
                  <p className="text-[13px] text-brand-brown line-clamp-1">{it.name}</p>
                  <p className="text-[11px] text-brand-tan">{it.size} · {formatPrice(it.price)} · {remaining} deliverable{it.returnedQuantity ? ` · ${it.returnedQuantity} returned` : ""}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => setQ(i, qty[i] - 1, remaining)} className="w-7 h-7 rounded border border-brand-tan/30 text-brand-tan">−</button>
                  <span className="w-7 text-center text-[13px]">{qty[i]}</span>
                  <button onClick={() => setQ(i, qty[i] + 1, remaining)} className="w-7 h-7 rounded border border-brand-tan/30 text-brand-tan">+</button>
                </div>
              </div>
            );
          })}

          <label className="flex items-center justify-between py-2">
            <span className="text-[13px] text-brand-brown">Waive delivery charge</span>
            <Toggle checked={waive} onChange={setWaive} />
          </label>
          <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} placeholder="reason / details" /></Field>

          <div className="bg-brand-cream/60 rounded-lg p-3 text-sm space-y-1">
            <div className="flex justify-between text-brand-tan"><span>Returned value</span><span>− {formatPrice(returnedValue)}</span></div>
            <div className="flex justify-between font-semibold text-brand-brown"><span>New order total</span><span>{formatPrice(newTotal)}</span></div>
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-brand-tan/15">
          <Button onClick={submit} disabled={saving} className="flex-1">{saving ? "Saving…" : "Record return (PIN)"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
      </div>
    </div>
  );
}

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const pinRef = useRef(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [sendingCourier, setSendingCourier] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const perms = getEffectivePermissions(session?.user);
  const canEdit = isElevated(session?.user?.role) || perms.includes("orders.edit");

  const sendToCourier = async () => {
    setSendingCourier(true);
    try {
      const res = await fetch(`/api/admin/orders/${id}/send-courier`, { method: "POST" });
      const d = await res.json();
      if (res.ok) { setOrder(d); toast.success("Sent to Steadfast"); }
      else toast.error(d.error || "Failed to send");
    } catch {
      toast.error("Failed to send");
    } finally {
      setSendingCourier(false);
    }
  };

  const recheckFraud = async () => {
    setRechecking(true);
    try {
      const res = await fetch("/api/admin/fraud/recheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: id }),
      });
      const d = await res.json();
      if (res.ok) {
        setOrder((o) => ({ ...o, fraudCheck: d.fraudCheck, orderStatus: d.orderStatus }));
        toast.success("Fraud check refreshed");
      } else toast.error(d.error || "Recheck failed");
    } catch {
      toast.error("Recheck failed");
    } finally {
      setRechecking(false);
    }
  };

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then(setOrder)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Update a single field. delivered/cancelled status changes and any payment
  // status change are PIN-gated.
  const updateStatus = async (field, value) => {
    const critical = (field === "orderStatus" && PIN_STATUSES.includes(value)) || field === "paymentStatus";

    if (critical) {
      try {
        const updated = await pinRef.current.run(async (pin) => {
          const res = await fetch(`/api/orders/${id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [field]: value, pin }),
          });
          const d = await res.json().catch(() => ({}));
          if (PIN_HTTP.includes(res.status)) return { pinError: d.error || "Incorrect PIN" };
          if (!res.ok) throw new Error(d.error || "Failed to update");
          return d;
        });
        if (!updated) return; // cancelled
        setOrder(updated);
        toast.success("Order updated!");
      } catch (e) {
        toast.error(e.message || "Something went wrong");
      }
      return;
    }

    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) { setOrder(await res.json()); toast.success("Order updated!"); }
      else toast.error("Failed to update order");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="text-brand-tan py-10 text-center">Loading...</div>;
  if (!order) return <div className="text-brand-tan py-10 text-center">Order not found</div>;

  return (
    <div>
      <PinPrompt ref={pinRef} />

      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-lg border border-brand-tan/30 text-brand-tan hover:text-brand-brown hover:bg-white transition-colors flex-shrink-0">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-brand-brown tracking-tight">{order.orderNumber}</h1>
        <Badge variant={order.orderStatus}>{order.orderStatus}</Badge>
        {canEdit && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditOpen(true)}>
            <Pencil size={13} /> Edit Order
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items + Address */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-brand-brown">Order Items</h2>
              <button onClick={() => setReturnOpen(true)} className="inline-flex items-center gap-1.5 text-[12px] text-brand-terracotta hover:underline">
                <RotateCcw size={13} /> Manage return
              </button>
            </div>
            <div className="space-y-3">
              {order.items.map((item, i) => {
                const ret = item.returnedQuantity || 0;
                return (
                <div key={i} className="flex justify-between items-center gap-3 border-b border-brand-tan/10 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-12 h-14 flex-shrink-0 bg-brand-cream-dark overflow-hidden rounded">
                      <Image
                        src={item.image || "/placeholder.jpg"}
                        alt={item.name}
                        fill
                        sizes="48px"
                        unoptimized={shouldUnoptimizeImage(item.image)}
                        className="object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-brand-brown line-clamp-1">{item.name}</p>
                      <p className="text-sm text-brand-tan">
                        {item.size}
                        {item.color ? ` · ${item.color}` : ""} · Qty: {item.quantity}
                      </p>
                      {ret > 0 && (
                        <p className="text-[11px] text-red-500 mt-0.5">{ret} returned</p>
                      )}
                      {item.sku && (
                        <p className="text-[11px] text-brand-tan/80 mt-0.5">SKU: {item.sku}</p>
                      )}
                    </div>
                  </div>
                  <span className="font-semibold text-brand-brown flex-shrink-0">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-brand-tan/20 space-y-1 text-sm">
              <div className="flex justify-between text-brand-tan">
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-brand-tan">
                <span>Shipping</span>
                <span>{order.shippingFee === 0 || order.deliveryChargeWaived ? "Free" : formatPrice(order.shippingFee)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-brand-tan">
                  <span>Discount</span>
                  <span className="text-emerald-600">− {formatPrice(order.discount)}</span>
                </div>
              )}
              {order.returnedAmount > 0 && (
                <div className="flex justify-between text-red-500">
                  <span>Returned / refunded</span>
                  <span>− {formatPrice(order.returnedAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-brand-brown text-base pt-1">
                <span>Total</span>
                <span>{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
            {order.discountCodes?.length > 0 && (
              <p className="mt-2 text-[11px] text-brand-tan">Coupons: {order.discountCodes.join(", ")}</p>
            )}
          </div>

          {/* Shipping */}
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
            <h2 className="font-semibold text-brand-brown mb-4">Shipping Address</h2>
            <div className="text-sm text-brand-brown space-y-1">
              <p className="font-medium">{order.shippingAddress.name}</p>
              <p>{order.shippingAddress.phone}</p>
              <p>{order.shippingAddress.street}</p>
              <p>{order.shippingAddress.city}{order.shippingAddress.state ? `, ${order.shippingAddress.state}` : ""}</p>
            </div>
          </div>

          {/* Activity / edit history */}
          {order.editHistory?.length > 0 && (
            <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
              <h2 className="font-semibold text-brand-brown mb-4 flex items-center gap-2">
                <Clock size={16} className="text-brand-terracotta" /> Activity Log
              </h2>
              <div className="space-y-3">
                {[...order.editHistory].reverse().map((h, i) => (
                  <div key={i} className="flex gap-3 text-sm border-b border-brand-tan/10 pb-3 last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-brand-brown">
                        <span className="font-medium">{h.byName || "Staff"}</span>
                        <span className="text-brand-tan"> · {ACTION_LABELS[h.action] || h.action}</span>
                        {h.pinVerified && <span className="text-[10px] text-emerald-600 ml-1">🔒 PIN</span>}
                      </p>
                      {h.summary && <p className="text-[12px] text-brand-tan mt-0.5">{h.summary}</p>}
                    </div>
                    <span className="text-[11px] text-brand-tan/70 whitespace-nowrap">{new Date(h.at).toLocaleString("en-BD")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Status controls */}
        <div className="space-y-6">
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
            <h2 className="font-semibold text-brand-brown mb-4">Order Status</h2>
            <div className="space-y-2">
              {ORDER_STATUSES.map((status) => (
                <label key={status} className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${order.orderStatus === status ? "bg-brand-cream" : "hover:bg-brand-cream/50"}`}>
                  <input
                    type="radio"
                    name="orderStatus"
                    value={status}
                    checked={order.orderStatus === status}
                    onChange={() => updateStatus("orderStatus", status)}
                    disabled={updating}
                    className="accent-brand-terracotta"
                  />
                  <span className="text-sm capitalize text-brand-brown">{status}</span>
                  {PIN_STATUSES.includes(status) && <span className="text-[10px] text-brand-tan ml-auto">🔒 PIN</span>}
                </label>
              ))}
            </div>
          </div>

          {/* Steadfast fraud / delivery history (fetched automatically on order) */}
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-brand-brown flex items-center gap-2">
                <ShieldAlert size={16} className="text-brand-terracotta" /> Fraud Check
              </h2>
              <button onClick={recheckFraud} disabled={rechecking} className="text-[11px] text-brand-terracotta hover:underline disabled:opacity-50">
                {rechecking ? "Checking…" : "Recheck"}
              </button>
            </div>
            {(() => {
              const fc = order.fraudCheck;
              if (fc?.status === "done") {
                return (
                  <>
                    <FraudStats data={fc} />
                    <p className="text-[11px] text-brand-tan mt-3">
                      Checked {fc.checkedAt ? new Date(fc.checkedAt).toLocaleString() : ""}
                      {fc.autoProcessed && <span className="text-emerald-600"> · auto-moved to processing</span>}
                    </p>
                  </>
                );
              }
              if (fc?.status === "checking" || fc?.status === "pending") {
                return <p className="text-sm text-brand-tan animate-pulse">Checking courier history…</p>;
              }
              if (fc?.status === "skipped") {
                return <p className="text-sm text-brand-tan">Auto fraud check is disabled in Settings.</p>;
              }
              if (fc?.status === "unavailable") {
                return <p className="text-sm text-amber-700">Steadfast package not installed on the server.</p>;
              }
              return <p className="text-sm text-red-600">{fc?.error || "No fraud data available."}</p>;
            })()}
          </div>

          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
            <h2 className="font-semibold text-brand-brown mb-4">Payment</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-tan">Method</span>
                <span className="font-medium text-brand-brown capitalize">
                  {order.paymentMethod === "cod" ? "Cash on Delivery" : order.paymentMethod}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-brand-tan">Status</span>
                <Badge variant={order.paymentStatus}>{order.paymentStatus}</Badge>
              </div>
              {order.transactionId && (
                <div className="flex justify-between">
                  <span className="text-brand-tan">Transaction ID</span>
                  <span className="text-xs text-brand-brown font-mono">{order.transactionId}</span>
                </div>
              )}
            </div>
            {order.paymentStatus !== "paid" && (
              <Button
                onClick={() => updateStatus("paymentStatus", "paid")}
                className="w-full mt-4"
              >
                Mark as Paid (PIN)
              </Button>
            )}
          </div>

          {/* Campaign attribution. Staff-only — the customer's own order page
              shows this exactly like any other order. */}
          {order.source === "landing_page" && order.landingPage && (
            <div className="bg-white border border-violet-200 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
              <h2 className="font-semibold text-brand-brown mb-3 flex items-center gap-2">
                <Rocket size={15} className="text-violet-600" /> Landing Page Order
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-brand-tan">Campaign</span>
                  <span className="font-medium text-brand-brown text-right">{order.landingPage.name || "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-brand-tan">Page</span>
                  <a
                    href={`/lp/${order.landingPage.code}`} target="_blank" rel="noopener"
                    className="font-mono text-violet-700 hover:underline"
                  >
                    /lp/{order.landingPage.code}
                  </a>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-brand-tan">Offer taken</span>
                  <span className="font-medium text-brand-brown text-right">{order.landingPage.offerLabel || "—"}</span>
                </div>
                {order.landingPage.regularPrice > order.landingPage.offerPrice && (
                  <div className="flex justify-between gap-3">
                    <span className="text-brand-tan">Offer price</span>
                    <span className="font-medium text-brand-brown">
                      {formatPrice(order.landingPage.offerPrice)}
                      <span className="text-brand-tan line-through font-normal ml-1.5">
                        {formatPrice(order.landingPage.regularPrice)}
                      </span>
                    </span>
                  </div>
                )}
                {order.landingPage.page && (
                  <Link
                    href={`/admin/landing-pages/${order.landingPage.page}`}
                    className="block pt-2 text-[12px] text-violet-700 hover:underline"
                  >
                    Edit this landing page →
                  </Link>
                )}
              </div>
            </div>
          )}

          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
            <h2 className="font-semibold text-brand-brown mb-3">Order Info</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-brand-tan">Channel</span>
                <span className="font-medium text-brand-brown">{SOURCE_LABELS[order.source] || "Website"}</span>
              </div>
              {order.createdByName && (
                <div className="flex justify-between">
                  <span className="text-brand-tan">Created by</span>
                  <span className="font-medium text-brand-brown">{order.createdByName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-brand-tan">Date</span>
                <span className="text-brand-brown">{new Date(order.createdAt).toLocaleString("en-BD")}</span>
              </div>
            </div>
          </div>

          {/* Steadfast courier */}
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6">
            <h2 className="font-semibold text-brand-brown mb-3 flex items-center gap-2">
              <PackageCheck size={16} className="text-brand-terracotta" /> Courier
            </h2>
            {order.courier?.consignmentId ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-brand-tan">Consignment</span><span className="font-mono text-brand-brown">{order.courier.consignmentId}</span></div>
                {order.courier.trackingCode && (
                  <div className="flex justify-between"><span className="text-brand-tan">Tracking</span><span className="font-mono text-brand-brown">{order.courier.trackingCode}</span></div>
                )}
                {order.courier.status && (
                  <div className="flex justify-between"><span className="text-brand-tan">Status</span><span className="text-brand-brown capitalize">{order.courier.status.replace(/_/g, " ")}</span></div>
                )}
                {order.courier.sentAt && (
                  <p className="text-[11px] text-brand-tan pt-1">Sent {new Date(order.courier.sentAt).toLocaleString("en-BD")}</p>
                )}
                {order.courier.trackingMessages?.length > 0 && (
                  <div className="pt-2 mt-1 border-t border-brand-tan/10 space-y-1">
                    {order.courier.trackingMessages.slice(-4).map((m, i) => (
                      <p key={i} className="text-[11px] text-brand-tan">• {m.message}</p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {order.courier?.error
                  ? <p className="text-sm text-red-600">{order.courier.error}</p>
                  : <p className="text-sm text-brand-tan">Not sent to courier yet.</p>}
                <Button onClick={sendToCourier} disabled={sendingCourier} className="w-full">
                  <Send size={14} /> {sendingCourier ? "Sending…" : "Send to Steadfast"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {returnOpen && (
        <ReturnModal
          order={order}
          pinRef={pinRef}
          onClose={() => setReturnOpen(false)}
          onDone={(updated) => { setOrder(updated); setReturnOpen(false); }}
        />
      )}

      {editOpen && (
        <EditOrderModal
          order={order}
          pinRef={pinRef}
          onClose={() => setEditOpen(false)}
          onDone={(updated) => { setOrder(updated); setEditOpen(false); }}
        />
      )}
    </div>
  );
}
