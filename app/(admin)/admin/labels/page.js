"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import { Printer, Search, CheckSquare, Square, RefreshCw } from "lucide-react";
import { PageHeader, Card, Button, Select, Field, TextInput, Toggle, SectionTitle } from "@/components/admin/ui";
import { formatPrice } from "@/lib/utils";
import { useSettings } from "@/context/SettingsContext";
import Barcode from "@/components/admin/Barcode";

// Paper sizes are exact physical dimensions. GP-3120TUD handles 2" and 3"
// thermal labels well when the browser page size matches the media.
const SIZES = {
  a4: { label: "A4", w: "210mm", h: "297mm", pad: "12mm" },
  a5: { label: "A5", w: "148mm", h: "210mm", pad: "10mm" },
  a6: { label: "A6 label", w: "105mm", h: "148mm", pad: "6mm" },
  "2x3": { label: '2" x 3" thermal', w: "50.8mm", h: "76.2mm", pad: "2.5mm", thermal: true },
  "3x2": { label: '3" x 2" thermal', w: "76.2mm", h: "50.8mm", pad: "2.5mm", thermal: true },
  "4x6": { label: '4"×6" thermal (2:3)', w: "101.6mm", h: "152.4mm", pad: "5mm" },
  "100x150": { label: "100×150 mm", w: "100mm", h: "150mm", pad: "5mm" },
  "80mm": { label: "80 mm receipt", w: "80mm", h: "140mm", pad: "4mm" },
  custom: { label: "Custom", w: null, h: null, pad: "5mm" },
};

const codFor = (o) => (o.paymentStatus === "paid" ? 0 : o.totalAmount);

function moneyLine(label, value) {
  return (
    <p>
      <span>{label}: </span>
      <span className="font-semibold">{value}</span>
    </p>
  );
}

