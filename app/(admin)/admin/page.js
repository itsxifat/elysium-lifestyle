export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { serializeDoc, formatPrice } from "@/lib/utils";
import { TrendingUp, Package, ShoppingCart, Users, ArrowRight, Clock } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Link from "next/link";

async function getDashboardData() {
  await connectDB();
  const [revenueResult, totalOrders, totalProducts, totalCustomers, recentOrders, pendingOrders] =
    await Promise.all([
      Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Order.countDocuments(),
      Product.countDocuments({ isPublished: true }),
      User.countDocuments({ role: "customer" }),
      Order.find().sort({ createdAt: -1 }).limit(7).populate("user", "name email").lean(),
      Order.countDocuments({ orderStatus: "pending" }),
    ]);
  return {
    totalRevenue: revenueResult[0]?.total || 0,
    totalOrders, totalProducts, totalCustomers,
    recentOrders: serializeDoc(recentOrders),
    pendingOrders,
  };
}

export default async function AdminDashboard() {
  const { totalRevenue, totalOrders, totalProducts, totalCustomers, recentOrders, pendingOrders } =
    await getDashboardData();

  const stats = [
    { label: "Total Revenue",  value: formatPrice(totalRevenue),       icon: TrendingUp,  accent: "#16a34a", sub: "Paid orders only" },
    { label: "Total Orders",   value: totalOrders.toLocaleString(),    icon: ShoppingCart, accent: "#2563eb", sub: pendingOrders > 0 ? `${pendingOrders} pending` : "All time" },
    { label: "Products",       value: totalProducts.toLocaleString(),  icon: Package,      accent: "#b85c3a", sub: "Published" },
    { label: "Customers",      value: totalCustomers.toLocaleString(), icon: Users,        accent: "#7c3aed", sub: "Registered" },
  ];

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[11px] text-brand-tan uppercase tracking-[3px] mb-1">Overview</p>
        <h1 className="text-2xl font-semibold text-brand-brown">Dashboard</h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-black/[0.06] p-5 hover:shadow-sm transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div
                className="w-9 h-9 flex items-center justify-center"
                style={{ background: s.accent + "18" }}
              >
                <s.icon size={17} style={{ color: s.accent }} strokeWidth={1.8} />
              </div>
            </div>
            <p className="text-2xl font-semibold text-brand-brown tracking-tight">{s.value}</p>
            <p className="text-[11px] text-brand-tan mt-1 uppercase tracking-wider">{s.label}</p>
            <p className="text-[11px] text-brand-tan/60 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div className="bg-white border border-black/[0.06]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.04]">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-brand-tan" strokeWidth={1.5} />
            <h2 className="text-[13px] font-semibold text-brand-brown">Recent Orders</h2>
          </div>
          <Link href="/admin/orders" className="flex items-center gap-1 text-[11px] text-brand-terracotta hover:text-brand-terracotta-dark font-medium transition-colors">
            View all <ArrowRight size={12} strokeWidth={2} />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="px-6 py-12 text-center text-brand-tan text-sm">No orders yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[0.04]">
                  {["Order #", "Customer", "Total", "Payment", "Status", "Date"].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-[10px] text-brand-tan uppercase tracking-[2px] font-medium bg-[#FAFAFA]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order, i) => (
                  <tr key={order._id} className={`border-b border-black/[0.03] hover:bg-[#FAFAFA] transition-colors ${i === recentOrders.length - 1 ? "border-b-0" : ""}`}>
                    <td className="px-6 py-3.5">
                      <Link href={`/admin/orders/${order._id}`} className="font-medium text-brand-brown hover:text-brand-terracotta transition-colors text-[13px]">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3.5 text-[13px] text-brand-brown/70">
                      {order.user?.name || order.shippingAddress?.name || "Guest"}
                    </td>
                    <td className="px-6 py-3.5 text-[13px] font-medium text-brand-brown">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={`inline-flex text-[10px] uppercase tracking-wider font-medium px-2 py-1 ${
                        order.paymentStatus === "paid" ? "bg-green-50 text-green-700" :
                        order.paymentStatus === "failed" ? "bg-red-50 text-red-600" :
                        "bg-amber-50 text-amber-600"
                      }`}>
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge variant={order.orderStatus}>{order.orderStatus}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-[12px] text-brand-tan">
                      {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
