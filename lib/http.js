import "server-only";

import { NextResponse } from "next/server";
import { ErpError } from "@/lib/erp";

// What this site's /api routes answer when the ERP refuses or fails: the ERP's
// stable `code` and a sentence a shopper can read, never the ERP's internals.

const SHOPPER_TEXT = {
  VALIDATION_FAILED: null, // the ERP's own detail names the field
  ORDER_PHONE_INVALID: "Please enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
  ACCOUNT_CODE_INVALID: "That code is wrong or has expired. Request a new one.",
  ACCOUNT_CREDENTIALS_INVALID: "Invalid email or password.",
  ACCOUNT_EMAIL_UNVERIFIED: "Please verify your email first — we sent you a 6-digit code.",
  ACCOUNT_EXISTS: "An account with this email already exists.",
  ACCOUNT_GOOGLE_CONFLICT: "This account is linked to another Google login.",
  ACCOUNT_NO_PASSWORD: "This account signs in with Google, so it has no password to change.",
  ACCOUNT_NOT_FOUND: "Account not found.",
  NOT_FOUND: "Not found.",
  CART_REPRICED: "Some prices in your bag changed. Please check the new total.",
  OUT_OF_STOCK: "Some items in your bag are no longer available in that quantity.",
  CART_NOT_DELIVERABLE: "We don't deliver to that area yet. Please choose another address.",
  PAYMENT_METHOD_UNAVAILABLE: "That way of paying isn't available for this order.",
  PAYMENT_NOT_PAYABLE: "This order can't be paid online now.",
  PAYMENT_GATEWAY_FAILED: "The payment page could not be opened. Nothing was charged — please try again.",
  IDEMPOTENCY_CONFLICT: "Please press Place order again.",
  IDEMPOTENCY_IN_FLIGHT: "Your order is still being placed. Please wait a moment.",
  RATE_LIMITED: "Too many attempts. Please wait a few minutes and try again.",
  SERVICE_UNAVAILABLE: "The payment service is slow right now. Please try again in a moment.",
  ERP_UNREACHABLE: "The shop is not reachable right now. Please try again.",
  ERP_TIMEOUT: "The shop is taking too long to answer. Please try again.",
  ERP_NOT_CONFIGURED: "The shop is not reachable right now. Please try again.",
};

/** The shopper-facing sentence for an ERP refusal. */
export function shopperMessage(error) {
  if (!(error instanceof ErpError)) return "Something went wrong. Please try again.";
  const text = SHOPPER_TEXT[error.code];
  if (text) return text;
  if (error.status === 400 && error.detail) return error.detail;
  if (error.code === "UNAUTHENTICATED") return "The shop is not reachable right now. Please try again.";
  return "Something went wrong. Please try again.";
}

/**
 * A JSON answer for a failed ERP call. 4xx refusals pass through with their
 * code (and, for a checkout, the `quote` or `lines` the ERP sent); anything
 * else is a 502 for the browser, whatever the ERP said.
 */
export function erpFailure(error, { extra = {} } = {}) {
  if (!(error instanceof ErpError)) {
    console.error("[api] unexpected error:", error?.message || error);
    return NextResponse.json({ error: shopperMessage(error) }, { status: 500 });
  }
  // A refusal passes through with its code; a website key the ERP refused
  // (UNAUTHENTICATED) is this server's problem, not the shopper's.
  const passes = error.status >= 400 && error.status < 500 && error.code !== "UNAUTHENTICATED";
  const status = passes ? error.status : error.status === 503 ? 503 : 502;
  const headers = error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined;
  const body = { error: shopperMessage(error), code: error.code, ...extra };
  if (error.problem?.quote) body.quote = error.problem.quote;
  if (error.problem?.lines) body.lines = error.problem.lines;
  return NextResponse.json(body, { status, headers });
}

/** Read a JSON body, or null. */
export async function jsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
