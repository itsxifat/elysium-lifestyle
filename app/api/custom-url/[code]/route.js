export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCustomLink } from "@/lib/storefront";
import { CAMPAIGN_CODE } from "@/lib/storefront-map";

// A campaign link's experience (?cu=<code>): the banner, the pop-up and the
// products it highlights, from the brand ERP's Website → Campaign links
// (GET /storefront/v1/custom-links/{code}, M35b, D-551), mapped by
// lib/storefront-map.js → mapCustomLink onto what hooks/useCustomCampaign.js and
// CustomUrlExperience draw: { code, title, basePath, banner, modal, highlightProducts }.
// Reading a link counts nothing: the visit is counted once per browser session
// by POST ./views.
export async function GET(_request, { params }) {
  const code = String(params.code || "").trim();
  if (!CAMPAIGN_CODE.test(code)) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  try {
    const link = await getCustomLink(code);
    if (!link) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(link, { headers: { "Cache-Control": "private, max-age=30" } });
  } catch {
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 502 });
  }
}
