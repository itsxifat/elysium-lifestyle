"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  Search, Plus, Users, UserCheck, ShoppingBag, Repeat, Wallet, AlertTriangle,
  ChevronLeft, ChevronRight, Trash2, Pencil, Eye, Merge, Download, X, Phone, Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader, Button, Card, StatCard, TableWrap, EmptyState, Pill } from "@/components/admin/ui";
import { ROLE_LABELS } from "@/lib/permissions";
import {
  Avatar, TypeBadge, ChannelPills, Dropdown, Checkbox, Modal,
  taka, takaShort, shortDate, timeAgo,
} from "@/components/admin/customers/shared";
import CustomerDrawer from "@/components/admin/customers/CustomerDrawer";
import CustomerFormModal from "@/components/admin/customers/CustomerFormModal";
import DuplicatesModal, { MergeGroup } from "@/components/admin/customers/DuplicatesModal";

// The customer directory.
//
// Almost every buyer here is a guest record created from a COD order — they have
// never signed in and most have no email. So the page is built around the two
// questions staff actually ask: "who is this number calling me" (search) and
// "who is worth keeping" (sort by value, repeat segment), rather than around
// account management, which is now its own Team tab.

const SEGMENTS = [
  { value: "all", label: "All customers" },
  { value: "repeat", label: "Repeat buyers" },
  { value: "guests", label: "Guests" },
  { value: "registered", label: "Registered" },
  { value: "inactive", label: "No orders" },
  { value: "team", label: "Team" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "Newest first" },
  { value: "last_order", label: "Recently ordered" },
  { value: "collected", label: "Highest paid" },
  { value: "spent", label: "Highest invoiced" },
  { value: "orders", label: "Most orders" },
  { value: "name", label: "Name (A–Z)" },
  { value: "oldest", label: "Oldest first" },
];

const PAGE_SIZES = [
  { value: "25", label: "25 per page" },
  { value: "50", label: "50 per page" },
  { value: "100", label: "100 per page" },
];

