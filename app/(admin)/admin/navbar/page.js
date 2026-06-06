"use client";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Plus, Trash2, MoveUp, MoveDown, Zap, ZapOff,
  Eye, EyeOff, Tag, Link as LinkIcon, Save,
} from "lucide-react";

function Toggle({ checked, onChange, size = "sm" }) {
  const w = size === "sm" ? "w-9 h-5" : "w-11 h-6";
  const dot = size === "sm" ? "after:w-4 after:h-4 peer-checked:after:translate-x-4" : "after:w-5 after:h-5 peer-checked:after:translate-x-5";
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only peer" />
      <div className={`${w} bg-brand-tan/40 rounded-full peer peer-checked:bg-brand-terracotta transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:transition-all ${dot}`} />
    </label>
  );
}

export default function AdminNavbarPage() {
  const [navItems, setNavItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [addType, setAddType] = useState("custom"); // 'custom' | 'category'
  const [newLabel, setNewLabel] = useState("");
  const [newHref, setNewHref] = useState("/");
  const [newCatId, setNewCatId] = useState("");
  const [newHighlight, setNewHighlight] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/navbar").then((r) => r.json()),
      fetch("/api/admin/categories").then((r) => r.json()),
    ])
      .then(([navData, catData]) => {
        setNavItems(navData.navItems || []);
        setCategories(Array.isArray(catData) ? catData : []);
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/navbar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navItems }),
      });
      if (res.ok) toast.success("Navbar saved!");
      else toast.error("Failed to save");
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  };

  const update = (idx, field, value) => {
    setNavItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const move = (idx, dir) => {
    setNavItems((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return next;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((item, i) => ({ ...item, order: i }));
    });
  };

  const remove = (idx) => setNavItems((prev) => prev.filter((_, i) => i !== idx));

  const addItem = () => {
    if (addType === "custom") {
      if (!newLabel.trim()) { toast.error("Label is required"); return; }
      setNavItems((prev) => [
        ...prev,
        { type: "custom", label: newLabel.trim(), href: newHref || "/", highlighted: newHighlight, isActive: true, order: prev.length },
      ]);
    } else {
      if (!newCatId) { toast.error("Select a category"); return; }
      const cat = categories.find((c) => c._id === newCatId);
      setNavItems((prev) => [
        ...prev,
        { type: "category", label: newLabel.trim() || cat?.name || "", href: newHref || "/", categoryId: newCatId, highlighted: newHighlight, isActive: true, order: prev.length },
      ]);
    }
    setNewLabel(""); setNewHref("/"); setNewCatId(""); setNewHighlight(false);
  };

  const topLevelCats = categories.filter((c) => !c.parent);

  if (loading) return <div className="text-brand-tan py-10">Loading…</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Navbar Configuration</h1>
          <p className="text-sm text-brand-tan mt-1">Configure what appears in the top navigation. Highlighted items show in terracotta with a shake effect.</p>
        </div>
        <button onClick={save} disabled={saving} className="btn-primary text-[11px] tracking-[2px] flex items-center gap-2 disabled:opacity-60">
          <Save size={13} strokeWidth={2} />
          {saving ? "Saving…" : "Save Navbar"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Item list ── */}
        <div className="lg:col-span-2 space-y-3">
          {navItems.length === 0 && (
            <div className="bg-white border border-dashed border-brand-tan/30 p-10 text-center">
              <LinkIcon size={24} className="text-brand-tan/30 mx-auto mb-3" strokeWidth={1} />
              <p className="text-sm text-brand-tan">No nav items yet. Add one from the panel →</p>
            </div>
          )}

          {navItems.map((item, i) => (
            <div
              key={i}
              className={`bg-white border p-4 transition-all ${item.highlighted ? "border-brand-terracotta/30 bg-brand-terracotta/[0.02]" : "border-brand-tan/20"} ${!item.isActive ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                {/* Reorder */}
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 text-brand-tan/40 hover:text-brand-brown disabled:opacity-20 transition-colors">
                    <MoveUp size={13} strokeWidth={2} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === navItems.length - 1} className="p-0.5 text-brand-tan/40 hover:text-brand-brown disabled:opacity-20 transition-colors">
                    <MoveDown size={13} strokeWidth={2} />
                  </button>
                </div>

                {/* Badge */}
                <span className={`text-[9px] uppercase tracking-widest px-2 py-0.5 font-medium flex-shrink-0 ${item.type === "category" ? "bg-brand-brown/10 text-brand-brown" : "bg-brand-tan/15 text-brand-tan"}`}>
                  {item.type === "category" ? <><Tag size={9} className="inline mr-1" />Cat</> : <><LinkIcon size={9} className="inline mr-1" />Link</>}
                </span>

                {/* Label */}
                <input
                  value={item.label}
                  onChange={(e) => update(i, "label", e.target.value)}
                  className="flex-1 min-w-[100px] border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] px-2.5 py-1.5 text-sm text-brand-brown bg-transparent focus:outline-none focus:border-brand-brown transition-colors"
                  placeholder="Label"
                />

                {/* Href */}
                <input
                  value={item.href || ""}
                  onChange={(e) => update(i, "href", e.target.value)}
                  className="flex-1 min-w-[120px] border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] px-2.5 py-1.5 text-sm text-brand-tan font-mono bg-transparent focus:outline-none focus:border-brand-brown transition-colors"
                  placeholder="/shop"
                />

                {/* Highlighted toggle */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.highlighted ? (
                    <Zap size={14} className="text-brand-terracotta" strokeWidth={2} />
                  ) : (
                    <ZapOff size={14} className="text-brand-tan/40" strokeWidth={1.5} />
                  )}
                  <Toggle checked={item.highlighted} onChange={(v) => update(i, "highlighted", v)} />
                </div>

                {/* Active toggle */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {item.isActive ? (
                    <Eye size={14} className="text-brand-tan" strokeWidth={1.5} />
                  ) : (
                    <EyeOff size={14} className="text-brand-tan/30" strokeWidth={1.5} />
                  )}
                  <Toggle checked={item.isActive} onChange={(v) => update(i, "isActive", v)} />
                </div>

                {/* Remove */}
                <button onClick={() => remove(i)} className="p-1.5 text-brand-tan/40 hover:text-red-500 transition-colors flex-shrink-0">
                  <Trash2 size={14} strokeWidth={1.5} />
                </button>
              </div>

              {/* Helper info row */}
              <div className="flex items-center gap-4 mt-2 pl-8">
                {item.type === "category" && item.categoryId && (
                  <span className="text-[10px] text-brand-tan">
                    Category: {categories.find((c) => c._id === item.categoryId?.toString())?.name || item.categoryId}
                  </span>
                )}
                {item.highlighted && (
                  <span className="text-[10px] text-brand-terracotta flex items-center gap-1">
                    <Zap size={9} /> Highlighted — shows in terracotta with shake animation
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Add panel ── */}
        <div className="space-y-4">
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-5">
            <p className="text-[10px] uppercase tracking-[2px] text-brand-tan font-medium mb-4">Add Nav Item</p>

            {/* Type selector */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAddType("custom")}
                className={`flex-1 py-2 text-[11px] uppercase tracking-wider border transition-colors ${addType === "custom" ? "bg-brand-brown text-white border-brand-brown" : "border-brand-tan/30 text-brand-tan hover:border-brand-brown hover:text-brand-brown"}`}
              >
                Custom Link
              </button>
              <button
                onClick={() => setAddType("category")}
                className={`flex-1 py-2 text-[11px] uppercase tracking-wider border transition-colors ${addType === "category" ? "bg-brand-brown text-white border-brand-brown" : "border-brand-tan/30 text-brand-tan hover:border-brand-brown hover:text-brand-brown"}`}
              >
                Category
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-brand-tan mb-1">Label</label>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={addType === "category" ? "Leave blank to use category name" : "e.g. Sale"}
                  className="w-full rounded-lg border border-brand-tan/30 px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown bg-transparent transition-colors"
                />
              </div>

              {addType === "category" ? (
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-brand-tan mb-1">Category</label>
                  <select
                    value={newCatId}
                    onChange={(e) => setNewCatId(e.target.value)}
                    className="w-full rounded-lg border border-brand-tan/30 px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown bg-white transition-colors"
                  >
                    <option value="">Select category…</option>
                    {topLevelCats.map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-brand-tan/60 mt-1">Subcategories auto-populate as dropdown</p>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-brand-tan mb-1">Link URL</label>
                  <input
                    value={newHref}
                    onChange={(e) => setNewHref(e.target.value)}
                    placeholder="/shop?onSale=true"
                    className="w-full rounded-lg border border-brand-tan/30 px-3 py-2 text-sm font-mono text-brand-brown focus:outline-none focus:border-brand-brown bg-transparent transition-colors"
                  />
                </div>
              )}

              <div className="flex items-center justify-between py-2 border-t border-brand-tan/10">
                <div>
                  <p className="text-[11px] font-medium text-brand-brown">Highlighted</p>
                  <p className="text-[10px] text-brand-tan">Terracotta color + shake animation</p>
                </div>
                <Toggle checked={newHighlight} onChange={setNewHighlight} />
              </div>

              <button
                onClick={addItem}
                className="w-full btn-primary text-[11px] tracking-[2px] flex items-center justify-center gap-2"
              >
                <Plus size={14} strokeWidth={2} /> Add Item
              </button>
            </div>
          </div>

          {/* Highlight legend */}
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-5">
            <p className="text-[10px] uppercase tracking-[2px] text-brand-tan font-medium mb-3">Legend</p>
            <div className="space-y-2 text-[12px]">
              <div className="flex items-center gap-2">
                <Zap size={13} className="text-brand-terracotta" strokeWidth={2} />
                <span className="text-brand-brown">Highlighted — terracotta + shake</span>
              </div>
              <div className="flex items-center gap-2">
                <Eye size={13} className="text-brand-tan" strokeWidth={1.5} />
                <span className="text-brand-tan">Visible in navbar</span>
              </div>
              <div className="flex items-center gap-2">
                <EyeOff size={13} className="text-brand-tan/40" strokeWidth={1.5} />
                <span className="text-brand-tan/60">Hidden from navbar</span>
              </div>
              <div className="flex items-center gap-2">
                <Tag size={13} className="text-brand-brown" strokeWidth={1.5} />
                <span className="text-brand-tan">Category item (auto-dropdown)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating save */}
      {navItems.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <button onClick={save} disabled={saving} className="btn-primary shadow-lg flex items-center gap-2 disabled:opacity-60">
            <Save size={15} strokeWidth={2} />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}
