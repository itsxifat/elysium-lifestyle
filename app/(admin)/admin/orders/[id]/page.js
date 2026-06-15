"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, ShieldAlert, PackageCheck, Send, RotateCcw, X } from "lucide-react";
import { formatPrice, shouldUnoptimizeImage } from "@/lib/utils";
import { Button, Toggle, TextInput, Field } from "@/components/admin/ui";
import { FraudStats } from "@/components/admin/FraudsClient";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

const SOURCE_LABELS = {
  website: "Website", facebook: "Facebook", instagram: "Instagram",
  whatsapp: "WhatsApp", phone: "Phone Call", offline: "Walk-in", other: "Manual",
};

// ── Return / partial-delivery modal ─────────────────────────────────────────
function ReturnModal({ order, onClose, onDone }) {
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
      const res = await fetch(`/api/admin/orders/${order._id}/return`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, deliveryChargeWaived: waive, note }),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Failed");
      toast.success("Return recorded");
      onDone(d);
    } catch {
      toast.error("Something went wrong");
    } finally {
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
          <p className="text-[12px] text-brand-tan">Pick how many of each item the customer returned. Stock is restored automatically.</p>
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
          <Button onClick={submit} disabled={saving} className="flex-1">{saving ? "Saving…" : "Record return"}</Button>
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
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [sendingCourier, setSendingCourier] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

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

  const updateStatus = async (field, value) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = await res.json();
        setOrder(updated);
        toast.success("Order updated!");
      } else {
        toast.error("Failed to update order");
      }
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
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="w-9 h-9 flex items-center justify-center rounded-lg border border-brand-tan/30 text-brand-tan hover:text-brand-brown hover:bg-white transition-colors flex-shrink-0">
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-xl sm:text-2xl font-bold text-brand-brown tracking-tight">{order.orderNumber}</h1>
        <Badge variant={order.orderStatus}>{order.orderStatus}</Badge>
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
                  {order.paymentMethod === "cod" ? "Cash on Delivery" : "Online"}
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
            {order.paymentMethod === "cod" && order.paymentStatus === "pending" && (
              <Button
                onClick={() => updateStatus("paymentStatus", "paid")}
                disabled={updating}
                className="w-full mt-4"
              >
                Mark as Paid
              </Button>
            )}
          </div>

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
          onClose={() => setReturnOpen(false)}
          onDone={(updated) => { setOrder(updated); setReturnOpen(false); }}
        />
      )}
    </div>
  );
}
