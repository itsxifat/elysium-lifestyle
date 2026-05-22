"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  Search, Plus, X, Users, UserCheck, Shield, ShoppingBag,
  Trash2, Pencil, ChevronLeft, ChevronRight, Eye,
  Mail, Phone, MapPin, Calendar, CheckCircle, XCircle,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 font-medium ${
      role === "admin"
        ? "bg-brand-terracotta/10 text-brand-terracotta"
        : "bg-brand-tan/15 text-brand-tan"
    }`}>
      {role}
    </span>
  );
}

function Avatar({ user, size = "sm" }) {
  const cls = size === "sm"
    ? "w-8 h-8 text-[11px]"
    : "w-14 h-14 text-xl";
  if (user?.image) {
    return (
      <img
        src={user.image}
        alt={user.name}
        className={`${cls} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${cls} rounded-full bg-brand-terracotta flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {user?.name?.charAt(0)?.toUpperCase() || "U"}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  const accents = {
    brown: "bg-brand-brown/8 text-brand-brown",
    tan: "bg-brand-tan/15 text-brand-tan",
    terracotta: "bg-brand-terracotta/10 text-brand-terracotta",
    green: "bg-emerald-500/10 text-emerald-600",
  };
  return (
    <div className="bg-white border border-brand-tan/20 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-brand-tan mb-1.5">{label}</p>
          <p className="text-2xl font-bold text-brand-brown">{value ?? "—"}</p>
        </div>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${accents[accent] || accents.tan}`}>
          <Icon size={18} strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

// ── Order status colors ────────────────────────────────────────────────────────
const orderStatusCls = {
  delivered:  "bg-emerald-100 text-emerald-700",
  shipped:    "bg-blue-100 text-blue-700",
  processing: "bg-amber-100 text-amber-700",
  pending:    "bg-yellow-100 text-yellow-700",
  cancelled:  "bg-red-100 text-red-600",
};

// ── User detail drawer ─────────────────────────────────────────────────────────
function UserDetailDrawer({ userId, onClose, onEdit, onDelete }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, [userId]);

  const user = data?.user;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[420px] bg-white z-50 flex flex-col shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-brand-tan/20 flex-shrink-0">
          <p className="text-[11px] uppercase tracking-widest text-brand-tan font-medium">User Details</p>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-brand-tan text-sm">Loading…</div>
        ) : !user ? (
          <div className="flex-1 flex items-center justify-center text-brand-tan text-sm">Failed to load</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Profile header */}
            <div className="px-6 py-5 border-b border-brand-tan/10">
              <div className="flex items-start gap-4">
                <Avatar user={user} size="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-base font-bold text-brand-brown truncate">{user.name}</p>
                  <p className="text-sm text-brand-tan truncate">{user.email}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-2">
                    <RoleBadge role={user.role} />
                    {user.emailVerified ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                        <CheckCircle size={11} /> Verified
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-brand-tan/50">
                        <XCircle size={11} /> Unverified
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-brand-cream/60 p-3 text-center">
                  <p className="text-lg font-bold text-brand-brown">{user.orderCount}</p>
                  <p className="text-[10px] text-brand-tan uppercase tracking-wider">Orders</p>
                </div>
                <div className="bg-brand-cream/60 p-3 text-center">
                  <p className="text-lg font-bold text-brand-brown">৳{user.totalSpent?.toLocaleString()}</p>
                  <p className="text-[10px] text-brand-tan uppercase tracking-wider">Total Spent</p>
                </div>
              </div>
            </div>

            {/* Info rows */}
            <div className="px-6 py-4 space-y-3 border-b border-brand-tan/10">
              <div className="flex items-center gap-3 text-sm">
                <Mail size={14} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
                <span className="text-brand-brown break-all">{user.email}</span>
              </div>
              {user.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone size={14} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-brand-brown">{user.phone}</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={14} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
                <span className="text-brand-brown">
                  Joined {new Date(user.createdAt).toLocaleDateString("en-BD", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                </span>
              </div>
              {user.address?.city && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin size={14} className="text-brand-tan flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-brand-brown">
                    {[user.address.street, user.address.city, user.address.state]
                      .filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Recent orders */}
            {data.orders?.length > 0 && (
              <div className="px-6 py-4">
                <p className="text-[10px] uppercase tracking-widest text-brand-tan font-medium mb-3">
                  Recent Orders
                </p>
                <div className="space-y-0">
                  {data.orders.slice(0, 6).map((order) => (
                    <div
                      key={order._id}
                      className="flex items-center justify-between py-2.5 border-b border-brand-tan/10 last:border-0"
                    >
                      <div>
                        <p className="text-[12px] font-semibold text-brand-brown">{order.orderNumber}</p>
                        <p className="text-[10px] text-brand-tan mt-0.5">
                          {order.itemCount} item{order.itemCount !== 1 ? "s" : ""} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString("en-BD")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[12px] font-semibold text-brand-brown">
                          ৳{order.totalAmount.toLocaleString()}
                        </p>
                        <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 inline-block mt-0.5 ${
                          orderStatusCls[order.orderStatus] || "bg-brand-tan/15 text-brand-tan"
                        }`}>
                          {order.orderStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        {user && (
          <div className="flex gap-3 px-6 py-4 border-t border-brand-tan/20 flex-shrink-0">
            <button
              onClick={() => onEdit(user)}
              className="btn-primary text-[11px] tracking-[2px] flex-1 flex items-center justify-center gap-2"
            >
              <Pencil size={13} strokeWidth={2} /> Edit User
            </button>
            <button
              onClick={() => onDelete(user)}
              className="flex items-center gap-2 px-4 py-2.5 text-[11px] uppercase tracking-[2px] border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── Create / Edit modal ────────────────────────────────────────────────────────
function UserFormModal({ mode, user, onClose, onSaved }) {
  const [form, setForm] = useState(
    mode === "edit"
      ? {
          name: user.name || "",
          phone: user.phone || "",
          role: user.role || "customer",
          emailVerified: user.emailVerified || false,
        }
      : { name: "", email: "", password: "", role: "customer", phone: "" }
  );
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (mode === "create") {
      if (!form.email.trim()) { toast.error("Email is required"); return; }
      if (!form.password || form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    }

    setSaving(true);
    try {
      const url = mode === "edit" ? `/api/admin/users/${user._id}` : "/api/admin/users";
      const method = mode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || "Failed"); return; }
      toast.success(mode === "edit" ? "User updated" : "User created");
      onSaved(json);
    } catch {
      toast.error("Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border border-brand-tan/30 bg-transparent px-3 py-2 text-sm text-brand-brown focus:outline-none focus:border-brand-brown transition-colors";
  const labelCls = "block text-[10px] uppercase tracking-widest text-brand-tan mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <p className="text-[11px] uppercase tracking-widest text-brand-tan font-medium">
            {mode === "edit" ? "Edit User" : "Create User"}
          </p>
          <button onClick={onClose} className="text-brand-tan hover:text-brand-brown transition-colors">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Full Name *</label>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Rahim Uddin"
            />
          </div>

          {mode === "create" && (
            <>
              <div>
                <label className={labelCls}>Email *</label>
                <input
                  className={inputCls}
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className={labelCls}>Password *</label>
                <input
                  className={inputCls}
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Min 6 characters"
                />
              </div>
            </>
          )}

          <div>
            <label className={labelCls}>Phone</label>
            <input
              className={inputCls}
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+880 1XXX XXXXXX"
            />
          </div>

          <div>
            <label className={labelCls}>Role</label>
            <select
              className={inputCls + " bg-white"}
              value={form.role}
              onChange={(e) => set("role", e.target.value)}
            >
              <option value="customer">Customer</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {mode === "edit" && (
            <div className="flex items-center justify-between py-3 border-t border-brand-tan/10">
              <div>
                <p className="text-[12px] font-medium text-brand-brown">Email Verified</p>
                <p className="text-[10px] text-brand-tan">Allow login without OTP</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.emailVerified}
                  onChange={(e) => set("emailVerified", e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-brand-tan/40 rounded-full peer peer-checked:bg-brand-terracotta transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={submit}
              disabled={saving}
              className="btn-primary text-[11px] tracking-[2px] flex-1 flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {saving ? "Saving…" : mode === "edit" ? "Save Changes" : "Create User"}
            </button>
            <button onClick={onClose} className="btn-outline text-[11px] tracking-[2px]">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  const [detailId, setDetailId] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const searchTimer = useRef(null);

  const load = useCallback(async (p = page, q = search, r = roleFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: p, limit: 20 });
      if (q) params.set("q", q);
      if (r) params.set("role", r);
      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
      if (data.stats) setStats(data.stats);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => { load(); }, [page]);

  const handleSearchChange = (val) => {
    setSearch(val);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(1, val, roleFilter), 400);
  };

  const handleRoleChange = (val) => {
    setRoleFilter(val);
    setPage(1);
    load(1, search, val);
  };

  const handleDelete = async (user) => {
    if (!confirm(`Delete "${user.name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/admin/users/${user._id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || "Failed to delete"); return; }
    toast.success("User deleted");
    if (detailId === user._id) setDetailId(null);
    load();
  };

  const handleSaved = (savedUser) => {
    setEditUser(null);
    setCreateOpen(false);
    load();
    // If we were viewing the edited user, refresh their detail
    if (detailId === savedUser._id) {
      setDetailId(null);
      setTimeout(() => setDetailId(savedUser._id), 50);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-brown">User Management</h1>
          <p className="text-sm text-brand-tan mt-1">
            {total} {total === 1 ? "user" : "users"} total
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="btn-primary text-[11px] tracking-[2px] flex items-center gap-2"
        >
          <Plus size={14} strokeWidth={2} /> Add User
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Users"  value={stats.total}     icon={Users}      accent="brown" />
          <StatCard label="Customers"    value={stats.customers} icon={ShoppingBag} accent="tan" />
          <StatCard label="Admins"       value={stats.admins}    icon={Shield}     accent="terracotta" />
          <StatCard label="Verified"     value={stats.verified}  icon={UserCheck}  accent="green" />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-tan/60" strokeWidth={1.5} />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by name, email, or phone…"
            className="w-full pl-9 pr-9 py-2.5 border border-brand-tan/30 text-sm text-brand-brown bg-white focus:outline-none focus:border-brand-brown transition-colors"
          />
          {search && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-tan/60 hover:text-brand-brown transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <select
          value={roleFilter}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="border border-brand-tan/30 px-3 py-2.5 text-sm text-brand-brown bg-white focus:outline-none focus:border-brand-brown transition-colors"
        >
          <option value="">All Roles</option>
          <option value="customer">Customers</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-brand-tan/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-tan/15 bg-brand-cream/40">
                {["User", "Role", "Phone", "Orders", "Spent", "Status", "Joined", ""].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-widest text-brand-tan font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-tan/5">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-brand-tan text-sm">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Users size={28} className="text-brand-tan/30 mx-auto mb-2" strokeWidth={1} />
                    <p className="text-sm text-brand-tan">No users found</p>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user._id}
                    onClick={() => setDetailId(detailId === user._id ? null : user._id)}
                    className={`hover:bg-brand-cream/30 transition-colors cursor-pointer ${
                      detailId === user._id ? "bg-brand-cream/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar user={user} />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-brand-brown truncate max-w-[140px]">
                            {user.name}
                          </p>
                          <p className="text-[11px] text-brand-tan truncate max-w-[140px]">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={user.role} />
                    </td>
                    <td className="px-4 py-3 text-[12px] text-brand-brown/70 whitespace-nowrap">
                      {user.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-semibold text-brand-brown">
                      {user.orderCount}
                    </td>
                    <td className="px-4 py-3 text-[13px] font-semibold text-brand-brown whitespace-nowrap">
                      ৳{user.totalSpent.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {user.emailVerified ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium whitespace-nowrap">
                          <CheckCircle size={12} /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] text-brand-tan/50 whitespace-nowrap">
                          <XCircle size={12} /> Unverified
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-brand-tan whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString("en-BD")}
                    </td>
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setDetailId(user._id)}
                          title="View details"
                          className="p-1.5 text-brand-tan hover:text-brand-brown transition-colors"
                        >
                          <Eye size={13} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => setEditUser(user)}
                          title="Edit"
                          className="p-1.5 text-brand-tan hover:text-brand-brown transition-colors"
                        >
                          <Pencil size={13} strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={() => handleDelete(user)}
                          title="Delete"
                          className="p-1.5 text-brand-tan hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} strokeWidth={1.5} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-brand-tan/10">
            <p className="text-[11px] text-brand-tan">
              Page {page} of {pages} · {total} users
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 text-brand-tan hover:text-brand-brown disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={16} strokeWidth={2} />
              </button>
              {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
                const p = page <= 3 ? i + 1 : page - 2 + i;
                if (p < 1 || p > pages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 text-[12px] transition-colors ${
                      p === page
                        ? "bg-brand-terracotta text-white"
                        : "text-brand-tan hover:text-brand-brown"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page === pages}
                className="p-1.5 text-brand-tan hover:text-brand-brown disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={16} strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User detail drawer */}
      {detailId && (
        <UserDetailDrawer
          userId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(u) => { setEditUser(u); setDetailId(null); }}
          onDelete={(u) => { handleDelete(u); setDetailId(null); }}
        />
      )}

      {/* Edit modal */}
      {editUser && (
        <UserFormModal
          mode="edit"
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={handleSaved}
        />
      )}

      {/* Create modal */}
      {createOpen && (
        <UserFormModal
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
