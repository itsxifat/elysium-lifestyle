"use client";

import { useState } from "react";
import Image from "next/image";
import {
  ChevronDown, ChevronRight, Trash2, AlertTriangle, AlertCircle, X, Boxes, Percent,
} from "lucide-react";
import { Card, Pill, Button, inputClass } from "@/components/admin/ui";
import { cn, formatPrice, shouldUnoptimizeImage } from "@/lib/utils";
import {
  previewItem, itemIssues, applyPercent, setAllSizes, sellAllStock, setUnits, discountPercent,
} from "./editorState";

const QUICK_PERCENTS = [10, 20, 30, 40, 50];

// The kit's inputClass is full-width; these inputs size themselves.
const fitInput = inputClass.replace("w-full ", "");

// Small money input with a "Tk" prefix.
function MoneyInput({ value, onChange, placeholder, disabled, className, ariaLabel }) {
  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-brand-tan">Tk</span>
      <input
        type="number"
        min="0"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "pl-8 py-1.5 tabular-nums disabled:bg-brand-cream/40 disabled:text-brand-tan")}
      />
    </div>
  );
}

// What a size row shows, worked out once for both of its layouts.
function rowFacts(row, variant, productPrice) {
  const stock = variant?.stock ?? 0;
  const regular = variant?.price ?? 0;
  const own = row.salePrice !== "" && row.salePrice !== null;
  const price = own ? Number(row.salePrice) : Number(productPrice) || 0;
  return {
    stock,
    regular,
    own,
    price,
    off: discountPercent(regular, price),
    overStock: !row.allStock && Number(row.limit) - (row.sold || 0) > stock,
  };
}

function OffBadge({ row, facts }) {
  if (!row.enabled) return <span className="text-brand-tan/60">—</span>;
  if (!(facts.price > 0)) return <span className="text-[11px] text-red-500 whitespace-nowrap">No price</span>;
  if (facts.off > 0) return <span className="text-[12px] font-semibold text-emerald-700">-{facts.off}%</span>;
  return <span className="text-[11px] text-red-500 whitespace-nowrap">Not lower</span>;
}

