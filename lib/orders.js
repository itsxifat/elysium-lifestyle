// Shared order helpers used by both the manual status route and the courier
// webhook so the rule lives in exactly one place.

// COD auto-paid: when a Cash-on-Delivery order reaches "delivered", the money has
// been collected, so flip the payment status to "paid" (unless already set).
// Mutates the given order doc in place; returns true if it changed anything.
export function applyCodAutoPaid(order) {
  if (
    order &&
    order.orderStatus === "delivered" &&
    order.paymentMethod === "cod" &&
    order.paymentStatus !== "paid"
  ) {
    order.paymentStatus = "paid";
    return true;
  }
  return false;
}
