"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import {
  Zap, Plus, Pencil, Trash2, Clock, Package, Loader2, ExternalLink, Files, Search, Home, TrendingDown, Radio, CalendarClock, ShoppingBag,
} from "lucide-react";
import {
  PageHeader, Card, Button, Toggle, Pill, EmptyState, StatCard, inputClass,
} from "@/components/admin/ui";
import { shouldUnoptimizeImage, cn } from "@/lib/utils";

const STATUS = {
  live: { tone: "green", label: "Live" },
  scheduled: { tone: "blue", label: "Scheduled" },
  draft: { tone: "amber", label: "Draft" },
  ended: { tone: "gray", label: "Ended" },
};

const TABS = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "scheduled", label: "Scheduled" },
  { id: "draft", label: "Drafts" },
  { id: "ended", label: "Ended" },
];

function span(ms) {
  const mins = Math.max(1, Math.round(Math.abs(ms) / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d}d${h ? ` ${h}h` : ""}`;
  if (h) return `${h}h${m ? ` ${m}m` : ""}`;
  return `${m}m`;
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

// "Ends in 5h 20m" / "Starts in 2d 4h" / "Ended 3d ago" — the one line that
// says where a sale is in its life.
function timing(sale, now) {
  const start = sale.startsAt ? new Date(sale.startsAt).getTime() : null;
  const end = sale.endsAt ? new Date(sale.endsAt).getTime() : null;
  if (end && end < now) return `Ended ${span(now - end)} ago`;
  if (start && start > now) return `Starts in ${span(start - now)}`;
  if (end) return sale.enabled ? `Ends in ${span(end - now)}` : `Would end in ${span(end - now)}`;
  return sale.enabled ? "Running — no end date" : "No schedule";
}

function SaleCard({ sale, now, busy, onToggle, onDuplicate, onDelete }) {
  const st = STATUS[sale.status] || STATUS.draft;
  const { stats } = sale;
  const pct = stats.total > 0 ? Math.round((stats.sold / stats.total) * 100) : 0;

  return (
    <Card padded={false} className={cn("flex flex-col overflow-hidden", sale.status === "ended" && "opacity-75")}>
      {/* Banner / product strip */}
      <Link href={`/admin/flash-sales/${sale._id}`} className="relative block h-24 bg-gradient-to-br from-brand-brown to-brand-terracotta overflow-hidden">
        {sale.bannerImage ? (
          <Image src={sale.bannerImage} alt="" fill className="object-cover" sizes="400px" unoptimized={shouldUnoptimizeImage(sale.bannerImage)} />
        ) : (
          <div className="absolute inset-0 grid grid-cols-4">
            {sale.thumbs.map((src) => (
              <div key={src} className="relative">
                <Image src={src} alt="" fill className="object-cover" sizes="100px" unoptimized={shouldUnoptimizeImage(src)} />
              </div>
            ))}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute top-2.5 left-2.5">
          <Pill tone={st.tone} className="shadow-sm">
            {sale.status === "live" && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />}
            {st.label}
          </Pill>
        </span>
        {sale.showOnHomepage && sale.status !== "ended" && (
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-brand-brown">
            <Home size={10} /> Homepage
          </span>
        )}
      </Link>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="min-w-0">
          <Link href={`/admin/flash-sales/${sale._id}`} className="block font-semibold text-brand-brown truncate hover:text-brand-terracotta transition-colors">
            {sale.title}
          </Link>
          {sale.subtitle && <p className="text-[12px] text-brand-tan truncate mt-0.5">{sale.subtitle}</p>}
          <p className="flex items-center gap-1.5 text-[12px] text-brand-brown mt-1.5">
            <Clock size={12} className="text-brand-tan" />
            <span className="font-medium">{timing(sale, now)}</span>
          </p>
          {(sale.startsAt || sale.endsAt) && (
            <p className="text-[11px] text-brand-tan mt-0.5 pl-[18px]">
              {fmtDate(sale.startsAt) || "On switch-on"} → {fmtDate(sale.endsAt) || "no end"}
            </p>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[11px] mb-1">
            <span className="text-brand-tan">
              <b className="text-brand-brown">{stats.sold}</b> sold · <b className="text-brand-brown">{stats.remaining}</b> left
            </span>
            <span className="text-brand-tan">{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-brand-cream-dark overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-terracotta-light to-brand-terracotta" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Pill tone="brown"><Package size={10} className="mr-1" />{stats.products} product{stats.products === 1 ? "" : "s"}</Pill>
          <Pill tone="gray">{stats.sizesOnSale} size{stats.sizesOnSale === 1 ? "" : "s"} on sale</Pill>
          {stats.maxDiscount > 0 && <Pill tone="terracotta"><TrendingDown size={10} className="mr-1" />Up to {stats.maxDiscount}%</Pill>}
        </div>

        <div className="flex items-center gap-1 pt-3 mt-auto border-t border-brand-tan/10">
          <label className="flex items-center gap-2 mr-auto cursor-pointer" title={sale.enabled ? "Switch off" : "Switch on"}>
            <Toggle checked={sale.enabled} disabled={busy} onChange={(v) => onToggle(sale, v)} />
            <span className="text-[11px] text-brand-tan">{sale.enabled ? "On" : "Off"}</span>
          </label>
          <Button as={Link} href={`/admin/flash-sales/${sale._id}`} variant="ghost" size="sm">
            <Pencil size={13} /> Edit
          </Button>
          <Button as="a" href={`/flash-sale/${sale.slug}`} target="_blank" rel="noopener" variant="ghost" size="icon" title={sale.enabled ? "View on the store" : "Preview (staff only)"}>
            <ExternalLink size={14} />
          </Button>
          <Button variant="ghost" size="icon" title="Duplicate as a draft" disabled={busy} onClick={() => onDuplicate(sale)}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Files size={14} />}
          </Button>
          <Button variant="danger-ghost" size="icon" title="Delete" disabled={busy} onClick={() => onDelete(sale)}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default function FlashSalesPage() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/flash-sales");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load flash sales");
      setSales(data.sales || []);
      setNow(Date.now());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Keep "ends in …" roughly current while the page is open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c = { all: sales.length, live: 0, scheduled: 0, draft: 0, ended: 0 };
    for (const s of sales) c[s.status] = (c[s.status] || 0) + 1;
    return c;
  }, [sales]);

  const totals = useMemo(() => ({
    sold: sales.reduce((n, s) => n + s.stats.sold, 0),
    left: sales.filter((s) => s.status === "live").reduce((n, s) => n + s.stats.remaining, 0),
  }), [sales]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter(
      (s) => (tab === "all" || s.status === tab) && (!q || s.title.toLowerCase().includes(q) || (s.subtitle || "").toLowerCase().includes(q))
    );
  }, [sales, tab, query]);

  async function toggle(sale, enabled) {
    setBusyId(sale._id);
    try {
      const res = await fetch(`/api/admin/flash-sales/${sale._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't update the sale");
      toast.success(enabled ? `“${sale.title}” is switched on` : `“${sale.title}” is switched off`);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function duplicate(sale) {
    setBusyId(sale._id);
    try {
      const res = await fetch(`/api/admin/flash-sales/${sale._id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to duplicate");
      toast.success("Duplicated as a draft");
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function remove(sale) {
    const warning = sale.stats.sold > 0 ? ` ${sale.stats.sold} units were sold through it; those orders are kept.` : "";
    if (!confirm(`Delete “${sale.title}”?${warning}`)) return;
    setBusyId(sale._id);
    try {
      const res = await fetch(`/api/admin/flash-sales/${sale._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Deleted");
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div>
      <PageHeader
        title="Flash Sales"
        subtitle="Time-limited, limited-stock campaigns — each with its own page, several can run at once."
        icon={Zap}
        actions={
          <>
            <Button as="a" href="/flash-sale" target="_blank" rel="noopener" variant="outline">
              <ExternalLink size={14} /> Flash sale page
            </Button>
            <Button as={Link} href="/admin/flash-sales/new">
              <Plus size={15} /> New flash sale
            </Button>
          </>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20 text-brand-tan"><Loader2 size={22} className="animate-spin" /></div>
      ) : sales.length === 0 ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="No flash sales yet"
            hint="Pick products, choose which sizes go on sale, set a price for the product or each size, and decide how many to sell — the stock comes straight from your inventory."
            action={<Button as={Link} href="/admin/flash-sales/new"><Plus size={15} /> Create your first flash sale</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatCard label="Live now" value={counts.live} icon={Radio} accent={counts.live ? "text-emerald-700" : undefined} />
            <StatCard label="Scheduled" value={counts.scheduled} icon={CalendarClock} />
            <StatCard label="Units sold" value={totals.sold} icon={ShoppingBag} hint="Across every sale" />
            <StatCard label="Units left" value={totals.left} icon={Package} hint="In live sales" />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
            <div className="flex gap-1 p-1 rounded-lg bg-brand-cream-dark/60 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12.5px] font-medium whitespace-nowrap transition-colors",
                    tab === t.id ? "bg-white text-brand-brown shadow-sm" : "text-brand-tan hover:text-brand-brown"
                  )}
                >
                  {t.label}
                  <span className={cn("text-[10px] rounded-full px-1.5", tab === t.id ? "bg-brand-cream text-brand-brown" : "text-brand-tan")}>
                    {counts[t.id] || 0}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative md:w-72">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-tan" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sales…" className={cn(inputClass, "pl-8")} />
            </div>
          </div>

          {shown.length === 0 ? (
            <Card>
              <EmptyState icon={Search} title="Nothing here" hint={query ? `No sale matches “${query}”.` : "No sales in this group yet."} />
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
              {shown.map((s) => (
                <SaleCard
                  key={s._id}
                  sale={s}
                  now={now}
                  busy={busyId === s._id}
                  onToggle={toggle}
                  onDuplicate={duplicate}
                  onDelete={remove}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
