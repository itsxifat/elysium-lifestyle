"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import Image from "next/image";
import {
  Link2, Plus, X, Pencil, Trash2, Copy, ExternalLink, Sparkles, Megaphone,
  MessageSquare, Image as ImageIcon, Upload, ArrowUp, ArrowDown, Check, Loader2,
} from "lucide-react";
import {
  PageHeader, Card, Button, Field, TextInput, Select, Toggle, SectionTitle,
  Pill, EmptyState, inputClass,
} from "@/components/admin/ui";
import CategoryProductBrowser from "@/components/admin/CategoryProductBrowser";
import { shouldUnoptimizeImage } from "@/lib/utils";

const blank = {
  title: "",
  baseType: "category",
  category: "",
  customPath: "",
  highlightProducts: [],
  banner: { enabled: false, text: "", bgColor: "#B85C3A", textColor: "#FFFFFF", link: "" },
  modal: { enabled: false, type: "text", title: "", text: "", image: "", ctaText: "", ctaLink: "" },
  isActive: true,
};

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

// Flatten the category tree into indented <option>s for the base-link picker.
function categoryOptions(cats) {
  const byParent = new Map();
  for (const c of cats) {
    const p = c.parent ? String(c.parent) : "root";
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(c);
  }
  const out = [];
  const walk = (parent, depth) => {
    const kids = (byParent.get(parent) || []).sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    for (const c of kids) {
      out.push({ _id: String(c._id), label: `${"  ".repeat(depth)}${depth ? "└ " : ""}${c.name}` });
      walk(String(c._id), depth + 1);
    }
  };
  walk("root", 0);
  return out;
}

function fullUrl(fullPath) {
  if (typeof window === "undefined") return fullPath;
  return `${window.location.origin}${fullPath}`;
}

