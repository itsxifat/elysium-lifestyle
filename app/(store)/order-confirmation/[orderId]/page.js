export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Package, Truck, Clock, CreditCard, AlertCircle } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { getShopperOrder } from "@/lib/storefront";
import { getShopper } from "@/lib/session";
import { isViewToken, rememberedOrderToken } from "@/lib/order-token";
import Badge from "@/components/ui/Badge";
import PurchaseTracker from "@/components/tracking/PurchaseTracker";
import OrderStateNotice, { needsStateNotice } from "@/components/ui/OrderStateNotice";
import PaymentFollowUp from "@/components/checkout/PaymentFollowUp";
import { RETURN_STATUSES } from "@/lib/order-status";

export const metadata = { title: "Your order", robots: { index: false, follow: false } };

// An order as the shopper sees it, read from the brand ERP: by the view token
// the emails carry (`?token=`), by the token this browser kept when it placed
// the order, or as the signed-in shopper's own order. A wrong token is "not
// found", never a hint that the order exists.
export default async function OrderConfirmationPage({ params, searchParams }) {
  const orderNo = decodeURIComponent(String(params.orderId || "")).toUpperCase();
  const fromLink = isViewToken(searchParams?.token) ? searchParams.token : null;
  const token = fromLink || rememberedOrderToken(orderNo);
  const shopper = await getShopper();
  const order = await getShopperOrder(orderNo, { token, accountId: shopper?.accountId });
  if (!order) notFound();

  const returned = String(searchParams?.payment || "");
  const paid = order.paymentState === "paid";
  const awaiting = order.paymentState === "awaiting_payment";
  const cancelled = order.orderStatus === "cancelled";
  const online = order.paymentMethod === "sslcommerz";
  // The browser's Purchase only for an order placed in the last day: the emailed
  // link opened later (on another device, past Meta's 48-hour deduplication) must
  // not count the sale again. The ERP's own Purchase is sent either way.
  const placedAt = Date.parse(order.createdAt || "");
  const recent = Number.isFinite(placedAt) && Date.now() - placedAt < 24 * 60 * 60 * 1000;

  return (
    <div className="bg-brand-cream min-h-screen py-16">
      {/* Client Purchase, deduplicated with the ERP's server event by `purchase_<order>`. */}
      {!cancelled && recent && (!online || paid) && (
        <PurchaseTracker
          order={{
            orderNumber: order.orderNumber,
            value: order.totalAmount,
            currency: "BDT",
            contentIds: order.items.map((i) => i.sku || i.name),
            numItems: order.itemCount,
          }}
        />
      )}
      <div className="container-custom max-w-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          {cancelled ? (
            <>
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-600" />
              </div>
              <h1 className="text-2xl font-bold text-brand-brown mb-2">
                {returned === "cancelled" || returned === "refused" ? "Payment not completed" : "Order cancelled"}
              </h1>
              <p className="text-brand-tan">
                {online && !paid
                  ? "The online payment did not go through, so this order was cancelled and nothing was charged."
                  : "This order has been cancelled."}
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={32} className="text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-brand-brown mb-2">
                {online && paid ? "Payment received — thank you!" : "Order Placed Successfully!"}
              </h1>
              <p className="text-brand-tan">Thank you for your order. We&apos;ll prepare it shortly.</p>
            </>
          )}
        </div>

        {/* An online order still waiting for its payment, or being checked. */}
        {online && !cancelled && !paid && (
          <PaymentFollowUp orderNo={order.orderNumber} checking={returned === "checking"} canPay={awaiting} />
        )}

        {/* Order info card */}
        <div className="bg-white border border-brand-tan/20 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-brand-tan uppercase tracking-wider">Order Number</p>
              <p className="text-lg font-bold text-brand-brown" data-testid="order-number">{order.orderNumber}</p>
            </div>
            <Badge variant={order.paymentMethod === "cod" ? "pending" : paid ? "paid" : "pending"}>
              {order.paymentMethod === "cod" ? "COD" : paid ? "PAID" : "PAYMENT PENDING"}
            </Badge>
          </div>

          {needsStateNotice(order.orderStatus) && (
            <div className="mb-5">
              <OrderStateNotice status={order.orderStatus} label={order.statusLabel?.en} />
            </div>
          )}

          {/* Status timeline */}
          {!needsStateNotice(order.orderStatus) && (
            <div className="flex items-center gap-2 mb-6">
              {[
                { icon: CheckCircle, label: "Placed", active: true },
                { icon: Package, label: "Processing", active: order.orderStatus !== "pending" },
                // A returned order reached the customer before it came back, so
                // the parcel's own journey still reads as complete here.
                { icon: Truck, label: "Shipped", active: ["shipped", "delivered", ...RETURN_STATUSES].includes(order.orderStatus) },
                { icon: Clock, label: "Delivered", active: ["delivered", ...RETURN_STATUSES].includes(order.orderStatus) },
              ].map((step, i) => (
                <div key={i} className="flex items-center flex-1">
                  <div className={`flex flex-col items-center flex-1 ${step.active ? "text-brand-terracotta" : "text-brand-tan/40"}`}>
                    <step.icon size={20} />
                    <span className="text-[10px] mt-1 text-center">{step.label}</span>
                  </div>
                  {i < 3 && <div className={`h-px flex-1 mx-1 ${step.active ? "bg-brand-terracotta" : "bg-brand-tan/20"}`} />}
                </div>
              ))}
            </div>
          )}

          {order.tracking?.trackingCode && (
            <p className="text-[12px] text-brand-tan mb-4">
              <Truck size={12} className="inline mr-1" />
              {order.tracking.courier}: <span className="text-brand-brown font-medium">{order.tracking.trackingCode}</span>
            </p>
          )}

          {/* Shipping address */}
          <div className="border-t border-brand-tan/20 pt-4">
            <p className="text-xs text-brand-tan uppercase tracking-wider mb-2">Shipping To</p>
            <p className="text-sm text-brand-brown font-medium">{order.shippingAddress.name}</p>
            <p className="text-sm text-brand-brown/70">
              {[order.shippingAddress.street, order.shippingAddress.city, order.shippingAddress.state].filter(Boolean).join(", ")}
            </p>
            <p className="text-sm text-brand-brown/70">{order.shippingAddress.phone}</p>
          </div>
        </div>

        {/* Items */}
        <div className="bg-white border border-brand-tan/20 p-6 mb-6">
          <h3 className="text-sm font-semibold text-brand-brown uppercase tracking-wider mb-4">Items Ordered</h3>
          <div className="space-y-3">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-brand-brown font-medium">{item.name}</p>
                  <p className="text-brand-tan text-xs">Qty: {item.quantity}</p>
                  {item.sku && <p className="text-brand-tan/80 text-[11px]">SKU: {item.sku}</p>}
                </div>
                <span className="font-medium text-brand-brown">{formatPrice(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-brand-tan/20 mt-4 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-brand-tan">
              <span>Subtotal</span>
              <span>{formatPrice(order.subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div className="flex justify-between text-brand-tan">
                <span>Discount</span>
                <span className="text-green-600">− {formatPrice(order.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-brand-tan">
              <span>Shipping</span>
              <span>{order.shippingFee === 0 ? "Free" : formatPrice(order.shippingFee)}</span>
            </div>
            <div className="flex justify-between font-bold text-brand-brown pt-1">
              <span>Total</span>
              <span data-testid="order-total">{formatPrice(order.totalAmount)}</span>
            </div>
            {order.paid > 0 && (
              <div className="flex justify-between text-brand-tan">
                <span className="flex items-center gap-1"><CreditCard size={12} /> Paid online</span>
                <span>{formatPrice(order.paid)}</span>
              </div>
            )}
            {order.paymentMethod === "cod" && !cancelled && (
              <div className="flex justify-between text-brand-brown">
                <span>To pay on delivery</span>
                <span>{formatPrice(order.dueOnDelivery)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/shop" className="btn-primary flex-1 text-center py-4">
            Continue Shopping
          </Link>
          <Link href="/account/orders" className="btn-outline flex-1 text-center py-4">
            View All Orders
          </Link>
        </div>
      </div>
    </div>
  );
}
