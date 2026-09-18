"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  ArrowLeft, Save, ExternalLink, Loader2, Plus, Zap, Search, RefreshCw, Percent, Package,
  AlertCircle, AlertTriangle, CheckCircle2, ChevronsDownUp, ChevronsUpDown, X, Eye, EyeOff,
} from "lucide-react";
import {
  PageHeader, Card, Button, Field, TextInput, Toggle, Pill, SectionTitle, EmptyState, inputClass,
} from "@/components/admin/ui";
import DatePicker from "@/components/admin/DatePicker";
import CategoryProductBrowser from "@/components/admin/CategoryProductBrowser";
import { ImagePicker } from "@/components/admin/landing/BlockFields";
import FlashProductCard from "@/components/admin/flash/FlashProductCard";
import FlashDealGrid from "@/components/flash/FlashDealGrid";
import {
  blankSale, hydrateSale, newItem, toPayload, saleSummary, itemIssues, findOverlaps,
  applyPercent, sellAllStock, refreshInventory, toPublicItem, sellableSizes,
} from "@/components/admin/flash/editorState";
import { saleStatus } from "@/lib/flash-pricing";
import { formatPrice, slugify, cn } from "@/lib/utils";

// The kit's inputClass is full-width; these inputs size themselves.
const fitInput = inputClass.replace("w-full ", "");

const STATUS = {
  live: { tone: "green", label: "Live" },
  scheduled: { tone: "blue", label: "Scheduled" },
  ended: { tone: "gray", label: "Ended" },
  draft: { tone: "amber", label: "Draft" },
};

const DURATIONS = [
  ["6 hours", 6],
  ["12 hours", 12],
  ["1 day", 24],
  ["3 days", 72],
  ["1 week", 168],
];

// The date picker offers 5-minute steps, so preset times land on one.
function roundUp5(date) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  return d;
}

