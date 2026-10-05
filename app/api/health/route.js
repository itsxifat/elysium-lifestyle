export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { erpGet, erpPath } from "@/lib/erp";

// Liveness for Docker and the deploy check: this server is up. `?erp=1` also
// asks the brand ERP for the site's settings with the website key, so a wrong
// ERP_API_URL, key or clock shows up as 503 before shoppers see it.
export async function GET(request) {
  if (new URL(request.url).searchParams.get("erp") !== "1") return NextResponse.json({ ok: true });
  try {
    await erpGet(erpPath("/site"), { cache: false });
    return NextResponse.json({ ok: true, erp: "ok" });
  } catch (error) {
    return NextResponse.json({ ok: false, erp: error?.code || "unreachable" }, { status: 503 });
  }
}
