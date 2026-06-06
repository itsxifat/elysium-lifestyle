"use client";

import { useEffect, useState } from "react";
import { StatCard, BarSeries, StackedBars, CoverageBar, Spinner } from "./ui";

export default function DashboardPanel() {
  const [range, setRange] = useState("7d");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/tracking/stats?range=${range}`)
      .then((r) => r.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [range]);

  if (loading && !stats) return <Spinner label="Loading dashboard…" />;
  if (!stats) return <p className="text-gray-400">No data.</p>;

  const p = stats.platform || {};
  const metaRate = p.metaAttempted ? Math.round((p.metaSuccess / p.metaAttempted) * 100) : 0;
  const ga4Rate = p.ga4Attempted ? Math.round((p.ga4Success / p.ga4Attempted) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <div className="flex items-center gap-2">
        {["today", "7d", "30d"].map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 text-[12px] rounded-md font-medium ${range === r ? "bg-brand-terracotta text-white" : "bg-white border border-gray-200 text-gray-500"}`}
          >
            {r === "today" ? "Today" : `Last ${r}`}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <StatCard label="Today" value={stats.cards.today} />
        <StatCard label="Last 7d" value={stats.cards.last7d} />
        <StatCard label="Last 30d" value={stats.cards.last30d} />
        <StatCard label="Success rate" value={`${stats.cards.successRate}%`} accent="text-green-600" />
        <StatCard label="Error rate" value={`${stats.cards.errorRate}%`} accent={stats.cards.errorRate > 10 ? "text-red-600" : "text-brand-brown"} />
        <StatCard label="Partial" value={stats.cards.partial} accent="text-amber-600" />
      </div>

      {/* Volume over time */}
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <h3 className="font-semibold text-brand-brown mb-1">Event volume — client vs server</h3>
        <p className="text-[12px] text-gray-400 mb-4">How much the server side is recovering when browsers are blocked.</p>
        {stats.byDay.length ? (
          <StackedBars data={stats.byDay} keys={["client", "server"]} colors={["#3B82F6", "#7C3AED"]} labelKey="day" height={170} />
        ) : (
          <p className="text-gray-400 text-[13px]">No events in range.</p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* By event */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="font-semibold text-brand-brown mb-3">By event type</h3>
          {stats.byEvent.length ? (
            <BarSeries data={stats.byEvent.map((e) => ({ label: e.eventName, value: e.total }))} labelKey="label" valueKey="value" height={150} />
          ) : (
            <p className="text-gray-400 text-[13px]">No events.</p>
          )}
          <div className="mt-4 space-y-1.5">
            {stats.byEvent.slice(0, 8).map((e) => (
              <div key={e.eventName} className="flex items-center justify-between text-[12px]">
                <span className="text-gray-600 font-medium">{e.eventName}</span>
                <span className="text-gray-400">{e.client} client · {e.server} server</span>
              </div>
            ))}
          </div>
        </div>

        {/* Match-quality coverage */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="font-semibold text-brand-brown mb-1">Match-quality coverage</h3>
          <p className="text-[12px] text-gray-400 mb-4">% of events carrying each Meta EMQ signal (over {stats.coverage.total} events).</p>
          <div className="space-y-2.5">
            <CoverageBar label="Email" pct={stats.coverage.email} />
            <CoverageBar label="Phone" pct={stats.coverage.phone} />
            <CoverageBar label="_fbp cookie" pct={stats.coverage.fbp} tone="#3B82F6" />
            <CoverageBar label="_fbc (click id)" pct={stats.coverage.fbc} tone="#3B82F6" />
            <CoverageBar label="IP address" pct={stats.coverage.ip} tone="#7C3AED" />
            <CoverageBar label="User agent" pct={stats.coverage.userAgent} tone="#7C3AED" />
            <CoverageBar label="External ID" pct={stats.coverage.externalId} tone="#0EA5E9" />
          </div>
        </div>
      </div>

      {/* Per-platform health */}
      <div className="grid md:grid-cols-2 gap-5">
        <PlatformHealth name="Meta CAPI" attempted={p.metaAttempted || 0} success={p.metaSuccess || 0} error={p.metaError || 0} rate={metaRate} latency={Math.round(p.metaLatency || 0)} />
        <PlatformHealth name="GA4 MP" attempted={p.ga4Attempted || 0} success={p.ga4Success || 0} error={p.ga4Error || 0} rate={ga4Rate} latency={Math.round(p.ga4Latency || 0)} />
      </div>
    </div>
  );
}

function PlatformHealth({ name, attempted, success, error, rate, latency }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5">
      <h3 className="font-semibold text-brand-brown mb-3">{name}</h3>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Mini label="Sent" value={attempted} />
        <Mini label="OK" value={success} accent="text-green-600" />
        <Mini label="Errors" value={error} accent={error ? "text-red-600" : "text-gray-400"} />
        <Mini label="Avg ms" value={latency} />
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-[11px] mb-1"><span className="text-gray-500">Success rate</span><span className="text-gray-400">{rate}%</span></div>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${rate}%` }} />
        </div>
      </div>
    </div>
  );
}

function Mini({ label, value, accent }) {
  return (
    <div>
      <p className={`text-xl font-bold ${accent || "text-brand-brown"}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}
