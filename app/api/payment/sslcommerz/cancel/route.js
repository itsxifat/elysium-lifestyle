export const dynamic = "force-dynamic";

import { relayPaymentReturn } from "@/lib/payment-return";

// SSLCommerz's "cancel" return, relayed to the brand ERP (lib/payment-return.js).
export async function POST(request) {
  return relayPaymentReturn(request, "cancel");
}

export async function GET(request) {
  return relayPaymentReturn(request, "cancel");
}
