import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { resolveRange, pickGranularity } from "@/lib/order-date-range";
import { getAnalytics, seriesToCsv } from "@/lib/analytics";

// Day-by-day (or month-by-month) sales for the selected period, as CSV — the
// "Export" button on /admin/analytics. Same range logic as the page, so the
// download always matches what's on screen.
export async function GET(request) {
  const { error } = await requireAdmin("analytics.view");
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "last_30_days";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    const settings = await Settings.findOne({}).select("orderFilters").lean();
    const { start, end } = resolveRange({ range, from, to, weekStartsOn: settings?.orderFilters?.weekStartsOn ?? 6 });

    const { series } = await getAnalytics({ start, end, prev: null });
    const csv = seriesToCsv(series, pickGranularity(start, end));

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="elysium-sales-${range}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("GET /api/admin/analytics/export error:", err);
    return new Response("Failed to build the export", { status: 500 });
  }
}
