// The order states a shopper sees, as lib/storefront.js maps them from the
// brand ERP's shopper words (D-524): placed → pending, processing, shipped,
// delivered, partly delivered, returned, cancelled, exchanged.
//
// Deliberately free of server imports: client components render these labels.

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "partly_delivered",
  "returned",
  "exchanged",
  "cancelled",
];

export const ORDER_STATUS_LABELS = {
  pending: "Placed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  partly_delivered: "Partly delivered",
  returned: "Returned",
  exchanged: "Exchanged",
  cancelled: "Cancelled",
};

export function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || String(status || "").replace(/_/g, " ");
}

/**
 * States an order reaches after the parcel got to the customer and something
 * came back (or was swapped): the delivery run is over, so the step tracker
 * gives way to a plain notice.
 */
export const RETURN_STATUSES = ["partly_delivered", "returned", "exchanged"];

export function isReturnStatus(status) {
  return RETURN_STATUSES.includes(status);
}
