export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPath, erpPost } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { clientOf } from "@/lib/shopper";
import { normalizeBdPhone } from "@/lib/utils";

// Sign-up, in the brand ERP (POST /storefront/v1/accounts/register, D-522): the
// ERP keeps the account and emails a six-digit code to prove the address.
// Registering an address that never entered its code again replaces its
// password and name; a verified one is 409 ACCOUNT_EXISTS.
export async function POST(request) {
  const body = await jsonBody(request);
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  if (!name || !email || !password) {
    return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  const phone = body?.phone ? normalizeBdPhone(body.phone) : "";
  const client = clientOf(request);
  try {
    const { body: answer } = await erpPost(erpPath("/accounts/register"), {
      email,
      password,
      name: name.slice(0, 120),
      ...(phone ? { phone } : {}),
      locale: body?.locale === "bn" ? "bn" : "en",
      ...(client ? { client } : {}),
    });
    return NextResponse.json(
      { requiresVerification: true, email: answer.email || email, message: "Account created. Please verify your email." },
      { status: 201 }
    );
  } catch (error) {
    return erpFailure(error);
  }
}
