import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Settings from "@/models/Settings";
import {
  buildSSLCommerzPayload,
  initiateSSLCommerz,
} from "@/lib/sslcommerz";

export async function POST(request) {
  try {
    await connectDB();
    const { orderId } = await request.json();

    const [order, settings] = await Promise.all([
      Order.findById(orderId).lean(),
      Settings.findOne({}).lean(),
    ]);

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const sslConfig = settings?.paymentGateways?.sslcommerz;
    if (!sslConfig?.enabled || !sslConfig.storeId || !sslConfig.storePassword) {
      return NextResponse.json(
        { error: "SSLCommerz is not configured" },
        { status: 400 }
      );
    }

    const payload = buildSSLCommerzPayload(
      order,
      sslConfig.storeId,
      sslConfig.storePassword,
      sslConfig.isLive || false
    );

    const apiResponse = await initiateSSLCommerz(
      payload,
      sslConfig.storeId,
      sslConfig.storePassword,
      sslConfig.isLive || false
    );

    if (!apiResponse?.GatewayPageURL) {
      return NextResponse.json(
        { error: "Failed to initiate payment" },
        { status: 500 }
      );
    }

    return NextResponse.json({ GatewayPageURL: apiResponse.GatewayPageURL });
  } catch (error) {
    console.error("SSLCommerz init error:", error);
    return NextResponse.json(
      { error: "Payment initiation failed" },
      { status: 500 }
    );
  }
}
