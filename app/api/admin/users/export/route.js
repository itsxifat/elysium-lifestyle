import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import { SEGMENTS, SORTS, buildPipeline, serializeCustomer } from "@/lib/customer-directory";

// CSV of the customer directory, honouring whatever segment, search and sort the
// admin is looking at — an export that disagreed with the table on screen would
// be worse than none. Capped so one click cannot stream the whole collection
// into memory.
const MAX_ROWS = 5000;

const COLUMNS = [
  ["Name", (u) => u.name],
  ["Phone", (u) => u.phone || ""],
  ["Email", (u) => u.email || ""],
  ["Type", (u) => (u.role !== "customer" ? u.role : u.isGuest ? "guest" : "registered")],
  ["Orders", (u) => u.orderCount],
  ["Delivered", (u) => u.deliveredCount],
  ["Cancelled", (u) => u.cancelledCount],
  ["Invoiced (BDT)", (u) => u.totalSpent],
  ["Collected (BDT)", (u) => u.collected],
  ["Channels", (u) => u.channels.join(" / ")],
  ["First order", (u) => iso(u.firstOrderAt)],
  ["Last order", (u) => iso(u.lastOrderAt)],
  ["Customer since", (u) => iso(u.createdAt)],
];

const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// Quote every field and double embedded quotes. The leading-character guard
// stops Excel treating a value like "=cmd" or "+880…" as a formula.
function csvCell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const segment = SEGMENTS.includes(searchParams.get("segment")) ? searchParams.get("segment") : "all";

  const { error } = await requireAdmin(segment === "team" ? "users.manage" : "customers.view");
  if (error) return error;

  const q = searchParams.get("q") || "";
  const role = searchParams.get("role") || "";
  const sortKey = SORTS[searchParams.get("sort")] ? searchParams.get("sort") : "recent";

  await connectDB();

  const rows = await User.aggregate(buildPipeline({ segment, role, q, sortKey, skip: 0, limit: MAX_ROWS }));
  const customers = rows.map(serializeCustomer);

  const lines = [COLUMNS.map(([h]) => csvCell(h)).join(",")];
  for (const c of customers) lines.push(COLUMNS.map(([, get]) => csvCell(get(c))).join(","));

  // BOM so Excel opens Bengali names in UTF-8 rather than mojibake.
  const body = "﻿" + lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${segment}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
