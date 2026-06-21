"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import Image from "next/image";
import {
  Zap, Plus, X, Pencil, Trash2, Clock, Package, Loader2, Tag,
} from "lucide-react";
import {
  PageHeader, Card, Button, Field, TextInput, Toggle, SectionTitle,
  Pill, EmptyState, inputClass,
} from "@/components/admin/ui";
import DatePicker from "@/components/admin/DatePicker";
import CategoryProductBrowser from "@/components/admin/CategoryProductBrowser";
import { shouldUnoptimizeImage, formatPrice } from "@/lib/utils";

const blank = {
  title: "Flash Sale",
  subtitle: "",
  enabled: false,
  startsAt: "",
  endsAt: "",
  items: [], // { product, name, image, origPrice, salePrice, stockLimit, soldCount }
};

// Map a populated DB item (or a browser pick) into the form item shape.
function toFormItem(it) {
  if (it.product && typeof it.product === "object") {
    const p = it.product;
    const orig = p.variants?.length ? Math.min(...p.variants.map((v) => v.price)) : 0;
    return {
      product: String(p._id),
      name: p.name,
      image: p.images?.[0] || "",
      origPrice: orig,
      salePrice: it.salePrice ?? orig,
      stockLimit: it.stockLimit ?? 0,
      soldCount: it.soldCount ?? 0,
    };
  }
  return it;
}

function FlashSaleModal({ initial, categories, onClose, onSaved }) {
  const editing = !!initial?._id;
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...blank,
          ...initial,
          startsAt: initial.startsAt || "",
          endsAt: initial.endsAt || "",
          items: (initial.items || []).map(toFormItem),
        }
      : { ...blank }
  );
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const selectedIds = form.items.map((i) => i.product);

  const addProduct = (p) => {
    setForm((f) =>
      f.items.some((i) => String(i.product) === String(p._id))
        ? f
        : {
            ...f,
            items: [
              ...f.items,
              {
                product: String(p._id),
                name: p.name,
                image: p.image || "",
                origPrice: p.price || 0,
                salePrice: p.price || 0,
                stockLimit: 10,
                soldCount: 0,
              },
            ],
          }
    );
  };
  const removeProduct = (id) =>
    set("items", form.items.filter((i) => String(i.product) !== String(id)));
  const setItem = (id, k, v) =>
    set("items", form.items.map((i) => (String(i.product) === String(id) ? { ...i, [k]: v } : i)));

  const submit = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (form.items.length === 0) return toast.error("Add at least one product");
    for (const it of form.items) {
      if (!(Number(it.salePrice) >= 0)) return toast.error(`Set a valid price for ${it.name}`);
      if (!(Number(it.stockLimit) > 0)) return toast.error(`Set the flash stock for ${it.name}`);
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        subtitle: form.subtitle,
        enabled: form.enabled,
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        items: form.items.map((i) => ({
          product: i.product,
          salePrice: Number(i.salePrice) || 0,
          stockLimit: Number(i.stockLimit) || 0,
        })),
      };
      const res = await fetch(
        editing ? `/api/admin/flash-sales/${initial._id}` : "/api/admin/flash-sales",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success(editing ? "Flash sale updated" : "Flash sale created");
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-brown/40 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-tan/15 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-base font-bold text-brand-brown">{editing ? "Edit Flash Sale" : "New Flash Sale"}</h2>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown p-1"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Title"><TextInput value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Flash Sale" /></Field>
            <Field label="Subtitle (optional)"><TextInput value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="Limited stock · ends soon" /></Field>
            <Field label="Starts at" hint="Leave empty to start now">
              <DatePicker withTime value={form.startsAt} onChange={(v) => set("startsAt", v)} placeholder="Now" />
            </Field>
            <Field label="Ends at" hint="Powers the countdown timer">
              <DatePicker withTime value={form.endsAt} onChange={(v) => set("endsAt", v)} placeholder="No end" />
            </Field>
          </div>

          {/* Selected items */}
          <div>
            <SectionTitle className="flex items-center gap-1.5"><Tag size={13} /> Flash products & prices</SectionTitle>
            {form.items.length === 0 ? (
              <p className="text-[13px] text-brand-tan mb-3">No products yet — pick them below.</p>
            ) : (
              <div className="space-y-2 mb-4">
                {form.items.map((it) => {
                  const remaining = Math.max(0, (Number(it.stockLimit) || 0) - (it.soldCount || 0));
                  return (
                    <div key={it.product} className="flex flex-wrap items-center gap-3 bg-brand-cream/50 border border-brand-tan/15 rounded-lg p-2.5">
                      <div className="w-10 h-12 flex-shrink-0 bg-brand-cream-dark overflow-hidden rounded relative">
                        {it.image ? <Image src={it.image} alt="" fill className="object-cover" unoptimized={shouldUnoptimizeImage(it.image)} sizes="40px" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-brand-brown truncate">{it.name}</p>
                        {it.origPrice > 0 && <p className="text-[11px] text-brand-tan">Regular {formatPrice(it.origPrice)}</p>}
                      </div>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-brand-tan">Flash price</span>
                        <input type="number" min="0" value={it.salePrice} onChange={(e) => setItem(it.product, "salePrice", e.target.value)} className={`${inputClass} w-24 py-1.5`} />
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-brand-tan">Flash stock</span>
                        <input type="number" min="1" value={it.stockLimit} onChange={(e) => setItem(it.product, "stockLimit", e.target.value)} className={`${inputClass} w-20 py-1.5`} />
                      </label>
                      <div className="text-center">
                        <span className="block text-[10px] uppercase tracking-wide text-brand-tan">Left</span>
                        <span className="text-[13px] font-semibold text-brand-brown">{remaining}</span>
                        {it.soldCount > 0 && <span className="block text-[10px] text-brand-tan">{it.soldCount} sold</span>}
                      </div>
                      <button type="button" onClick={() => removeProduct(it.product)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  );
                })}
              </div>
            )}

            <CategoryProductBrowser
              categories={categories}
              selectedIds={selectedIds}
              onAdd={addProduct}
              onRemove={removeProduct}
            />
          </div>

          <div className="flex items-center justify-between border-t border-brand-tan/10 pt-5">
            <div>
              <p className="text-[13px] font-medium text-brand-brown">Enabled</p>
              <p className="text-[12px] text-brand-tan">Only one enabled, in-schedule sale shows at a time.</p>
            </div>
            <Toggle checked={form.enabled} onChange={(v) => set("enabled", v)} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-brand-tan/15 sticky bottom-0 bg-white rounded-b-xl">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Create flash sale"}</Button>
        </div>
      </div>
    </div>
  );
}

