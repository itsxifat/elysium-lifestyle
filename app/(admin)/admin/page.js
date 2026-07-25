export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { serializeDoc, formatPrice } from "@/lib/utils";
import { TrendingUp, Package, ShoppingCart, Users, ArrowRight, Clock, BarChart3 } from "lucide-react";
import Link from "next/link";
import { PageHeader, Card, StatCard, TableWrap, Pill, EmptyState } from "@/components/admin/ui";
import { resolveRange } from "@/lib/order-date-range";
import { getTotals } from "@/lib/analytics";

async function getDashboardData() {
  await connectDB();
  // Store-local (Asia/Dhaka) windows, so "today" is the shop's day.
  const today = resolveRange({ range: "today" });
  const month = resolveRange({ range: "this_month" });

  const [revenueResult, totalOrders, totalProducts, totalCustomers, recentOrders, pendingOrders, todayTotals, monthTotals] =
    await Promise.all([
      Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Order.countDocuments(),
      Product.countDocuments({ isPublished: true }),
      User.countDocuments({ role: "customer" }),
      Order.find().sort({ createdAt: -1 }).limit(7).populate("user", "name email").lean(),
      Order.countDocuments({ orderStatus: "pending" }),
      getTotals(today.start, today.end),
      getTotals(month.start, month.end),
    ]);
  return {
    totalRevenue: revenueResult[0]?.total || 0,
    totalOrders, totalProducts, totalCustomers,
    recentOrders: serializeDoc(recentOrders),
    pendingOrders,
    todayTotals,
    monthTotals,
  };
}

const STATUS_TONE = {
  pending: "amber", processing: "blue", shipped: "blue", delivered: "green", cancelled: "red",
};
const PAYMENT_TONE = { paid: "green", failed: "red", pending: "amber" };

export default async function AdminDashboard() {
  const { totalRevenue, totalOrders, totalProducts, totalCustomers, recentOrders, pendingOrders, todayTotals, monthTotals } =
    await getDashboardData();

  const stats = [
    { label: "Total Revenue", value: formatPrice(totalRevenue), icon: TrendingUp, hint: "Paid orders only" },
    { label: "Total Orders", value: totalOrders.toLocaleString(), icon: ShoppingCart, hint: pendingOrders > 0 ? `${pendingOrders} pending` : "All time" },
    { label: "Products", value: totalProducts.toLocaleString(), icon: Package, hint: "Published" },
    { label: "Customers", value: totalCustomers.toLocaleString(), icon: Users, hint: "Registered" },
  ];

  // Today / this month at a glance — the full breakdown lives in Analytics.
  const periods = [
    { label: "Today", t: todayTotals },
    { label: "This month", t: monthTotals },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your store's performance" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} hint={s.hint} />
        ))}
      </div>

      <Card padded={false} className="mb-6">
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-brand-tan/12">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-brand-tan" />
            <h2 className="text-[13px] font-semibold text-brand-brown">Sales snapshot</h2>
          </div>
          <Link href="/admin/analytics" className="flex items-center gap-1 text-[11px] text-brand-terracotta hover:text-brand-terracotta-dark font-medium transition-colors">
            Full analytics <ArrowRight size={12} />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-brand-tan/12">
          {periods.map(({ label, t }) => (
            <div key={label} className="p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-widest text-brand-tan mb-3">{label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { k: "Net sales", v: formatPrice(t.netSales) },
                  { k: "Orders", v: t.orders.toLocaleString() },
                  { k: "Delivered", v: formatPrice(t.collected) },
                  { k: "Avg order", v: formatPrice(t.aov) },
                ].map((cell) => (
                  <div key={cell.k} className="min-w-0">
                    <p className="text-[10px] text-brand-tan truncate">{cell.k}</p>
                    <p className="text-[15px] font-bold text-brand-brown tabular-nums truncate">{cell.v}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card padded={false}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-brand-tan/12">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-brand-tan" />
            <h2 className="text-[13px] font-semibold text-brand-brown">Recent Orders</h2>
          </div>
          <Link href="/admin/orders" className="flex items-center gap-1 text-[11px] text-brand-terracotta hover:text-brand-terracotta-dark font-medium transition-colors">
            View all <ArrowRight size={12} />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No orders yet" hint="Orders will appear here as customers check out." />
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-cream/40">
                  {["Order #", "Customer", "Total", "Payment", "Status", "Date"].map((h) => (
                    <th key={h} className="text-left px-4 sm:px-5 py-2.5 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order._id} className="border-t border-brand-tan/10 hover:bg-brand-cream/30 transition-colors">
                    <td className="px-4 sm:px-5 py-3">
                      <Link href={`/admin/orders/${order._id}`} className="font-medium text-brand-brown hover:text-brand-terracotta transition-colors text-[13px]">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-5 py-3 text-[13px] text-brand-brown/70 whitespace-nowrap">
                      {order.user?.name || order.shippingAddress?.name || "Guest"}
                    </td>
                    <td className="px-4 sm:px-5 py-3 text-[13px] font-medium text-brand-brown whitespace-nowrap">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="px-4 sm:px-5 py-3"><Pill tone={PAYMENT_TONE[order.paymentStatus] || "gray"}>{order.paymentStatus}</Pill></td>
                    <td className="px-4 sm:px-5 py-3"><Pill tone={STATUS_TONE[order.orderStatus] || "gray"}>{order.orderStatus}</Pill></td>
                    <td className="px-4 sm:px-5 py-3 text-[12px] text-brand-tan whitespace-nowrap">
                      {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
