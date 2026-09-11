import { isReturnStatus } from "@/lib/order-status";

// The customer's view of an order that left the normal delivery run.
//
// A four-dot "pending → processing → shipped → delivered" tracker cannot say
// anything true about an order that was cancelled or is coming back, so those
// states get a plain sentence instead. Shared by the account order list, the
// order detail page and the confirmation page so the wording is the same in
// all three.
//
// The words here are the CUSTOMER's, which is why they are not simply
// lib/order-status labels: "Return requested" is the shop's internal state —
// what the customer needs told is that their return is on its way to us and
// nothing is expected of them.
const STATES = {
  cancelled: {
    label: "Order cancelled",
    dot: "bg-red-400",
    text: "text-red-500",
    bg: "bg-red-50",
  },
  return_requested: {
    label: "Return in progress",
    dot: "bg-orange-400",
    text: "text-orange-600",
    bg: "bg-orange-50",
  },
  partial_returned: {
    label: "Partially returned",
    dot: "bg-amber-500",
    text: "text-amber-700",
    bg: "bg-amber-50",
  },
  returned: {
    label: "Returned",
    dot: "bg-stone-400",
    text: "text-stone-600",
    bg: "bg-stone-100",
  },
};

/** Does this status need the notice instead of the step tracker? */
export function needsStateNotice(status) {
  return status === "cancelled" || isReturnStatus(status);
}

export default function OrderStateNotice({ status, size = "md", className = "" }) {
  const state = STATES[status];
  if (!state) return null;

  const sm = size === "sm";
  return (
    <div
      className={`inline-flex items-center gap-2 ${sm ? "px-3 py-1.5" : "px-3 py-2"} ${state.bg} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${state.dot}`} />
      <span
        className={`${sm ? "text-[10px]" : "text-[11px]"} uppercase tracking-[2px] ${state.text} ${sm ? "" : "font-medium"}`}
      >
        {state.label}
      </span>
    </div>
  );
}
