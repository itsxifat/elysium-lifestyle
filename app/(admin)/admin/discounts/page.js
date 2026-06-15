"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import toast from "react-hot-toast";
import {
  Tag, Plus, X, Pencil, Trash2, Search, Percent, Ticket, Zap, CheckCircle2,
} from "lucide-react";
import {
  PageHeader, Card, Button, Field, TextInput, Select, Toggle, SectionTitle,
  Pill, EmptyState, TableWrap, StatCard,
} from "@/components/admin/ui";
import DatePicker from "@/components/admin/DatePicker";
import { formatPrice } from "@/lib/utils";

const TYPE_LABELS = {
  percentage: "% off",
  fixed: "Fixed amount",
  free_shipping: "Free shipping",
  buy_x_get_y: "Buy X get Y",
  tiered: "Tiered",
};

const blank = {
  title: "", description: "", method: "code", code: "",
  type: "percentage", value: 10, maxDiscount: 0,
  buyQuantity: 1, getQuantity: 1, getDiscountPercent: 100,
  tiers: [{ minSubtotal: 0, type: "percentage", value: 0 }],
  appliesTo: "all", products: [], categories: [],
  minSubtotal: 0, minQuantity: 0, firstOrderOnly: false,
  usageLimit: 0, perCustomerLimit: 0,
  startsAt: "", endsAt: "",
  allowStacking: false, priority: 0, active: true,
};

