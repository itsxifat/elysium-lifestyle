export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import TrackingEvent from "@/models/TrackingEvent";
import { requireAdmin } from "@/lib/auth";
import { escapeRegExp } from "@/lib/utils";

// Live event log for the monitoring view. Supports filtering by event type,
// platform, status, source, date range and free-text search; plus a `dedup`
// mode that groups by event_id to confirm browser+server deduplication.
export async function GET(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode");

    const eventName = searchParams.get("eventName");
    const platform = searchParams.get("platform"); // meta | ga4
    const status = searchParams.get("status"); // success | error | partial | skipped
    const source = searchParams.get("source"); // client | server
    const q = searchParams.get("q");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const query = {};
    if (eventName && eventName !== "all") query.eventName = eventName;
    if (source && source !== "all") query.source = source;
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }
    if (platform && (platform === "meta" || platform === "ga4")) {
      if (status && status !== "all") query[`${platform}.status`] = status;
      else query[`${platform}.attempted`] = true;
    } else if (status && status !== "all") {
      query.status = status;
    }
    if (q) {
      const safe = escapeRegExp(q);
      query.$or = [
        { eventId: { $regex: safe, $options: "i" } },
        { "user.emailMasked": { $regex: safe, $options: "i" } },
      ];
    }

    // Dedup view: group recent events by event_id and surface the sources seen.
    if (mode === "dedup") {
      const groups = await TrackingEvent.aggregate([
        { $match: query },
        { $sort: { createdAt: -1 } },
        { $limit: 2000 },
        {
          $group: {
            _id: "$eventId",
            eventName: { $first: "$eventName" },
            createdAt: { $first: "$createdAt" },
            sources: { $addToSet: "$source" },
            count: { $sum: 1 },
            metaOk: { $max: { $cond: [{ $eq: ["$meta.status", "success"] }, 1, 0] } },
            ga4Ok: { $max: { $cond: [{ $eq: ["$ga4.status", "success"] }, 1, 0] } },
          },
        },
        { $sort: { createdAt: -1 } },
        { $limit: 200 },
      ]);
      return NextResponse.json({
        groups: groups.map((g) => ({
          eventId: g._id,
          eventName: g.eventName,
          createdAt: g.createdAt,
          sources: g.sources,
          deduped: g.sources.includes("client") && g.sources.includes("server"),
          count: g.count,
          metaOk: Boolean(g.metaOk),
          ga4Ok: Boolean(g.ga4Ok),
        })),
      });
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "30"));
    const [events, total] = await Promise.all([
      TrackingEvent.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TrackingEvent.countDocuments(query),
    ]);

    return NextResponse.json({ events, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    console.error("[tracking] events GET error:", err.message);
    return NextResponse.json({ error: "Failed to load events" }, { status: 500 });
  }
}
