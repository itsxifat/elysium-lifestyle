export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import {
  BarChart3, Banknote, ShoppingCart, Receipt, Package, Users, Truck, XCircle,
  Rocket, Tag, TrendingUp, Radio, UserRound, Globe, Store, Filter,
} from "lucide-react";

import { authOptions } from "@/lib/auth";
import { hasPermission, ROLE_LABELS } from "@/lib/permissions";
import { connectDB } from "@/lib/mongoose";
import Settings from "@/models/Settings";
import { resolveRange, previousRange } from "@/lib/order-date-range";
import {
  getAnalytics, getStaffDirectory, pctChange,
  SOURCE_LABELS, PAYMENT_LABELS, ZONE_LABELS, CHANNEL_GROUPS,
} from "@/lib/analytics";
import { formatPrice } from "@/lib/utils";
import { PageHeader, Card, EmptyState, TableWrap } from "@/components/admin/ui";
import AnalyticsFilterBar from "@/components/admin/analytics/AnalyticsFilterBar";
import ExportMenu from "@/components/admin/analytics/ExportMenu";
import TrendPanel from "@/components/admin/analytics/TrendPanel";
import TeamPanel from "@/components/admin/analytics/TeamPanel";
import { ChannelMixPanel, ChannelBreakdown } from "@/components/admin/analytics/ChannelPanel";
import { ColumnChart } from "@/components/admin/analytics/charts";
import { STATUS_COLORS, CHANNEL_COLORS } from "@/components/admin/analytics/palette";
import { MetricCard, BarList, ChartCard } from "@/components/admin/analytics/parts";

export const metadata = { title: "Analytics" };

const STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const ORIGIN_ICONS = { staff: UserRound, self: Store, partner: Globe };

async function getData({ range, from, to, channel, staff }) {
  await connectDB();
  const settings = await Settings.findOne({}).select("orderFilters").lean();
  const weekStartsOn = settings?.orderFilters?.weekStartsOn ?? 6;

  const { start, end } = resolveRange({ range, from, to, weekStartsOn });
  const prev = previousRange({ start, end });
  const filters = { source: channel, staff };

  const [data, staffDirectory] = await Promise.all([
    getAnalytics({ start, end, prev, filters }),
    getStaffDirectory(),
  ]);

  return { ...data, weekStartsOn, staffDirectory };
}

// The channel filter accepts a family key ("social") or a single source
// ("whatsapp"); the header has to be able to name either.
function channelName(key) {
  const group = CHANNEL_GROUPS.find((g) => g.key === key);
  return group ? group.label : SOURCE_LABELS[key] || key;
}

