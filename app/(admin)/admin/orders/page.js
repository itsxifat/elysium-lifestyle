export const dynamic = "force-dynamic";

import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import { serializeDoc, formatPrice } from "@/lib/utils";
import Link from "next/link";
import Badge from "@/components/ui/Badge";

async function getOrders() {
  await connectDB();
  const orders = await Order.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .lean();
  return serializeDoc(orders);
}

export default async function AdminOrdersPage() {
  const orders = await getOrders();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Orders</h1>
          <p className="text-brand-tan text-sm mt-1">{orders.length} orders total</p>
        </div>
      </div>

      <div className="bg-white border border-brand-tan/20 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-tan/20 bg-brand-cream">
              {["Order", "Customer", "Items", "Total", "Payment", "Status", "Date", ""].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-xs text-brand-tan uppercase tracking-wider font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-tan/10">
            {orders.map((order) => (
              <tr key={order._id} className="hover:bg-brand-cream/30">
                <td className="px-4 py-3 font-medium text-brand-brown">
                  {order.orderNumber}
                </td>
                <td className="px-4 py-3 text-brand-brown/80">
                  {order.user?.name || order.shippingAddress?.name || "Guest"}
                  <div className="text-xs text-brand-tan">
                    {order.shippingAddress?.phone}
                  </div>
                </td>
                <td className="px-4 py-3 text-brand-brown/70">
                  {order.items.length} item{order.items.length > 1 ? "s" : ""}
                </td>
                <td className="px-4 py-3 font-medium text-brand-brown">
                  {formatPrice(order.totalAmount)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-brand-brown capitalize">
                    {order.paymentMethod === "cod" ? "COD" : "Online"}
                  </span>
                  <div>
                    <Badge variant={order.paymentStatus} className="mt-0.5">
                      {order.paymentStatus}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={order.orderStatus}>{order.orderStatus}</Badge>
                </td>
                <td className="px-4 py-3 text-brand-tan text-xs whitespace-nowrap">
                  {new Date(order.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/orders/${order._id}`}
                    className="text-xs text-brand-terracotta hover:underline"
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && (
          <div className="text-center py-12 text-brand-tan">No orders yet</div>
        )}
      </div>
    </div>
  );
}