function humanSpan(ms) {
  const mins = Math.round(Math.abs(ms) / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (!days && m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  return parts.slice(0, 2).join(" ") || "less than a minute";
}

// `blocks`: the server refuses to save this schedule at all.
function scheduleText(form) {
  const now = Date.now();
  const start = form.startsAt ? new Date(form.startsAt).getTime() : null;
  const end = form.endsAt ? new Date(form.endsAt).getTime() : null;
  if (start && end && end <= start) return { tone: "error", blocks: true, text: "The sale has to end after it starts." };
  if (end && end < now) return { tone: "error", text: `The end time passed ${humanSpan(now - end)} ago — shoppers won't see this sale.` };
  const runs = start && end ? ` and runs for ${humanSpan(end - start)}` : "";
  if (start && start > now) return { tone: "info", text: `Starts in ${humanSpan(start - now)}${runs}.` };
  if (end) return { tone: "info", text: `${form.enabled ? "Ends" : "Would end"} in ${humanSpan(end - now)}.` };
  return { tone: "info", text: "No end time — it runs until you switch it off, without a countdown." };
}

function ToggleRow({ title, hint, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[13px] font-medium text-brand-brown">{title}</p>
        {hint && <p className="text-[11px] text-brand-tan mt-0.5">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function SummaryRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-brand-tan/10 last:border-0">
      <span className="text-[12px] text-brand-tan">{label}</span>
      <span className="text-[13px] font-semibold text-brand-brown tabular-nums text-right">{children}</span>
    </div>
  );
}

export default function FlashSaleEditor() {
  const { id } = useParams();
  const router = useRouter();
  const isNew = id === "new";

  const [form, setForm] = useState(isNew ? blankSale() : null);
  const [categories, setCategories] = useState([]);
  const [others, setOthers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [picking, setPicking] = useState(isNew);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("");
  const [bulkPct, setBulkPct] = useState("");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [serverErrors, setServerErrors] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cRes, lRes, sRes] = await Promise.all([
          // The public categories route: it needs no `categories.manage`,
          // which a content-only staffer won't hold.
          fetch("/api/categories"),
          fetch("/api/admin/flash-sales"),
          isNew ? null : fetch(`/api/admin/flash-sales/${id}`),
        ]);
        const cData = await cRes.json().catch(() => []);
        const lData = await lRes.json().catch(() => ({}));
        if (cancelled) return;
        setCategories(Array.isArray(cData) ? cData : cData.categories || []);
        setOthers(lData.sales || []);
        if (sRes) {
          const sData = await sRes.json();
          if (!sRes.ok) throw new Error(sData.error || "Flash sale not found");
          if (cancelled) return;
          setForm(hydrateSale(sData));
          setDirty(false);
          setSlugTouched(true);
        }
      } catch (err) {
        toast.error(err.message);
        router.push("/admin/flash-sales");
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, router]);

  // Every edit goes through here so the unsaved flag can't drift.
  const update = useCallback((patch) => {
    setForm((f) => ({ ...f, ...(typeof patch === "function" ? patch(f) : patch) }));
    setDirty(true);
  }, []);

  // Warn before losing unsaved work.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const summary = useMemo(() => (form ? saleSummary(form) : null), [form]);
  const overlaps = useMemo(() => (form ? findOverlaps(form, others, isNew ? null : id) : new Map()), [form, others, id, isNew]);
  // Severity mirrors the server (lib/flash-admin.js → buildSaleDoc): "error"
  // refuses any save, "live" refuses switching the sale on, "warn" is advice.
  const issues = useMemo(() => {
    if (!form) return [];
    const out = [];
    if (!form.title.trim()) out.push({ severity: "error", text: "Give the sale a title." });
    const sched = scheduleText(form);
    if (sched.tone === "error") out.push({ severity: sched.blocks ? "error" : "warn", text: sched.text });
    if (!form.items.length) out.push({ severity: "live", text: "Add at least one product." });
    else if (!sellableSizes(form)) out.push({ severity: "live", text: "Put at least one size on sale, with a price." });
    else if (!summary.sizesOnSale) out.push({ severity: "warn", text: "Nothing is discounted yet — every sale price is at or above the regular price." });
    for (const it of form.items) {
      for (const i of itemIssues(it, overlaps.get(it.product) || [])) out.push({ ...i, product: it.info.name });
    }
    return out;
  }, [form, summary, overlaps]);

  if (!form) {
    return (
      <div className="flex justify-center py-24 text-brand-tan">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  const status = saleStatus(form);
  const sched = scheduleText(form);
  const q = filter.trim().toLowerCase();
  const visibleItems = q
    ? form.items.filter((it) => it.info.name.toLowerCase().includes(q) || it.info.sku.toLowerCase().includes(q))
    : form.items;
  const anyOpen = form.items.some((it) => it.open);

  const setTitle = (title) => update(slugTouched ? { title } : { title, slug: slugify(title) });
  const setItem = (pid, next) => update((f) => ({ items: f.items.map((it) => (it.product === pid ? next : it)) }));
  const addProduct = (p) =>
    update((f) => (f.items.some((it) => it.product === String(p._id)) ? {} : { items: [...f.items, newItem(p)] }));
  const removeProduct = (pid) => {
    const it = form.items.find((i) => i.product === String(pid));
    if (it?.soldCount > 0 && !confirm(`${it.soldCount} of “${it.info.name}” already sold in this sale. Remove it anyway?`)) return;
    update((f) => ({ items: f.items.filter((i) => i.product !== String(pid)) }));
  };

  const setDuration = (hours) => {
    const start = form.startsAt ? new Date(form.startsAt) : roundUp5(new Date());
    update({ endsAt: new Date(start.getTime() + hours * 3600000).toISOString() });
  };

  async function refreshStock() {
    if (!form.items.length) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/flash-sales/products?ids=${form.items.map((i) => i.product).join(",")}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read stock");
      const byId = new Map((data.products || []).map((p) => [String(p._id), p]));
      setForm((f) => ({ ...f, items: f.items.map((it) => (byId.has(it.product) ? refreshInventory(it, byId.get(it.product)) : it)) }));
      toast.success("Stock refreshed");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  async function save(overrides = {}) {
    const next = { ...form, ...overrides };
    // The server applies the same rules; checking here too shows the whole
    // list at once instead of one refusal at a time.
    const stop = issues.filter((i) => i.severity === "error" || (next.enabled && i.severity === "live"));
    if (stop.length) {
      setServerErrors(stop.map((i) => (i.product ? `${i.product}: ${i.text}` : i.text)));
      return toast.error(next.enabled ? "Fix these before switching the sale on" : "Fix these before saving");
    }
    setSaving(true);
    setServerErrors([]);
    try {
      const res = await fetch(isNew ? "/api/admin/flash-sales" : `/api/admin/flash-sales/${id}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toPayload(next)),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerErrors(data.errors || [data.error || "Failed to save"]);
        throw new Error(data.error || "Failed to save");
      }
      setDirty(false);
      toast.success(isNew ? "Flash sale created" : next.enabled && !form.enabled ? "Saved and switched on" : "Saved");
      if (isNew) {
        router.replace(`/admin/flash-sales/${data._id}`);
        return;
      }
      // Re-read with live stock, keeping the rows the admin had open.
      const fresh = await fetch(`/api/admin/flash-sales/${id}`).then((r) => r.json());
      const open = new Set(form.items.filter((i) => i.open).map((i) => i.product));
      const hydrated = hydrateSale(fresh);
      setForm({ ...hydrated, items: hydrated.items.map((i) => ({ ...i, open: open.has(i.product) })) });
      setDirty(false);
      fetch("/api/admin/flash-sales").then((r) => r.json()).then((d) => setOthers(d.sales || [])).catch(() => {});
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={form.title || (isNew ? "New flash sale" : "Untitled flash sale")}
        icon={Zap}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill>
            {dirty && <Pill tone="amber">Unsaved</Pill>}
            {form.slug && <span className="font-mono text-[12px]">/flash-sale/{form.slug}</span>}
          </span>
        }
        actions={
          <>
            <Button as={Link} href="/admin/flash-sales" variant="ghost" size="sm">
              <ArrowLeft size={14} /> Back
            </Button>
            {!isNew && (
              <Button as="a" href={`/flash-sale/${form.slug || id}`} target="_blank" rel="noopener" variant="outline" size="sm">
                <ExternalLink size={14} /> {form.enabled ? "View" : "Preview"}
              </Button>
            )}
            {!form.enabled && (
              <Button variant="secondary" size="sm" disabled={saving} onClick={() => save({ enabled: true })}>
                <Zap size={14} /> Save & switch on
              </Button>
            )}
            <Button size="sm" onClick={() => save()} disabled={saving || (!dirty && !isNew)}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {isNew ? "Create" : "Save"}
            </Button>
          </>
        }
      />

      {serverErrors.length > 0 && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-semibold text-red-700">Can&apos;t save yet</p>
            <button type="button" onClick={() => setServerErrors([])} className="text-red-400 hover:text-red-600"><X size={14} /></button>
          </div>
          <ul className="mt-1 space-y-0.5 list-disc pl-5 text-[12px] text-red-700">
            {serverErrors.slice(0, 8).map((e) => <li key={e}>{e}</li>)}
            {serverErrors.length > 8 && <li>…and {serverErrors.length - 8} more</li>}
          </ul>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] 2xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-5">
          <Card className="space-y-4">
            <SectionTitle>Campaign</SectionTitle>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Title">
                <TextInput value={form.title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend Flash Sale" autoFocus={isNew} />
              </Field>
              <Field label="Tagline" hint="One line under the title.">
                <TextInput value={form.subtitle} onChange={(e) => update({ subtitle: e.target.value })} placeholder="Up to 50% off — limited stock" />
              </Field>
            </div>
            <Field label="Page link" hint="The sale's own page. Short and readable is best.">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] text-brand-tan whitespace-nowrap">/flash-sale/</span>
                <TextInput
                  value={form.slug}
                  onChange={(e) => { setSlugTouched(true); update({ slug: e.target.value }); }}
                  onBlur={() => form.slug && update({ slug: slugify(form.slug) })}
                  placeholder="weekend-flash-sale"
                  className="font-mono"
                />
              </div>
            </Field>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
              <Field label="Description (optional)" hint="Shown on the sale's page, under the title.">
                <textarea
                  rows={4}
                  className={`${inputClass} resize-y`}
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Our biggest drop of the season. Prices hold only while stock lasts."
                />
              </Field>
              <div>
                <ImagePicker label="Banner image (optional)" value={form.bannerImage} onChange={(v) => update({ bannerImage: v })} />
                <p className="text-[11px] text-brand-tan mt-1">A wide photo behind the title on the sale&apos;s page and the flash-sale hub.</p>
              </div>
            </div>
          </Card>

          {/* ── Products ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-brand-brown flex items-center gap-2">
                  <Package size={16} className="text-brand-terracotta" /> Products &amp; pricing
                  <span className="text-[12px] font-medium text-brand-tan">({form.items.length})</span>
                </h2>
                <p className="text-[12px] text-brand-tan mt-0.5">
                  Stock is read live from inventory. Tick the sizes to sell, set a price for the product or per size, and choose all stock or a fixed number.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {form.items.length > 0 && (
                  <Button variant="outline" size="sm" onClick={refreshStock} disabled={refreshing} title="Re-read stock and prices from inventory">
                    <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Refresh stock
                  </Button>
                )}
                <Button size="sm" variant={picking ? "secondary" : "primary"} onClick={() => setPicking((v) => !v)}>
                  <Plus size={14} /> {picking ? "Done adding" : "Add products"}
                </Button>
              </div>
            </div>

            {picking && (
              <Card padded={false} className="p-3">
                <CategoryProductBrowser
                  categories={categories}
                  endpoint="/api/admin/flash-sales/products"
                  selectedIds={form.items.map((i) => i.product)}
                  onAdd={addProduct}
                  onRemove={removeProduct}
                />
              </Card>
            )}

            {form.items.length > 1 && (
              <Card padded={false} className="px-3 py-2.5 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-tan" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Find a product in this sale…"
                    className={cn(inputClass, "pl-8 py-1.5")}
                  />
                </div>
                <div className="flex items-center">
                  <span className="px-2.5 py-[7px] rounded-l-lg border border-r-0 border-brand-tan/30 bg-brand-cream text-[12px] text-brand-tan">
                    <Percent size={12} />
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="95"
                    value={bulkPct}
                    onChange={(e) => setBulkPct(e.target.value)}
                    placeholder="Off"
                    aria-label="Discount for every product"
                    className={cn(fitInput, "w-[64px] py-1.5 rounded-none")}
                  />
                  <button
                    type="button"
                    disabled={!(Number(bulkPct) > 0)}
                    onClick={() => {
                      update((f) => ({ items: f.items.map((it) => applyPercent(it, bulkPct)) }));
                      toast.success(`${bulkPct}% off applied to every product`);
                      setBulkPct("");
                    }}
                    className="px-2.5 py-[7px] rounded-r-lg border border-l-0 border-brand-tan/30 bg-white text-[12px] font-medium text-brand-brown whitespace-nowrap hover:bg-brand-cream disabled:opacity-50"
                  >
                    Apply to all
                  </button>
                </div>
                <Button variant="outline" size="sm" onClick={() => update((f) => ({ items: f.items.map(sellAllStock) }))}>
                  Sell all stock everywhere
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, items: f.items.map((it) => ({ ...it, open: !anyOpen })) }))}
                >
                  {anyOpen ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />} {anyOpen ? "Collapse all" : "Expand all"}
                </Button>
              </Card>
            )}

            {form.items.length === 0 ? (
              !picking && (
                <Card>
                  <EmptyState
                    icon={Package}
                    title="No products yet"
                    hint="Add products to put them on sale. You'll see each size's real stock and can choose which sizes to sell, at what price, and how many."
                    action={<Button onClick={() => setPicking(true)}><Plus size={14} /> Add products</Button>}
                  />
                </Card>
              )
            ) : (
              <div className="space-y-2.5">
                {visibleItems.map((it) => (
                  <FlashProductCard
                    key={it.product}
                    item={it}
                    overlaps={overlaps.get(it.product) || []}
                    onChange={(next) => {
                      // Opening/closing a row isn't an edit.
                      const onlyToggle = next.open !== it.open && next.sizes === it.sizes && next.salePrice === it.salePrice && next.stockLimit === it.stockLimit;
                      if (onlyToggle) setForm((f) => ({ ...f, items: f.items.map((x) => (x.product === it.product ? next : x)) }));
                      else setItem(it.product, next);
                    }}
                    onRemove={() => removeProduct(it.product)}
                  />
                ))}
                {!visibleItems.length && (
                  <p className="text-center text-[13px] text-brand-tan py-6">No product in this sale matches “{filter}”.</p>
                )}
              </div>
            )}

            {form.items.length > 0 && (
              <Card padded={false}>
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-[13px] font-semibold text-brand-brown flex items-center gap-2">
                    {showPreview ? <EyeOff size={14} /> : <Eye size={14} />} Storefront preview
                  </span>
                  <span className="text-[11px] text-brand-tan">How the first deals look to shoppers</span>
                </button>
                {showPreview && (
                  <div className="px-4 pb-4 border-t border-brand-tan/10 pt-4 bg-brand-cream/40">
                    <FlashDealGrid
                      items={form.items.map(toPublicItem).filter((i) => i.sizes.length)}
                      maxRows={1}
                      mode="preview"
                    />
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <SectionTitle className="mb-0">Status</SectionTitle>
              <Pill tone={STATUS[status].tone}>{STATUS[status].label}</Pill>
            </div>
            <ToggleRow
              title="Switched on"
              hint={form.enabled ? "Shoppers see it while it's in its schedule." : "A draft — only staff can preview it."}
              checked={form.enabled}
              onChange={(v) => update({ enabled: v })}
            />
            <ToggleRow
              title="Show on homepage"
              hint="In the homepage flash-sale section."
              checked={form.showOnHomepage}
              onChange={(v) => update({ showOnHomepage: v })}
            />
            <Field label="Display order" hint="Higher comes first when several sales run at once.">
              <input type="number" value={form.priority} onChange={(e) => update({ priority: e.target.value })} className={cn(fitInput, "w-24")} />
            </Field>
          </Card>

          <Card className="space-y-3">
            <SectionTitle className="mb-0">Schedule</SectionTitle>
            <Field label="Starts">
              <DatePicker withTime value={form.startsAt} onChange={(v) => update({ startsAt: v })} placeholder="As soon as it's switched on" />
            </Field>
            <Field label="Ends" hint="Powers the countdown timer.">
              <DatePicker withTime value={form.endsAt} onChange={(v) => update({ endsAt: v })} placeholder="No end" />
            </Field>
            <div>
              <span className="block text-[11px] text-brand-tan mb-1.5">Run for</span>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map(([label, hours]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setDuration(hours)}
                    className="px-2.5 py-1 rounded-md border border-brand-tan/30 bg-white text-[11.5px] text-brand-brown hover:border-brand-terracotta hover:text-brand-terracotta transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className={cn("text-[12px] rounded-md px-2.5 py-2", sched.tone === "error" ? "bg-red-50 text-red-700" : "bg-brand-cream/60 text-brand-brown")}>
              {sched.text}
            </p>
          </Card>

          <Card>
            <SectionTitle>Summary</SectionTitle>
            <SummaryRow label="Products">{summary.products}</SummaryRow>
            <SummaryRow label="Sizes on sale">{summary.sizesOnSale}</SummaryRow>
            <SummaryRow label="Units offered now">{summary.units}</SummaryRow>
            {summary.units > 0 && (
              <SummaryRow label="Worth at sale price">
                {formatPrice(summary.saleValue)}
                <span className="block text-[11px] font-normal text-brand-tan line-through">{formatPrice(summary.regularValue)}</span>
              </SummaryRow>
            )}
            <SummaryRow label="Average discount">
              {summary.avgDiscount}%{summary.maxDiscount > summary.avgDiscount && <span className="text-[11px] font-normal text-brand-tan"> · up to {summary.maxDiscount}%</span>}
            </SummaryRow>
            {!isNew && <SummaryRow label="Sold so far">{summary.sold}</SummaryRow>}
          </Card>

          <Card>
            <SectionTitle>Checklist</SectionTitle>
            {issues.length === 0 ? (
              <p className="flex items-center gap-2 text-[12.5px] text-emerald-700">
                <CheckCircle2 size={15} /> Everything looks ready.
              </p>
            ) : (
              <ul className="space-y-2 max-h-[320px] overflow-y-auto">
                {issues.map((i, k) => {
                  const red = i.severity === "error" || (i.severity === "live" && form.enabled);
                  return (
                    <li key={k} className={cn("flex items-start gap-1.5 text-[12px] leading-snug", red ? "text-red-600" : "text-amber-700")}>
                      {red ? <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />}
                      <span>
                        {i.product && <b className="font-semibold">{i.product}: </b>}
                        {i.text}
                        {i.severity === "live" && !form.enabled && (
                          <span className="ml-1.5 inline-block rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase tracking-wide align-middle">Before going live</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