// ── Create / edit modal ──────────────────────────────────────────────────────
function CampaignModal({ initial, categories, onClose, onSaved }) {
  const editing = !!initial?._id;
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...blank,
          ...initial,
          category: initial.category?._id ? String(initial.category._id) : (initial.category ? String(initial.category) : ""),
          highlightProducts: (initial.highlightProducts || []).map((p) => String(p._id || p)),
          banner: { ...blank.banner, ...(initial.banner || {}) },
          modal: { ...blank.modal, ...(initial.modal || {}) },
        }
      : { ...blank }
  );
  // id -> { name, image } so we can render selected-product chips.
  const [meta, setMeta] = useState(() => {
    const m = {};
    for (const p of initial?.highlightProducts || []) {
      if (p && p._id) m[String(p._id)] = { name: p.name, image: p.images?.[0] || "" };
    }
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setBanner = (k, v) => setForm((f) => ({ ...f, banner: { ...f.banner, [k]: v } }));
  const setModal = (k, v) => setForm((f) => ({ ...f, modal: { ...f.modal, [k]: v } }));

  const addProduct = (p) => {
    setMeta((m) => ({ ...m, [p._id]: { name: p.name, image: p.image } }));
    setForm((f) =>
      f.highlightProducts.includes(p._id)
        ? f
        : { ...f, highlightProducts: [...f.highlightProducts, p._id] }
    );
  };
  const removeProduct = (id) =>
    set("highlightProducts", form.highlightProducts.filter((x) => String(x) !== String(id)));
  const moveProduct = (idx, dir) => {
    const arr = [...form.highlightProducts];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    set("highlightProducts", arr);
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setModal("image", url);
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const submit = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (form.baseType === "category" && !form.category) return toast.error("Pick a category");
    if (form.baseType === "custom" && !form.customPath.trim()) return toast.error("Enter a custom link path");
    setSaving(true);
    try {
      const res = await fetch(
        editing ? `/api/admin/custom-urls/${initial._id}` : "/api/admin/custom-urls",
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      toast.success(editing ? "Campaign updated" : "Campaign created");
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const catOpts = categoryOptions(categories);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-brown/40 backdrop-blur-sm p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-brand-tan/15 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-base font-bold text-brand-brown">
            {editing ? "Edit Custom URL" : "New Custom URL"}
          </h2>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown p-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Basics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Campaign title" className="sm:col-span-2">
              <TextInput value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Eid Dresses Highlight" />
            </Field>

            <Field label="Base link">
              <Select value={form.baseType} onChange={(e) => set("baseType", e.target.value)}>
                <option value="category">A category</option>
                <option value="shop">Shop — all products</option>
                <option value="custom">Custom link</option>
              </Select>
            </Field>

            {form.baseType === "category" && (
              <Field label="Category">
                <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
                  <option value="">Select a category…</option>
                  {catOpts.map((o) => (
                    <option key={o._id} value={o._id}>{o.label}</option>
                  ))}
                </Select>
              </Field>
            )}

            {form.baseType === "custom" && (
              <Field label="Custom path" hint="Any storefront path, e.g. /shop?search=eid">
                <TextInput value={form.customPath} onChange={(e) => set("customPath", e.target.value)} placeholder="/shop?search=eid" />
              </Field>
            )}
          </div>

          {/* Highlight products */}
          <div>
            <SectionTitle className="flex items-center gap-1.5">
              <Sparkles size={13} /> Highlighted products (shown on top)
            </SectionTitle>

            {form.highlightProducts.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {form.highlightProducts.map((id, idx) => (
                  <div key={id} className="flex items-center gap-2 bg-brand-cream/50 border border-brand-tan/15 rounded-lg p-1.5">
                    <span className="text-[11px] font-bold text-brand-tan w-5 text-center flex-shrink-0">{idx + 1}</span>
                    <div className="w-8 h-9 flex-shrink-0 bg-brand-cream-dark overflow-hidden rounded relative">
                      {meta[id]?.image ? (
                        <Image src={meta[id].image} alt="" fill className="object-cover" unoptimized={shouldUnoptimizeImage(meta[id].image)} sizes="32px" />
                      ) : null}
                    </div>
                    <span className="flex-1 min-w-0 text-[12px] text-brand-brown truncate">{meta[id]?.name || "Product"}</span>
                    <button type="button" onClick={() => moveProduct(idx, -1)} disabled={idx === 0} className="p-1 text-brand-tan hover:text-brand-brown disabled:opacity-30">
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" onClick={() => moveProduct(idx, 1)} disabled={idx === form.highlightProducts.length - 1} className="p-1 text-brand-tan hover:text-brand-brown disabled:opacity-30">
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" onClick={() => removeProduct(id)} className="p-1 text-red-400 hover:text-red-600">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <CategoryProductBrowser
              categories={categories}
              selectedIds={form.highlightProducts}
              onAdd={addProduct}
              onRemove={removeProduct}
            />
          </div>

          {/* Top banner */}
          <div className="border-t border-brand-tan/10 pt-5">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle className="flex items-center gap-1.5 mb-0">
                <Megaphone size={13} /> Top offer banner
              </SectionTitle>
              <Toggle checked={form.banner.enabled} onChange={(v) => setBanner("enabled", v)} />
            </div>
            {form.banner.enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Banner text" className="sm:col-span-2">
                  <TextInput value={form.banner.text} onChange={(e) => setBanner("text", e.target.value)} placeholder="🎉 Eid Sale — up to 40% off!" />
                </Field>
                <Field label="Link (optional)">
                  <TextInput value={form.banner.link} onChange={(e) => setBanner("link", e.target.value)} placeholder="/shop?onSale=true" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Background">
                    <input type="color" value={form.banner.bgColor} onChange={(e) => setBanner("bgColor", e.target.value)} className="w-full h-[38px] rounded-lg border border-brand-tan/30 cursor-pointer" />
                  </Field>
                  <Field label="Text color">
                    <input type="color" value={form.banner.textColor} onChange={(e) => setBanner("textColor", e.target.value)} className="w-full h-[38px] rounded-lg border border-brand-tan/30 cursor-pointer" />
                  </Field>
                </div>
                {form.banner.text && (
                  <div className="sm:col-span-2 rounded-lg px-4 py-2.5 text-center text-[13px] font-medium" style={{ background: form.banner.bgColor, color: form.banner.textColor }}>
                    {form.banner.text}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Modal notification */}
          <div className="border-t border-brand-tan/10 pt-5">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle className="flex items-center gap-1.5 mb-0">
                <MessageSquare size={13} /> Pop-up modal
              </SectionTitle>
              <Toggle checked={form.modal.enabled} onChange={(v) => setModal("enabled", v)} />
            </div>
            {form.modal.enabled && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {["text", "image"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setModal("type", t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
                        form.modal.type === t ? "border-brand-terracotta bg-brand-terracotta/10 text-brand-terracotta" : "border-brand-tan/30 text-brand-tan hover:text-brand-brown"
                      }`}
                    >
                      {t === "text" ? <MessageSquare size={13} /> : <ImageIcon size={13} />}
                      {t === "text" ? "Text" : "Image"}
                    </button>
                  ))}
                </div>

                <Field label="Heading">
                  <TextInput value={form.modal.title} onChange={(e) => setModal("title", e.target.value)} placeholder="Welcome!" />
                </Field>

                {form.modal.type === "image" && (
                  <Field label="Image">
                    <div className="flex items-center gap-3">
                      {form.modal.image ? (
                        <div className="w-20 h-20 relative rounded-lg overflow-hidden bg-brand-cream-dark flex-shrink-0">
                          <Image src={form.modal.image} alt="" fill className="object-cover" unoptimized={shouldUnoptimizeImage(form.modal.image)} sizes="80px" />
                          <button type="button" onClick={() => setModal("image", "")} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5">
                            <X size={12} />
                          </button>
                        </div>
                      ) : null}
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={`flex items-center gap-2 ${inputClass} w-auto cursor-pointer hover:border-brand-brown`}>
                        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {uploading ? "Uploading…" : form.modal.image ? "Replace image" : "Upload image"}
                      </button>
                      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
                    </div>
                  </Field>
                )}

                <Field label={form.modal.type === "image" ? "Caption (optional)" : "Message"}>
                  <textarea
                    value={form.modal.text}
                    onChange={(e) => setModal("text", e.target.value)}
                    rows={3}
                    className={inputClass}
                    placeholder="Tell visitors about your offer…"
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Button text (optional)">
                    <TextInput value={form.modal.ctaText} onChange={(e) => setModal("ctaText", e.target.value)} placeholder="Shop now" />
                  </Field>
                  <Field label="Button link (optional)">
                    <TextInput value={form.modal.ctaLink} onChange={(e) => setModal("ctaLink", e.target.value)} placeholder="/shop?onSale=true" />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* Active */}
          <div className="flex items-center justify-between border-t border-brand-tan/10 pt-5">
            <div>
              <p className="text-[13px] font-medium text-brand-brown">Active</p>
              <p className="text-[12px] text-brand-tan">Inactive campaigns ignore the suffix.</p>
            </div>
            <Toggle checked={form.isActive} onChange={(v) => set("isActive", v)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-brand-tan/15 sticky bottom-0 bg-white rounded-b-xl">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Create campaign"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function CustomUrlsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, catRes] = await Promise.all([
        fetch("/api/admin/custom-urls"),
        fetch("/api/admin/categories"),
      ]);
      const cData = await cRes.json();
      const catData = await catRes.json();
      setCampaigns(cData.campaigns || []);
      setCategories(Array.isArray(catData) ? catData : []);
    } catch {
      toast.error("Failed to load campaigns");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = async (id) => {
    try {
      const res = await fetch(`/api/admin/custom-urls/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setEditing(data);
      setModalOpen(true);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this custom URL? The suffix will stop working.")) return;
    try {
      const res = await fetch(`/api/admin/custom-urls/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copyUrl = (fullPath) => {
    navigator.clipboard.writeText(fullUrl(fullPath)).then(
      () => toast.success("URL copied"),
      () => toast.error("Copy failed")
    );
  };

  const baseLabel = (c) => {
    if (c.baseType === "category") return c.category?.name || "Category";
    if (c.baseType === "custom") return c.customPath || "Custom";
    return "Shop — all products";
  };

  return (
    <div>
      <PageHeader
        title="Custom URLs"
        subtitle="Attach highlighted products, an offer banner, or a pop-up to any category or shop link."
        icon={Link2}
        actions={<Button onClick={openNew}><Plus size={15} /> New Custom URL</Button>}
      />

      {loading ? (
        <div className="flex justify-center py-20 text-brand-tan"><Loader2 size={22} className="animate-spin" /></div>
      ) : campaigns.length === 0 ? (
        <Card>
          <EmptyState
            icon={Link2}
            title="No custom URLs yet"
            hint="Create one to highlight products on top of a category, show an offer banner, or trigger a pop-up — all from a single shareable link."
            action={<Button onClick={openNew}><Plus size={15} /> New Custom URL</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
          {campaigns.map((c) => (
            <Card key={c._id} className={`flex flex-col gap-3 ${!c.isActive ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-brown truncate">{c.title}</p>
                  <p className="text-[12px] text-brand-tan truncate mt-0.5">{baseLabel(c)}</p>
                </div>
                <span className="flex-shrink-0 font-mono text-[13px] font-bold text-brand-terracotta bg-brand-terracotta/10 px-2 py-1 rounded">
                  {c.code}
                </span>
              </div>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-1.5">
                {c.highlightProducts?.length > 0 && (
                  <Pill tone="terracotta"><Sparkles size={10} className="mr-1" />{c.highlightProducts.length} highlighted</Pill>
                )}
                {c.banner?.enabled && <Pill tone="amber"><Megaphone size={10} className="mr-1" />Banner</Pill>}
                {c.modal?.enabled && <Pill tone="blue"><MessageSquare size={10} className="mr-1" />Pop-up</Pill>}
                {c.isActive ? <Pill tone="green">Active</Pill> : <Pill tone="gray">Inactive</Pill>}
              </div>

              {/* URL */}
              <div className="flex items-center gap-1.5 bg-brand-cream/60 border border-brand-tan/15 rounded-lg px-2.5 py-1.5">
                <code className="flex-1 min-w-0 text-[11px] text-brand-brown truncate">{c.fullPath}</code>
                <button onClick={() => copyUrl(c.fullPath)} title="Copy URL" className="p-1 text-brand-tan hover:text-brand-terracotta">
                  <Copy size={14} />
                </button>
                <a href={c.fullPath} target="_blank" rel="noreferrer" title="Open" className="p-1 text-brand-tan hover:text-brand-terracotta">
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="flex items-center justify-between pt-1 mt-auto border-t border-brand-tan/10">
                <span className="text-[11px] text-brand-tan">{c.views || 0} view{c.views === 1 ? "" : "s"}</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c._id)}><Pencil size={13} /> Edit</Button>
                  <Button variant="danger-ghost" size="sm" onClick={() => remove(c._id)}><Trash2 size={13} /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && (
        <CampaignModal
          initial={editing}
          categories={categories}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}
