"use client";

import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import Image from "next/image";
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown,
  FolderTree, Check, X, Upload, Star,
} from "lucide-react";
import { slugify, shouldUnoptimizeImage } from "@/lib/utils";

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

function buildTree(cats, parentId = null) {
  return cats
    .filter((c) => (parentId ? c.parent?.toString() === parentId.toString() : !c.parent))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((c) => ({ ...c, children: buildTree(cats, c._id) }));
}

function depthLabel(level) {
  if (level === 0) return null;
  if (level === 1) return "Sub";
  return "Sub·Sub";
}

// ── Category row ──────────────────────────────────────────────────────────────
function CategoryRow({ cat, level, allCats, onEdit, onDelete, onAddChild }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = cat.children?.length > 0;
  const indent = level * 20;

  return (
    <>
      <tr className={`border-b border-brand-tan/10 hover:bg-brand-cream/40 transition-colors ${!cat.isActive ? "opacity-50" : ""}`}>
        {/* Name */}
        <td className="py-3 pl-4 pr-2">
          <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
            {hasChildren ? (
              <button onClick={() => setExpanded((v) => !v)} className="text-brand-tan hover:text-brand-brown p-0.5 flex-shrink-0">
                {expanded ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronRight size={14} strokeWidth={2} />}
              </button>
            ) : (
              <span className="w-5 flex-shrink-0" />
            )}
            {/* Thumbnail */}
            {cat.image ? (
              <div className="w-8 h-8 flex-shrink-0 relative overflow-hidden bg-brand-cream">
                <Image src={cat.image} alt={cat.name} fill className="object-cover" unoptimized={shouldUnoptimizeImage(cat.image)} />
              </div>
            ) : (
              <div className="w-8 h-8 flex-shrink-0 bg-brand-tan/10 flex items-center justify-center">
                <span className="text-[9px] text-brand-tan/40">IMG</span>
              </div>
            )}
            <span className="text-[13px] font-medium text-brand-brown">{cat.name}</span>
            {depthLabel(level) && (
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 bg-brand-tan/15 text-brand-tan">
                {depthLabel(level)}
              </span>
            )}
            {!cat.isActive && <span className="text-[9px] text-red-400">Inactive</span>}
          </div>
        </td>
        {/* Slug */}
        <td className="py-3 pr-4 text-[12px] text-brand-tan font-mono hidden sm:table-cell">{cat.slug}</td>
        {/* Gender */}
        <td className="py-3 pr-4 hidden md:table-cell">
          <span className="text-[11px] capitalize text-brand-tan">{cat.gender}</span>
        </td>
        {/* Featured */}
        <td className="py-3 pr-4">
          {cat.isFeatured ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium">
              <Star size={11} className="fill-amber-500 text-amber-500" />
              Home
            </span>
          ) : (
            <span className="text-[10px] text-brand-tan/40">—</span>
          )}
        </td>
        {/* Actions */}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-1">
            {level < 2 && (
              <button
                onClick={() => onAddChild(cat)}
                title="Add subcategory"
                className="p-1.5 text-brand-tan hover:text-brand-terracotta transition-colors"
              >
                <Plus size={14} strokeWidth={2} />
              </button>
            )}
            <button onClick={() => onEdit(cat)} title="Edit" className="p-1.5 text-brand-tan hover:text-brand-brown transition-colors">
              <Pencil size={13} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => onDelete(cat)}
              title={hasChildren ? "Has subcategories — cannot delete" : "Delete"}
              disabled={hasChildren}
              className="p-1.5 text-brand-tan hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasChildren && cat.children.map((child) => (
        <CategoryRow
          key={child._id}
          cat={child}
          level={level + 1}
          allCats={allCats}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </>
  );
}