// ── Single label / mini-invoice ─────────────────────────────────────────────
function Label({ order, shop, opts, layout }) {
  const a = order.shippingAddress || {};
  const cod = codFor(order);
  const scan = order.courier?.trackingCode || order.orderNumber;
  const address = [a.street, a.city, a.state].filter(Boolean).join(", ");
  const items = order.items || [];

  if (layout === "landscape") {
    return (
      <div className="label-content label-content--landscape text-black bg-white" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
        <div className="grid grid-cols-[1.05fr_0.95fr] gap-2 h-full">
          <div className="min-w-0 flex flex-col">
            <div className="border-b-2 border-black pb-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {opts.showLogo && <p className="font-bold text-[12px] leading-tight truncate">{shop.name}</p>}
                  <p className="text-[8px] leading-tight">{shop.phone}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[8px] uppercase">Invoice</p>
                  <p className="font-bold text-[10px] leading-tight">{order.orderNumber}</p>
                </div>
              </div>
            </div>

            <div className="py-1 border-b border-black/40">
              <p className="text-[7px] uppercase text-black/60">Deliver to</p>
              <p className="font-bold text-[11px] leading-tight truncate">{a.name}</p>
              <p className="text-[10px] font-semibold leading-tight">{a.phone}</p>
              <p className="text-[8px] leading-tight label-address">{address}</p>
            </div>

            <div className="mt-auto pt-1 flex items-end justify-between gap-2">
              <div className="text-[7px] leading-tight">
                <p className="capitalize">{order.paymentMethod === "cod" ? "Cash on Delivery" : order.paymentMethod}</p>
                {order.courier?.consignmentId && <p>CN: {order.courier.consignmentId}</p>}
                <p>{new Date(order.createdAt).toLocaleDateString("en-GB")}</p>
              </div>
              {opts.showCod && (
                <div className="text-right">
                  <p className="text-[7px] uppercase">{cod > 0 ? "Collect" : "Paid"}</p>
                  <p className="font-bold text-[15px] leading-none">{cod > 0 ? formatPrice(cod) : formatPrice(order.totalAmount)}</p>
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex flex-col border-l border-black/30 pl-2">
            {opts.showBarcode && (
              <div className="border-b border-dashed border-black/60 pb-1">
                <Barcode value={scan} height={30} />
                <p className="font-mono font-bold text-[8px] leading-tight text-center truncate">{scan}</p>
              </div>
            )}
            <table className="w-full text-[8px] mt-1">
              <thead>
                <tr className="border-b border-black/50">
                  <th className="text-left font-semibold py-0.5">Item</th>
                  <th className="text-center font-semibold">Sz</th>
                  <th className="text-center font-semibold">Q</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 5).map((it, i) => (
                  <tr key={i} className="border-b border-black/15 align-top">
                    <td className="py-0.5 pr-1 leading-tight truncate">{it.name}</td>
                    <td className="text-center">{it.size}</td>
                    <td className="text-center">{it.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length > 5 && <p className="text-[7px] mt-0.5">+{items.length - 5} more item(s)</p>}
            {opts.showPrices && (
              <div className="mt-auto pt-1 border-t border-black text-[8px] leading-tight">
                {moneyLine("Subtotal", formatPrice(order.subtotal))}
                {moneyLine("Shipping", order.shippingFee ? formatPrice(order.shippingFee) : "Free")}
                {order.discount > 0 && moneyLine("Discount", `-${formatPrice(order.discount)}`)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="label-content label-content--portrait text-black bg-white" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b-2 border-black pb-1.5">
        <div className="min-w-0">
          {opts.showLogo && <p className="font-bold text-[15px] leading-tight truncate">{shop.name}</p>}
          <p className="text-[10px] leading-tight">{shop.phone}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[10px] uppercase tracking-wide">Invoice</p>
          <p className="font-bold text-[13px]">{order.orderNumber}</p>
          {order.courier?.consignmentId && <p className="text-[10px] font-semibold">CN: {order.courier.consignmentId}</p>}
          <p className="text-[9px]">{new Date(order.createdAt).toLocaleDateString("en-GB")}</p>
        </div>
      </div>

      {/* Consignment / barcode */}
      {opts.showBarcode && (
        <div className="py-1.5 border-b border-dashed border-black/60">
          <Barcode value={scan} height={42} />
          <div className="flex items-center justify-between text-[10px] mt-0.5">
            <span>{order.courier?.consignmentId ? `CN: ${order.courier.consignmentId}` : "Not in courier yet"}</span>
            <span className="font-mono font-bold">{scan}</span>
          </div>
        </div>
      )}

      {/* Recipient */}
      <div className="py-1.5 border-b border-black/40">
        <p className="text-[9px] uppercase tracking-wide text-black/60">Deliver to</p>
        <p className="font-bold text-[13px] leading-snug">{a.name}</p>
        <p className="text-[12px] font-semibold">{a.phone}</p>
        <p className="text-[11px] leading-snug">{address}</p>
      </div>

      {/* Items */}
      <table className="w-full text-[11px] mt-1.5">
        <thead>
          <tr className="border-b border-black/50">
            <th className="text-left font-semibold py-0.5">Item</th>
            <th className="text-center font-semibold">Size</th>
            <th className="text-center font-semibold">Qty</th>
            {opts.showPrices && <th className="text-right font-semibold">Amount</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-black/15 align-top">
              <td className="py-0.5 pr-1">
                {it.name}
                {it.sku && <span className="block text-[9px] text-black/55">SKU: {it.sku}</span>}
              </td>
              <td className="text-center">{it.size}</td>
              <td className="text-center">{it.quantity}</td>
              {opts.showPrices && <td className="text-right">{formatPrice(it.price * it.quantity)}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals + COD */}
      <div className="mt-1.5 pt-1 border-t-2 border-black flex items-end justify-between">
        <div className="text-[10px] leading-tight">
          {opts.showPrices && (
            <>
              <p>Subtotal: {formatPrice(order.subtotal)}</p>
              <p>Shipping: {order.shippingFee ? formatPrice(order.shippingFee) : "Free"}</p>
              {order.discount > 0 && <p>Discount: −{formatPrice(order.discount)}</p>}
            </>
          )}
          <p className="capitalize">{order.paymentMethod === "cod" ? "Cash on Delivery" : order.paymentMethod}</p>
        </div>
        {opts.showCod && (
          <div className="text-right">
            <p className="text-[9px] uppercase">{cod > 0 ? "Collect (COD)" : "Paid"}</p>
            <p className="font-bold text-[18px] leading-none">{cod > 0 ? formatPrice(cod) : formatPrice(order.totalAmount)}</p>
          </div>
        )}
      </div>

      {order.notes && <p className="text-[9px] mt-1 italic">Note: {order.notes}</p>}
    </div>
  );
}

export default function LabelsPage() {
  const { settings } = useSettings();
  const shop = {
    name: settings?.siteInfo?.siteName || "Elysium Lifestyle",
    phone: settings?.siteInfo?.whatsappNumber || "",
  };

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("processing");
  const [onlyCourier, setOnlyCourier] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());

  const [sizeKey, setSizeKey] = useState("3x2");
  const [orientation, setOrientation] = useState("landscape");
  const [customW, setCustomW] = useState("100mm");
  const [customH, setCustomH] = useState("150mm");
  const [opts, setOpts] = useState({ showLogo: true, showBarcode: true, showPrices: true, showCod: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (status !== "all") params.set("status", status);
      const res = await fetch(`/api/orders?${params}`);
      const d = await res.json();
      setOrders(d.orders || []);
    } catch {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    let list = orders;
    if (onlyCourier) list = list.filter((o) => o.courier?.consignmentId);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((o) =>
      o.orderNumber?.toLowerCase().includes(q) ||
      o.shippingAddress?.name?.toLowerCase().includes(q) ||
      o.shippingAddress?.phone?.includes(q) ||
      String(o.courier?.consignmentId || "").includes(q)
    );
    return list;
  }, [orders, onlyCourier, search]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = visible.length > 0 && visible.every((o) => selected.has(o._id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((o) => o._id)));

  const selectedOrders = useMemo(() => orders.filter((o) => selected.has(o._id)), [orders, selected]);

  // Only allow a number+unit; never raw text into the <style> tag.
  const safeDim = (v, fallback) =>
    /^(\d{1,4}(\.\d+)?(mm|cm|in|px))$/.test(String(v).trim()) ? String(v).trim() : fallback;

  const size = SIZES[sizeKey];
  const baseW = sizeKey === "custom" ? safeDim(customW, "100mm") : size.w;
  const baseH = sizeKey === "custom" ? safeDim(customH, "150mm") : size.h;
  const portraitW = [baseW, baseH].sort((a, b) => parseFloat(a) - parseFloat(b))[0];
  const portraitH = [baseW, baseH].sort((a, b) => parseFloat(a) - parseFloat(b))[1];
  const w = orientation === "landscape" ? portraitH : portraitW;
  const h = orientation === "landscape" ? portraitW : portraitH;
  const pad = size.pad;
  const labelLayout = orientation === "landscape" ? "landscape" : "portrait";

  const printCss = `
    @media screen {
      #label-print-root { position: fixed; left: -10000px; top: 0; }
    }
    .label-content { width: 100%; height: 100%; overflow: hidden; }
    .label-address {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    @media print {
      html,
      body,
      body > div {
        width: ${w};
        height: auto;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        overflow: visible !important;
      }
      *,
      *::before,
      *::after {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        box-shadow: none !important;
      }
      body * { visibility: hidden !important; }
      .no-print { display: none !important; }
      .admin-shell,
      .admin-shell-body,
      .admin-main,
      .admin-main-inner {
        display: block !important;
        width: ${w} !important;
        min-width: 0 !important;
        height: auto !important;
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
        background: #fff !important;
      }
      .admin-mobile-spacer {
        display: none !important;
      }
      #label-print-root,
      #label-print-root * {
        visibility: visible !important;
      }
      #label-print-root {
        display: block !important;
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        width: ${w};
        min-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      .label-sheet {
        display: block !important;
        width: ${w};
        height: ${h};
        margin: 0 !important;
        padding: ${pad};
        box-sizing: border-box;
        overflow: hidden;
        break-inside: avoid;
        page-break-inside: avoid;
        break-after: page;
        page-break-after: always;
      }
      .label-content--landscape,
      .label-content--portrait {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
      }
      .label-sheet:last-child { page-break-after: auto; break-after: auto; }
      @page { size: ${w} ${h}; margin: 0; }
    }
  `;

  const doPrint = () => {
    if (selectedOrders.length === 0) return toast.error("Select at least one order");
    window.print();
  };

  return (
    <div>
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: printCss }} />

      <div className="no-print">
        <PageHeader
          title="Shipping Labels"
          subtitle={`${selected.size} selected · ${visible.length} shown`}
          icon={Printer}
          actions={
            <>
              <Button variant="outline" onClick={load}><RefreshCw size={14} /> Refresh</Button>
              <Button onClick={doPrint} disabled={selected.size === 0}><Printer size={14} /> Print ({selected.size})</Button>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 no-print">
        {/* Order list */}
        <div className="space-y-3">
          <Card className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan/60" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Order #, name, phone, CN…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-brand-tan/30 text-sm text-brand-brown" />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-44">
              <option value="processing">Processing</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="pending">Pending</option>
              <option value="all">All statuses</option>
            </Select>
          </Card>

          <Card padded={false}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-brand-tan/10">
              <button onClick={toggleAll} className="inline-flex items-center gap-2 text-[12px] text-brand-brown">
                {allSelected ? <CheckSquare size={15} className="text-brand-terracotta" /> : <Square size={15} className="text-brand-tan" />}
                Select all
              </button>
              <label className="inline-flex items-center gap-2 text-[12px] text-brand-tan">
                <input type="checkbox" checked={onlyCourier} onChange={(e) => setOnlyCourier(e.target.checked)} className="accent-brand-terracotta" />
                Only sent to courier
              </label>
            </div>
            {loading ? (
              <div className="py-10 text-center text-brand-tan text-sm">Loading…</div>
            ) : visible.length === 0 ? (
              <div className="py-10 text-center text-brand-tan text-sm">No orders</div>
            ) : (
              <div className="divide-y divide-brand-tan/10 max-h-[60vh] overflow-y-auto">
                {visible.map((o) => (
                  <label key={o._id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-brand-cream/40">
                    <input type="checkbox" checked={selected.has(o._id)} onChange={() => toggle(o._id)} className="accent-brand-terracotta" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-brand-brown text-[13px]">{o.orderNumber}</span>
                        <span className="text-[12px] font-semibold text-brand-brown">{formatPrice(codFor(o))}{codFor(o) === 0 ? " (paid)" : ""}</span>
                      </div>
                      <p className="text-[11px] text-brand-tan truncate">
                        {o.shippingAddress?.name} · {o.shippingAddress?.phone}
                        {o.courier?.consignmentId ? ` · CN ${o.courier.consignmentId}` : ""}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Controls + live preview */}
        <div className="space-y-4">
          <Card className="space-y-3">
            <SectionTitle>Print settings</SectionTitle>
            <Field label="Paper size">
              <Select value={sizeKey} onChange={(e) => setSizeKey(e.target.value)}>
                {Object.entries(SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            {sizeKey === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Width"><TextInput value={customW} onChange={(e) => setCustomW(e.target.value)} placeholder="100mm" /></Field>
                <Field label="Height"><TextInput value={customH} onChange={(e) => setCustomH(e.target.value)} placeholder="150mm" /></Field>
              </div>
            )}
            <Field label="Orientation">
              <Select value={orientation} onChange={(e) => setOrientation(e.target.value)}>
                <option value="landscape">Horizontal / landscape</option>
                <option value="portrait">Vertical / portrait</option>
              </Select>
            </Field>
            <p className="text-[11px] text-brand-tan">
              Print size: {w} x {h}. For GP-3120TUD, use horizontal with 3&quot; x 2&quot; or 2&quot; x 3&quot; media when the printer feeds sideways.
            </p>
            <div className="space-y-2 pt-1">
              {[["showLogo", "Shop name"], ["showBarcode", "Barcode / CN"], ["showPrices", "Item prices"], ["showCod", "COD amount"]].map(([k, lbl]) => (
                <label key={k} className="flex items-center justify-between">
                  <span className="text-[13px] text-brand-brown">{lbl}</span>
                  <Toggle checked={opts[k]} onChange={(v) => setOpts((o) => ({ ...o, [k]: v }))} />
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <SectionTitle>Preview</SectionTitle>
            <div className="bg-brand-cream/40 rounded-lg p-3 overflow-auto" style={{ maxHeight: "55vh" }}>
              {selectedOrders[0] ? (
                // Exact print dimensions (border-box + padding + height) so the
                // preview is true-to-print, not a roomier approximation.
                <div
                  className="bg-white shadow mx-auto border border-brand-tan/40"
                  style={{ width: w, height: h, padding: pad, boxSizing: "border-box" }}
                >
                  <Label order={selectedOrders[0]} shop={shop} opts={opts} layout={labelLayout} />
                </div>
              ) : (
                <p className="text-center text-brand-tan text-sm py-6">Select an order to preview its label.</p>
              )}
            </div>
            <p className="text-[11px] text-brand-tan mt-2">Actual size · 1 of {selectedOrders.length || 0} selected · prints one per page.</p>
          </Card>
        </div>
      </div>

      {/* Hidden print root — every selected label, one per page */}
      <div id="label-print-root">
        {selectedOrders.map((o) => (
          <div key={o._id} className="label-sheet">
            <Label order={o} shop={shop} opts={opts} layout={labelLayout} />
          </div>
        ))}
      </div>
    </div>
  );
}
