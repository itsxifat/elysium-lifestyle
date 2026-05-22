import SSLCommerzPayment from "sslcommerz-lts";

export function buildSSLCommerzPayload(order, storeId, storePassword, isLive) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  return {
    store_id: storeId,
    store_passwd: storePassword,
    total_amount: order.totalAmount,
    currency: "BDT",
    tran_id: order._id.toString(),
    success_url: `${baseUrl}/api/payment/sslcommerz/success`,
    fail_url: `${baseUrl}/api/payment/sslcommerz/fail`,
    cancel_url: `${baseUrl}/api/payment/sslcommerz/cancel`,
    cus_name: order.shippingAddress.name,
    cus_email: order.guestEmail || order.shippingAddress.email || "customer@elysium.com",
    cus_phone: order.shippingAddress.phone,
    cus_add1: order.shippingAddress.street,
    cus_city: order.shippingAddress.city,
    cus_country: "Bangladesh",
    shipping_method: "Courier",
    product_name: `Elysium Order #${order.orderNumber}`,
    product_category: "Clothing",
    product_profile: "general",
    num_of_item: order.items.reduce((acc, i) => acc + i.quantity, 0),
    ship_name: order.shippingAddress.name,
    ship_add1: order.shippingAddress.street,
    ship_city: order.shippingAddress.city,
    ship_country: "Bangladesh",
  };
}

export async function initiateSSLCommerz(payload, storeId, storePassword, isLive) {
  const sslcz = new SSLCommerzPayment(storeId, storePassword, isLive);
  return await sslcz.init(payload);
}

export async function validateSSLCommerz(val_id, storeId, storePassword, isLive) {
  const sslcz = new SSLCommerzPayment(storeId, storePassword, isLive);
  return await sslcz.validate({ val_id });
}