// ── Create / edit modal ─────────────────────────────────────────────────────
function DiscountModal({ initial, categories, onClose, onSaved }) {
  const editing = !!initial?._id;
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...blank, ...initial,
          code: initial.code || "",
          products: (initial.products || []).map(String),
          categories: (initial.categories || []).map(String),
          tiers: initial.tiers?.length ? initial.tiers : blank.tiers,
          startsAt: initial.startsAt || "",
          endsAt: initial.endsAt || "",
        }
      : { ...blank }
  );
  const [saving, setSaving] = useState(false);
  const [prodResults, setProdResults] = useState([]);
  const [prodMap, setProdMap] = useState({});
  const [prodQuery, setProdQuery] = useState("");
  const searchTimer = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const searchProducts = (q) => {
    setProdQuery(q);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/orders/search-products?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      setProdResults(d.products || []);
    }, 250);
  };
  const addProduct = (p) => {
    if (!form.products.includes(p._id)) set("products", [...form.products, p._id]);
    setProdMap((m) => ({ ...m, [p._id]: p.name }));
  };
  const removeProduct = (id) => set("products", form.products.filter((x) => x !== id));
  const toggleCategory = (id) =>
    set("categories", form.categories.includes(id) ? form.categories.filter((x) => x !== id) : [...form.categories, id]);

  const setTier = (i, k, v) => set("tiers", form.tiers.map((t, idx) => (idx === i ? { ...t, [k]: v } : t)));
  const addTier = () => set("tiers", [...form.tiers, { minSubtotal: 0, type: "percentage", value: 0 }]);
  const removeTier = (i) => set("tiers", form.tiers.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (form.method === "code" && !form.code.trim()) return toast.error("Coupon code is required");
    setSaving(true);
    try {
      const url = editing ? `/api/admin/discounts/${initial._id}` : "/api/admin/discounts";
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) return toast.error(d.error || "Failed");
      toast.success(editing ? "Discount updated" : "Discount created");
      onSaved();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop is fixed so it stays put while the panel scrolls */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
      <div className="relative min-h-full flex items-start justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="relative bg-white w-full max-w-3xl my-8 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-tan/15 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center"><Tag size={15} /></div>
            <h2 className="font-semibold text-brand-brown">{editing ? "Edit Discount" : "New Discount"}</h2>
          </div>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basics */}
          <section>
            <SectionTitle>Basics</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Title *" className="sm:col-span-2"><TextInput value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Eid Sale 20%" /></Field>
              <Field label="Method">
                <Select value={form.method} onChange={(e) => set("method", e.target.value)}>
                  <option value="code">Coupon code</option>
                  <option value="automatic">Automatic</option>
                </Select>
              </Field>
              {form.method === "code" ? (
                <Field label="Code *"><TextInput value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="EID20" /></Field>
              ) : <div className="hidden sm:block" />}
              <Field label="Type" className="sm:col-span-2">
                <Select value={form.type} onChange={(e) => set("type", e.target.value)}>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
            </div>
          </section>

          {/* Type-specific */}
          {(form.type === "percentage" || form.type === "fixed" || form.type === "buy_x_get_y" || form.type === "tiered") && (
            <section>
              <SectionTitle>Discount value</SectionTitle>
              {(form.type === "percentage" || form.type === "fixed") && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label={form.type === "percentage" ? "Percent (%)" : "Amount (Tk)"}>
                    <TextInput type="number" value={form.value} onChange={(e) => set("value", e.target.value)} />
                  </Field>
                  {form.type === "percentage" && (
                    <Field label="Max discount (Tk)" hint="0 = no cap"><TextInput type="number" value={form.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} /></Field>
                  )}
                </div>
              )}
              {form.type === "buy_x_get_y" && (
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Buy qty"><TextInput type="number" value={form.buyQuantity} onChange={(e) => set("buyQuantity", e.target.value)} /></Field>
                  <Field label="Get qty"><TextInput type="number" value={form.getQuantity} onChange={(e) => set("getQuantity", e.target.value)} /></Field>
                  <Field label="Get % off" hint="100 = free"><TextInput type="number" value={form.getDiscountPercent} onChange={(e) => set("getDiscountPercent", e.target.value)} /></Field>
                </div>
              )}
              {form.type === "tiered" && (
                <div className="space-y-2">
                  {form.tiers.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TextInput type="number" placeholder="Min spend" value={t.minSubtotal} onChange={(e) => setTier(i, "minSubtotal", e.target.value)} />
                      <Select value={t.type} onChange={(e) => setTier(i, "type", e.target.value)} className="w-28">
                        <option value="percentage">%</option>
                        <option value="fixed">Tk</option>
                      </Select>
                      <TextInput type="number" placeholder="Value" value={t.value} onChange={(e) => setTier(i, "value", e.target.value)} />
                      <button onClick={() => removeTier(i)} className="text-brand-tan hover:text-red-500"><Trash2 size={15} /></button>
                    </div>
                  ))}
                  <button onClick={addTier} className="text-[12px] text-brand-terracotta hover:underline">+ Add tier</button>
                </div>
              )}
            </section>
          )}

          {/* Scope */}
          <section>
            <SectionTitle>Applies to</SectionTitle>
            <Select value={form.appliesTo} onChange={(e) => set("appliesTo", e.target.value)}>
              <option value="all">Entire order</option>
              <option value="products">Specific products</option>
              <option value="categories">Specific categories</option>
            </Select>

            {form.appliesTo === "categories" && (
              <div className="mt-3 max-h-44 overflow-y-auto border border-brand-tan/15 rounded-lg p-3 grid grid-cols-2 lg:grid-cols-3 gap-1">
                {categories.map((c) => (
                  <label key={c._id} className="flex items-center gap-2 text-[12px] text-brand-brown cursor-pointer">
                    <input type="checkbox" checked={form.categories.includes(String(c._id))} onChange={() => toggleCategory(String(c._id))} className="accent-brand-terracotta" />
                    {c.name}
                  </label>
                ))}
              </div>
            )}

            {form.appliesTo === "products" && (
              <div className="mt-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan/60" />
                  <input value={prodQuery} onChange={(e) => searchProducts(e.target.value)} placeholder="Search products to add…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-brand-tan/30 text-sm text-brand-brown" />
                  {prodResults.length > 0 && prodQuery && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-brand-tan/20 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                      {prodResults.map((p) => (
                        <button key={p._id} onClick={() => { addProduct(p); setProdQuery(""); setProdResults([]); }} className="block w-full text-left px-3 py-2 text-[12px] text-brand-brown hover:bg-brand-cream">{p.name}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.products.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 bg-brand-cream px-2 py-1 rounded text-[11px] text-brand-brown">
                      {prodMap[id] || id.slice(-6)}
                      <button onClick={() => removeProduct(id)}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Conditions & schedule */}
          <section>
            <SectionTitle>Conditions, limits & schedule</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Min subtotal (Tk)"><TextInput type="number" value={form.minSubtotal} onChange={(e) => set("minSubtotal", e.target.value)} /></Field>
              <Field label="Min items"><TextInput type="number" value={form.minQuantity} onChange={(e) => set("minQuantity", e.target.value)} /></Field>
              <Field label="Priority" hint="higher applies first"><TextInput type="number" value={form.priority} onChange={(e) => set("priority", e.target.value)} /></Field>
              <Field label="Total usage limit" hint="0 = unlimited"><TextInput type="number" value={form.usageLimit} onChange={(e) => set("usageLimit", e.target.value)} /></Field>
              <Field label="Per-customer limit" hint="0 = unlimited"><TextInput type="number" value={form.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} /></Field>
              <div className="hidden lg:block" />
              <Field label="Starts at"><DatePicker withTime value={form.startsAt} onChange={(v) => set("startsAt", v)} placeholder="Any time" /></Field>
              <Field label="Ends at"><DatePicker withTime value={form.endsAt} onChange={(v) => set("endsAt", v)} placeholder="No end" /></Field>
            </div>
            <div className="flex flex-wrap gap-5 mt-4">
              <label className="flex items-center gap-2 text-[13px] text-brand-brown"><Toggle checked={form.firstOrderOnly} onChange={(v) => set("firstOrderOnly", v)} /> First order only</label>
              <label className="flex items-center gap-2 text-[13px] text-brand-brown"><Toggle checked={form.allowStacking} onChange={(v) => set("allowStacking", v)} /> Allow stacking</label>
              <label className="flex items-center gap-2 text-[13px] text-brand-brown"><Toggle checked={form.active} onChange={(v) => set("active", v)} /> Active</label>
            </div>
          </section>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-brand-tan/15 sticky bottom-0 bg-white rounded-b-2xl">
          <Button onClick={submit} disabled={saving} className="flex-1">{saving ? "Saving…" : editing ? "Save changes" : "Create discount"}</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AdminDiscountsPage() {
  const [discounts, setDiscounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, cRes] = await Promise.all([fetch("/api/admin/discounts"), fetch("/api/categories")]);
      const d = await dRes.json();
      setDiscounts(d.discounts || []);
      setCategories((await cRes.json()) || []);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    total: discounts.length,
    active: discounts.filter((d) => d.active).length,
    coupons: discounts.filter((d) => d.method === "code").length,
    automatic: discounts.filter((d) => d.method === "automatic").length,
  }), [discounts]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return discounts;
    return discounts.filter((d) => d.title?.toLowerCase().includes(q) || d.code?.toLowerCase().includes(q));
  }, [discounts, search]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (d) => { setEditing(d); setModalOpen(true); };
  const del = async (d) => {
    if (!confirm(`Delete "${d.title}"?`)) return;
    const res = await fetch(`/api/admin/discounts/${d._id}`, { method: "DELETE" });
    if (res.ok) { toast.success("Deleted"); load(); } else toast.error("Failed to delete");
  };
  const toggleActive = async (d) => {
    const res = await fetch(`/api/admin/discounts/${d._id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, active: !d.active }),
    });
    if (res.ok) load();
  };

  const valueLabel = (d) => {
    if (d.type === "percentage") return `${d.value}%`;
    if (d.type === "fixed") return formatPrice(d.value);
    if (d.type === "free_shipping") return "Free ship";
    if (d.type === "buy_x_get_y") return `Buy ${d.buyQuantity} get ${d.getQuantity}`;
    if (d.type === "tiered") return `${d.tiers?.length || 0} tiers`;
    return "—";
  };

  return (
    <div>
      <PageHeader
        title="Discounts"
        subtitle="Coupon codes & automatic promotions"
        icon={Tag}
        actions={<Button onClick={openNew}><Plus size={14} /> New Discount</Button>}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard label="Total" value={stats.total} icon={Tag} accent="text-brand-brown" />
        <StatCard label="Active" value={stats.active} icon={CheckCircle2} accent="text-emerald-600" />
        <StatCard label="Coupons" value={stats.coupons} icon={Ticket} />
        <StatCard label="Automatic" value={stats.automatic} icon={Zap} />
      </div>

      {/* Toolbar */}
      <div className="relative mb-4 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan/60" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or code…" className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-brand-tan/30 text-sm text-brand-brown bg-white focus:outline-none focus:border-brand-brown" />
      </div>

      <Card padded={false}>
        {loading ? (
          <div className="py-12 text-center text-brand-tan text-sm">Loading…</div>
        ) : visible.length === 0 ? (
          <EmptyState icon={Percent} title="No discounts yet" hint="Create coupon codes or automatic promotions." action={<Button onClick={openNew}><Plus size={14} /> New Discount</Button>} />
        ) : (
          <TableWrap>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-brand-cream/40">
                  {["Discount", "Type", "Value", "Scope", "Used", "Status", ""].map((h, i) => (
                    <th key={i} className="text-left px-4 py-2.5 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr key={d._id} className="border-t border-brand-tan/10 hover:bg-brand-cream/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-brand-brown">{d.title}</p>
                      {d.code ? <span className="text-[11px] font-mono bg-brand-cream px-1.5 py-0.5 rounded text-brand-terracotta">{d.code}</span> : <span className="text-[11px] text-brand-tan">automatic</span>}
                    </td>
                    <td className="px-4 py-3 text-brand-brown/70 text-[12px]">{TYPE_LABELS[d.type]}</td>
                    <td className="px-4 py-3 font-medium text-brand-brown">{valueLabel(d)}</td>
                    <td className="px-4 py-3 text-[12px] text-brand-tan capitalize">{d.appliesTo}</td>
                    <td className="px-4 py-3 text-[12px] text-brand-tan">{d.usedCount || 0}{d.usageLimit ? `/${d.usageLimit}` : ""}</td>
                    <td className="px-4 py-3"><Pill tone={d.active ? "green" : "gray"}>{d.active ? "Active" : "Off"}</Pill></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Toggle checked={d.active} onChange={() => toggleActive(d)} />
                        <button onClick={() => openEdit(d)} className="p-1.5 text-brand-tan hover:text-brand-brown"><Pencil size={14} /></button>
                        <button onClick={() => del(d)} className="p-1.5 text-brand-tan hover:text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      {modalOpen && (
        <DiscountModal
          initial={editing}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}
