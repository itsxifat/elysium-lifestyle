import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Order from "@/models/Order";
import Product from "@/models/Product";
import Settings from "@/models/Settings";
import { sendEmail, orderConfirmationTemplate } from "@/lib/email";

export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const query = {};
    if (status && status !== "all") query.orderStatus = status;
    if (search) {
      query.$or = [
        { orderNumber: { $regex: search, $options: "i" } },
        { "shippingAddress.name": { $regex: search, $options: "i" } },
        { "shippingAddress.phone": { $regex: search, $options: "i" } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(query).populate("user", "name email").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(query),
    ]);

    return NextResponse.json({ orders, total, page, totalPages: Math.ceil(total / limit) });
  } catch {
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    const data = await request.json();

    if (!data.items?.length) return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
    if (!data.shippingAddress || !data.paymentMethod) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const productIds = data.items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = Object.fromEntries(products.map((p) => [p._id.toString(), p]));

    const orderItems = [];
    for (const item of data.items) {
      const product = productMap[item.productId];
      if (!product) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 400 });

      // Find variant by size to get the real price
      const variant = product.variants?.find((v) => v.size === item.size);
      if (!variant) return NextResponse.json({ error: `Size ${item.size} not found for ${product.name}` }, { status: 400 });

      orderItems.push({
        product: product._id,
        name: product.name,
        image: product.images?.[0] || "",
        size: item.size,
        price: variant.price,
        quantity: item.quantity,
      });
    }

    const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const settings = await Settings.findOne({}).lean();
    const s = settings?.shipping || {};
    let shippingFee;
    if (s.freeShippingEnabled) {
      shippingFee = 0;
    } else {
      const freeThreshold = s.freeShippingThreshold ?? settings?.siteInfo?.freeShippingThreshold ?? 1500;
      if (subtotal >= freeThreshold) {
        shippingFee = 0;
      } else {
        const zone = data.shippingZone || "inside_dhaka";
        if (zone === "outside_dhaka") shippingFee = s.outsideDhaka ?? 130;
        else if (zone === "suburbs") shippingFee = s.suburbs ?? 100;
        else shippingFee = s.insideDhaka ?? 60;
      }
    }
    const totalAmount = subtotal + shippingFee;

    const count = await Order.countDocuments();
    const orderNumber = `ELY-${new Date().getFullYear()}-${String(count + 1).padStart(5, "0")}`;

    const order = await Order.create({
      orderNumber,
      user: session?.user?.id || null,
      guestEmail: !session ? data.guestEmail : undefined,
      items: orderItems,
      shippingAddress: data.shippingAddress,
      shippingZone: data.shippingZone || "inside_dhaka",
      paymentMethod: data.paymentMethod,
      paymentStatus: "pending",
      orderStatus: "pending",
      subtotal,
      shippingFee,
      totalAmount,
    });

    if (data.paymentMethod === "cod") {
      for (const item of orderItems) {
        await Product.updateOne(
          { _id: item.product, "variants.size": item.size },
          { $inc: { "variants.$.stock": -item.quantity } }
        );
      }
      await Order.findByIdAndUpdate(order._id, { orderStatus: "processing" });

      const toEmail = session?.user?.email || data.guestEmail;
      if (toEmail) {
        const populatedOrder = { ...order.toObject(), orderStatus: "processing" };
        sendEmail({
          to: toEmail,
          subject: `Order Confirmed — ${orderNumber}`,
          html: orderConfirmationTemplate(populatedOrder),
        }).catch(console.error);
      }
    }

    return NextResponse.json({ orderId: order._id.toString() }, { status: 201 });
  } catch (err) {
    console.error("POST /api/orders error:", err);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }
}
