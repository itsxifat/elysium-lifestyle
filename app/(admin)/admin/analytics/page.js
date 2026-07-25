export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  BarChart3, Banknote, ShoppingCart, Receipt, Package, Users, Truck, XCircle,
  Download, Rocket, Tag, TrendingUp,
} from "lucide-react";

import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { resolveRange, previousRange } from "@/lib/order-date-range";
import {
  getAnalytics, pctChange, SOURCE_LABELS, PAYMENT_LABELS, ZONE_LABELS,
} from "@/lib/analytics";
import { formatPrice } from "@/lib/utils";
import { PageHeader, Card, Button, EmptyState, TableWrap } from "@/components/admin/ui";
import AnalyticsFilterBar from "@/components/admin/analytics/AnalyticsFilterBar";
import TrendPanel from "@/components/admin/analytics/TrendPanel";
import { ColumnChart } from "@/components/admin/analytics/charts";
import { STATUS_COLORS } from "@/components/admin/analytics/palette";
import { MetricCard, BarList, ChartCard } from "@/components/admin/analytics/parts";

export const metadata = { title: "Analytics" };

const STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

async function getData({ range, from, to }) {
  await connectDB();
  const settings = await Settings.findOne({}).select("orderFilters").lean();
  const weekStartsOn = settings?.orderFilters?.weekStartsOn ?? 6;

  const { start, end } = resolveRange({ range, from, to, weekStartsOn });
  const prev = previousRange({ start, end });
  const data = await getAnalytics({ start, end, prev });

  return { ...data, weekStartsOn };
}