// ── Add / Edit Form ───────────────────────────────────────────────────────────
function CategoryForm({ editing, defaultParent, allCats, onSave, onCancel }) {
  const [imageUrl, setImageUrl] = useState(editing?.image || "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: editing
      ? {
          name: editing.name,
          slug: editing.slug,
          gender: editing.gender,
          parent: editing.parent?.toString() || "",
          description: editing.description || "",
          sortOrder: editing.sortOrder || 0,
          isActive: editing.isActive !== false,
          isFeatured: editing.isFeatured || false,
        }
      : {
          name: "",
          slug: "",
          gender: "all",
          parent: defaultParent?._id?.toString() || "",
          description: "",
          sortOrder: 0,
          isActive: true,
          isFeatured: false,
        },
  });

  const name = watch("name");
  const slug = watch("slug");

  useEffect(() => {
    if (!editing && name && !slug) setValue("slug", slugify(name));
  }, [name, editing, slug, setValue]);

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file);
      setImageUrl(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onSubmit = async (data) => {
    const url = editing ? `/api/admin/categories/${editing._id}` : "/api/admin/categories";
    const method = editing ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, parent: data.parent || null, image: imageUrl }),
    });
    const json = await res.json();
    if (!res.ok) { toast.error(json.error || "Failed"); return; }
    toast.success(editing ? "Category updated" : "Category created");
    onSave();
  };

  const inputCls = "w-full rounded-lg border border-brand-tan/30 bg-transparent px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors";
  const labelCls = "block text-[10px] uppercase tracking-widest text-brand-tan mb-1.5";

  const topLevelCats = allCats.filter((c) => !c.parent);
  const subCats = allCats.filter((c) => c.parent);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Image upload */}
      <div>
        <label className={labelCls}>Category Image</label>
        <div className="flex items-start gap-3">
          <div className="relative w-24 h-24 bg-brand-cream border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] flex-shrink-0 overflow-hidden">
            {imageUrl ? (
              <>
                <Image src={imageUrl} alt="Category" fill className="object-cover" unoptimized={shouldUnoptimizeImage(imageUrl)} />
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-red-600 transition-colors"
                >
                  <X size={10} strokeWidth={2.5} />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-brand-tan/30">
                <span className="text-[10px] uppercase tracking-wider text-center leading-tight">No<br />Image</span>
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 rounded-lg border border-brand-tan/30 px-3 py-2 text-[11px] uppercase tracking-[2px] text-brand-tan hover:border-brand-brown hover:text-brand-brown transition-colors disabled:opacity-50"
            >
              <Upload size={13} strokeWidth={1.5} />
              {uploading ? "Uploading…" : imageUrl ? "Replace" : "Upload Image"}
            </button>
            <p className="text-[10px] text-brand-tan/60">JPG, PNG or WEBP. Shown in the homepage grid.</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
      </div>

      <div>
        <label className={labelCls}>Name *</label>
        <input {...register("name", { required: true })} className={inputCls} placeholder="e.g. Summer Dresses" />
      </div>
      <div>
        <label className={labelCls}>Slug *</label>
        <input {...register("slug", { required: true })} className={inputCls} placeholder="e.g. summer-dresses" />
        <p className="text-[10px] text-brand-tan/60 mt-1">Used in URLs — lowercase, no spaces</p>
      </div>
      <div>
        <label className={labelCls}>Parent Category</label>
        <select {...register("parent")} className={inputCls}>
          <option value="">— Top Level —</option>
          {topLevelCats.map((c) => (
            <option key={c._id} value={c._id}>{c.name}</option>
          ))}
          {subCats.map((c) => {
            const parentName = allCats.find((p) => p._id?.toString() === c.parent?.toString())?.name;
            return (
              <option key={c._id} value={c._id}>{parentName ? `${parentName} › ` : ""}{c.name}</option>
            );
          })}
        </select>
        <p className="text-[10px] text-brand-tan/60 mt-1">Max 3 levels: Category › Sub › Sub·Sub</p>
      </div>
      <div>
        <label className={labelCls}>Gender</label>
        <select {...register("gender")} className={inputCls}>
          <option value="all">All</option>
          <option value="women">Women</option>
          <option value="men">Men</option>
          <option value="kids">Kids</option>
        </select>
      </div>
      <div>
        <label className={labelCls}>Description</label>
        <input {...register("description")} className={inputCls} placeholder="Short description shown on cards" />
      </div>
      <div>
        <label className={labelCls}>Sort Order</label>
        <input type="number" {...register("sortOrder")} className={inputCls} placeholder="0" />
      </div>

      {/* Toggles */}
      <div className="space-y-2 pt-1 border-t border-brand-tan/10">
        <label className="flex items-center gap-2.5 cursor-pointer py-1">
          <input type="checkbox" {...register("isFeatured")} className="accent-brand-terracotta w-4 h-4" />
          <div>
            <span className="text-[12px] font-medium text-brand-brown">Show on Homepage</span>
            <p className="text-[10px] text-brand-tan">Appears in the category grid section (max 3 shown)</p>
          </div>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer py-1">
          <input type="checkbox" {...register("isActive")} className="accent-brand-terracotta w-4 h-4" />
          <span className="text-[12px] text-brand-brown">Active</span>
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-primary text-[11px] tracking-[2px] flex items-center gap-2">
          <Check size={13} strokeWidth={2} />
          {editing ? "Save Changes" : "Create Category"}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline text-[11px] tracking-[2px]">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminCategoriesPage() {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((data) => setCats(Array.isArray(data) ? data : []))
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleEdit = (cat) => setPanel({ mode: "edit", cat });
  const handleAddChild = (parent) => setPanel({ mode: "add", defaultParent: parent });
  const handleDelete = async (cat) => {
    if (!confirm(`Delete "${cat.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/categories/${cat._id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Failed to delete"); return; }
    toast.success("Deleted");
    load();
  };

  const tree = buildTree(cats);
  const normalCats = cats.map((c) => ({
    ...c,
    _id: c._id?.toString(),
    parent: c.parent?.toString() || null,
  }));

  const featuredCount = cats.filter((c) => c.isFeatured).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">Categories</h1>
          <p className="text-sm text-brand-tan mt-1">
            Manage category hierarchy · <span className="text-amber-600 font-medium">{featuredCount}/3 featured</span> on homepage
          </p>
        </div>
        <button
          onClick={() => setPanel({ mode: "add", defaultParent: null })}
          className="btn-primary text-[11px] tracking-[2px] flex items-center gap-2"
        >
          <Plus size={14} strokeWidth={2} /> Add Category
        </button>
      </div>

      <div className={`grid gap-6 ${panel ? "grid-cols-1 xl:grid-cols-3" : "grid-cols-1"}`}>
        {/* Tree list */}
        <div className={panel ? "xl:col-span-2" : ""}>
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-brand-tan text-sm">Loading…</div>
            ) : tree.length === 0 ? (
              <div className="p-12 text-center">
                <FolderTree size={32} className="text-brand-tan/30 mx-auto mb-3" strokeWidth={1} />
                <p className="text-sm text-brand-tan">No categories yet. Create your first one.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-brand-tan/15 bg-brand-cream/40">
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-brand-tan font-medium">Name</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-brand-tan font-medium hidden sm:table-cell">Slug</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-brand-tan font-medium hidden md:table-cell">Gender</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-brand-tan font-medium">Featured</th>
                      <th className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-brand-tan font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-tan/5">
                    {tree.map((cat) => (
                      <CategoryRow
                        key={cat._id}
                        cat={cat}
                        level={0}
                        allCats={normalCats}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onAddChild={handleAddChild}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex items-center gap-5 mt-3 text-[11px] text-brand-tan">
            <span className="flex items-center gap-1.5"><span className="w-4 h-4 border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] bg-white" /> Top-level</span>
            <span className="flex items-center gap-1.5"><span className="text-[9px] px-1.5 py-0.5 bg-brand-tan/15">Sub</span> Subcategory</span>
            <span className="flex items-center gap-1.5"><Star size={11} className="fill-amber-500 text-amber-500" /> Featured on homepage</span>
          </div>
        </div>

        {/* Side panel */}
        {panel && (
          <div className="bg-white border border-brand-tan/15 rounded-xl shadow-[0_1px_3px_rgba(44,24,16,0.04)] p-6 overflow-y-auto max-h-[90vh] sticky top-4">
            <div className="flex items-center justify-between mb-5">
              <p className="text-[11px] uppercase tracking-widest text-brand-tan font-medium">
                {panel.mode === "edit" ? `Edit: ${panel.cat.name}` : panel.defaultParent ? `Add under: ${panel.defaultParent.name}` : "New Category"}
              </p>
              <button onClick={() => setPanel(null)} className="text-brand-tan hover:text-brand-brown">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
            <CategoryForm
              editing={panel.mode === "edit" ? panel.cat : null}
              defaultParent={panel.defaultParent || null}
              allCats={normalCats}
              onSave={() => { setPanel(null); load(); }}
              onCancel={() => setPanel(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