export default function FlashSalesPage() {
  const [sales, setSales] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, catRes] = await Promise.all([
        fetch("/api/admin/flash-sales"),
        fetch("/api/admin/categories"),
      ]);
      const sData = await sRes.json();
      const catData = await catRes.json();
      setSales(sData.sales || []);
      setCategories(Array.isArray(catData) ? catData : []);
    } catch {
      toast.error("Failed to load flash sales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = async (id) => {
    try {
      const res = await fetch(`/api/admin/flash-sales/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setEditing(data);
      setModalOpen(true);
    } catch (err) {
      toast.error(err.message);
    }
  };
  const remove = async (id) => {
    if (!confirm("Delete this flash sale?")) return;
    try {
      const res = await fetch(`/api/admin/flash-sales/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : null);

  return (
    <div>
      <PageHeader
        title="Flash Sales"
        subtitle="Run a limited-stock, special-price promo on the homepage with a live countdown."
        icon={Zap}
        actions={<Button onClick={openNew}><Plus size={15} /> New Flash Sale</Button>}
      />

      {loading ? (
        <div className="flex justify-center py-20 text-brand-tan"><Loader2 size={22} className="animate-spin" /></div>
      ) : sales.length === 0 ? (
        <Card>
          <EmptyState
            icon={Zap}
            title="No flash sales yet"
            hint="Create one to feature discounted products on the homepage with a countdown and 'only X left' urgency."
            action={<Button onClick={openNew}><Plus size={15} /> New Flash Sale</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {sales.map((s) => {
            const totalStock = (s.items || []).reduce((a, i) => a + (i.stockLimit || 0), 0);
            const totalSold = (s.items || []).reduce((a, i) => a + (i.soldCount || 0), 0);
            return (
              <Card key={s._id} className={`flex flex-col gap-3 ${!s.enabled ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-brand-brown truncate">{s.title}</p>
                    {s.subtitle && <p className="text-[12px] text-brand-tan truncate mt-0.5">{s.subtitle}</p>}
                  </div>
                  {s.enabled ? <Pill tone="green">Enabled</Pill> : <Pill tone="gray">Off</Pill>}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Pill tone="terracotta"><Package size={10} className="mr-1" />{s.items?.length || 0} products</Pill>
                  <Pill tone="amber">{totalSold}/{totalStock} sold</Pill>
                </div>

                {(s.startsAt || s.endsAt) && (
                  <p className="flex items-center gap-1.5 text-[12px] text-brand-tan">
                    <Clock size={12} />
                    {fmtDate(s.startsAt) || "Now"} → {fmtDate(s.endsAt) || "No end"}
                  </p>
                )}

                <div className="flex items-center justify-end gap-1 pt-1 mt-auto border-t border-brand-tan/10">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s._id)}><Pencil size={13} /> Edit</Button>
                  <Button variant="danger-ghost" size="sm" onClick={() => remove(s._id)}><Trash2 size={13} /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <FlashSaleModal
          initial={editing}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}
