"use client";

import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { Plus, X, GripVertical, Ruler } from "lucide-react";

export default function AdminMasterSizesPage() {
  const [sizes, setSizes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newSize, setNewSize] = useState("");
  const inputRef = useRef(null);
  const dragItem = useRef(null);
  const dragOver = useRef(null);

  useEffect(() => {
    fetch("/api/admin/master-sizes")
      .then((r) => r.json())
      .then((data) => setSizes(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load sizes"))
      .finally(() => setLoading(false));
  }, []);

  const addSize = () => {
    const trimmed = newSize.trim().toUpperCase();
    if (!trimmed) return;
    if (sizes.includes(trimmed)) {
      toast.error(`"${trimmed}" already exists`);
      return;
    }
    setSizes((prev) => [...prev, trimmed]);
    setNewSize("");
    inputRef.current?.focus();
  };

  const removeSize = (index) => {
    setSizes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragStart = (index) => { dragItem.current = index; };
  const handleDragEnter = (index) => { dragOver.current = index; };
  const handleDragEnd = () => {
    const from = dragItem.current;
    const to = dragOver.current;
    if (from === null || to === null || from === to) { dragItem.current = null; dragOver.current = null; return; }
    const updated = [...sizes];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setSizes(updated);
    dragItem.current = null;
    dragOver.current = null;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/master-sizes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sizes }),
      });
      if (res.ok) toast.success("Master sizes saved!");
      else toast.error("Failed to save");
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const presets = [
    { label: "Clothing (S–3XL)", sizes: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] },
    { label: "Numeric (28–40)", sizes: ["28", "30", "32", "34", "36", "38", "40"] },
    { label: "Kids (2Y–14Y)", sizes: ["2Y", "4Y", "6Y", "8Y", "10Y", "12Y", "14Y"] },
    { label: "Shoes (36–45)", sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"] },
  ];

  const applyPreset = (presetSizes) => {
    const unique = [...new Set([...sizes, ...presetSizes])];
    setSizes(unique);
  };

  if (loading) {
    return <div className="text-brand-tan text-sm py-10 animate-pulse">Loading…</div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Master Sizes</h1>
          <p className="text-sm text-brand-tan mt-1">
            Define the global size pool — these appear when adding variants to any product
          </p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary text-[11px] tracking-[2px] disabled:opacity-60">
          {saving ? "Saving…" : "Save Sizes"}
        </button>
      </div>

      <div className="max-w-2xl space-y-5">

        {/* Quick presets */}
        <div className="bg-white border border-brand-tan/20 px-6 py-5">
          <p className="text-[10px] uppercase tracking-widest text-brand-tan font-medium mb-3">Quick Presets</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.sizes)}
                className="text-[11px] px-3 py-1.5 border border-brand-tan/30 text-brand-tan hover:border-brand-brown hover:text-brand-brown transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-brand-tan/50 mt-2">Appends preset sizes to your current list (no duplicates)</p>
        </div>

        {/* Size chips */}
        <div className="bg-white border border-brand-tan/20 px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] uppercase tracking-widest text-brand-tan font-medium">
              Current Sizes <span className="ml-1 text-brand-brown/60">({sizes.length})</span>
            </p>
            <p className="text-[10px] text-brand-tan/50">Drag to reorder</p>
          </div>

          {sizes.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-brand-tan/30">
              <Ruler size={20} className="text-brand-tan/40 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-[12px] text-brand-tan/60">No sizes yet — add some below or use a preset</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 min-h-[60px] p-3 bg-brand-cream/30 border border-brand-tan/15">
              {sizes.map((size, index) => (
                <div
                  key={`${size}-${index}`}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnter={() => handleDragEnter(index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-brand-tan/30 group cursor-grab active:cursor-grabbing hover:border-brand-brown transition-colors"
                >
                  <GripVertical size={11} className="text-brand-tan/40 group-hover:text-brand-tan" />
                  <span className="text-[12px] font-medium text-brand-brown">{size}</span>
                  <button
                    onClick={() => removeSize(index)}
                    className="text-brand-tan/30 hover:text-red-500 transition-colors ml-0.5"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add new size */}
          <div className="flex gap-2 mt-4">
            <input
              ref={inputRef}
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addSize(); }}
              placeholder="e.g. XXL, 32, 10Y…"
              className="flex-1 border border-brand-tan/30 bg-transparent px-3 py-2.5 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors uppercase"
            />
            <button
              onClick={addSize}
              className="px-4 py-2.5 bg-brand-brown text-brand-cream text-[11px] uppercase tracking-[2px] hover:bg-brand-terracotta transition-colors flex items-center gap-2"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="bg-brand-cream/50 border border-brand-tan/15 px-5 py-4">
          <p className="text-[11px] text-brand-tan leading-relaxed">
            These sizes are the global pool. When you add variants to a product, you&apos;ll pick from this list and set a price and stock for each. Removing a size here does not affect existing products — it only removes it from the picker for future uploads.
          </p>
        </div>

        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? "Saving…" : "Save Master Sizes"}
        </button>
      </div>
    </div>
  );
}
