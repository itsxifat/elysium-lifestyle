export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TrackingEvent from "@/models/TrackingEvent";
import { requireAdmin } from "@/lib/auth";

// Health/analytics dashboard data: volume over time, match-quality coverage,
// client-vs-server recovery, per-platform success/latency, and summary cards.
export async function GET(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") || "7d";
    const days = range === "today" ? 1 : range === "30d" ? 30 : 7;
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const sumIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });

    const [facet] = await TrackingEvent.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $facet: {
          totals: [{ $count: "n" }],
          byDay: [
            {
              $group: {
                _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d" } },
                total: { $sum: 1 },
                client: sumIf({ $eq: ["$source", "client"] }),
                server: sumIf({ $eq: ["$source", "server"] }),
                metaSuccess: sumIf({ $eq: ["$meta.status", "success"] }),
                ga4Success: sumIf({ $eq: ["$ga4.status", "success"] }),
                errors: sumIf({ $eq: ["$status", "error"] }),
              },
            },
            { $sort: { _id: 1 } },
          ],
          byEvent: [
            {
              $group: {
                _id: "$eventName",
                total: { $sum: 1 },
                client: sumIf({ $eq: ["$source", "client"] }),
                server: sumIf({ $eq: ["$source", "server"] }),
              },
            },
            { $sort: { total: -1 } },
          ],
          coverage: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                email: sumIf("$matchKeys.email"),
                phone: sumIf("$matchKeys.phone"),
                fbp: sumIf("$matchKeys.fbp"),
                fbc: sumIf("$matchKeys.fbc"),
                ip: sumIf("$matchKeys.ip"),
                userAgent: sumIf("$matchKeys.userAgent"),
                externalId: sumIf("$matchKeys.externalId"),
              },
            },
          ],
          platform: [
            {
              $group: {
                _id: null,
                metaAttempted: sumIf("$meta.attempted"),
                metaSuccess: sumIf({ $eq: ["$meta.status", "success"] }),
                metaError: sumIf({ $eq: ["$meta.status", "error"] }),
                metaLatency: { $avg: { $cond: ["$meta.attempted", "$meta.latencyMs", null] } },
                ga4Attempted: sumIf("$ga4.attempted"),
                ga4Success: sumIf({ $eq: ["$ga4.status", "success"] }),
                ga4Error: sumIf({ $eq: ["$ga4.status", "error"] }),
                ga4Latency: { $avg: { $cond: ["$ga4.attempted", "$ga4.latencyMs", null] } },
              },
            },
          ],
          status: [{ $group: { _id: "$status", n: { $sum: 1 } } }],
        },
      },
    ]);

    const [todayN, d7, d30] = await Promise.all([
      TrackingEvent.countDocuments({ createdAt: { $gte: new Date(Date.now() - 86400000) } }),
      TrackingEvent.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } }),
      TrackingEvent.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
    ]);

    const total = facet.totals[0]?.n || 0;
    const statusMap = Object.fromEntries(facet.status.map((s) => [s._id, s.n]));
    const cov = facet.coverage[0] || { total: 0 };
    const pct = (n) => (cov.total ? Math.round((n / cov.total) * 100) : 0);

    return NextResponse.json({
      range,
      cards: {
        today: todayN,
        last7d: d7,
        last30d: d30,
        successRate: total ? Math.round(((statusMap.success || 0) / total) * 100) : 0,
        errorRate: total ? Math.round(((statusMap.error || 0) / total) * 100) : 0,
        partial: statusMap.partial || 0,
      },
      byDay: facet.byDay.map((d) => ({ day: d._id, ...d, _id: undefined })),
      byEvent: facet.byEvent.map((e) => ({ eventName: e._id, ...e, _id: undefined })),
      coverage: {
        total: cov.total,
        email: pct(cov.email),
        phone: pct(cov.phone),
        fbp: pct(cov.fbp),
        fbc: pct(cov.fbc),
        ip: pct(cov.ip),
        userAgent: pct(cov.userAgent),
        externalId: pct(cov.externalId),
      },
      platform: facet.platform[0] || {},
      statusBreakdown: statusMap,
    });
  } catch (err) {
    console.error("[tracking] stats error:", err.message);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
