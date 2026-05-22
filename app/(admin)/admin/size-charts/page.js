"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import {
  Plus, Trash2, ChevronRight, ArrowLeft,
  TableProperties, PenLine, ColumnSpacingIcon,
} from "lucide-react";

function EmptyState({ onNew }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-14 h-14 bg-brand-cream flex items-center justify-center mb-4">
        <TableProperties size={22} className="text-brand-tan" strokeWidth={1.5} />
      </div>
      <h3 className="text-[13px] font-semibold text-brand-brown uppercase tracking-wider mb-1">No Size Charts Yet</h3>
      <p className="text-[12px] text-brand-tan mb-6">Create your first chart to assign it to products</p>
      <button onClick={onNew} className="btn-primary text-[11px] tracking-[2px]">
        <Plus size={13} className="inline mr-2" /> Create First Chart
      </button>
    </div>
  );
}

function ChartList({ charts, selectedId, onSelect, onCreate, onDelete }) {
  return (
    <div className="w-64 flex-shrink-0 border-r border-brand-tan/15 flex flex-col h-full">
      <div className="px-5 py-4 border-b border-brand-tan/10 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[3px] text-brand-tan font-medium">Charts</p>
        <button
          onClick={onCreate}
          className="w-7 h-7 flex items-center justify-center bg-brand-terracotta text-white hover:bg-brand-terracotta/90 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {charts.map((c) => (
          <button
            key={c._id}
            onClick={() => onSelect(c._id)}
            className={`w-full flex items-center justify-between px-5 py-3 text-left group transition-colors ${
              selectedId === c._id
                ? "bg-brand-terracotta/8 border-r-2 border-brand-terracotta"
                : "hover:bg-brand-tan/5"
            }`}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-[12px] font-medium truncate ${selectedId === c._id ? "text-brand-terracotta" : "text-brand-brown"}`}>
                {c.name}
              </p>
              <p className="text-[10px] text-brand-tan mt-0.5">
                {c.columns?.length || 0} cols · {c.rows?.length || 0} rows
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(c._id, c.name); }}
              className="opacity-0 group-hover:opacity-100 p-1 text-brand-tan/50 hover:text-red-500 transition-all ml-2"
            >
              <Trash2 size={13} />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}

function SpreadsheetEditor({ chart, onChange }) {
  const updateCell = (rowIdx, colIdx, value) => {
    const newRows = chart.rows.map((r, ri) =>
      ri === rowIdx ? r.map((c, ci) => (ci === colIdx ? value : c)) : r
    );
    onChange({ ...chart, rows: newRows });
  };

  const updateCol = (colIdx, value) => {
    const newCols = chart.columns.map((c, i) => (i === colIdx ? value : c));
    onChange({ ...chart, columns: newCols });
  };

  const addRow = () => {
    const emptyRow = chart.columns.map(() => "");
    onChange({ ...chart, rows: [...chart.rows, emptyRow] });
  };

  const addCol = () => {
    const newColumns = [...chart.columns, "New Column"];
    const newRows = chart.rows.map((r) => [...r, ""]);
    onChange({ ...chart, columns: newColumns, rows: newRows });
  };

  const deleteRow = (rowIdx) => {
    onChange({ ...chart, rows: chart.rows.filter((_, i) => i !== rowIdx) });
  };

  const deleteCol = (colIdx) => {
    onChange({
      ...chart,
      columns: chart.columns.filter((_, i) => i !== colIdx),
      rows: chart.rows.map((r) => r.filter((_, i) => i !== colIdx)),
    });
  };

  return (
    <div className="overflow-auto">
      <table className="border-collapse w-full min-w-max">
        <thead>
          <tr>
            <th className="w-8" />
            {chart.columns.map((col, ci) => (
              <th key={ci} className="border border-brand-tan/20 bg-brand-cream p-0 min-w-[130px]">
                <div className="flex items-center group relative">
                  <input
                    value={col}
                    onChange={(e) => updateCol(ci, e.target.value)}
                    className="w-full px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-brand-brown bg-transparent focus:outline-none focus:bg-white"
                    placeholder="Column name"
                  />
                  {chart.columns.length > 1 && (
                    <button
                      onClick={() => deleteCol(ci)}
                      className="absolute right-1 opacity-0 group-hover:opacity-100 p-0.5 text-brand-tan/50 hover:text-red-500 transition-all"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </th>
            ))}
            <th className="border border-brand-tan/20 bg-brand-cream">
              <button
                onClick={addCol}
                className="px-3 py-2.5 text-[11px] text-brand-tan hover:text-brand-terracotta transition-colors flex items-center gap-1 whitespace-nowrap"
              >
                <Plus size={11} /> Col
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {chart.rows.map((row, ri) => (
            <tr key={ri} className="group">
              <td className="border border-brand-tan/10 bg-brand-cream/40 text-center">
                <button
                  onClick={() => deleteRow(ri)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-brand-tan/50 hover:text-red-500 transition-all mx-auto block"
                >
                  <Trash2 size={11} />
                </button>
              </td>
              {row.map((cell, ci) => (
                <td key={ci} className="border border-brand-tan/15 p-0">
                  <input
                    value={cell}
                    onChange={(e) => updateCell(ri, ci, e.target.value)}
                    className="w-full px-3 py-2.5 text-[13px] text-brand-brown bg-transparent focus:outline-none focus:bg-brand-cream/50"
                    placeholder="—"
                  />
                </td>
              ))}
              <td className="border border-brand-tan/10" />
            </tr>
          ))}
          <tr>
            <td colSpan={chart.columns.length + 2} className="border border-brand-tan/10">
              <button
                onClick={addRow}
                className="w-full py-2 text-[11px] text-brand-tan hover:text-brand-terracotta transition-colors flex items-center justify-center gap-1.5"
              >
                <Plus size={12} /> Add Row
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function AdminSizeChartsPage() {
  const [charts, setCharts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");

  const fetchCharts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/size-charts");
      const data = await res.json();
      setCharts(data);
    } catch {
      toast.error("Failed to load size charts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCharts(); }, [fetchCharts]);

  const selectChart = (id) => {
    const c = charts.find((c) => c._id === id);
    setSelectedId(id);
    setDraft(JSON.parse(JSON.stringify(c)));
    setCreatingNew(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/size-charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          columns: ["Size", "Chest (cm)", "Waist (cm)", "Length (cm)"],
          rows: [["S", "", "", ""], ["M", "", "", ""], ["L", "", "", ""], ["XL", "", "", ""]],
        }),
      });
      const created = await res.json();
      if (!res.ok) { toast.error(created.error); return; }
      toast.success("Chart created!");
      setNewName("");
      setCreatingNew(false);
      await fetchCharts();
      setSelectedId(created._id);
      setDraft(created);
    } catch {
      toast.error("Failed to create chart");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/size-charts/${draft._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draft.name, columns: draft.columns, rows: draft.rows }),
      });
      if (!res.ok) { toast.error("Failed to save"); return; }
      toast.success("Saved!");
      await fetchCharts();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete "${name}"? This will unlink it from all products.`)) return;
    try {
      const res = await fetch(`/api/admin/size-charts/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Failed to delete"); return; }
      toast.success("Chart deleted");
      if (selectedId === id) { setSelectedId(null); setDraft(null); }
      await fetchCharts();
    } catch {
      toast.error("Something went wrong");
    }
  };

  if (loading) {
    return <div className="text-brand-tan text-sm py-10 animate-pulse">Loading size charts…</div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Size Charts</h1>
          <p className="text-sm text-brand-tan mt-1">Create spreadsheet-style charts and assign them to products</p>
        </div>
        {draft && (
          <button onClick={handleSave} disabled={saving} className="btn-primary text-[11px] tracking-[2px] disabled:opacity-60">
            {saving ? "Saving…" : "Save Chart"}
          </button>
        )}
      </div>

      <div className="bg-white border border-brand-tan/20 flex" style={{ minHeight: 500 }}>
        {/* Sidebar list */}
        <ChartList
          charts={charts}
          selectedId={selectedId}
          onSelect={selectChart}
          onCreate={() => { setCreatingNew(true); setSelectedId(null); setDraft(null); }}
          onDelete={handleDelete}
        />

        {/* Main area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* New chart form */}
          {creatingNew && (
            <div className="px-8 py-10 flex flex-col items-center justify-center flex-1">
              <div className="w-12 h-12 bg-brand-cream flex items-center justify-center mb-5">
                <PenLine size={18} className="text-brand-tan" strokeWidth={1.5} />
              </div>
              <h3 className="text-[13px] font-semibold text-brand-brown uppercase tracking-wider mb-5">Name Your Chart</h3>
              <div className="w-full max-w-xs space-y-3">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  placeholder="e.g. Men's Tops, Kids' Bottoms…"
                  className="w-full border border-brand-tan/30 px-4 py-3 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors bg-transparent"
                />
                <div className="flex gap-2">
                  <button onClick={handleCreate} disabled={saving} className="flex-1 btn-primary disabled:opacity-60 text-sm">
                    {saving ? "Creating…" : "Create Chart"}
                  </button>
                  <button onClick={() => setCreatingNew(false)} className="btn-outline text-sm px-4">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Editor */}
          {draft && !creatingNew && (
            <div className="flex-1 flex flex-col">
              {/* Chart name header */}
              <div className="px-6 py-4 border-b border-brand-tan/10 flex items-center gap-4">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="text-base font-semibold text-brand-brown bg-transparent border-b border-transparent focus:border-brand-brown focus:outline-none pb-0.5 transition-colors"
                />
                <span className="text-[10px] text-brand-tan/60 uppercase tracking-wider">
                  {draft.columns.length} columns · {draft.rows.length} rows
                </span>
              </div>
              {/* Spreadsheet */}
              <div className="flex-1 overflow-auto p-6">
                <SpreadsheetEditor chart={draft} onChange={setDraft} />
              </div>
            </div>
          )}

          {/* Empty — nothing selected */}
          {!draft && !creatingNew && (
            charts.length === 0
              ? <EmptyState onNew={() => setCreatingNew(true)} />
              : (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-8">
                  <ChevronRight size={20} className="text-brand-tan mb-3 rotate-180" strokeWidth={1.5} />
                  <p className="text-[12px] text-brand-tan">Select a chart from the left to edit it</p>
                </div>
              )
          )}
        </div>
      </div>
    </div>
  );
}
