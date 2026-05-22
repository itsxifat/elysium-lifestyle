import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import User from "@/models/User";
import { requireAdmin } from "@/lib/auth";

export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    await connectDB();

    const [revenueResult, totalOrders, totalProducts, totalCustomers, pendingOrders] =
      await Promise.all([
        Order.aggregate([
          { $match: { paymentStatus: "paid" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Order.countDocuments(),
        Product.countDocuments({ isPublished: true }),
        User.countDocuments({ role: "customer" }),
        Order.countDocuments({ orderStatus: "pending" }),
      ]);

    return NextResponse.json({
      totalRevenue: revenueResult[0]?.total || 0,
      totalOrders,
      totalProducts,
      totalCustomers,
      pendingOrders,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
