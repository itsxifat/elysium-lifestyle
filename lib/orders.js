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

/**
 * Fields no customer-facing read may return.
 *
 * The customer sees every order the same way, whatever channel it came through.
 * Campaign attribution, the internal audit trail and the fraud verdict are for
 * staff only, so they never leave the database on those paths.
 *
 * `ncom` is on the list for that reason and one more: besides naming the
 * campaign it holds the entire handoff payload — internal page URLs, the stock
 * warnings staff need to see, the shop's own view of the sale. None of it is
 * the customer's, and all of it would otherwise be serialised straight into the
 * page they are looking at.
 *
 * Here rather than beside any one page because there are three such reads and
 * the next one added must not have to rediscover the list.
 */
export const CUSTOMER_HIDDEN = "-landingPage -ncom -editHistory -fraudCheck";
