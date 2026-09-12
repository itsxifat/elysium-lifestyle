import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import User from "@/models/User";
import Order from "@/models/Order";
import { normalizeBdPhone } from "@/lib/utils";

// Find customer records that are really the same person.
//
// Three signals, reported with their confidence so the admin can act on the
// certain ones and eyeball the rest. Nothing is merged here — this endpoint only
// looks.
//
//   phone   (certain)  — the same number after normalisation. Two records can
//                        still hold "+880 17…" and "017…" if either was typed in
//                        before phones were normalised on write.
//   email   (certain)  — the same address. The sparse unique index prevents this
//                        going forward, so a hit means legacy data.
//   name    (probable) — identical name AND the same delivery street. A shared
//                        family phone gives one person several names, so name
//                        alone is far too weak; the address is what makes it a
//                        real lead.
const MAX_GROUPS = 200;

export async function GET() {
  const { error } = await requireAdmin("users.manage");
  if (error) return error;

  await connectDB();

  const users = await User.find({ role: "customer" })
    .select("name email phone isGuest createdAt")
    .lean();

  const byPhone = new Map();
  const byEmail = new Map();

  for (const u of users) {
    const p = normalizeBdPhone(u.phone || "");
    if (p) {
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p).push(u);
    }
    const e = String(u.email || "").toLowerCase().trim();
    if (e) {
      if (!byEmail.has(e)) byEmail.set(e, []);
      byEmail.get(e).push(u);
    }
  }

  const groups = [];
  const claimed = new Set();

  const push = (reason, confidence, list, key) => {
    const ids = list.map((u) => String(u._id)).sort();
    const sig = reason + ":" + ids.join(",");
    if (claimed.has(sig)) return;
    claimed.add(sig);
    groups.push({ reason, confidence, key, userIds: ids });
  };

  for (const [p, list] of byPhone) if (list.length > 1) push("phone", "certain", list, p);
  for (const [e, list] of byEmail) if (list.length > 1) push("email", "certain", list, e);

  // Probable: same name, same street. Only worth computing for names that repeat.
  const byName = new Map();
  for (const u of users) {
    const n = String(u.name || "").toLowerCase().trim();
    if (!n || n === "guest") continue;
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(u);
  }
  const repeatedNames = [...byName.entries()].filter(([, l]) => l.length > 1);

  if (repeatedNames.length) {
    const candidateIds = repeatedNames.flatMap(([, l]) => l.map((u) => u._id));
    const addrRows = await Order.aggregate([
      { $match: { user: { $in: candidateIds } } },
      { $group: { _id: "$user", streets: { $addToSet: { $toLower: "$shippingAddress.street" } } } },
    ]);
    const streetsOf = new Map(addrRows.map((r) => [String(r._id), new Set((r.streets || []).filter(Boolean))]));

    for (const [name, list] of repeatedNames) {
      // Cluster this name's records by a shared street.
      for (let i = 0; i < list.length; i++) {
        const group = [list[i]];
        const mine = streetsOf.get(String(list[i]._id));
        if (!mine || !mine.size) continue;
        for (let j = i + 1; j < list.length; j++) {
          const theirs = streetsOf.get(String(list[j]._id));
          if (!theirs) continue;
          if ([...mine].some((s) => theirs.has(s))) group.push(list[j]);
        }
        if (group.length > 1) push("name+address", "probable", group, name);
      }
    }
  }

  // Attach the facts an admin needs to choose a winner. Match on the ObjectIds
  // we already hold from the users query rather than re-casting the strings.
  const userById = Object.fromEntries(users.map((u) => [String(u._id), u]));
  const involved = [...new Set(groups.flatMap((g) => g.userIds))];
  const involvedOids = involved.map((id) => userById[id]?._id).filter(Boolean);
  const counts = await Order.aggregate([
    { $match: { user: { $in: involvedOids } } },
    { $group: { _id: "$user", orders: { $sum: 1 }, spent: { $sum: "$totalAmount" }, last: { $max: "$createdAt" } } },
  ]);
  const statsById = Object.fromEntries(counts.map((c) => [String(c._id), c]));

  const detailed = groups.slice(0, MAX_GROUPS).map((g) => ({
    ...g,
    users: g.userIds.map((id) => {
      const u = userById[id] || {};
      const s = statsById[id] || {};
      return {
        _id: id,
        name: u.name || "",
        email: u.email || null,
        phone: u.phone || null,
        isGuest: !!u.isGuest,
        createdAt: u.createdAt,
        orderCount: s.orders || 0,
        totalSpent: s.spent || 0,
        lastOrderAt: s.last || null,
      };
    }),
  }));

  return NextResponse.json({
    groups: detailed,
    total: groups.length,
    truncated: groups.length > MAX_GROUPS,
    scanned: users.length,
  });
}
