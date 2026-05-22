"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import toast from "react-hot-toast";
import { Plus, Trash2, Upload, X, TableProperties } from "lucide-react";
import { slugify } from "@/lib/utils";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Image from "next/image";

export default function ProductForm({ categories, defaultValues, isEdit, productId }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState(defaultValues?.images || []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [masterSizes, setMasterSizes] = useState([]);
  const [sizeCharts, setSizeCharts] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm({
    defaultValues: defaultValues || {
      name: "", slug: "", description: "", category: "", gender: "",
      material: "", careInstructions: "", sizeChart: "",
      featured: false, isNewArrival: false, isPublished: true,
      variants: [{ size: "", price: 0, stock: 0, sku: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "variants" });

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/master-sizes").then((r) => r.json()),
      fetch("/api/admin/size-charts").then((r) => r.json()),
    ])
      .then(([sizes, charts]) => {
        setMasterSizes(Array.isArray(sizes) ? sizes : []);
        setSizeCharts(Array.isArray(charts) ? charts : []);
      })
      .catch(() => toast.error("Failed to load sizes / charts"))
      .finally(() => setLoadingMeta(false));
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) { setImages((prev) => [...prev, data.url]); toast.success("Image uploaded"); }
      else toast.error(data.error || "Upload failed");
    } catch { toast.error("Upload failed"); }
    finally { setUploadingImage(false); e.target.value = ""; }
  };

  const removeImage = async (url, index) => {
    setImages((prev) => prev.filter((_, j) => j !== index));
    if (url.startsWith("/uploads/")) {
      await fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      }).catch(() => {});
    }
  };

  const onSubmit = async (data) => {
    if (images.length === 0) { toast.error("Please upload at least one image"); return; }
    if (!data.variants?.length) { toast.error("Add at least one size variant"); return; }
    setSaving(true);
    try {
      const payload = {
        ...data,
        images,
        sizeChart: data.sizeChart || null,
        variants: data.variants.map((v) => ({
          ...v,
          price: Number(v.price),
          stock: Number(v.stock),
        })),
      };
      const res = await fetch(isEdit ? `/api/products/${productId}` : "/api/products", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) { toast.error(result.error || "Failed to save"); return; }
      toast.success(isEdit ? "Product updated!" : "Product created!");
      router.push("/admin/products");
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-4xl">
      {/* Basic Info */}
      <div className="bg-white border border-brand-tan/20 p-6">
        <h2 className="text-sm font-semibold text-brand-brown uppercase tracking-wider mb-5">Basic Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Input
              label="Product Name *"
              {...register("name", { required: "Name is required" })}
              error={errors.name?.message}
              onChange={(e) => { register("name").onChange(e); if (!isEdit) setValue("slug", slugify(e.target.value)); }}
            />
          </div>
          <Input label="Slug" {...register("slug")} placeholder="auto-generated" />
          <Select label="Category" {...register("category")}>
            <option value="">Select category</option>
            {categories.map((cat) => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
          </Select>
          <Select label="Gender" {...register("gender")}>
            <option value="">Select gender</option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="kids">Kids</option>
            <option value="unisex">Unisex</option>
          </Select>
          <Input label="Material" {...register("material")} />
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-brand-brown mb-1">Care Instructions</label>
            <Input {...register("careInstructions")} placeholder="e.g. Machine wash cold, tumble dry low" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-brand-brown mb-1">Description</label>
            <textarea
              {...register("description")}
              rows={4}
              className="w-full border border-brand-tan bg-white px-4 py-3 text-brand-brown text-sm focus:outline-none focus:border-brand-terracotta resize-none"
              placeholder="Product description…"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-6 mt-4">
          {[{ name: "featured", label: "Featured" }, { name: "isNewArrival", label: "New Arrival" }, { name: "isPublished", label: "Published" }].map((t) => (
            <label key={t.name} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register(t.name)} className="accent-brand-terracotta w-4 h-4" />
              <span className="text-sm text-brand-brown">{t.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Images */}
      <div className="bg-white border border-brand-tan/20 p-6">
        <h2 className="text-sm font-semibold text-brand-brown uppercase tracking-wider mb-5">Product Images</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          {images.map((img, i) => (
            <div key={i} className="relative w-24 h-28 group">
              <Image src={img} alt={`Product ${i + 1}`} fill className="object-cover" />
              <button type="button" onClick={() => removeImage(img, i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={12} />
              </button>
              {i === 0 && <span className="absolute bottom-0 left-0 right-0 bg-brand-brown/80 text-white text-[10px] text-center py-0.5">Main</span>}
            </div>
          ))}
          <label className="w-24 h-28 border-2 border-dashed border-brand-tan flex flex-col items-center justify-center cursor-pointer hover:border-brand-terracotta transition-colors text-brand-tan hover:text-brand-terracotta">
            {uploadingImage ? <span className="text-xs">Uploading…</span> : <><Upload size={20} /><span className="text-xs mt-1">Upload</span></>}
            <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="hidden" />
          </label>
        </div>
        <p className="text-xs text-brand-tan">First image is the main product image.</p>
      </div>

      {/* Variants */}
      <div className="bg-white border border-brand-tan/20 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold text-brand-brown uppercase tracking-wider">Variants — Size / Price / Stock</h2>
            <p className="text-xs text-brand-tan mt-0.5">Sizes come from your Master Sizes list</p>
          </div>
          <button
            type="button"
            onClick={() => append({ size: masterSizes[0] || "", price: 0, stock: 0, sku: "" })}
            className="flex items-center gap-1 text-sm text-brand-terracotta hover:underline"
          >
            <Plus size={14} /> Add Size
          </button>
        </div>

        {loadingMeta ? (
          <p className="text-xs text-brand-tan animate-pulse">Loading sizes…</p>
        ) : masterSizes.length === 0 ? (
          <div className="border border-dashed border-brand-tan/30 p-4 text-center">
            <p className="text-xs text-brand-tan">No master sizes configured.</p>
            <a href="/admin/master-sizes" target="_blank" className="text-xs text-brand-terracotta underline mt-1 inline-block">
              Go to Master Sizes →
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {fields.map((field, i) => (
              <div key={field.id} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end p-3 bg-brand-cream/30 border border-brand-tan/10">
                <div>
                  {i === 0 && <label className="block text-[10px] uppercase tracking-widest text-brand-tan mb-1.5">Size</label>}
                  <select
                    {...register(`variants.${i}.size`, { required: true })}
                    className="w-full border border-brand-tan/30 bg-white px-3 py-2.5 text-sm text-brand-brown focus:outline-none focus:border-brand-brown"
                  >
                    <option value="">Select…</option>
                    {masterSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <Input
                  label={i === 0 ? "Price (BDT) *" : ""}
                  type="number"
                  min="0"
                  {...register(`variants.${i}.price`, { required: true, min: 0, valueAsNumber: true })}
                  placeholder="1200"
                />
                <Input
                  label={i === 0 ? "Stock" : ""}
                  type="number"
                  min="0"
                  {...register(`variants.${i}.stock`, { min: 0, valueAsNumber: true })}
                />
                <Input
                  label={i === 0 ? "SKU (optional)" : ""}
                  {...register(`variants.${i}.sku`)}
                  placeholder="ELY-001-M"
                />
                <div className={`flex items-${i === 0 ? "end" : "center"}`}>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    disabled={fields.length === 1}
                    className="p-2 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-brand-tan mt-3">Each size has its own price. Set stock to 0 to mark as unavailable.</p>
      </div>

      {/* Size Chart */}
      <div className="bg-white border border-brand-tan/20 p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-8 h-8 bg-brand-cream flex items-center justify-center flex-shrink-0 mt-0.5">
            <TableProperties size={14} className="text-brand-tan" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-brand-brown uppercase tracking-wider">Size Guide Chart</h2>
            <p className="text-xs text-brand-tan mt-0.5">Attach a size chart — shown to customers as a "Size Guide" on the product page</p>
          </div>
        </div>

        {loadingMeta ? (
          <p className="text-xs text-brand-tan animate-pulse">Loading charts…</p>
        ) : sizeCharts.length === 0 ? (
          <div className="border border-dashed border-brand-tan/30 p-4 text-center">
            <p className="text-xs text-brand-tan">No size charts created yet.</p>
            <a href="/admin/size-charts" target="_blank" className="text-xs text-brand-terracotta underline mt-1 inline-block">
              Create a Size Chart →
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-brand-tan/20 cursor-pointer hover:bg-brand-cream/30 transition-colors">
              <input
                type="radio"
                value=""
                {...register("sizeChart")}
                className="accent-brand-terracotta"
              />
              <span className="text-sm text-brand-tan">No size chart</span>
            </label>
            {sizeCharts.map((chart) => (
              <label key={chart._id} className="flex items-center gap-3 p-3 border border-brand-tan/20 cursor-pointer hover:bg-brand-cream/30 transition-colors">
                <input
                  type="radio"
                  value={chart._id}
                  {...register("sizeChart")}
                  className="accent-brand-terracotta"
                />
                <div>
                  <p className="text-sm font-medium text-brand-brown">{chart.name}</p>
                  <p className="text-[11px] text-brand-tan mt-0.5">
                    {chart.columns?.length} cols · {chart.rows?.length} rows
                  </p>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? "Saving…" : isEdit ? "Update Product" : "Create Product"}
        </button>
        <button type="button" onClick={() => router.push("/admin/products")} className="btn-outline">
          Cancel
        </button>
      </div>
    </form>
  );
}
