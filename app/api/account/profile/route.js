export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpPatch, erpPath } from "@/lib/erp";
import { erpFailure, jsonBody } from "@/lib/http";
import { getShopper } from "@/lib/session";
import { getAccount } from "@/lib/storefront";
import { normalizeBdPhone } from "@/lib/utils";

// The signed-in shopper's profile and saved addresses, kept in the brand ERP
// (GET / PATCH /storefront/v1/accounts/{id}, D-522). The account id comes from
// this site's own session, never from the browser.

function view(account) {
  return {
    name: account.name || "",
    email: account.email,
    phone: account.phone || "",
    hasPassword: !!account.hasPassword,
    googleLinked: !!account.googleLinked,
    addresses: account.addresses || [],
  };
}

export async function GET() {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(view(await getAccount(shopper.accountId)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return erpFailure(error);
  }
}

function address(a) {
  return {
    ...(a.id ? { id: a.id } : {}),
    ...(String(a.label || "").trim() ? { label: String(a.label).trim().slice(0, 40) } : {}),
    name: String(a.name || "").trim().slice(0, 200),
    phone: normalizeBdPhone(a.phone || "").slice(0, 32),
    districtId: Number(a.districtId),
    thanaId: Number(a.thanaId),
    ...(String(a.area || "").trim() ? { area: String(a.area).trim().slice(0, 160) } : {}),
    addressLine: String(a.addressLine || "").trim().slice(0, 500),
    isDefault: !!a.isDefault,
  };
}

export async function PUT(request) {
  const shopper = await getShopper();
  if (!shopper) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await jsonBody(request);
  const patch = {};
  if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
  if (body?.phone !== undefined) {
    const phone = normalizeBdPhone(body.phone || "");
    patch.phone = phone ? phone.slice(0, 32) : null;
  }
  if (Array.isArray(body?.addresses)) patch.addresses = body.addresses.slice(0, 10).map(address);
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  try {
    const { body: answer } = await erpPatch(erpPath(`/accounts/${shopper.accountId}`), patch);
    return NextResponse.json(view(answer.account));
  } catch (error) {
    return erpFailure(error);
  }
}
