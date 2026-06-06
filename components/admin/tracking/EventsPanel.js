"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, ChevronDown, ChevronRight, RotateCw } from "lucide-react";
import { STANDARD_EVENTS } from "@/lib/tracking/constants";
import { StatusBadge, Pill, JsonViewer, Spinner } from "./ui";

const EMPTY_FILTERS = { eventName: "all", platform: "all", status: "all", source: "all", q: "" };

export default function EventsPanel() {
  const [view, setView] = useState("events"); // events | dedup | errors
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState(null);
  const [dedup, setDedup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [auto, setAuto] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const f = view === "errors" ? { ...filters, status: "error" } : filters;
      Object.entries(f).forEach(([k, v]) => v && v !== "all" && params.set(k, v));
      if (view === "dedup") {
        const res = await fetch(`/api/admin/tracking/events?mode=dedup&${params}`);
        setDedup((await res.json()).groups || []);
      } else {
        params.set("page", page);
        const res = await fetch(`/api/admin/tracking/events?${params}`);
        setData(await res.json());
      }
    } catch {
      toast.error("Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [filters, page, view]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [auto, load]);

  const retry = async (id, platform) => {
    try {
      const res = await fetch(`/api/admin/tracking/events/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(platform ? { platform } : {}),
      });
      if (!res.ok) throw new Error();
      toast.success("Retried");
      load();
    } catch {
      toast.error("Retry failed");
    }
  };

  const setF = (k, v) => {
    setPage(1);
    setFilters((p) => ({ ...p, [k]: v }));
  };

  return (
    <div className="space-y-4">
      {/* View tabs + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-gray-200 overflow-hidden">
          {[["events", "Events"], ["dedup", "Dedup"], ["errors", "Errors"]].map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-[12px] font-medium ${view === v ? "bg-brand-terracotta text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-500 ml-2">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Auto-refresh
        </label>
        <button onClick={load} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center bg-white border border-gray-200 rounded-lg p-3">
        <Select label="Event" value={filters.eventName} onChange={(v) => setF("eventName", v)} options={["all", ...STANDARD_EVENTS]} />
        <Select label="Platform" value={filters.platform} onChange={(v) => setF("platform", v)} options={["all", "meta", "ga4"]} />
        {view !== "errors" && <Select label="Status" value={filters.status} onChange={(v) => setF("status", v)} options={["all", "success", "partial", "error", "skipped"]} />}
        <Select label="Source" value={filters.source} onChange={(v) => setF("source", v)} options={["all", "client", "server"]} />
        <input
          value={filters.q}
          onChange={(e) => setF("q", e.target.value)}
          placeholder="Search event_id / user…"
          className="flex-1 min-w-[160px] px-3 py-1.5 rounded-md border border-gray-300 text-[12px]"
        />
        <button onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }} className="text-[12px] text-gray-400 hover:text-gray-600 px-2">
          Clear
        </button>
      </div>

      {/* Body */}
      {loading && !data && !dedup ? (
        <Spinner />
      ) : view === "dedup" ? (
        <DedupTable groups={dedup || []} />
      ) : (
        <>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 text-gray-400">
                <tr className="text-left">
                  <th className="w-6"></th>
                  <th className="py-2.5 px-2 font-medium">Time</th>
                  <th className="py-2.5 px-2 font-medium">Event</th>
                  <th className="py-2.5 px-2 font-medium">Source</th>
                  <th className="py-2.5 px-2 font-medium">Meta</th>
                  <th className="py-2.5 px-2 font-medium">GA4</th>
                  <th className="py-2.5 px-2 font-medium">Value</th>
                  <th className="py-2.5 px-2 font-medium">Latency</th>
                  <th className="py-2.5 px-2 font-medium">User</th>
                  <th className="py-2.5 px-2 font-medium">event_id</th>
                </tr>
              </thead>
              <tbody>
                {(data?.events || []).map((e) => (
                  <Row key={e._id} e={e} expanded={expanded === e._id} onToggle={() => setExpanded(expanded === e._id ? null : e._id)} onRetry={retry} />
                ))}
                {data?.events?.length === 0 && (
                  <tr><td colSpan={10} className="text-center text-gray-400 py-8">No events match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between text-[12px] text-gray-500">
              <span>{data.total} events</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Prev</button>
                <span className="px-2 py-1">Page {data.page} / {data.totalPages}</span>
                <button disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ e, expanded, onToggle, onRetry }) {
  return (
    <>
      <tr className="border-t border-gray-50 hover:bg-gray-50/60 cursor-pointer" onClick={onToggle}>
        <td className="text-center text-gray-400">{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
        <td className="py-2 px-2 text-gray-500 whitespace-nowrap">{new Date(e.createdAt).toLocaleTimeString()}</td>
        <td className="py-2 px-2 font-medium text-brand-brown">{e.eventName}</td>
        <td className="py-2 px-2"><Pill tone={e.source === "server" ? "violet" : "blue"}>{e.source}</Pill></td>
        <td className="py-2 px-2"><StatusBadge status={e.meta?.status} /></td>
        <td className="py-2 px-2"><StatusBadge status={e.ga4?.status} /></td>
        <td className="py-2 px-2 text-gray-600">{e.value ? `${e.currency || ""} ${e.value}` : "—"}</td>
        <td className="py-2 px-2 text-gray-500">{e.totalLatencyMs}ms</td>
        <td className="py-2 px-2 text-gray-500">{e.user?.emailMasked || e.user?.ip || "—"}</td>
        <td className="py-2 px-2 font-mono text-[10px] text-gray-400">{e.eventId?.slice(0, 8)}…</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50/40">
          <td colSpan={10} className="p-4">
            <div className="grid lg:grid-cols-2 gap-4">
              <PlatformBlock title="Meta CAPI" result={e.meta} onRetry={() => onRetry(e._id, "meta")} />
              <PlatformBlock title="GA4 MP" result={e.ga4} onRetry={() => onRetry(e._id, "ga4")} />
            </div>
            <div className="mt-3 grid lg:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 mb-1">Inbound</p>
                <JsonViewer data={e.inbound} maxHeight={180} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 mb-1">Match keys / user</p>
                <JsonViewer data={{ user: e.user, matchKeys: e.matchKeys, customData: e.customData }} maxHeight={180} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PlatformBlock({ title, result, onRetry }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-semibold text-gray-500">{title} <StatusBadge status={result?.status} /> {result?.httpStatus ? <span className="text-gray-400">HTTP {result.httpStatus} · {result.latencyMs}ms</span> : null}</p>
        {result?.status === "error" && (
          <button onClick={onRetry} className="flex items-center gap-1 text-[11px] text-brand-terracotta hover:underline">
            <RotateCw size={11} /> Retry
          </button>
        )}
      </div>
      {result?.error && <p className="text-[11px] text-red-600 mb-1">{result.error}</p>}
      <JsonViewer data={{ request: result?.request, response: result?.response }} maxHeight={220} />
    </div>
  );
}

function DedupTable({ groups }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 text-[12px] text-gray-500 border-b border-gray-100">
        Browser + server events sharing an <code className="text-brand-terracotta">event_id</code> are deduplicated by Meta. A <b>Deduped</b> badge means both sides fired with the same id.
      </div>
      <table className="w-full text-[12px]">
        <thead className="text-gray-400 text-left">
          <tr>
            <th className="py-2 px-3 font-medium">event_id</th>
            <th className="py-2 px-3 font-medium">Event</th>
            <th className="py-2 px-3 font-medium">Sources</th>
            <th className="py-2 px-3 font-medium">Dedup</th>
            <th className="py-2 px-3 font-medium">Meta</th>
            <th className="py-2 px-3 font-medium">GA4</th>
            <th className="py-2 px-3 font-medium">Time</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.eventId} className="border-t border-gray-50">
              <td className="py-2 px-3 font-mono text-[10px] text-gray-500">{g.eventId?.slice(0, 12)}…</td>
              <td className="py-2 px-3 font-medium text-brand-brown">{g.eventName}</td>
              <td className="py-2 px-3">{g.sources.map((s) => <Pill key={s} tone={s === "server" ? "violet" : "blue"}>{s}</Pill>)}</td>
              <td className="py-2 px-3">{g.deduped ? <Pill tone="terracotta">deduped ✓</Pill> : <span className="text-gray-300">single</span>}</td>
              <td className="py-2 px-3">{g.metaOk ? "✓" : "—"}</td>
              <td className="py-2 px-3">{g.ga4Ok ? "✓" : "—"}</td>
              <td className="py-2 px-3 text-gray-400">{new Date(g.createdAt).toLocaleString()}</td>
            </tr>
          ))}
          {groups.length === 0 && <tr><td colSpan={7} className="text-center text-gray-400 py-8">No grouped events yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-gray-500">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="px-2 py-1.5 rounded-md border border-gray-300 bg-white text-[12px]">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