export default function CustomersPage() {
  const { data: session } = useSession();
  const actor = session?.user;

  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [meta, setMeta] = useState({ total: 0, page: 1, pages: 1, canManageUsers: false });
  const [loading, setLoading] = useState(true);

  const [segment, setSegment] = useState("all");
  const [sort, setSort] = useState("recent");
  const [limit, setLimit] = useState("25");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState(new Set());
  const [drawerId, setDrawerId] = useState(null);
  const [formState, setFormState] = useState({ open: false, mode: "create", user: null });
  const [dupesOpen, setDupesOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  // Debounce the search box — a phone number is typed digit by digit and each
  // keystroke would otherwise be a full aggregation.
  const debounce = useRef(null);
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { setQ(search); setPage(1); }, 350);
    return () => clearTimeout(debounce.current);
  }, [search]);

  const params = useCallback(
    () => new URLSearchParams({ segment, sort, q, page: String(page), limit }),
    [segment, sort, q, page, limit]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?${params()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load customers");
      setRows(data.users || []);
      setStats(data.stats || null);
      setMeta({ total: data.total, page: data.page, pages: data.pages, canManageUsers: data.canManageUsers });
    } catch (err) {
      toast.error(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [segment, q, page]);

  const canManage = meta.canManageUsers;

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r._id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        rows.forEach((r) => next.delete(r._id));
        return next;
      }
      return new Set([...prev, ...rows.map((r) => r._id)]);
    });
  };

  const remove = async (user) => {
    if (!confirm(`Delete ${user.name}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user._id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete");
      toast.success("Record deleted");
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportCsv = () => {
    const p = new URLSearchParams({ segment, sort, q });
    window.location.href = `/api/admin/users/export?${p}`;
  };

  const selectedRows = rows.filter((r) => selected.has(r._id));
  const isTeam = segment === "team";

  return (
    <div className="w-full">
      <PageHeader
        icon={Users}
        title={isTeam ? "Team" : "Customers"}
        subtitle={
          isTeam
            ? "Panel accounts, their roles and what each one may do"
            : "Everyone who has ever ordered — matched by phone and email, however they bought"
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download size={14} /> <span className="hidden sm:inline">Export</span>
            </Button>
            {canManage && !isTeam && (
              <Button variant="outline" size="sm" onClick={() => setDupesOpen(true)}>
                <Merge size={14} /> <span className="hidden sm:inline">Duplicates</span>
              </Button>
            )}
            {canManage && (
              <Button size="sm" onClick={() => setFormState({ open: true, mode: "create", user: null })}>
                <Plus size={14} /> <span className="hidden sm:inline">{isTeam ? "Add member" : "Add customer"}</span>
              </Button>
            )}
          </>
        }
      />

      {/* Health + headline numbers */}
      {stats && (
        <>
          {stats.unattachedOrders > 0 && (
            <Card className="mb-4 border-amber-300 bg-amber-50 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-amber-900">
                  {stats.unattachedOrders} order{stats.unattachedOrders === 1 ? " is" : "s are"} not linked to any customer
                </p>
                <p className="text-[12px] text-amber-800 mt-0.5">
                  Those buyers are missing from this list and from every lifetime-value total.
                  Run <code className="font-mono bg-amber-100 px-1 rounded">node scripts/backfill-order-customers.mjs</code> on the server to attach them.
                </p>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
            <StatCard label="Customers" value={stats.customers.toLocaleString()} icon={Users}
              hint={`${stats.registered} registered · ${stats.guests} guest`} />
            <StatCard label="Have ordered" value={stats.buyers.toLocaleString()} icon={ShoppingBag}
              hint={`${stats.orders.toLocaleString()} orders`} />
            <StatCard label="Repeat buyers" value={stats.repeatBuyers.toLocaleString()} icon={Repeat}
              hint={stats.buyers ? `${Math.round((stats.repeatBuyers / stats.buyers) * 100)}% come back` : "—"} />
            <StatCard label="Collected" value={takaShort(stats.collected)} icon={Wallet}
              hint="delivered orders only" accent="text-emerald-700" />
            <StatCard label="Reachable" value={stats.withPhone.toLocaleString()} icon={Phone}
              hint={`${stats.withEmail} also by email`} />
          </div>
        </>
      )}

      {/* Segments */}
      <div className="flex gap-1 overflow-x-auto pb-1 mb-3 -mx-1 px-1">
        {SEGMENTS.map((s) => {
          const active = segment === s.value;
          const count =
            stats &&
            { all: stats.customers, guests: stats.guests, registered: stats.registered, team: stats.team, repeat: stats.repeatBuyers }[s.value];
          return (
            <button
              key={s.value}
              onClick={() => { setSegment(s.value); setPage(1); }}
              className={cn(
                "px-3.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5",
                active
                  ? "bg-brand-brown text-white"
                  : "text-brand-tan hover:text-brand-brown hover:bg-brand-cream-dark/70"
              )}
            >
              {s.label}
              {count !== undefined && count !== null && (
                <span className={cn("text-[11px] tabular-nums", active ? "text-white/70" : "text-brand-tan/70")}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone or email…"
            className="w-full pl-9 pr-9 py-2 rounded-lg border border-brand-tan/30 bg-white text-[13px] text-brand-brown placeholder:text-brand-tan/50 focus:outline-none focus:border-brand-brown focus:ring-2 focus:ring-brand-terracotta/15 transition-shadow"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tan hover:text-brand-brown"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <Dropdown value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORT_OPTIONS} className="sm:w-48" widthClass="w-48" align="right" />
        <Dropdown value={limit} onChange={(v) => { setLimit(v); setPage(1); }} options={PAGE_SIZES} className="sm:w-36" widthClass="w-36" align="right" />
      </div>

      {/* Selection bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 px-3.5 py-2.5 rounded-lg bg-brand-brown text-white">
          <span className="text-[13px]">
            {selected.size} selected
            {selected.size > 1 && <span className="text-white/60"> · merge folds them into one customer</span>}
          </span>
          <div className="flex items-center gap-2">
            {canManage && selected.size > 1 && selectedRows.length === selected.size && (
              <Button size="sm" variant="primary" onClick={() => setMergeOpen(true)}>
                <Merge size={13} /> Merge
              </Button>
            )}
            <button onClick={() => setSelected(new Set())} className="text-[12px] text-white/70 hover:text-white">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card padded={false} className="overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => <div key={i} className="h-14 bg-brand-cream/60 rounded-lg animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? "No one matches that search" : "Nothing here yet"}
            hint={
              q
                ? "Try just the last few digits of the phone number."
                : segment === "inactive"
                ? "Every customer record has at least one order against it."
                : "Customers appear here the moment an order is placed, signed in or not."
            }
            action={q ? <Button variant="outline" size="sm" onClick={() => setSearch("")}>Clear search</Button> : null}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <TableWrap>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-brand-tan/15 bg-brand-cream/40">
                      {canManage && (
                        <th className="w-10 pl-4 py-2.5">
                          <Checkbox checked={allOnPageSelected} onChange={toggleAll} label="Select all on page" />
                        </th>
                      )}
                      <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan">Customer</th>
                      <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan">Contact</th>
                      {isTeam ? (
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan">Role</th>
                      ) : (
                        <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan">Channels</th>
                      )}
                      <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan text-right">Orders</th>
                      <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan text-right">Collected</th>
                      <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-brand-tan">Last order</th>
                      <th className="px-3 py-2.5 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-tan/10">
                    {rows.map((u) => (
                      <tr
                        key={u._id}
                        className={cn("hover:bg-brand-cream/40 transition-colors", selected.has(u._id) && "bg-brand-terracotta/5")}
                      >
                        {canManage && (
                          <td className="pl-4 py-2.5">
                            <Checkbox checked={selected.has(u._id)} onChange={() => toggleSelect(u._id)} label={`Select ${u.name}`} />
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          <button onClick={() => setDrawerId(u._id)} className="flex items-center gap-2.5 text-left group min-w-0">
                            <Avatar user={u} />
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-brand-brown group-hover:text-brand-terracotta transition-colors truncate max-w-[200px]">
                                {u.name}
                              </p>
                              <div className="mt-0.5"><TypeBadge user={u} /></div>
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="text-[12px] text-brand-brown tabular-nums">{u.phone || <span className="text-brand-tan/50">—</span>}</div>
                          {u.email && <div className="text-[11px] text-brand-tan truncate max-w-[180px]">{u.email}</div>}
                        </td>
                        {isTeam ? (
                          <td className="px-3 py-2.5">
                            <Pill tone="brown">{ROLE_LABELS[u.role] || u.role}</Pill>
                            {u.hasPin && <span className="ml-1.5 text-[10px] text-brand-tan">PIN set</span>}
                          </td>
                        ) : (
                          <td className="px-3 py-2.5"><ChannelPills channels={u.channels} /></td>
                        )}
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-[13px] font-medium text-brand-brown tabular-nums">{u.orderCount}</span>
                          {u.cancelledCount > 0 && (
                            <span className="block text-[10px] text-red-500 tabular-nums">{u.cancelledCount} cancelled</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-[13px] font-semibold text-brand-brown tabular-nums">{taka(u.collected)}</span>
                          {u.totalSpent !== u.collected && (
                            <span className="block text-[10px] text-brand-tan tabular-nums">{taka(u.totalSpent)} invoiced</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="text-[12px] text-brand-tan">{u.lastOrderAt ? timeAgo(u.lastOrderAt) : "—"}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="icon" onClick={() => setDrawerId(u._id)} aria-label={`View ${u.name}`}>
                              <Eye size={15} />
                            </Button>
                            {canManage && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => setFormState({ open: true, mode: "edit", user: u })} aria-label={`Edit ${u.name}`}>
                                  <Pencil size={15} />
                                </Button>
                                <Button variant="danger-ghost" size="icon" onClick={() => remove(u)} aria-label={`Delete ${u.name}`}>
                                  <Trash2 size={15} />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-brand-tan/10">
              {rows.map((u) => (
                <div key={u._id} className={cn("p-3.5", selected.has(u._id) && "bg-brand-terracotta/5")}>
                  <div className="flex items-start gap-3">
                    {canManage && (
                      <div className="pt-1">
                        <Checkbox checked={selected.has(u._id)} onChange={() => toggleSelect(u._id)} label={`Select ${u.name}`} />
                      </div>
                    )}
                    <button onClick={() => setDrawerId(u._id)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                      <Avatar user={u} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-[14px] font-medium text-brand-brown truncate">{u.name}</p>
                          <TypeBadge user={u} />
                        </div>
                        {u.phone && (
                          <p className="text-[12px] text-brand-tan mt-0.5 tabular-nums flex items-center gap-1">
                            <Phone size={10} /> {u.phone}
                          </p>
                        )}
                        {u.email && (
                          <p className="text-[12px] text-brand-tan truncate flex items-center gap-1">
                            <Mail size={10} /> {u.email}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-[12px]">
                          <span className="text-brand-brown font-medium tabular-nums">
                            {u.orderCount} order{u.orderCount === 1 ? "" : "s"}
                          </span>
                          <span className="text-emerald-700 font-semibold tabular-nums">{taka(u.collected)}</span>
                          <span className="text-brand-tan">{u.lastOrderAt ? timeAgo(u.lastOrderAt) : "no orders"}</span>
                        </div>
                        {!isTeam && u.channels.length > 0 && (
                          <div className="mt-2"><ChannelPills channels={u.channels} max={3} /></div>
                        )}
                      </div>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* Pagination */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
          <p className="text-[12px] text-brand-tan">
            Showing {(meta.page - 1) * Number(limit) + 1}–{Math.min(meta.page * Number(limit), meta.total)} of{" "}
            {meta.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={meta.page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <span className="px-3 text-[12px] text-brand-tan tabular-nums">
              {meta.page} / {meta.pages}
            </span>
            <Button variant="outline" size="sm" disabled={meta.page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {/* Overlays */}
      <CustomerDrawer
        customerId={drawerId}
        open={!!drawerId}
        onClose={() => setDrawerId(null)}
        onEdit={(u) => { setDrawerId(null); setFormState({ open: true, mode: "edit", user: u }); }}
        canManage={canManage}
      />

      <CustomerFormModal
        open={formState.open}
        mode={formState.mode}
        user={formState.user}
        actor={actor}
        onClose={() => setFormState({ open: false, mode: "create", user: null })}
        onSaved={load}
      />

      <DuplicatesModal open={dupesOpen} onClose={() => setDupesOpen(false)} onMerged={load} />

      {/* Merge the rows the admin hand-picked */}
      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} size="md" labelledBy="merge-selected-title">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-brand-tan/15">
          <h2 id="merge-selected-title" className="text-base font-bold text-brand-brown">Merge {selectedRows.length} records</h2>
          <Button variant="ghost" size="icon" onClick={() => setMergeOpen(false)} aria-label="Close"><X size={18} /></Button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto">
          <p className="text-[12px] text-brand-tan mb-3">
            Choose the record to keep. Every order from the others moves onto it, and the emptied records are removed.
          </p>
          <MergeGroup
            group={{ reason: "manual", confidence: "chosen by you", key: "", users: selectedRows }}
            onMerged={() => { setMergeOpen(false); setSelected(new Set()); load(); }}
          />
        </div>
      </Modal>
    </div>
  );
}
