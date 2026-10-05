export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccountOrders } from "@/lib/storefront";
import { formatPrice } from "@/lib/utils";
import Link from "next/link";
import Badge from "@/components/ui/Badge";
import OrderStateNotice, { needsStateNotice } from "@/components/ui/OrderStateNotice";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";

const statusSteps = ["pending", "processing", "shipped", "delivered"];
const stepLabels = ["Placed", "Processing", "Shipped", "Delivered"];

function OrderTracker({ status, label }) {
  if (needsStateNotice(status)) return <OrderStateNotice status={status} label={label} size="sm" className="mt-4" />;

  const current = statusSteps.indexOf(status);

  return (
    <div className="mt-5">
      <div className="flex items-center">
        {statusSteps.map((step, i) => (
          <div key={step} className="flex items-center flex-1 last:flex-none">
            <div
              className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                i < current
                  ? "bg-brand-brown"
                  : i === current
                  ? "bg-brand-terracotta ring-[3px] ring-brand-terracotta/15"
                  : "bg-stone-200"
              }`}
            />
            {i < statusSteps.length - 1 && (
              <div className={`flex-1 h-px mx-1.5 ${i < current ? "bg-brand-brown" : "bg-stone-200"}`} />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {stepLabels.map((label, i) => (
          <span
            key={label}
            className={`text-[9px] uppercase tracking-[1.5px] ${
              i === current
                ? "text-brand-terracotta font-medium"
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

// The shopper's website orders from the brand ERP, newest first: those placed
// while signed in, and guest orders that gave this account's verified email
// (D-523). Never the desk's orders for the same phone (D-533).
async function getUserOrders(accountId) {
  try {
    return { orders: await getAccountOrders(accountId), failed: false };
  } catch (error) {
    console.error("account orders:", error?.code || error?.message);
    return { orders: [], failed: true };
  }
}

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/auth/login");

  const { orders, failed } = await getUserOrders(session.user.id);

  return (
    <div className="bg-white p-8">
      <div className="flex items-center gap-2.5 mb-8 pb-5 border-b border-stone-100">
        <Package size={14} strokeWidth={1.5} className="text-brand-tan" />
        <span className="text-[10px] uppercase tracking-[2.5px] text-brand-tan">
          My Orders{orders.length > 0 && ` · ${orders.length}`}
        </span>
      </div>

      {failed ? (
        <p className="text-[13px] text-brand-tan py-10 text-center">We couldn&apos;t load your orders just now. Please try again in a moment.</p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-brand-cream flex items-center justify-center mb-5">
            <Package size={20} strokeWidth={1} className="text-brand-tan" />
          </div>
          <p className="text-brand-brown font-medium text-sm mb-1.5">No orders yet</p>
          <p className="text-[12px] text-brand-tan mb-7">When you place an order, it&apos;ll show up here</p>
          <Link
            href="/shop"
            className="bg-brand-brown text-brand-cream text-[11px] uppercase tracking-[2.5px] px-7 py-3 hover:bg-brand-terracotta transition-colors"
          >
            Start Shopping
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order._id}
              className="border border-stone-100 hover:border-stone-200 transition-colors p-5 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-brand-brown text-[13px] tracking-wide">{order.orderNumber}</p>
                  <p className="text-[11px] text-brand-tan mt-0.5">
                    {new Date(order.createdAt).toLocaleDateString("en-BD", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
                {/* A list summary names the way of paying; the order's own page says whether it is paid. */}
                <Badge variant={order.paymentMethod === "cod" ? "pending" : "processing"} className="shrink-0">
                  {order.paymentMethod === "cod" ? "COD" : "Online"}
                </Badge>
              </div>

              <OrderTracker status={order.orderStatus} label={order.statusLabel?.en} />

              <div className="flex items-end justify-between mt-5 pt-4 border-t border-stone-100">
                <div>
                  <p className="text-[11px] text-brand-tan leading-relaxed">
                    {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                  </p>
                  <p className="font-semibold text-brand-brown text-[15px] mt-1">{formatPrice(order.totalAmount)}</p>
                </div>
                <Link
                  href={`/account/orders/${encodeURIComponent(order.orderNumber)}`}
                  className="text-[11px] uppercase tracking-[2px] text-brand-terracotta hover:text-brand-brown transition-colors shrink-0"
                >
                  View →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
