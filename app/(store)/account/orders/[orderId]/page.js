export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import { serializeDoc, formatPrice } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Badge from "@/components/ui/Badge";
import { ArrowLeft, MapPin, CreditCard, Package } from "lucide-react";

const statusSteps = ["pending", "processing", "shipped", "delivered"];
const stepLabels = ["Pending", "Processing", "Shipped", "Delivered"];

function StatusTracker({ status }) {
  if (status === "cancelled") {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 bg-red-50">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
        <span className="text-[11px] uppercase tracking-[2px] text-red-500 font-medium">Order Cancelled</span>
      </div>
    );
  }

  const current = statusSteps.indexOf(status);

  return (
    <div className="w-full">
      <div className="flex items-center">
        {statusSteps.map((step, i) => (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-3 h-3 rounded-full shrink-0 transition-colors ${
                i < current
                  ? "bg-brand-brown"
                  : i === current
                  ? "bg-brand-terracotta ring-[4px] ring-brand-terracotta/15"
                  : "bg-stone-200"
              }`}
            />
            {i < statusSteps.length - 1 && (
              <div className={`flex-1 h-px mx-2 ${i < current ? "bg-brand-brown" : "bg-stone-200"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2.5">
        {stepLabels.map((label, i) => (
          <span
            key={label}
            className={`text-[10px] uppercase tracking-[1.5px] ${
              i === current
                ? "text-brand-terracotta font-semibold"
                : i < current
                ? "text-brand-brown/60"
                : "text-stone-300"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

async function getOrder(orderId, userId) {
  await connectDB();
  const order = await Order.findById(orderId).lean();
  if (!order) return null;
  if (order.user?.toString() !== userId) return null;
  return serializeDoc(order);
}

export default async function OrderDetailPage({ params }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/login");

  const order = await getOrder(params.orderId, session.user.id);
  if (!order) notFound();

  const paymentLabel = order.paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white p-6 sm:p-8">
        <Link
          href="/account/orders"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[2px] text-brand-tan hover:text-brand-brown transition-colors mb-6"
        >
          <ArrowLeft size={13} strokeWidth={1.5} />
          All Orders
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[2.5px] text-brand-tan mb-1">Order Number</p>
            <h1 className="text-xl font-semibold text-brand-brown tracking-wide">{order.orderNumber}</h1>
            <p className="text-[12px] text-brand-tan mt-1">
              Placed on{" "}
              {new Date(order.createdAt).toLocaleDateString("en-BD", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Badge variant={order.paymentStatus}>
              {order.paymentMethod === "cod" ? "COD" : order.paymentStatus}
            </Badge>
          </div>
        </div>

        {/* Status tracker */}
        <div className="mt-8 pt-6 border-t border-stone-100">
          <p className="text-[10px] uppercase tracking-[2.5px] text-brand-tan mb-5">Order Status</p>
          <StatusTracker status={order.orderStatus} />
        </div>
      </div>

      {/* Items */}
      <div className="bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2.5 mb-6 pb-5 border-b border-stone-100">
          <Package size={14} strokeWidth={1.5} className="text-brand-tan" />
          <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">
            Items · {order.items.length}
          </span>
        </div>

        <div className="space-y-5">
          {order.items.map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-16 h-20 bg-stone-50 shrink-0 relative overflow-hidden">
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-stone-100 flex items-center justify-center">
                    <Package size={18} className="text-stone-300" strokeWidth={1} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-brand-brown text-[13px] leading-snug">{item.name}</p>
                <div className="flex gap-3 mt-1.5">
                  <span className="text-[11px] text-brand-tan">Size: {item.size}</span>
                  {item.color && <span className="text-[11px] text-brand-tan">Color: {item.color}</span>}
                  <span className="text-[11px] text-brand-tan">Qty: {item.quantity}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium text-brand-brown text-[13px]">
                  {formatPrice(item.price * item.quantity)}
                </p>
                {item.quantity > 1 && (
                  <p className="text-[11px] text-brand-tan mt-0.5">{formatPrice(item.price)} each</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Price breakdown */}
        <div className="mt-6 pt-5 border-t border-stone-100 space-y-2.5 max-w-xs ml-auto">
          <div className="flex justify-between text-[12px]">
            <span className="text-brand-tan">Subtotal</span>
            <span className="text-brand-brown">{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex justify-between text-[12px]">
            <span className="text-brand-tan">Shipping</span>
            <span className="text-brand-brown">
              {order.shippingFee === 0 ? "Free" : formatPrice(order.shippingFee)}
            </span>
          </div>
          <div className="flex justify-between text-[14px] pt-2 border-t border-stone-100">
            <span className="font-semibold text-brand-brown">Total</span>
            <span className="font-semibold text-brand-brown">{formatPrice(order.totalAmount)}</span>
          </div>
        </div>
      </div>

      {/* Shipping + Payment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-stone-100">
            <MapPin size={14} strokeWidth={1.5} className="text-brand-tan" />
            <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">Shipping Address</span>
          </div>
          <div className="space-y-1.5">
            <p className="font-medium text-brand-brown text-[13px]">{order.shippingAddress.name}</p>
            <p className="text-[12px] text-brand-tan">{order.shippingAddress.phone}</p>
            <p className="text-[12px] text-brand-tan">{order.shippingAddress.street}</p>
            <p className="text-[12px] text-brand-tan">
              {order.shippingAddress.city}
              {order.shippingAddress.postalCode && ` – ${order.shippingAddress.postalCode}`}
            </p>
            <p className="text-[12px] text-brand-tan">{order.shippingAddress.country}</p>
          </div>
        </div>

        <div className="bg-white p-6 sm:p-8">
          <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-stone-100">
            <CreditCard size={14} strokeWidth={1.5} className="text-brand-tan" />
            <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">Payment</span>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-[2px] text-brand-tan mb-1">Method</p>
              <p className="text-[13px] text-brand-brown font-medium">{paymentLabel}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[2px] text-brand-tan mb-1">Status</p>
              <Badge variant={order.paymentStatus}>{order.paymentStatus}</Badge>
            </div>
            {order.transactionId && (
              <div>
                <p className="text-[10px] uppercase tracking-[2px] text-brand-tan mb-1">Transaction ID</p>
                <p className="text-[12px] text-brand-brown font-mono">{order.transactionId}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {order.notes && (
        <div className="bg-white p-6 sm:p-8">
          <p className="text-[10px] uppercase tracking-[2.5px] text-brand-tan mb-3">Order Notes</p>
          <p className="text-[13px] text-brand-brown/80 leading-relaxed">{order.notes}</p>
        </div>
      )}
    </div>
  );
}
