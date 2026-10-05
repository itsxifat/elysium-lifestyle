export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ErpError, erpGet, erpPath } from "@/lib/erp";

// A campaign link's experience (?cu=<code>): the banner, the pop-up and the
// products it highlights, from the brand ERP's Website → Campaign links
// (GET /storefront/v1/custom-links/{code}, M35b).
//
// WAITING FOR M35b: until the ERP serves that route it answers 404, so no
// campaign shows and the shop behaves exactly as without `?cu=`. When it lands,
// map its answer onto { code, title, basePath, banner, modal, highlightProducts }
// (what hooks/useCustomCampaign.js and CustomUrlExperience draw).
export async function GET(_request, { params }) {
  const code = String(params.code || "").trim();
  if (!/^\d{4,6}$/.test(code)) return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  try {
    const answer = await erpGet(erpPath(`/custom-links/${code}`));
    const link = answer.customLink || answer.link || answer;
    return NextResponse.json({
      code: link.code || code,
      title: link.title || "",
      basePath: link.basePath || link.target || "/shop",
      banner: link.banner || null,
      modal: link.modal || link.popup || null,
      highlightProducts: [],
    });
  } catch (error) {
    if (error instanceof ErpError && error.status !== 0 && error.status < 500) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 502 });
  }
}
