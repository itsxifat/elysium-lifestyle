"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, FolderTree, Search } from "lucide-react";

// Hierarchical category picker. Categories are a self-referential tree
// (Category.parent), so a flat <select> hides the structure. This shows the
// parent → child → sub tree with expand/collapse, the full path of the
// selection ("Men › Shirts › Casual"), and a search box for big catalogs.

function buildTree(cats, parentId = null) {
  return cats
    .filter((c) => (parentId ? String(c.parent) === String(parentId) : !c.parent))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    .map((c) => ({ ...c, children: buildTree(cats, c._id) }));
}

function pathOf(cats, id) {
  const byId = Object.fromEntries(cats.map((c) => [String(c._id), c]));
  const parts = [];
  let cur = byId[String(id)];
  let guard = 0;
  while (cur && guard++ < 12) {
    parts.unshift(cur.name);
    cur = cur.parent ? byId[String(cur.parent)] : null;
  }
  return parts;
}

export default function CategoryTreeSelect({
  categories = [],
  value,
  onChange,
  label = "Category",
  placeholder = "Select category",
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState({});
  const ref = useRef(null);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const selectedPath = useMemo(() => (value ? pathOf(categories, value) : []), [categories, value]);

  // Auto-expand ancestors of the current selection when opening.
  useEffect(() => {
    if (!open || !value) return;
    const byId = Object.fromEntries(categories.map((c) => [String(c._id), c]));
    const next = {};
    let cur = byId[String(value)];
    let guard = 0;
    while (cur?.parent && guard++ < 12) {
      next[String(cur.parent)] = true;
      cur = byId[String(cur.parent)];
    }
    setExpanded((p) => ({ ...p, ...next }));
  }, [open, value, categories]);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const select = (id) => {
    onChange(id);
    setOpen(false);
    setQ("");
  };

  const filter = q.trim().toLowerCase();
  const matches = filter ? categories.filter((c) => c.name.toLowerCase().includes(filter)) : null;

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-brand-brown mb-1">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 border border-brand-tan/30 bg-white px-3 py-2 text-sm text-left rounded-md focus:outline-none focus:border-brand-brown transition-colors"
      >
        <span className="flex items-center gap-1.5 min-w-0">
          <FolderTree size={14} className="text-brand-tan flex-shrink-0" />
          {selectedPath.length ? (
            <span className="truncate">
              {selectedPath.map((p, i) => (
                <span key={i}>
                  {i > 0 && <span className="text-brand-tan/50 mx-1">›</span>}
                  <span className={i === selectedPath.length - 1 ? "text-brand-brown font-medium" : "text-brand-tan"}>{p}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-brand-tan">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={15} className={`text-brand-tan flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-brand-tan/30 rounded-md shadow-xl max-h-72 overflow-auto">
          <div className="sticky top-0 bg-white border-b border-brand-tan/15 p-2">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-brand-cream/50 rounded">
              <Search size={13} className="text-brand-tan flex-shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search categories…"
                className="w-full bg-transparent text-sm focus:outline-none text-brand-brown"
              />
            </div>
          </div>
          <div className="py-1">
            <button
              type="button"
              onClick={() => select("")}
              className="w-full text-left px-3 py-1.5 text-sm text-brand-tan hover:bg-brand-cream/50"
            >
              No category
            </button>
            {matches ? (
              matches.length ? (
                matches.map((c) => (
                  <FlatRow key={c._id} node={c} value={value} onSelect={select} path={pathOf(categories, c._id)} />
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-brand-tan text-center">No matches</p>
              )
            ) : (
              tree.map((node) => (
                <TreeNode key={node._id} node={node} depth={0} value={value} expanded={expanded} onToggle={toggle} onSelect={select} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TreeNode({ node, depth, value, expanded, onToggle, onSelect }) {
  const hasChildren = node.children?.length > 0;
  const isOpen = expanded[node._id];
  const selected = String(value) === String(node._id);
  return (
    <div>
      <div
        className={`flex items-center ${selected ? "bg-brand-terracotta/10" : "hover:bg-brand-cream/50"}`}
        style={{ paddingLeft: depth * 16 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => onToggle(node._id)} className="p-1 text-brand-tan hover:text-brand-brown">
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[21px] flex-shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node._id)}
          className="flex-1 flex items-center justify-between gap-2 px-1.5 py-1.5 text-left text-sm text-brand-brown"
        >
          <span className="truncate">{node.name}</span>
          {selected && <Check size={14} className="text-brand-terracotta flex-shrink-0" />}
        </button>
      </div>
      {hasChildren &&
        isOpen &&
        node.children.map((child) => (
          <TreeNode key={child._id} node={child} depth={depth + 1} value={value} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
        ))}
    </div>
  );
}

function FlatRow({ node, value, onSelect, path }) {
  const selected = String(value) === String(node._id);
  return (
    <button
      type="button"
      onClick={() => onSelect(node._id)}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-2 ${selected ? "bg-brand-terracotta/10" : "hover:bg-brand-cream/50"}`}
    >
      <span className="truncate">
        {path.slice(0, -1).map((p, i) => (
          <span key={i} className="text-brand-tan/60">{p} › </span>
        ))}
        <span className="text-brand-brown font-medium">{node.name}</span>
      </span>
      {selected && <Check size={14} className="text-brand-terracotta flex-shrink-0" />}
    </button>
  );
}
