"use client";

import { Truck, Tag, Plus, Trash2, Gift } from "lucide-react";
import { Card, Button, Field, TextInput, Select, Toggle, SectionTitle } from "@/components/admin/ui";
import { DISCOUNT_BASES, REWARD_TYPES, defaultRuleLabel } from "@/lib/landing-promotions";

// Page-wide promotions editor: a free-delivery threshold and a spend-and-save
// discount ladder. These apply to EVERY offer on the page (evaluated on the
// customer's order). See lib/landing-promotions.js.

const num = (e) => Math.max(0, Number(e.target.value) || 0);

export default function PromotionsEditor({ value, onChange }) {
  const promo = value || {};
  const fs = promo.freeShipping || {};
  const rules = promo.discountRules || [];

  const setFs = (patch) => onChange({ ...promo, freeShipping: { ...fs, ...patch } });
  const setRules = (next) => onChange({ ...promo, discountRules: next });
  const updateRule = (i, patch) => setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules([...rules, { basis: "amount", threshold: 0, rewardType: "amount", value: 0, maxDiscount: 0, label: "" }]);
  const removeRule = (i) => setRules(rules.filter((_, idx) => idx !== i));

  return (
    <>
      <Card className="space-y-3.5">
        <div className="flex items-center justify-between">
          <SectionTitle className="mb-0 flex items-center gap-1.5"><Truck size={13} /> Free delivery</SectionTitle>
          <Toggle checked={!!fs.enabled} onChange={(v) => setFs({ enabled: v })} />
        </div>
        {fs.enabled && (
          <>
            <p className="text-[11px] text-brand-tan">
              Delivery becomes free once <b>either</b> threshold is met. Leave a field at 0 to ignore it.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Order amount ≥ (৳)">
                <TextInput type="number" min="0" value={fs.minSubtotal ?? 0} onChange={(e) => setFs({ minSubtotal: num(e) })} />
              </Field>
              <Field label="Items ≥ (pieces)">
                <TextInput type="number" min="0" value={fs.minQuantity ?? 0} onChange={(e) => setFs({ minQuantity: num(e) })} />
              </Field>
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-3">
        <div>
          <SectionTitle className="mb-1 flex items-center gap-1.5"><Gift size={13} /> Spend &amp; save</SectionTitle>
          <p className="text-[11px] text-brand-tan">
            “Buy this much → get this off.” The single best-value matching rule applies to the order.
          </p>
        </div>

        {rules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-brand-tan/30 py-6 text-center">
            <Tag size={18} className="mx-auto text-brand-tan/40 mb-1.5" />
            <p className="text-[12px] text-brand-tan">No discount rules yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {rules.map((r, i) => (
              <div key={i} className="rounded-lg border border-brand-tan/20 bg-white p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-brand-brown">{r.label?.trim() || defaultRuleLabel(r)}</span>
                  <button type="button" onClick={() => removeRule(i)} className="p-1 text-red-400 hover:text-red-600">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field label="When">
                    <Select value={r.basis} onChange={(e) => updateRule(i, { basis: e.target.value })}>
                      {DISCOUNT_BASES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </Select>
                  </Field>
                  <Field label={r.basis === "quantity" ? "Reaches (items)" : "Reaches (৳)"}>
                    <TextInput type="number" min="0" value={r.threshold ?? 0} onChange={(e) => updateRule(i, { threshold: num(e) })} />
                  </Field>
                  <Field label="Reward">
                    <Select value={r.rewardType} onChange={(e) => updateRule(i, { rewardType: e.target.value })}>
                      {REWARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </Field>
                  <Field label={r.rewardType === "percent" ? "Percent off (%)" : "Amount off (৳)"}>
                    <TextInput type="number" min="0" value={r.value ?? 0} onChange={(e) => updateRule(i, { value: num(e) })} />
                  </Field>
                  {r.rewardType === "percent" && (
                    <Field label="Max discount cap (৳)" hint="0 = no cap.">
                      <TextInput type="number" min="0" value={r.maxDiscount ?? 0} onChange={(e) => updateRule(i, { maxDiscount: num(e) })} />
                    </Field>
                  )}
                  <Field label="Label (optional)" hint="Shown to the customer.">
                    <TextInput value={r.label ?? ""} onChange={(e) => updateRule(i, { label: e.target.value })} placeholder="e.g. Eid special" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          <Plus size={13} /> Add a discount rule
        </Button>
      </Card>
    </>
  );
}