export default async function AnalyticsPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  // Revenue is not for every panel member — the layout only guarantees staff.
  if (!hasPermission(session?.user, "analytics.view")) redirect("/admin");

  const range = searchParams?.range || "last_30_days";
  const from = searchParams?.from || "";
  const to = searchParams?.to || "";

  const {
    granularity, totals, prevTotals, series, byStatus, bySource, byPayment, byZone,
    topProducts, topCategories, customers, topCustomers, whenTheyBuy, landingPages,
    discounts, signups, weekStartsOn,
  } = await getData({ range, from, to });

  const change = (key) => (prevTotals ? pctChange(totals[key], prevTotals[key]) : undefined);
  const exportHref = `/api/admin/analytics/export?${new URLSearchParams({ range, ...(from && { from }), ...(to && { to }) })}`;

  const hasSales = totals.orders > 0;

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        subtitle="Sales, customers and channel performance"
        actions={
          <Button as="a" href={exportHref} variant="outline" size="sm" download>
            <Download size={13} /> Export CSV
          </Button>
        }
      />

      <AnalyticsFilterBar range={range} from={from} to={to} weekStartsOn={weekStartsOn} />

      {/* ── Headline KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <MetricCard
          label="Net sales" icon={Banknote}
          value={formatPrice(totals.netSales)}
          change={change("netSales")}
          hint="Invoiced, cancellations excluded"
        />
        <MetricCard
          label="Collected" icon={TrendingUp}
          value={formatPrice(totals.collected)}
          change={change("collected")}
          hint={`${formatPrice(totals.inFlight)} still in flight`}
          accent="bg-emerald-500/10 text-emerald-600"
        />
        <MetricCard
          label="Orders" icon={ShoppingCart}
          value={totals.orders.toLocaleString("en-BD")}
          change={change("orders")}
          hint={`${totals.sellableOrders.toLocaleString("en-BD")} live · ${totals.cancelledOrders} cancelled`}
        />
        <MetricCard
          label="Avg order value" icon={Receipt}
          value={formatPrice(totals.aov)}
          change={change("aov")}
          hint={`${totals.unitsPerOrder} item${totals.unitsPerOrder === 1 ? "" : "s"} per order`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <MetricCard
          label="Units sold" icon={Package}
          value={totals.units.toLocaleString("en-BD")}
          change={change("units")}
          hint="Net of returned items"
        />
        <MetricCard
          label="Customers" icon={Users}
          value={customers.buyers.toLocaleString("en-BD")}
          hint={`${customers.newBuyers} new · ${customers.returningBuyers} returning`}
        />
        <MetricCard
          label="Delivery rate" icon={Truck}
          value={`${totals.deliveryRate}%`}
          change={change("deliveryRate")}
          hint={`${totals.deliveredOrders} delivered of ${totals.deliveredOrders + totals.cancelledOrders} settled`}
          accent="bg-blue-500/10 text-blue-600"
        />
        <MetricCard
          label="Lost to cancellations" icon={XCircle}
          value={formatPrice(totals.cancelledValue)}
          change={change("cancelledValue")} invert
          hint={`${totals.cancelRate}% of orders placed`}
          accent="bg-red-500/10 text-red-600"
        />
      </div>

      {!hasSales ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="No orders in this period"
            hint="Pick a wider date range above, or come back once orders start coming in."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* ── Revenue / orders over time ──────────────────────────────────── */}
          <TrendPanel series={series} granularity={granularity} />

          {/* ── Where the money comes from ──────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <ChartCard title="Sales channels" subtitle="Net sales by where the order came from">
              <BarList
                rows={bySource.map((r) => ({
                  key: r.key,
                  label: SOURCE_LABELS[r.key] || r.key,
                  value: r.netSales,
                  sub: `${r.orders} order${r.orders === 1 ? "" : "s"}`,
                }))}
              />
            </ChartCard>

            <ChartCard title="Order status" subtitle="Every order placed in the period">
              <BarList
                money={false}
                colors={STATUS_COLORS}
                rows={byStatus.map((r) => ({
                  key: r.key,
                  label: STATUS_LABELS[r.key] || r.key,
                  value: r.orders,
                  sub: formatPrice(r.netSales || r.collected),
                }))}
              />
            </ChartCard>

            <ChartCard title="Payment methods" subtitle="Net sales by how customers pay">
              <BarList
                rows={byPayment.map((r) => ({
                  key: r.key,
                  label: PAYMENT_LABELS[r.key] || r.key,
                  value: r.netSales,
                  sub: `${r.orders} order${r.orders === 1 ? "" : "s"}`,
                }))}
              />
            </ChartCard>
          </div>

          {/* ── Money breakdown + delivery health ───────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="How the total is built" subtitle="From goods ordered to what was invoiced" className="lg:col-span-2">
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                {[
                  { label: "Goods (before discount)", value: totals.grossSales },
                  { label: "Discounts given", value: totals.discounts, negate: true },
                  { label: "Shipping charged", value: totals.shipping },
                  { label: "Net sales (invoiced)", value: totals.netSales, strong: true },
                  { label: "Collected (delivered)", value: totals.collected, tone: "text-emerald-600" },
                  { label: "Still in flight", value: totals.inFlight, tone: "text-amber-600" },
                  { label: "Cancelled", value: totals.cancelledValue, tone: "text-red-600" },
                  { label: "Returned", value: totals.returnedAmount, tone: "text-red-600" },
                  { label: "Revenue per customer", value: customers.revenuePerBuyer },
                ].map((row) => (
                  <div key={row.label} className="min-w-0">
                    <dt className="text-[11px] text-brand-tan truncate">{row.label}</dt>
                    <dd className={`text-[15px] font-semibold tabular-nums mt-0.5 ${row.tone || "text-brand-brown"} ${row.strong ? "text-brand-terracotta" : ""}`}>
                      {row.negate && row.value > 0 ? "− " : ""}{formatPrice(row.value)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] text-brand-tan mt-4 pt-3 border-t border-brand-tan/10">
                Products carry no cost price, so these are revenue figures — not profit.
              </p>
            </ChartCard>

            <ChartCard title="Delivery zones" subtitle="Net sales by shipping zone">
              <BarList
                rows={byZone.map((r) => ({
                  key: r.key,
                  label: ZONE_LABELS[r.key] || r.key,
                  value: r.netSales,
                  sub: `${r.orders} order${r.orders === 1 ? "" : "s"}`,
                }))}
              />
            </ChartCard>
          </div>

          {/* ── Products ────────────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="Best sellers" subtitle="Top products by revenue" className="lg:col-span-2">
              {topProducts.length === 0 ? (
                <p className="text-[13px] text-brand-tan py-6 text-center">No products sold in this period</p>
              ) : (
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {["Product", "Units", "Orders", "Revenue"].map((h, i) => (
                          <th key={h} className={`${i ? "text-right" : "text-left"} pb-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topProducts.map((p) => (
                        <tr key={p.id} className="border-t border-brand-tan/10">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {p.image ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.image} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0 bg-brand-cream" />
                              ) : (
                                <div className="w-8 h-10 rounded bg-brand-cream flex-shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-[12.5px] text-brand-brown truncate">{p.name}</p>
                                {p.sku && <p className="text-[10px] text-brand-tan font-mono truncate">{p.sku}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-[12px] text-brand-brown tabular-nums">{p.units}</td>
                          <td className="py-2.5 text-right text-[12px] text-brand-tan tabular-nums">{p.orders}</td>
                          <td className="py-2.5 text-right text-[12px] font-semibold text-brand-brown tabular-nums whitespace-nowrap">
                            {formatPrice(p.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </ChartCard>

            <ChartCard title="Categories" subtitle="Revenue by category">
              <BarList
                rows={topCategories.map((c) => ({
                  key: c.key,
                  label: c.name,
                  value: c.revenue,
                  sub: `${c.units} unit${c.units === 1 ? "" : "s"}`,
                }))}
                emptyText="No categorised sales yet"
              />
            </ChartCard>
          </div>

          {/* ── Customers ───────────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-3">
            <ChartCard title="New vs returning" subtitle="Customers who ordered in this period">
              <div className="space-y-4">
                <div className="flex items-end gap-3">
                  <div>
                    <p className="text-2xl font-bold text-brand-brown tabular-nums">{customers.returningShare}%</p>
                    <p className="text-[11px] text-brand-tan">of buyers had ordered before</p>
                  </div>
                </div>
                <BarList
                  money={false}
                  rows={[
                    { key: "new", label: "First-time buyers", value: customers.newBuyers, sub: formatPrice(customers.newRevenue) },
                    { key: "returning", label: "Returning buyers", value: customers.returningBuyers, sub: formatPrice(customers.returningRevenue) },
                  ]}
                />
                <dl className="grid grid-cols-2 gap-3 pt-3 border-t border-brand-tan/10">
                  <div>
                    <dt className="text-[11px] text-brand-tan">Ordered 2+ times</dt>
                    <dd className="text-[15px] font-semibold text-brand-brown tabular-nums">{customers.repeatBuyers}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-brand-tan">New customer records</dt>
                    <dd className="text-[15px] font-semibold text-brand-brown tabular-nums">
                      {signups.total}
                      <span className="text-[11px] font-normal text-brand-tan ml-1.5">{signups.registered} registered</span>
                    </dd>
                  </div>
                </dl>
              </div>
            </ChartCard>

            <ChartCard title="Top customers" subtitle="By spend in this period" className="lg:col-span-2">
              <TableWrap>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {["Customer", "Orders", "Spent"].map((h, i) => (
                        <th key={h} className={`${i ? "text-right" : "text-left"} pb-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomers.map((c) => (
                      <tr key={c.key} className="border-t border-brand-tan/10">
                        <td className="py-2.5 pr-3 min-w-0">
                          <p className="text-[12.5px] text-brand-brown truncate">{c.name}</p>
                          <p className="text-[10px] text-brand-tan truncate">
                            {c.phone}{c.city ? ` · ${c.city}` : ""}
                          </p>
                        </td>
                        <td className="py-2.5 text-right text-[12px] text-brand-brown tabular-nums">{c.orders}</td>
                        <td className="py-2.5 text-right text-[12px] font-semibold text-brand-brown tabular-nums whitespace-nowrap">
                          {formatPrice(c.spent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </ChartCard>
          </div>

          {/* ── When people buy ─────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Busiest days" subtitle="Orders by day of the week">
              <ColumnChart data={whenTheyBuy.byWeekday.map((d) => ({ key: d.key, label: d.key, value: d.orders }))} />
            </ChartCard>
            <ChartCard title="Busiest hours" subtitle="Orders by hour, Bangladesh time">
              <ColumnChart data={whenTheyBuy.byHour.map((d) => ({ key: d.key, label: `${d.key}:00 – ${d.key}:59`, value: d.orders }))} />
            </ChartCard>
          </div>

          {/* ── Campaigns ───────────────────────────────────────────────────── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Landing pages" subtitle="Campaign funnel performance">
              {landingPages.length === 0 ? (
                <EmptyState icon={Rocket} title="No landing-page orders" hint="Orders from /lp campaigns will show up here." />
              ) : (
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {["Page", "Orders", "Cancelled", "Net sales"].map((h, i) => (
                          <th key={h} className={`${i ? "text-right" : "text-left"} pb-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {landingPages.map((lp) => (
                        <tr key={lp.code} className="border-t border-brand-tan/10">
                          <td className="py-2.5 pr-3 min-w-0">
                            <p className="text-[12.5px] text-brand-brown truncate">{lp.name || lp.code}</p>
                            <p className="text-[10px] text-brand-tan font-mono truncate">/lp/{lp.code}</p>
                          </td>
                          <td className="py-2.5 text-right text-[12px] text-brand-brown tabular-nums">{lp.orders}</td>
                          <td className="py-2.5 text-right text-[12px] text-brand-tan tabular-nums">{lp.cancelled}</td>
                          <td className="py-2.5 text-right text-[12px] font-semibold text-brand-brown tabular-nums whitespace-nowrap">
                            {formatPrice(lp.netSales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </ChartCard>

            <ChartCard title="Discounts & offers" subtitle="What the promotions cost">
              {discounts.length === 0 ? (
                <EmptyState icon={Tag} title="No discounts used" hint="Coupons and automatic offers will be tallied here." />
              ) : (
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {["Code / offer", "Uses", "Given away", "Order value"].map((h, i) => (
                          <th key={h} className={`${i ? "text-right" : "text-left"} pb-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {discounts.map((d) => (
                        <tr key={d.code} className="border-t border-brand-tan/10">
                          <td className="py-2.5 pr-3 min-w-0">
                            <p className="text-[12.5px] text-brand-brown truncate font-mono">{d.code}</p>
                            {d.title && <p className="text-[10px] text-brand-tan truncate">{d.title}</p>}
                          </td>
                          <td className="py-2.5 text-right text-[12px] text-brand-brown tabular-nums">{d.uses}</td>
                          <td className="py-2.5 text-right text-[12px] text-red-600 tabular-nums whitespace-nowrap">− {formatPrice(d.amount)}</td>
                          <td className="py-2.5 text-right text-[12px] font-semibold text-brand-brown tabular-nums whitespace-nowrap">
                            {formatPrice(d.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
