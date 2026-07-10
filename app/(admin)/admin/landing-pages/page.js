"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Rocket, Plus, ExternalLink, Copy, Files, Pencil, Trash2, Loader2, Eye, ShoppingBag, X,
} from "lucide-react";
import {
  PageHeader, Card, Button, Field, TextInput, Pill, EmptyState, SectionTitle,
} from "@/components/admin/ui";
import { formatPrice } from "@/lib/utils";

function CreateModal({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Give the page a name");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/landing-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, isActive: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      toast.success("Landing page created");
      onCreated(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <Card className="w-full max-w-md relative" padded>
        <button onClick={onClose} className="absolute top-4 right-4 text-brand-tan hover:text-brand-brown">
          <X size={16} />
        </button>
        <SectionTitle>New landing page</SectionTitle>
        <form onSubmit={submit} className="space-y-4 mt-2">
          <Field label="Internal name" hint="Only you see this — e.g. “Eid Panjabi — Facebook”.">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Eid Panjabi campaign" />
          </Field>
          <Field label="Link (optional)" hint="Leave blank for a short auto-generated code.">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-brand-tan whitespace-nowrap">/lp/</span>
              <TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="eid-panjabi" />
            </div>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Create & edit
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function LandingPagesAdmin() {
  const router = useRouter();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/landing-pages");
      const data = await res.json();
      setPages(data.pages || []);
    } catch {
      toast.error("Could not load landing pages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function copyLink(code) {
    navigator.clipboard.writeText(`${window.location.origin}/lp/${code}`);
    toast.success("Link copied");
  }

  async function duplicate(id) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/landing-pages/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to duplicate");
      toast.success("Duplicated as a draft");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function remove(page) {
    if (!confirm(`Delete “${page.name}”? Orders already placed from it are kept.`)) return;
    setBusyId(page._id);
    try {
      const res = await fetch(`/api/admin/landing-pages/${page._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      toast.success("Landing page deleted");
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <PageHeader
        title="Landing Pages"
        subtitle="Single-page campaign funnels with their own offers and cash-on-delivery order form."
        icon={Rocket}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={15} /> New landing page
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-20 text-brand-tan">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <Card>
          <EmptyState
            icon={Rocket}
            title="No landing pages yet"
            hint="Build a focused page around one product or a bundle, share the short /lp link in your ads, and take orders without the customer ever leaving the page."
            action={<Button onClick={() => setCreating(true)}><Plus size={15} /> Create your first one</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pages.map((p) => (
            <Card key={p._id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-brown text-[14px] truncate">{p.name}</p>
                  <button
                    onClick={() => copyLink(p.code)}
                    className="text-[12px] text-brand-terracotta hover:underline font-mono"
                    title="Copy link"
                  >
                    /lp/{p.code}
                  </button>
                </div>
                <Pill tone={p.isActive ? "green" : "gray"}>{p.isActive ? "Live" : "Draft"}</Pill>
              </div>

              <div className="grid grid-cols-3 gap-2 py-2 border-y border-brand-tan/10">
                {[
                  { icon: Eye, label: "Views", value: p.views ?? 0 },
                  { icon: ShoppingBag, label: "Orders", value: p.orderCount ?? 0 },
                  { icon: null, label: "Revenue", value: formatPrice(p.revenue ?? 0) },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-[10px] uppercase tracking-wide text-brand-tan">{s.label}</p>
                    <p className="text-[13px] font-semibold text-brand-brown truncate">{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-1 mt-auto">
                <Button as={Link} href={`/admin/landing-pages/${p._id}`} size="sm" className="flex-1">
                  <Pencil size={13} /> Edit
                </Button>
                <Button as="a" href={`/lp/${p.code}`} target="_blank" rel="noopener" variant="outline" size="icon" title="Open">
                  <ExternalLink size={14} />
                </Button>
                <Button variant="outline" size="icon" onClick={() => copyLink(p.code)} title="Copy link">
                  <Copy size={14} />
                </Button>
                <Button
                  variant="ghost" size="icon" title="Duplicate"
                  onClick={() => duplicate(p._id)} disabled={busyId === p._id}
                >
                  {busyId === p._id ? <Loader2 size={14} className="animate-spin" /> : <Files size={14} />}
                </Button>
                <Button variant="danger-ghost" size="icon" title="Delete" onClick={() => remove(p)} disabled={busyId === p._id}>
                  <Trash2 size={14} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(page) => router.push(`/admin/landing-pages/${page._id}`)}
        />
      )}
    </>
  );
}
