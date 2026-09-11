// The order lifecycle, in one place.
//
// Every status list, label, colour and "is this a return?" test in the app
// resolves from here — the admin list tabs, the detail radios, the customer's
// tracker, the courier sync report, the dashboard. Before this module the same
// five strings were spelled out in a dozen files, so adding the return states
// meant finding all of them.
//
// Deliberately free of database imports: client components render these labels.

export const ORDER_STATUSES = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "return_requested",
  "partial_returned",
  "returned",
  "cancelled",
];

export const ORDER_STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  return_requested: "Return requested",
  partial_returned: "Partially returned",
  returned: "Returned",
  cancelled: "Cancelled",
};

export function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || String(status || "").replace(/_/g, " ");
}

/**
 * The three states a parcel coming back moves through.
 *
 * `return_requested` is "the courier says something is coming back, nobody has
 * itemised it yet" — the state Steadfast's partial delivery / return request
 * lands an order in. The other two are the OUTCOME of the return editor and
 * are never set by hand: staff record which items and how many came back, and
 * the split between them follows from that (all units → returned, some units →
 * partial_returned). See app/api/admin/orders/[id]/return.
 */
export const RETURN_STATUSES = ["return_requested", "partial_returned", "returned"];

/** Statuses derived from recorded return lines, so never directly settable. */
export const COMPUTED_RETURN_STATUSES = ["partial_returned", "returned"];

export function isReturnStatus(status) {
  return RETURN_STATUSES.includes(status);
}

/**
 * What staff may choose by hand.
 *
 * `returned` / `partial_returned` are absent on purpose: an order in one of
 * those states must have return lines behind it — the quantities, the restocked
 * units and the recomputed total — and a radio button cannot produce those.
 * `return_requested` IS here, because a customer ringing up to say they are
 * sending something back is news that arrives before any courier reports it.
 */
export const MANUAL_ORDER_STATUSES = ORDER_STATUSES.filter(
  (s) => !COMPUTED_RETURN_STATUSES.includes(s)
);

// Pill/Badge tone per status. Returns get their own family (terracotta → amber
// → brown) so "coming back" never reads as either green (delivered) or red
// (cancelled) at a glance.
export const ORDER_STATUS_TONES = {
  pending: "amber",
  processing: "blue",
  shipped: "blue",
  delivered: "green",
  return_requested: "terracotta",
  partial_returned: "amber",
  returned: "brown",
  cancelled: "red",
};

export function orderStatusTone(status) {
  return ORDER_STATUS_TONES[status] || "gray";
}

/**
 * How many units of an order have come back, and what that makes it.
 *
 * The single rule behind the auto-classification the shop asked for: every
 * unit returned is a full return, some units is a partial one. Used by the
 * return editor's route after it writes the lines, so the status can never
 * disagree with the quantities stored on the items.
 */
export function returnTally(items = []) {
  const ordered = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const returned = items.reduce((n, i) => n + (Number(i.returnedQuantity) || 0), 0);
  return {
    ordered,
    returned,
    kept: Math.max(0, ordered - returned),
    status: returned <= 0 ? null : returned >= ordered ? "returned" : "partial_returned",
  };
}
