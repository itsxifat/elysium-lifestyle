"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ShieldAlert, Plus, Trash2, Search, CheckCircle2, XCircle, Star } from "lucide-react";
import { PageHeader, Card, SectionTitle, Field, TextInput, Button, Pill, EmptyState } from "@/components/admin/ui";

export default function FraudsClient() {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", label: "" });

  // Phone lookup tool
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState(null);
  const [looking, setLooking] = useState(false);

  const load = () =>
    fetch("/api/admin/fraud/accounts")
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load accounts"));

  useEffect(() => {
    load();
  }, []);

  const addAccount = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error("Email and password required");
    setAdding(true);
    try {
      const res = await fetch("/api/admin/fraud/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success("Account added");
      setForm({ email: "", password: "", label: "" });
      load();
    } catch (err) {
      toast.error(err.message || "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const removeAccount = async (email) => {
    if (!confirm(`Remove ${email}?`)) return;
    await fetch("/api/admin/fraud/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    toast.success("Removed");
    load();
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/fraud/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (d.ok) toast.success("All accounts working ✓");
      else toast.error(d.error || "Test failed");
      load();
    } finally {
      setTesting(false);
    }
  };

  const runLookup = async (e) => {
    e.preventDefault();
    if (!phone) return;
    setLooking(true);
    setLookup(null);
    try {
      const res = await fetch("/api/admin/fraud/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setLookup(d);
    } catch (err) {
      toast.error(err.message || "Lookup failed");
    } finally {
      setLooking(false);
    }
  };

  const accounts = data?.accounts || [];
  const available = data?.available;

  return (
    <div>
      <PageHeader
        icon={ShieldAlert}
        title="Fraud Accounts"
        subtitle="Steadfast (Packzy) merchant accounts used to check a customer's courier history"
        actions={
          <Button variant="outline" onClick={testConnection} disabled={testing || !accounts.length}>
            {testing ? "Testing…" : "Test connection"}
          </Button>
        }
      />

      {available === false && (
        <Card className="mb-5 border-amber-300 bg-amber-50">
          <p className="text-[13px] text-amber-800">
            The <code className="font-mono">steadfast-fraud</code> package isn&apos;t installed on the server. Run{" "}
            <code className="font-mono">npm install steadfast-fraud</code> (and set <code className="font-mono">FRAUDJS_SECRET</code>),
            then restart. Accounts you add here are saved either way.
          </p>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Accounts list */}
        <div className="lg:col-span-2 space-y-5">
          <Card padded={false}>
            <div className="px-5 py-3.5 border-b border-brand-tan/12">
              <SectionTitle className="mb-0">Configured accounts ({accounts.length})</SectionTitle>
            </div>
            {accounts.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No accounts yet" hint="Add a Steadfast merchant account to enable fraud checks." />
            ) : (
              <div className="divide-y divide-brand-tan/10">
                {accounts.map((a) => (
                  <div key={a.email} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-brand-brown truncate">{a.email}</p>
                        {a.primary && <Pill tone="terracotta"><Star size={9} className="inline -mt-0.5 mr-0.5" />Primary</Pill>}
                        {a.label && <Pill tone="gray">{a.label}</Pill>}
                      </div>
                      <p className="text-[11px] text-brand-tan mt-0.5">
                        {a.lastTestedAt ? (
                          a.lastTestOk ? (
                            <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={11} /> Working · {new Date(a.lastTestedAt).toLocaleString()}</span>
                          ) : (
                            <span className="text-red-600 inline-flex items-center gap-1"><XCircle size={11} /> {a.lastTestMessage || "Failed"}</span>
                          )
                        ) : (
                          "Not tested yet"
                        )}
                      </p>
                    </div>
                    <button onClick={() => removeAccount(a.email)} className="p-2 rounded-md text-brand-tan hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Add account */}
          <Card as="form" onSubmit={addAccount}>
            <SectionTitle>Add account</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Steadfast email">
                <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
              </Field>
              <Field label="Password">
                <TextInput type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
              </Field>
              <Field label="Label (optional)" className="sm:col-span-2">
                <TextInput value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Main store account" />
              </Field>
            </div>
            <p className="text-[11px] text-brand-tan mt-2">Stored encrypted by the package — the password is never saved in our database.</p>
            <div className="mt-3">
              <Button type="submit" disabled={adding}>
                <Plus size={15} /> {adding ? "Adding…" : "Add account"}
              </Button>
            </div>
          </Card>
        </div>

        {/* Phone lookup tool */}
        <div>
          <Card as="form" onSubmit={runLookup}>
            <SectionTitle>Check a phone</SectionTitle>
            <p className="text-[12px] text-brand-tan mb-3">Look up any customer&apos;s Steadfast delivery history.</p>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan" />
              <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01700000000" className="pl-9" />
            </div>
            <Button type="submit" disabled={looking || !phone} className="w-full mt-3">
              {looking ? "Checking…" : "Check history"}
            </Button>

            {lookup && (
              <div className="mt-4">
                <FraudStats data={lookup} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

// Reusable stat block — also used on the order detail page.
export function FraudStats({ data }) {
  const stats = [
    { label: "Delivered", value: data.delivered, tone: "text-emerald-600" },
    { label: "Cancelled", value: data.cancelled, tone: "text-amber-600" },
    { label: "Frauds", value: data.frauds, tone: data.frauds > 0 ? "text-red-600" : "text-brand-brown" },
    { label: "Total", value: data.totalParcels, tone: "text-brand-brown" },
  ];
  return (
    <div>
      <div className="grid grid-cols-4 gap-2 text-center">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg bg-brand-cream/50 py-2.5">
            <p className={`text-lg font-bold ${s.tone}`}>{s.value}</p>
            <p className="text-[10px] uppercase tracking-wide text-brand-tan">{s.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-brand-tan">Success rate</span>
          <span className="font-medium text-brand-brown">{data.successRate}%</span>
        </div>
        <div className="h-2 rounded-full bg-brand-cream-dark overflow-hidden">
          <div
            className={`h-full rounded-full ${data.successRate >= 70 ? "bg-emerald-500" : data.successRate >= 40 ? "bg-amber-500" : "bg-red-500"}`}
            style={{ width: `${data.successRate}%` }}
          />
        </div>
      </div>
    </div>
  );
}