export default async function AnalyticsPage({ searchParams }) {
  const session = await getServerSession(authOptions);
  // Revenue is not for every panel member — the layout only guarantees staff.
  if (!hasPermission(session?.user, "analytics.view")) redirect("/admin");

  const range = searchParams?.range || "last_30_days";
  const from = searchParams?.from || "";
  const to = searchParams?.to || "";
  const channel = searchParams?.channel || "";
  const staff = searchParams?.staff || "";

  const {
    granularity, totals, prevTotals, series, byStatus, byPayment, byZone,
    channels, channelSeries, origins, team,
    topProducts, topCategories, customers, topCustomers, whenTheyBuy,
    landingPages, partnerPages, discounts, signups, weekStartsOn, staffDirectory,
  } = await getData({ range, from, to, channel, staff });

  const change = (key) => (prevTotals ? pctChange(totals[key], prevTotals[key]) : undefined);
  const exportParams = { range, ...(from && { from }), ...(to && { to }), ...(channel && { channel }), ...(staff && { staff }) };

  const hasSales = totals.orders > 0;
  const staffName = staffDirectory.find((u) => u.id === staff)?.name;
  const scopeLabels = [
    channel ? channelName(channel) : null,
    staff === "any" ? "Keyed in by staff" : staff === "self" ? "Not keyed in by anyone" : staffName || null,
  ].filter(Boolean);

  return (
    <div>
      <PageHeader
        icon={BarChart3}
        title="Analytics"
        subtitle="Sales, channels, customers and team performance"
        actions={<ExportMenu params={exportParams} />}
      />

      <AnalyticsFilterBar
        range={range}
        from={from}
        to={to}
        channel={channel}
        staff={staff}
        weekStartsOn={weekStartsOn}
        channelGroups={CHANNEL_GROUPS}
        sourceLabels={SOURCE_LABELS}
        staffDirectory={staffDirectory}
        roleLabels={ROLE_LABELS}
      />

      {/* A filtered page looks exactly like an unfiltered one until you read the
          filter bar, so say it out loud above the numbers it changes. */}
      {scopeLabels.length > 0 && (
        <div className="flex items-start gap-2 mb-4 px-3.5 py-2.5 rounded-xl bg-brand-terracotta/8 border border-brand-terracotta/20">
          <Filter size={13} className="text-brand-terracotta flex-shrink-0 mt-0.5" />
          <p className="text-[12px] text-brand-brown">
            Every number below is narrowed to <span className="font-semibold">{scopeLabels.join(" · ")}</span>.
            <span className="text-brand-tan"> New-customer records are store-wide — a signup has no sales channel to filter on.</span>
          </p>
        </div>
      )}

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
            hint={
              scopeLabels.length
                ? "Nothing matched these filters. Widen the date range, or clear the channel and staff filters above."
                : "Pick a wider date range above, or come back once orders start coming in."
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* ── Revenue / orders over time ──────────────────────────────────── */}
          <TrendPanel series={series} granularity={granularity} />

          {/* ══ CHANNELS ═══════════════════════════════════════════════════════
              Where the orders come from, in three passes: how they reach the
              system at all, how the mix has moved, and how each one performs. */}
          <div className="flex items-center gap-2 pt-3">
            <Radio size={14} className="text-brand-terracotta" />
            <h2 className="text-[13px] font-semibold text-brand-brown">Sales channels</h2>
            <span className="text-[11px] text-brand-tan">— where every order came from</span>
          </div>

          {/* How the order got in at all. The denominator for everything in the
              team section below. */}
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
            {origins.map((o) => {
              const Icon = ORIGIN_ICONS[o.key];
              return (
                <Card key={o.key} className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-brand-tan font-medium truncate">{o.label}</p>
                      <p className="text-xl font-bold text-brand-brown mt-1 tabular-nums">
                        {o.orders.toLocaleString("en-BD")}
                        <span className="text-[11px] font-normal text-brand-tan ml-1.5">
                          order{o.orders === 1 ? "" : "s"}
                        </span>
                      </p>
                    </div>
                    <div className="w-7 h-7 rounded-lg bg-brand-terracotta/10 text-brand-terracotta flex items-center justify-center flex-shrink-0">
                      <Icon size={14} />
                    </div>
                  </div>
                  <div className="mt-2.5 h-1.5 rounded-full bg-brand-cream-dark/70 overflow-hidden">
                    <div className="h-full rounded-full bg-brand-terracotta" style={{ width: `${Math.max(1, o.shareOfOrders)}%` }} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 mt-3">
                    {[
                      { label: "Net sales", value: formatPrice(o.netSales) },
                      { label: "Units", value: o.units.toLocaleString("en-BD") },
                      { label: "AOV", value: formatPrice(o.aov) },
                    ].map((s) => (
                      <div key={s.label} className="min-w-0">
                        <dt className="text-[10px] text-brand-tan truncate">{s.label}</dt>
                        <dd className="text-[12.5px] font-semibold text-brand-brown tabular-nums truncate">{s.value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-[11px] text-brand-tan mt-2.5 pt-2.5 border-t border-brand-tan/10">
                    {o.shareOfSales}% of sales · {o.deliveryRate}% delivered
                  </p>
                </Card>
              );
            })}
          </div>

          <ChannelMixPanel series={channelSeries} groups={CHANNEL_GROUPS} granularity={granularity} />

          <ChartCard
            title="Channel performance"
            subtitle="Every measure per channel — open a family to see the channels inside it"
          >
            <ChannelBreakdown channels={channels} totalNet={channels.totalNet} />
          </ChartCard>

          {/* ══ TEAM ═══════════════════════════════════════════════════════════ */}
          <div className="flex items-center gap-2 pt-3">
            <UserRound size={14} className="text-brand-terracotta" />
            <h2 className="text-[13px] font-semibold text-brand-brown">Team performance</h2>
            <span className="text-[11px] text-brand-tan">— orders keyed in by a person</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              label="Sellers" icon={UserRound}
              value={team.totals.people.toLocaleString("en-BD")}
              hint={team.processors.length ? `+ ${team.processors.length} who only processed orders` : "Staff who created at least one order"}
            />
            <MetricCard
              label="Orders keyed in" icon={ShoppingCart}
              value={team.totals.orders.toLocaleString("en-BD")}
              hint={team.totals.ordersPerDay !== null ? `${team.totals.ordersPerDay} per day across the period` : "Across the whole period"}
            />
            <MetricCard
              label="Units sold by staff" icon={Package}
              value={team.totals.units.toLocaleString("en-BD")}
              hint="Net of returned items"
            />
            <MetricCard
              label="Staff net sales" icon={Banknote}
              value={formatPrice(team.totals.netSales)}
              hint={`${formatPrice(team.totals.collected)} collected · ${formatPrice(team.totals.aovPerOrder)} per order`}
            />
          </div>

          <ChartCard
            title="Who sold what"
            subtitle="Sort by any column · open a row for that person's channels, pace and processing work"
          >
            <TeamPanel team={team} />
          </ChartCard>

          {/* ══ THE REST ═══════════════════════════════════════════════════════ */}
          <div className="flex items-center gap-2 pt-3">
            <Banknote size={14} className="text-brand-terracotta" />
            <h2 className="text-[13px] font-semibold text-brand-brown">Money, products &amp; customers</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
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

          {/* ── Money breakdown ─────────────────────────────────────────────── */}
          <ChartCard title="How the total is built" subtitle="From goods ordered to what was invoiced">
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-4">
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
                { label: "Discount rate", value: `${totals.discountRate}%`, raw: true },
              ].map((row) => (
                <div key={row.label} className="min-w-0">
                  <dt className="text-[11px] text-brand-tan truncate">{row.label}</dt>
                  <dd className={`text-[15px] font-semibold tabular-nums mt-0.5 ${row.tone || "text-brand-brown"} ${row.strong ? "text-brand-terracotta" : ""}`}>
                    {row.negate && row.value > 0 ? "− " : ""}{row.raw ? row.value : formatPrice(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-brand-tan mt-4 pt-3 border-t border-brand-tan/10">
              Products carry no cost price, so these are revenue figures — not profit.
            </p>
          </ChartCard>

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
                    <p className="text-[11px] text-brand-tan">
                      of buyers had ordered before{channel ? " through this channel" : ""}
                    </p>
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
            <ChartCard
              title="Landing pages"
              subtitle="Campaign funnel performance"
              action={<span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CHANNEL_COLORS.campaign }} />}
            >
              {landingPages.length === 0 ? (
                <EmptyState icon={Rocket} title="No landing-page orders" hint="Orders from /lp campaigns will show up here." />
              ) : (
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {["Page", "Orders", "Units", "Cancelled", "Net sales"].map((h, i) => (
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
                          <td className="py-2.5 text-right text-[12px] text-brand-tan tabular-nums">{lp.units}</td>
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

            {/* An ncom order is packed by us but sold on somebody else's page, so
                their store and their offer are the only campaign detail it has. */}
            <ChartCard
              title="Partner pages (ncom.bd)"
              subtitle="Which of their storefronts and offers sold it"
              action={<span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: CHANNEL_COLORS.partner }} />}
            >
              {partnerPages.length === 0 ? (
                <EmptyState icon={Globe} title="No partner orders" hint="Orders handed to us by ncom.bd will be broken down here." />
              ) : (
                <TableWrap>
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        {["Store / offer", "Orders", "Units", "Cancelled", "Net sales"].map((h, i) => (
                          <th key={h} className={`${i ? "text-right" : "text-left"} pb-2 text-[10px] text-brand-tan uppercase tracking-[1.5px] font-semibold`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {partnerPages.map((p) => (
                        <tr key={p.key} className="border-t border-brand-tan/10">
                          <td className="py-2.5 pr-3 min-w-0">
                            <p className="text-[12.5px] text-brand-brown truncate">{p.store}</p>
                            <p className="text-[10px] text-brand-tan truncate">{p.offer || p.pageTitle || "—"}</p>
                          </td>
                          <td className="py-2.5 text-right text-[12px] text-brand-brown tabular-nums">{p.orders}</td>
                          <td className="py-2.5 text-right text-[12px] text-brand-tan tabular-nums">{p.units}</td>
                          <td className="py-2.5 text-right text-[12px] text-brand-tan tabular-nums">{p.cancelled}</td>
                          <td className="py-2.5 text-right text-[12px] font-semibold text-brand-brown tabular-nums whitespace-nowrap">
                            {formatPrice(p.netSales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </ChartCard>
          </div>

          <ChartCard title="Discounts &amp; offers" subtitle="What the promotions cost">
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
      )}
    </div>
  );
}
