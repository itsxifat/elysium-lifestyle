"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import {
  ChevronRight, ChevronDown, FolderTree, Search, Check, Plus, Loader2, X,
} from "lucide-react";
import { shouldUnoptimizeImage } from "@/lib/utils";
import { inputClass } from "@/components/admin/ui";

function buildTree(cats, parentId = null) {
  return cats
    .filter((c) => (parentId ? c.parent?.toString() === parentId.toString() : !c.parent))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
    .map((c) => ({ ...c, children: buildTree(cats, c._id) }));
}

// One row of the category tree. Selecting a node loads its products on the right.
function TreeNode({ node, level, activeId, onSelect }) {
  const [open, setOpen] = useState(level < 1);
  const hasChildren = node.children?.length > 0;
  const isActive = String(activeId) === String(node._id);

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded-md pr-2 transition-colors ${
          isActive ? "bg-brand-terracotta/12 text-brand-terracotta" : "hover:bg-brand-cream/70 text-brand-brown"
        }`}
        style={{ paddingLeft: 4 + level * 12 }}
      >
        {hasChildren ? (
          <button type="button" onClick={() => setOpen((v) => !v)} className="p-1 text-brand-tan hover:text-brand-brown flex-shrink-0">
            {open ? <ChevronDown size={13} strokeWidth={2} /> : <ChevronRight size={13} strokeWidth={2} />}
          </button>
        ) : (
          <span className="w-[21px] flex-shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(node)}
          className="flex-1 text-left text-[13px] py-1.5 truncate"
        >
          {node.name}
        </button>
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child._id} node={child} level={level + 1} activeId={activeId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategoryProductBrowser({ categories, selectedIds, onAdd, onRemove }) {
  const tree = buildTree(categories);
  const [activeCat, setActiveCat] = useState(null); // { _id, name }
  const [subtree, setSubtree] = useState(true);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const searchTimer = useRef(null);

  const selected = new Set((selectedIds || []).map(String));

  const load = useCallback(async (pageNum, { catId, sub, q }) => {
    if (!catId && !q) {
      setProducts([]);
      setHasMore(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (catId) {
        params.set("category", catId);
        params.set("subtree", sub ? "1" : "0");
      }
      if (q) params.set("q", q);
      params.set("page", String(pageNum));
      const res = await fetch(`/api/admin/custom-urls/products?${params.toString()}`);
      const data = await res.json();
      setProducts((prev) => (pageNum === 1 ? data.products || [] : [...prev, ...(data.products || [])]));
      setHasMore(!!data.hasMore);
      setPage(pageNum);
    } catch {
      setProducts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the active category, subtree toggle, or (debounced) search changes.
  useEffect(() => {
    clearTimeout(searchTimer.current);
    const q = query.trim();
    searchTimer.current = setTimeout(() => {
      load(1, { catId: activeCat?._id || "", sub: subtree, q });
    }, q ? 280 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [activeCat, subtree, query, load]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] gap-3 border border-brand-tan/20 rounded-lg overflow-hidden bg-white">
      {/* Category tree */}
      <div className="border-b md:border-b-0 md:border-r border-brand-tan/15 bg-brand-cream/30 max-h-[340px] overflow-y-auto p-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan px-1 pb-2">
          <FolderTree size={13} /> Categories
        </div>
        <button
          type="button"
          onClick={() => setActiveCat(null)}
          className={`w-full text-left text-[13px] py-1.5 px-2 rounded-md transition-colors ${
            !activeCat ? "bg-brand-terracotta/12 text-brand-terracotta" : "text-brand-brown hover:bg-brand-cream/70"
          }`}
        >
          All products (search)
        </button>
        {tree.map((node) => (
          <TreeNode key={node._id} node={node} level={0} activeId={activeCat?._id} onSelect={setActiveCat} />
        ))}
      </div>

      {/* Product list */}
      <div className="p-3 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-tan" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={activeCat ? `Search in ${activeCat.name}…` : "Search all products…"}
              className={`${inputClass} pl-8`}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-tan hover:text-brand-brown">
                <X size={13} />
              </button>
            )}
          </div>
          {activeCat && (
            <label className="flex items-center gap-1.5 text-[12px] text-brand-brown whitespace-nowrap cursor-pointer select-none">
              <input type="checkbox" checked={subtree} onChange={(e) => setSubtree(e.target.checked)} className="accent-brand-terracotta" />
              Include sub-categories
            </label>
          )}
        </div>

        <div className="min-h-[180px] max-h-[300px] overflow-y-auto -mx-1 px-1">
          {products.length === 0 && !loading ? (
            <p className="text-[13px] text-brand-tan text-center py-12">
              {activeCat || query ? "No products found." : "Pick a category or search to find products."}
            </p>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {products.map((p) => {
                const isSel = selected.has(String(p._id));
                return (
                  <button
                    type="button"
                    key={p._id}
                    onClick={() => (isSel ? onRemove(p._id) : onAdd(p))}
                    className={`group flex items-center gap-2 p-1.5 rounded-lg border text-left transition-colors ${
                      isSel ? "border-brand-terracotta bg-brand-terracotta/8" : "border-brand-tan/20 hover:border-brand-brown/40"
                    }`}
                  >
                    <div className="w-10 h-12 flex-shrink-0 bg-brand-cream-dark overflow-hidden rounded relative">
                      {p.image ? (
                        <Image src={p.image} alt="" fill className="object-cover" unoptimized={shouldUnoptimizeImage(p.image)} sizes="40px" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-brand-brown truncate leading-tight">{p.name}</p>
                      {p.sku && <p className="text-[10px] text-brand-tan truncate">{p.sku}</p>}
                    </div>
                    <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${isSel ? "bg-brand-terracotta text-white" : "bg-brand-cream-dark text-brand-tan group-hover:text-brand-brown"}`}>
                      {isSel ? <Check size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={2.5} />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-4 text-brand-tan">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {hasMore && !loading && (
            <button
              type="button"
              onClick={() => load(page + 1, { catId: activeCat?._id || "", sub: subtree, q: query.trim() })}
              className="w-full mt-2 text-[12px] text-brand-terracotta hover:underline py-1.5"
            >
              Load more
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
