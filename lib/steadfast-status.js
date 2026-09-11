// Steadfast's delivery-status vocabulary, and how it maps onto ours.
//
// Deliberately free of any database or `fetch` import: this is the one part of
// the courier integration a CLIENT component needs (an order page rendering a
// status in words staff understand), and importing lib/steadfast.js there would
// pull mongoose and the Settings model into the browser bundle.

// Every delivery status Steadfast can report, with the words staff use for it
// here. Their vocabulary and ours differ on the three that matter most:
//   in_review         = they have the consignment, not collected  → our "processing"
//   pending           = with the courier, out for delivery        → our "shipped"
//   partial_delivered = part of the parcel came back              → our "return_requested"
// Anything staff read on screen goes through this map so nobody has to hold
// that translation in their head.
export const COURIER_STATUS_LABELS = {
  in_review: "In review (with Steadfast)",
  pending: "Out for delivery",
  hold: "On hold",
  delivered: "Delivered",
  delivered_approval_pending: "Delivered (awaiting their approval)",
  partial_delivered: "Partially delivered",
  partial_delivered_approval_pending: "Partially delivered (awaiting their approval)",
  cancelled: "Cancelled / returned",
  cancelled_approval_pending: "Cancelled (awaiting their approval)",
  unknown: "Unknown — contact Steadfast",
  unknown_approval_pending: "Unknown (awaiting their approval)",
};

export function courierStatusLabel(raw) {
  const key = (raw || "").toLowerCase();
  return COURIER_STATUS_LABELS[key] || (key ? key.replace(/_/g, " ") : "—");
}

// Statuses Steadfast will never move away from: the parcel's journey is over
// and the balance has been settled. Polling one of these again can only ever
// return the same answer, so a sync skips them unless explicitly told not to.
export const COURIER_SETTLED_STATUSES = ["delivered", "partial_delivered", "cancelled"];

export function isCourierSettled(raw) {
  return COURIER_SETTLED_STATUSES.includes((raw || "").toLowerCase());
}

// Map a Steadfast delivery status → our orderStatus (and whether it's terminal).
// Steadfast "pending" means the courier has the parcel in hand → we ship.
export function mapSteadfastStatus(raw) {
  switch ((raw || "").toLowerCase()) {
    case "in_review":
      return "processing"; // accepted by Steadfast, not collected yet
    case "pending":
      return "shipped";
    case "delivered":
    case "delivered_approval_pending":
      return "delivered";
    case "partial_delivered":
    case "partial_delivered_approval_pending":
      // Part of the parcel is coming back, and only a human can say which
      // items and how many — so the order waits in "return requested" until
      // staff work through the return editor, which then computes
      // partial_returned (some units) or returned (all of them).
      return "return_requested";
    case "cancelled":
    case "cancelled_approval_pending":
      // The whole parcel came back undelivered — the customer never took it, so
      // this is a cancelled sale rather than a return of goods they had.
      return "cancelled";
    default:
      return null; // hold / unknown → leave our status unchanged
  }
}
