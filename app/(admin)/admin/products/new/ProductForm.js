"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import toast from "react-hot-toast";
import { Plus, Trash2, Upload, X, TableProperties, Package } from "lucide-react";
import { shouldUnoptimizeImage, slugify } from "@/lib/utils";
import CategoryTreeSelect from "@/components/admin/CategoryTreeSelect";
import { PageHeader, Card, Field, Button, SectionTitle, inputClass } from "@/components/admin/ui";
import Image from "next/image";

export default function ProductForm({ categories, defaultValues, isEdit, productId }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState(defaultValues?.images || []);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [masterSizes, setMasterSizes] = useState([]);
  const [sizeCharts, setSizeCharts] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);
  // Images uploaded in this session but not yet persisted — safe to delete
  // eagerly if removed. Already-saved images are cleaned up by the PUT diff.
  const sessionUploads = useRef(new Set());

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
      if (data.url) {
        sessionUploads.current.add(data.url);
        setImages((prev) => [...prev, data.url]);
        toast.success("Image uploaded");
      }
      else toast.error(data.error || "Upload failed");
    } catch { toast.error("Upload failed"); }
    finally { setUploadingImage(false); e.target.value = ""; }
  };

  const removeImage = async (url, index) => {
    setImages((prev) => prev.filter((_, j) => j !== index));
    // Only delete from the CDN immediately if it was uploaded this session and
    // never saved. Persisted images removed during an edit are deleted by the
    // product PUT diff on save — so cancelling an edit never destroys them.
    if (sessionUploads.current.has(url)) {
      sessionUploads.current.delete(url);
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
      router.refresh(); // invalidate the App Router cache so the list + re-edit show fresh data
    } catch { toast.error("Something went wrong"); }
    finally { setSaving(false); }
  };

  const cancel = () => router.push("/admin/products");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl mx-auto">
      <PageHeader
        icon={Package}
        title={isEdit ? "Edit Product" : "New Product"}
        subtitle={isEdit ? "Update product details, images and variants" : "Add a new product to your catalog"}
      />

      <div className="space-y-5">
        {/* Basic Info */}
        <Card>
          <SectionTitle>Basic Information</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Product Name *" error={errors.name?.message} className="md:col-span-2">
              <input
                className={inputClass}
                placeholder="e.g. Classic Cotton Shirt"
                {...register("name", { required: "Name is required" })}
                onChange={(e) => { register("name").onChange(e); if (!isEdit) setValue("slug", slugify(e.target.value)); }}
              />
            </Field>
            <Field label="Slug" hint="Auto-generated from the name">
              <input className={inputClass} placeholder="auto-generated" {...register("slug")} />
            </Field>
            <Field label="Material">
              <input className={inputClass} placeholder="e.g. 100% Cotton" {...register("material")} />
            </Field>
            <Field label="Description" className="md:col-span-2">
              <textarea rows={4} className={`${inputClass} resize-none`} placeholder="Product description…" {...register("description")} />
            </Field>
            <Field label="Care Instructions" className="md:col-span-2">
              <input className={inputClass} placeholder="e.g. Machine wash cold, tumble dry low" {...register("careInstructions")} />
            </Field>
          </div>
        </Card>

        {/* Organization */}
        <Card>
          <SectionTitle>Organization</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <CategoryTreeSelect
                label="Category"
                categories={categories}
                value={watch("category")}
                onChange={(id) => setValue("category", id, { shouldDirty: true, shouldValidate: true })}
              />
              <input type="hidden" {...register("category")} />
            </div>
            <Field label="Gender">
              <select className={inputClass} {...register("gender")}>
                <option value="">Select gender</option>
                <option value="men">Men</option>
                <option value="women">Women</option>
                <option value="kids">Kids</option>
                <option value="unisex">Unisex</option>
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {[{ name: "featured", label: "Featured" }, { name: "isNewArrival", label: "New Arrival" }, { name: "isPublished", label: "Published" }].map((t) => (
              <label key={t.name} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-tan/25 cursor-pointer hover:bg-brand-cream/50 has-[:checked]:border-brand-terracotta has-[:checked]:bg-brand-terracotta/5 transition-colors">
                <input type="checkbox" {...register(t.name)} className="accent-brand-terracotta w-4 h-4" />
                <span className="text-[13px] text-brand-brown font-medium">{t.label}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* Images */}
        <Card>
          <SectionTitle>Product Images</SectionTitle>
          <div className="flex flex-wrap gap-3">
            {images.map((img, i) => (
              <div key={i} className="relative w-24 h-28 rounded-lg overflow-hidden border border-brand-tan/15 group">
                <Image src={img} alt={`Product ${i + 1}`} fill sizes="96px" unoptimized={shouldUnoptimizeImage(img)} className="object-cover" />
                <button type="button" onClick={() => removeImage(img, i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={12} />
                </button>
                {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-brand-brown/80 text-white text-[10px] text-center py-0.5">Main</span>}
              </div>
            ))}
            <label className="w-24 h-28 rounded-lg border-2 border-dashed border-brand-tan/40 flex flex-col items-center justify-center cursor-pointer hover:border-brand-terracotta hover:text-brand-terracotta text-brand-tan transition-colors">
              {uploadingImage ? <span className="text-xs">Uploading…</span> : <><Upload size={20} /><span className="text-xs mt-1">Upload</span></>}
              <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} className="hidden" />
            </label>
          </div>
          <p className="text-xs text-brand-tan mt-3">First image is the main product image.</p>
        </Card>

        {/* Variants */}
        <Card>
          <div className="flex items-center justify-between gap-3 mb-1">
            <SectionTitle className="mb-0">Variants — Size / Price / Stock</SectionTitle>
            <Button type="button" variant="ghost" size="sm" onClick={() => append({ size: masterSizes[0] || "", price: 0, stock: 0, sku: "" })}>
              <Plus size={14} /> Add Size
            </Button>
          </div>
          <p className="text-xs text-brand-tan mb-4">Sizes come from your Master Sizes list. Each size has its own price.</p>

          {loadingMeta ? (
            <p className="text-xs text-brand-tan animate-pulse">Loading sizes…</p>
          ) : masterSizes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-brand-tan/30 p-4 text-center">
              <p className="text-xs text-brand-tan">No master sizes configured.</p>
              <a href="/admin/master-sizes" target="_blank" className="text-xs text-brand-terracotta underline mt-1 inline-block">Go to Master Sizes →</a>
            </div>
          ) : (
            <div className="space-y-2.5">
              {fields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-2 md:grid-cols-[1.2fr_1fr_1fr_1.2fr_auto] gap-2.5 items-end p-3 rounded-lg bg-brand-cream/40 border border-brand-tan/10">
                  <Field label={i === 0 ? "Size" : undefined}>
                    <select className={inputClass} {...register(`variants.${i}.size`, { required: true })}>
                      <option value="">Select…</option>
                      {masterSizes.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label={i === 0 ? "Price (Tk) *" : undefined}>
                    <input type="number" min="0" className={inputClass} placeholder="1200" {...register(`variants.${i}.price`, { required: true, min: 0, valueAsNumber: true })} />
                  </Field>
                  <Field label={i === 0 ? "Stock" : undefined}>
                    <input type="number" min="0" className={inputClass} {...register(`variants.${i}.stock`, { min: 0, valueAsNumber: true })} />
                  </Field>
                  <Field label={i === 0 ? "SKU" : undefined}>
                    <input className={inputClass} placeholder="ELY-001-M" {...register(`variants.${i}.sku`)} />
                  </Field>
                  <button type="button" onClick={() => remove(i)} disabled={fields.length === 1} className="p-2.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed justify-self-start">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Size Chart */}
        <Card>
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
              <TableProperties size={15} />
            </div>
            <div>
              <SectionTitle className="mb-0.5">Size Guide Chart</SectionTitle>
              <p className="text-xs text-brand-tan">Shown to customers as a &quot;Size Guide&quot; on the product page</p>
            </div>
          </div>

          {loadingMeta ? (
            <p className="text-xs text-brand-tan animate-pulse">Loading charts…</p>
          ) : sizeCharts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-brand-tan/30 p-4 text-center">
              <p className="text-xs text-brand-tan">No size charts created yet.</p>
              <a href="/admin/size-charts" target="_blank" className="text-xs text-brand-terracotta underline mt-1 inline-block">Create a Size Chart →</a>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-brand-tan/20 cursor-pointer hover:bg-brand-cream/40 has-[:checked]:border-brand-terracotta has-[:checked]:bg-brand-terracotta/5 transition-colors">
                <input type="radio" value="" {...register("sizeChart")} className="accent-brand-terracotta" />
                <span className="text-sm text-brand-tan">No size chart</span>
              </label>
              {sizeCharts.map((chart) => (
                <label key={chart._id} className="flex items-center gap-3 p-3 rounded-lg border border-brand-tan/20 cursor-pointer hover:bg-brand-cream/40 has-[:checked]:border-brand-terracotta has-[:checked]:bg-brand-terracotta/5 transition-colors">
                  <input type="radio" value={chart._id} {...register("sizeChart")} className="accent-brand-terracotta" />
                  <div>
                    <p className="text-sm font-medium text-brand-brown">{chart.name}</p>
                    <p className="text-[11px] text-brand-tan mt-0.5">{chart.columns?.length} cols · {chart.rows?.length} rows</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sticky action bar — Save/Cancel always reachable without scrolling */}
      <div className="sticky bottom-4 z-20 mt-5">
        <div className="flex items-center gap-3 bg-white/95 backdrop-blur-sm border border-brand-tan/20 rounded-xl shadow-lg px-4 py-3">
          <span className="text-[12px] text-brand-tan hidden sm:block">{isEdit ? "Editing product" : "New product"}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Product" : "Create Product"}</Button>
          </div>
        </div>
      </div>
    </form>
  );
}
