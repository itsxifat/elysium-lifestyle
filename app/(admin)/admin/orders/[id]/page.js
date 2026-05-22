"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import Badge from "@/components/ui/Badge";
import toast from "react-hot-toast";

const ORDER_STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

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
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="text-sm text-brand-tan hover:text-brand-brown">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-brand-brown">{order.orderNumber}</h1>
        <Badge variant={order.orderStatus}>{order.orderStatus}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items + Address */}
        <div className="lg:col-span-2 space-y-6">
          {/* Items */}
          <div className="bg-white border border-brand-tan/20 p-6">
            <h2 className="font-semibold text-brand-brown mb-4">Order Items</h2>
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center border-b border-brand-tan/10 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-medium text-brand-brown">{item.name}</p>
                    <p className="text-sm text-brand-tan">
                      {item.size} · {item.color} · Qty: {item.quantity}
                    </p>
                  </div>
                  <span className="font-semibold text-brand-brown">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-brand-tan/20 space-y-1 text-sm">
              <div className="flex justify-between text-brand-tan">
                <span>Subtotal</span>
                <span>{formatPrice(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-brand-tan">
                <span>Shipping</span>
                <span>{order.shippingFee === 0 ? "Free" : formatPrice(order.shippingFee)}</span>
              </div>
              <div className="flex justify-between font-bold text-brand-brown text-base pt-1">
                <span>Total</span>
                <span>{formatPrice(order.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Shipping */}
          <div className="bg-white border border-brand-tan/20 p-6">
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
          <div className="bg-white border border-brand-tan/20 p-6">
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

          <div className="bg-white border border-brand-tan/20 p-6">
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
              <button
                onClick={() => updateStatus("paymentStatus", "paid")}
                disabled={updating}
                className="btn-primary w-full text-center mt-4 py-2 text-xs"
              >
                Mark as Paid
              </button>
            )}
          </div>

          <div className="bg-white border border-brand-tan/20 p-6">
            <h2 className="font-semibold text-brand-brown mb-2">Order Date</h2>
            <p className="text-sm text-brand-brown">
              {new Date(order.createdAt).toLocaleString("en-BD")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
