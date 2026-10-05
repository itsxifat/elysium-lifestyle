export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getShopperOrder } from "@/lib/storefront";
import { formatPrice } from "@/lib/utils";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import OrderStateNotice, { needsStateNotice } from "@/components/ui/OrderStateNotice";
import PaymentFollowUp from "@/components/checkout/PaymentFollowUp";
import { ArrowLeft, MapPin, CreditCard, Package, Truck } from "lucide-react";

const statusSteps = ["pending", "processing", "shipped", "delivered"];
const stepLabels = ["Placed", "Processing", "Shipped", "Delivered"];

const PAYMENT_WORDS = {
  cash_on_delivery: "Cash on delivery",
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  refund_due: "Refund due",
};

function StatusTracker({ status, label }) {
  // A cancelled order, or one that came back, has left the delivery run — four
  // dots reading "placed → delivered" cannot say anything true about it.
  if (needsStateNotice(status)) return <OrderStateNotice status={status} label={label} />;

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
        {stepLabels.map((stepLabel, i) => (
          <span
            key={stepLabel}
            className={`text-[10px] uppercase tracking-[1.5px] ${
              i === current
                ? "text-brand-terracotta font-semibold"
                : i < current
                ? "text-brand-brown/60"
                : "text-stone-300"
            }`}
          >
            {stepLabel}
          </span>
        ))}
      </div>
    </div>
  );
}

// One of the shopper's own website orders, read from the brand ERP
// (GET /storefront/v1/accounts/{id}/orders/{orderNo}); another shopper's order,
// or a desk order, is simply not found.
export default async function OrderDetailPage({ params }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/login");

  const orderNo = decodeURIComponent(String(params.orderId || "")).toUpperCase();
  const order = await getShopperOrder(orderNo, { accountId: session.user.id });
  if (!order) notFound();

  const paymentLabel = order.paymentMethod === "cod" ? "Cash on Delivery" : "Online Payment (SSLCommerz)";
  const online = order.paymentMethod === "sslcommerz";
  const cancelled = order.orderStatus === "cancelled";

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
              {order.paymentMethod === "cod" ? "COD" : PAYMENT_WORDS[order.paymentState] || "Online"}
            </Badge>
          </div>
        </div>

        {/* Status tracker */}
        <div className="mt-8 pt-6 border-t border-stone-100">
          <p className="text-[10px] uppercase tracking-[2.5px] text-brand-tan mb-5">Order Status</p>
          <StatusTracker status={order.orderStatus} label={order.statusLabel?.en} />
          {order.tracking?.trackingCode && (
            <p className="text-[12px] text-brand-tan mt-5 flex items-center gap-2">
              <Truck size={13} strokeWidth={1.5} />
              {order.tracking.courier} · <span className="text-brand-brown font-medium">{order.tracking.trackingCode}</span>
            </p>
          )}
        </div>
      </div>

      {online && !cancelled && order.paymentState === "awaiting_payment" && (
        <PaymentFollowUp orderNo={order.orderNumber} canPay />
      )}

      {/* Items */}
      <div className="bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2.5 mb-6 pb-5 border-b border-stone-100">
          <Package size={14} strokeWidth={1.5} className="text-brand-tan" />
          <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">
            Items · {order.itemCount}
          </span>
        </div>

        <div className="space-y-5">
          {order.items.map((item, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-16 h-20 bg-stone-100 shrink-0 flex items-center justify-center">
                <Package size={18} className="text-stone-300" strokeWidth={1} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-brand-brown text-[13px] leading-snug">{item.name}</p>
                <div className="flex gap-3 mt-1.5 flex-wrap">
                  <span className="text-[11px] text-brand-tan">Qty: {item.quantity}</span>
                  {item.sku && <span className="text-[11px] text-brand-tan">SKU: {item.sku}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-medium text-brand-brown text-[13px]">{formatPrice(item.lineTotal)}</p>
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
          {order.discount > 0 && (
            <div className="flex justify-between text-[12px]">
              <span className="text-brand-tan">Discount</span>
              <span className="text-green-600">− {formatPrice(order.discount)}</span>
            </div>
          )}
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
          {order.paid > 0 && (
            <div className="flex justify-between text-[12px]">
              <span className="text-brand-tan">Paid online</span>
              <span className="text-brand-brown">{formatPrice(order.paid)}</span>
            </div>
          )}
          {!cancelled && order.dueOnDelivery > 0 && (
            <div className="flex justify-between text-[12px]">
              <span className="text-brand-tan">To pay on delivery</span>
              <span className="text-brand-brown">{formatPrice(order.dueOnDelivery)}</span>
            </div>
          )}
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
              {[order.shippingAddress.city, order.shippingAddress.state].filter(Boolean).join(", ")}
            </p>
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
              <Badge variant={order.paymentStatus}>{PAYMENT_WORDS[order.paymentState] || order.paymentStatus}</Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
