export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import { serializeDoc, formatPrice } from "@/lib/utils";
import Link from "next/link";
import { ShoppingCart, ChevronRight } from "lucide-react";
import { PageHeader, Card, Pill, EmptyState, TableWrap } from "@/components/admin/ui";

async function getOrders() {
  await connectDB();
  const orders = await Order.find().populate("user", "name email").sort({ createdAt: -1 }).lean();
  return serializeDoc(orders);
}

const STATUS_TONE = { pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red" };
const PAYMENT_TONE = { paid: "green", failed: "red", pending: "amber" };

// Compact courier-history indicator (delivered/total, flags frauds).
function FraudBadge({ fc }) {
  if (!fc) return null;
  if (fc.status === "checking" || fc.status === "pending") {
    return <span className="text-[10px] text-brand-tan/60">checking…</span>;
  }
  if (fc.status !== "done") return null;
  const tone = fc.frauds > 0 ? "bg-red-100 text-red-700" : fc.successRate >= 70 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${tone}`}>
      {fc.delivered}/{fc.totalParcels} ✓{fc.frauds > 0 ? ` · ${fc.frauds}⚠` : ""}
    </span>
  );
}

export default async function AdminOrdersPage() {
  const orders = await getOrders();

  return (
    <div>
      <PageHeader title="Orders" subtitle={`${orders.length} order${orders.length === 1 ? "" : "s"} total`} icon={ShoppingCart} />

      <Card padded={false}>
        {orders.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders yet" hint="New orders will show up here." />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand-cream/40">
                      {["Order", "Customer", "Items", "Total", "Payment", "Status", "Date", ""].map((h, i) => (
                        <th key={i} className="text-left px-4 py-2.5 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order._id} className="border-t border-brand-tan/10 hover:bg-brand-cream/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/admin/orders/${order._id}`} className="font-medium text-brand-brown hover:text-brand-terracotta transition-colors">{order.orderNumber}</Link>
                        </td>
                        <td className="px-4 py-3 text-brand-brown/80">
                          {order.user?.name || order.shippingAddress?.name || "Guest"}
                          <div className="text-xs text-brand-tan">{order.shippingAddress?.phone}</div>
                          <div className="mt-1"><FraudBadge fc={order.fraudCheck} /></div>
                        </td>
                        <td className="px-4 py-3 text-brand-brown/70 whitespace-nowrap">{order.items.length} item{order.items.length > 1 ? "s" : ""}</td>
                        <td className="px-4 py-3 font-medium text-brand-brown whitespace-nowrap">{formatPrice(order.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-[11px] text-brand-tan">{order.paymentMethod === "cod" ? "COD" : "Online"}</span>
                            <Pill tone={PAYMENT_TONE[order.paymentStatus] || "gray"}>{order.paymentStatus}</Pill>
                          </div>
                        </td>
                        <td className="px-4 py-3"><Pill tone={STATUS_TONE[order.orderStatus] || "gray"}>{order.orderStatus}</Pill></td>
                        <td className="px-4 py-3 text-brand-tan text-xs whitespace-nowrap">{new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</td>
                        <td className="px-4 py-3"><Link href={`/admin/orders/${order._id}`} className="text-xs text-brand-terracotta hover:underline">View</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-brand-tan/10">
              {orders.map((order) => (
                <Link key={order._id} href={`/admin/orders/${order._id}`} className="flex items-center gap-3 p-4 active:bg-brand-cream/40">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-brand-brown">{order.orderNumber}</p>
                      <span className="font-semibold text-brand-brown text-sm">{formatPrice(order.totalAmount)}</span>
                    </div>
                    <p className="text-xs text-brand-tan mt-0.5 truncate">
                      {order.user?.name || order.shippingAddress?.name || "Guest"} · {order.items.length} item{order.items.length > 1 ? "s" : ""}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Pill tone={PAYMENT_TONE[order.paymentStatus] || "gray"}>{order.paymentStatus}</Pill>
                      <Pill tone={STATUS_TONE[order.orderStatus] || "gray"}>{order.orderStatus}</Pill>
                      <FraudBadge fc={order.fraudCheck} />
                      <span className="text-[11px] text-brand-tan ml-auto">{new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-brand-tan/50 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
