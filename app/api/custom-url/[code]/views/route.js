export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { countCustomLinkView } from "@/lib/storefront";
import { CAMPAIGN_CODE } from "@/lib/storefront-map";

// One visit of a campaign link (?cu=<code>), counted by the brand ERP
// (POST /storefront/v1/custom-links/{code}/views, M35b). The browser calls it
// once per session per code (components/layout/CustomUrlExperience.js); the
// count is shown only in the ERP's console. Always a quiet answer: a counter
// must never break a page.
export async function POST(_request, { params }) {
  const code = String(params.code || "").trim();
  if (!CAMPAIGN_CODE.test(code)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const counted = await countCustomLinkView(code);
    return NextResponse.json({ ok: counted }, { status: counted ? 200 : 404 });
  } catch {
    return NextResponse.json({ ok: false }, { status: 202 });
  }
}
