import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { resolveRange, pickGranularity } from "@/lib/order-date-range";
import { getAnalytics, seriesToCsv, channelsToCsv, teamToCsv } from "@/lib/analytics";

// CSV download for the "Export" menu on /admin/analytics. Same range AND same
// channel/staff filters as the page, so the download always matches what's on
// screen — an export that quietly ignored the active filter would be worse than
// no export, because nothing about the file says it was unfiltered.
const DATASETS = {
  series: { name: "sales", build: ({ series }, granularity) => seriesToCsv(series, granularity) },
  channels: { name: "channels", build: ({ channels }) => channelsToCsv(channels.channels) },
  team: { name: "team", build: ({ team }) => teamToCsv(team) },
};

export async function GET(request) {
  const { error } = await requireAdmin("analytics.view");
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "last_30_days";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";
    const channel = searchParams.get("channel") || "";
    const staff = searchParams.get("staff") || "";
    const dataset = DATASETS[searchParams.get("dataset")] ? searchParams.get("dataset") : "series";

    const settings = await Settings.findOne({}).select("orderFilters").lean();
    const { start, end } = resolveRange({ range, from, to, weekStartsOn: settings?.orderFilters?.weekStartsOn ?? 6 });

    const data = await getAnalytics({ start, end, prev: null, filters: { source: channel, staff } });
    const spec = DATASETS[dataset];
    const csv = spec.build(data, pickGranularity(start, end));

    const stamp = new Date().toISOString().slice(0, 10);
    const scope = [channel, staff && staff.length <= 12 ? staff : ""].filter(Boolean).join("-");
    const filename = ["elysium", spec.name, scope, range, stamp].filter(Boolean).join("-");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/admin/analytics/export error:", err);
    return new Response("Failed to build the export", { status: 500 });
  }
}