function PriceControl({ row, facts, productPrice, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <MoneyInput
        className="w-[108px]"
        value={row.salePrice}
        placeholder={productPrice ? String(productPrice) : "Price"}
        disabled={!row.enabled}
        ariaLabel={`Sale price for ${row.size}`}
        onChange={(v) => onChange({ salePrice: v })}
      />
      {facts.own && row.enabled && (
        <button
          type="button"
          title="Use the product's sale price"
          aria-label={`Use the product's sale price for ${row.size}`}
          onClick={() => onChange({ salePrice: "" })}
          className="p-1 text-brand-tan hover:text-brand-brown"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// "All stock" sells every unit on the shelf; "Fixed" sells a set number.
function UnitsControl({ row, facts, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("inline-flex flex-shrink-0 rounded-md border border-brand-tan/30 overflow-hidden text-[11px] font-medium whitespace-nowrap", !row.enabled && "opacity-50")}>
        <button
          type="button"
          disabled={!row.enabled}
          aria-pressed={row.allStock}
          onClick={() => onChange({ allStock: true })}
          className={cn("px-2 py-1.5 transition-colors", row.allStock ? "bg-brand-brown text-white" : "bg-white text-brand-tan hover:text-brand-brown")}
        >
          All stock
        </button>
        <button
          type="button"
          disabled={!row.enabled}
          aria-pressed={!row.allStock}
          onClick={() => onChange({ allStock: false, limit: row.limit === "" ? Math.max(facts.stock, row.sold || 0) : row.limit })}
          className={cn("px-2 py-1.5 border-l border-brand-tan/30 transition-colors", !row.allStock ? "bg-brand-brown text-white" : "bg-white text-brand-tan hover:text-brand-brown")}
        >
          Fixed
        </button>
      </div>
      {row.allStock ? (
        <span className="text-[11px] text-brand-tan tabular-nums whitespace-nowrap">{facts.stock} units</span>
      ) : (
        <input
          type="number"
          min={row.sold || 0}
          value={row.limit}
          disabled={!row.enabled}
          aria-label={`Units of ${row.size} to sell`}
          onChange={(e) => onChange({ limit: e.target.value })}
          className={cn(fitInput, "w-[64px] py-1.5 tabular-nums", facts.overStock && "border-amber-400")}
        />
      )}
    </div>
  );
}

function RowCheckbox({ row, onChange }) {
  return (
    <input
      type="checkbox"
      checked={row.enabled}
      onChange={(e) => onChange({ enabled: e.target.checked })}
      aria-label={`Put size ${row.size} on sale`}
      className="w-4 h-4 accent-brand-terracotta cursor-pointer flex-shrink-0"
    />
  );
}

const stockTone = (stock) => (stock === 0 ? "text-red-500 font-semibold" : stock <= 5 ? "text-amber-600 font-semibold" : "text-brand-brown");

// Wide layout: one table row per size.
function SizeRow({ row, variant, productPrice, onChange }) {
  const f = rowFacts(row, variant, productPrice);
  return (
    <tr className={cn("border-t border-brand-tan/10 transition-colors", row.enabled ? "bg-white" : "bg-brand-cream/30")}>
      <td className="pl-3 pr-1 py-2"><RowCheckbox row={row} onChange={onChange} /></td>
      <td className={cn("px-2 py-2 font-semibold", row.enabled ? "text-brand-brown" : "text-brand-tan")}>{row.size}</td>
      <td className="px-2 py-2 text-right tabular-nums"><span className={stockTone(f.stock)}>{f.stock}</span></td>
      <td className="px-2 py-2 text-right tabular-nums text-brand-tan whitespace-nowrap">{formatPrice(f.regular)}</td>
      <td className="px-2 py-2"><PriceControl row={row} facts={f} productPrice={productPrice} onChange={onChange} /></td>
      <td className="px-2 py-2 text-right"><OffBadge row={row} facts={f} /></td>
      <td className="px-2 py-2"><UnitsControl row={row} facts={f} onChange={onChange} /></td>
      <td className="pl-2 pr-3 py-2 text-right tabular-nums text-brand-tan">{row.sold || 0}</td>
    </tr>
  );
}

// Narrow layout: one small card per size, nothing to scroll sideways for.
function SizeCard({ row, variant, productPrice, onChange }) {
  const f = rowFacts(row, variant, productPrice);
  return (
    <div className={cn("px-3 py-3 border-t border-brand-tan/10 space-y-2.5", row.enabled ? "bg-white" : "bg-brand-cream/30")}>
      <div className="flex items-center gap-2.5">
        <RowCheckbox row={row} onChange={onChange} />
        <span className={cn("text-[13px] font-semibold", row.enabled ? "text-brand-brown" : "text-brand-tan")}>{row.size}</span>
        <span className="text-[11px] text-brand-tan">
          <span className={stockTone(f.stock)}>{f.stock}</span> in stock · {formatPrice(f.regular)}
        </span>
        <span className="ml-auto"><OffBadge row={row} facts={f} /></span>
      </div>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 pl-[26px]">
        <span className="text-[11px] text-brand-tan">Price</span>
        <PriceControl row={row} facts={f} productPrice={productPrice} onChange={onChange} />
        <span className="text-[11px] text-brand-tan">Sell</span>
        <UnitsControl row={row} facts={f} onChange={onChange} />
      </div>
      {row.sold > 0 && <p className="pl-[26px] text-[11px] text-brand-tan">{row.sold} sold so far</p>}
    </div>
  );
}

/**
 * One product in the sale: its sale price, and a row per size with the real
 * stock, the regular price, an optional own price and how many to sell.
 */
export default function FlashProductCard({ item, overlaps, onChange, onRemove }) {
  const [customPct, setCustomPct] = useState("");
  const [bulkUnits, setBulkUnits] = useState("");
  const { info } = item;
  const d = previewItem(item);
  const issues = itemIssues(item, overlaps);
  // Things that stop the sale being switched on.
  const errors = issues.filter((i) => i.severity === "live");
  const variants = new Map(info.variants.map((v) => [v.size, v]));
  const ticked = item.sizes.filter((s) => s.enabled).length;
  const inStock = item.sizes.filter((s) => (variants.get(s.size)?.stock || 0) > 0);
  const allInStockOn = inStock.length > 0 && inStock.every((s) => s.enabled);
  const totalStock = info.variants.reduce((n, v) => n + v.stock, 0);
  const regulars = info.variants.map((v) => v.price);
  const regularRange = regulars.length
    ? Math.min(...regulars) === Math.max(...regulars)
      ? formatPrice(regulars[0])
      : `${formatPrice(Math.min(...regulars))} – ${formatPrice(Math.max(...regulars))}`
    : "—";

  const set = (patch) => onChange({ ...item, ...patch });
  const setRow = (size, patch) => set({ sizes: item.sizes.map((s) => (s.size === size ? { ...s, ...patch } : s)) });

  return (
    <Card padded={false} className={cn("overflow-hidden", errors.length && "border-red-200")}>
      {/* Summary row */}
      <div className="flex items-start gap-3 p-3 sm:p-4">
        <button
          type="button"
          onClick={() => set({ open: !item.open })}
          aria-expanded={item.open}
          aria-label={item.open ? "Collapse" : "Expand"}
          className="mt-3 text-brand-tan hover:text-brand-brown flex-shrink-0"
        >
          {item.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <div className="relative w-11 h-14 rounded bg-brand-cream-dark overflow-hidden flex-shrink-0">
          {info.image && <Image src={info.image} alt="" fill className="object-cover" sizes="44px" unoptimized={shouldUnoptimizeImage(info.image)} />}
        </div>

        <button type="button" onClick={() => set({ open: !item.open })} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-[13.5px] font-semibold text-brand-brown truncate">{info.name}</span>
            {!info.isPublished && <Pill tone="amber">Not published</Pill>}
          </span>
          <span className="block text-[11px] text-brand-tan mt-0.5">
            {info.sku && <>{info.sku} · </>}
            Regular {regularRange} · {totalStock} in stock
          </span>
          <span className="block text-[11px] mt-1">
            <span className={cn("font-medium", ticked ? "text-brand-brown" : "text-brand-tan")}>
              {ticked}/{info.variants.length} sizes selected
            </span>
            <span className="text-brand-tan"> · {d.remaining} units offered</span>
            {item.soldCount > 0 && <span className="text-brand-tan"> · {item.soldCount} sold</span>}
          </span>
          {!item.open && issues.length > 0 && (
            <span className={cn("flex items-center gap-1 text-[11px] mt-1", errors.length ? "text-red-600" : "text-amber-700")}>
              {errors.length ? <AlertCircle size={12} /> : <AlertTriangle size={12} />}
              {issues[0].text}
              {issues.length > 1 && <span className="text-brand-tan"> (+{issues.length - 1} more)</span>}
            </span>
          )}
        </button>

        <div className="hidden sm:flex flex-col items-end flex-shrink-0 pt-0.5">
          {d.price ? (
            <>
              <span className="text-[14px] font-bold text-brand-terracotta tabular-nums">
                {d.minPrice !== d.maxPrice && <span className="text-[10px] font-medium mr-0.5">from</span>}
                {formatPrice(d.price)}
              </span>
              {d.maxDiscount > 0 && <span className="text-[11px] font-semibold text-emerald-700">up to -{d.maxDiscount}%</span>}
            </>
          ) : (
            <span className="text-[11px] text-brand-tan">No price yet</span>
          )}
        </div>

        <Button variant="danger-ghost" size="icon" title="Remove from sale" onClick={onRemove} className="flex-shrink-0">
          <Trash2 size={14} />
        </Button>
      </div>

      {item.open && (
        <div className="border-t border-brand-tan/10 px-3 sm:px-4 py-4 space-y-4 bg-brand-cream/[0.15]">
          {/* Product-level pricing */}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,200px)_minmax(0,1fr)_minmax(0,190px)] lg:items-start">
            <div>
              <span className="block text-[12px] font-medium text-brand-brown mb-1.5">Sale price · all sizes</span>
              <MoneyInput
                value={item.salePrice}
                placeholder="e.g. 990"
                ariaLabel="Sale price for every size"
                onChange={(v) => set({ salePrice: v })}
              />
              <span className="block text-[11px] text-brand-tan mt-1">Sizes without their own price use this.</span>
            </div>

            <div>
              <span className="flex items-center gap-1 text-[12px] font-medium text-brand-brown mb-1.5">
                <Percent size={12} /> Quick discount
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onChange(applyPercent(item, p))}
                    className="px-2.5 py-1.5 rounded-md border border-brand-tan/30 bg-white text-[12px] font-medium text-brand-brown hover:border-brand-terracotta hover:text-brand-terracotta transition-colors"
                  >
                    -{p}%
                  </button>
                ))}
                <div className="flex items-center">
                  <input
                    type="number"
                    min="1"
                    max="95"
                    value={customPct}
                    onChange={(e) => setCustomPct(e.target.value)}
                    placeholder="%"
                    aria-label="Custom discount percent"
                    className={cn(fitInput, "w-[58px] py-1.5 rounded-r-none")}
                  />
                  <button
                    type="button"
                    disabled={!(Number(customPct) > 0)}
                    onClick={() => { onChange(applyPercent(item, customPct)); setCustomPct(""); }}
                    className="px-2.5 py-[7px] rounded-r-lg border border-l-0 border-brand-tan/30 bg-brand-cream text-[12px] font-medium text-brand-brown hover:bg-brand-cream-dark disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>
              <span className="block text-[11px] text-brand-tan mt-1">Worked out from each size&apos;s own regular price.</span>
            </div>

            <div>
              <span className="flex items-center gap-1 text-[12px] font-medium text-brand-brown mb-1.5">
                <Boxes size={12} /> Product cap
              </span>
              <input
                type="number"
                min="0"
                value={item.stockLimit}
                placeholder="No cap"
                aria-label="Most units of this product to sell, all sizes together"
                onChange={(e) => set({ stockLimit: e.target.value })}
                className={cn(inputClass, "py-1.5 tabular-nums")}
              />
              <span className="block text-[11px] text-brand-tan mt-1">Optional — most units to sell, all sizes together.</span>
            </div>
          </div>

          {/* Sizes. The layout follows the card's own width (a container
              query), not the screen's: the editor's main column is narrow on a
              laptop with the sidebar beside it, and on a phone. */}
          <div className="rounded-lg border border-brand-tan/20 bg-white overflow-hidden [container-type:inline-size]">
            <div className="[@container(min-width:640px)]:hidden">
              <label className="flex items-center gap-2.5 px-3 py-2 bg-brand-cream/60 text-[10px] font-semibold uppercase tracking-wide text-brand-tan cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allInStockOn}
                  disabled={!inStock.length}
                  onChange={(e) => onChange(setAllSizes(item, e.target.checked))}
                  className="w-4 h-4 accent-brand-terracotta cursor-pointer"
                />
                Every size in stock
              </label>
              {item.sizes.map((row) => (
                <SizeCard
                  key={row.size}
                  row={row}
                  variant={variants.get(row.size)}
                  productPrice={item.salePrice}
                  onChange={(patch) => setRow(row.size, patch)}
                />
              ))}
            </div>

            <div className="hidden [@container(min-width:640px)]:block">
              <table className="w-full text-[12.5px]">
                <thead className="bg-brand-cream/60 text-[10px] uppercase tracking-wide text-brand-tan">
                  <tr>
                    <th className="pl-3 pr-1 py-2 w-8 text-left">
                      <input
                        type="checkbox"
                        checked={allInStockOn}
                        disabled={!inStock.length}
                        onChange={(e) => onChange(setAllSizes(item, e.target.checked))}
                        aria-label="Put every size in stock on sale"
                        title="Every size in stock"
                        className="w-4 h-4 accent-brand-terracotta cursor-pointer"
                      />
                    </th>
                    <th className="px-2 py-2 text-left font-semibold">Size</th>
                    <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">In stock</th>
                    <th className="px-2 py-2 text-right font-semibold">Regular</th>
                    <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">Sale price</th>
                    <th className="px-2 py-2 text-right font-semibold">Off</th>
                    <th className="px-2 py-2 text-left font-semibold whitespace-nowrap">Units to sell</th>
                    <th className="pl-2 pr-3 py-2 text-right font-semibold">Sold</th>
                  </tr>
                </thead>
                <tbody>
                  {item.sizes.map((row) => (
                    <SizeRow
                      key={row.size}
                      row={row}
                      variant={variants.get(row.size)}
                      productPrice={item.salePrice}
                      onChange={(patch) => setRow(row.size, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {!item.sizes.length && (
              <p className="px-3 py-6 text-center text-[12px] text-brand-tan">This product has no sizes, so it can&apos;t be sold.</p>
            )}

            {/* Bulk tools for the ticked sizes */}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-t border-brand-tan/15 bg-brand-cream/30 text-[11.5px]">
              <span className="text-brand-tan font-medium">Sizes on sale:</span>
              <button
                type="button"
                onClick={() => onChange(sellAllStock(item))}
                className="px-2.5 py-1 rounded-md border border-brand-tan/30 bg-white text-brand-brown hover:border-brand-brown transition-colors"
              >
                Sell all stock
              </button>
              <span className="text-brand-tan">or</span>
              <div className="flex items-center">
                <input
                  type="number"
                  min="0"
                  value={bulkUnits}
                  onChange={(e) => setBulkUnits(e.target.value)}
                  placeholder="Qty"
                  aria-label="Units per size"
                  className={cn(fitInput, "w-[64px] py-1 text-[12px] rounded-r-none")}
                />
                <button
                  type="button"
                  disabled={!(Number(bulkUnits) > 0)}
                  onClick={() => { onChange(setUnits(item, bulkUnits)); setBulkUnits(""); }}
                  className="px-2.5 py-[5px] rounded-r-lg border border-l-0 border-brand-tan/30 bg-white text-brand-brown hover:bg-brand-cream disabled:opacity-50"
                >
                  units each
                </button>
              </div>
              <button
                type="button"
                onClick={() => set({ sizes: item.sizes.map((s) => ({ ...s, salePrice: "" })) })}
                className="ml-auto text-brand-tan hover:text-brand-brown underline-offset-2 hover:underline"
              >
                Clear size prices
              </button>
            </div>
          </div>

          {item.legacy && (
            <p className="text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
              This product was added before per-size pricing. Its shared allocation is kept as the product cap; saving converts it.
            </p>
          )}

          {issues.length > 0 && (
            <ul className="space-y-1">
              {issues.map((i) => (
                <li key={i.text} className={cn("flex items-start gap-1.5 text-[12px]", i.severity === "live" ? "text-red-600" : "text-amber-700")}>
                  {i.severity === "live" ? <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />}
                  {i.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
