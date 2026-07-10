"use client";

import { useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Upload, X, Plus, ArrowUp, ArrowDown, Loader2, Trash2 } from "lucide-react";
import { Button, Field, TextInput, Select, Toggle, inputClass } from "@/components/admin/ui";
import { shouldUnoptimizeImage } from "@/lib/utils";

// A generic form driven by a block's `fields` spec (see lib/landing-blocks.js).
// Adding a block type means describing its fields there — no editor code.

async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return data.url;
}

export function ImagePicker({ value, onChange, label }) {
  const [busy, setBusy] = useState(false);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadFile(file));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label && <span className="block text-[12px] font-medium text-brand-brown mb-1.5">{label}</span>}
      {value ? (
        <div className="relative w-full h-28 rounded-lg overflow-hidden border border-brand-tan/20 bg-brand-cream">
          <Image src={value} alt="" fill className="object-cover" unoptimized={shouldUnoptimizeImage(value)} sizes="300px" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-1.5 w-full h-28 rounded-lg border border-dashed border-brand-tan/40 cursor-pointer hover:border-brand-brown/50 hover:bg-brand-cream/40 transition-colors text-brand-tan">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          <span className="text-[11px]">{busy ? "Uploading…" : "Upload image"}</span>
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
        </label>
      )}
    </div>
  );
}

// An ISO instant → the "YYYY-MM-DDTHH:mm" LOCAL string <input type="datetime-local">
// expects. Going through toISOString() directly would silently shift the admin's
// deadline by their UTC offset.
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// One field of any `kind`. `list` recurses into this component per sub-field.
function FieldInput({ field, value, onChange }) {
  switch (field.kind) {
    case "textarea":
      return (
        <Field label={field.label} hint={field.hint}>
          <textarea
            rows={field.rows || 3}
            className={`${inputClass} resize-y`}
            placeholder={field.placeholder}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      );

    case "number":
      return (
        <Field label={field.label} hint={field.hint}>
          <TextInput
            type="number" min={field.min} max={field.max}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </Field>
      );

    case "image":
      return <ImagePicker label={field.label} value={value || ""} onChange={onChange} />;

    case "color":
      return (
        <Field label={field.label} hint={field.hint}>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value || "#000000"}
              onChange={(e) => onChange(e.target.value)}
              className="w-10 h-9 rounded-lg border border-brand-tan/30 bg-white cursor-pointer p-0.5"
            />
            <TextInput value={value || ""} onChange={(e) => onChange(e.target.value)} className="font-mono" />
          </div>
        </Field>
      );

    case "select":
      return (
        <Field label={field.label} hint={field.hint}>
          <Select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o.charAt(0).toUpperCase() + o.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
      );

    case "toggle":
      return (
        <div className="flex items-center justify-between py-1">
          <span className="text-[12px] font-medium text-brand-brown">{field.label}</span>
          <Toggle checked={value !== false} onChange={onChange} />
        </div>
      );

    case "datetime":
      return (
        <Field label={field.label} hint={field.hint}>
          <TextInput
            type="datetime-local"
            value={toLocalInput(value)}
            // The input's value is a zone-less local time; `new Date` reads it as
            // local, which is what the admin means by "ends at 11pm".
            onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : "")}
          />
        </Field>
      );

    case "list":
      return <ListField field={field} value={Array.isArray(value) ? value : []} onChange={onChange} />;

    default:
      return (
        <Field label={field.label} hint={field.hint}>
          <TextInput placeholder={field.placeholder} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
        </Field>
      );
  }
}

// A repeatable group of sub-fields with add / remove / reorder.
function ListField({ field, value, onChange }) {
  const blank = Object.fromEntries(field.item.map((f) => [f.key, f.kind === "toggle" ? true : ""]));

  const update = (i, key, v) => onChange(value.map((it, idx) => (idx === i ? { ...it, [key]: v } : it)));
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  // A single-field list (e.g. gallery images, trust badges) is rendered inline
  // rather than as a stack of cards — one input per row reads much better.
  const compact = field.item.length === 1;

  return (
    <div>
      <span className="block text-[12px] font-medium text-brand-brown mb-1.5">{field.label}</span>
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="rounded-lg border border-brand-tan/20 bg-brand-cream/30 p-2.5">
            <div className={compact ? "flex items-center gap-2" : "space-y-2.5"}>
              <div className={compact ? "flex-1 min-w-0" : "space-y-2.5"}>
                {field.item.map((sub) => (
                  <FieldInput
                    key={sub.key}
                    field={compact ? { ...sub, label: "" } : sub}
                    value={item[sub.key]}
                    onChange={(v) => update(i, sub.key, v)}
                  />
                ))}
              </div>
              <div className={`flex ${compact ? "" : "justify-end pt-1"} items-center gap-0.5 flex-shrink-0`}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="p-1.5 text-brand-tan hover:text-brand-brown disabled:opacity-25">
                  <ArrowUp size={13} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1}
                  className="p-1.5 text-brand-tan hover:text-brand-brown disabled:opacity-25">
                  <ArrowDown size={13} />
                </button>
                <button type="button" onClick={() => remove(i)}
                  className="p-1.5 text-red-400 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => onChange([...value, { ...blank }])}>
        <Plus size={13} /> Add
      </Button>
    </div>
  );
}

// The full field set for one block.
export default function BlockFields({ fields, data, onChange }) {
  if (!fields?.length) return null;
  return (
    <div className="space-y-3.5">
      {fields.map((f) => (
        <FieldInput key={f.key} field={f} value={data[f.key]} onChange={(v) => onChange({ ...data, [f.key]: v })} />
      ))}
    </div>
  );
}
