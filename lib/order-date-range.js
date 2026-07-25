// Date-range logic for the admin Orders list filters. All boundaries are
// computed in Bangladesh time (Asia/Dhaka, fixed UTC+6, no DST) so "Today",
// "This week", etc. line up with the store's local day regardless of where the
// server runs. Pure JS (no DB / server-only imports) so it's safe to import
// from client components too.

export const TZ_OFFSET_MIN = 6 * 60; // Asia/Dhaka
const DAY = 86400000;
const OFF = TZ_OFFSET_MIN * 60000;

// The quick-pick presets shown as buttons, in display order.
export const DATE_PRESETS = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This week" },
  { key: "last_week", label: "Last week" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
];

// The Analytics page offers a wider set (rolling windows + years). Kept separate
// from DATE_PRESETS so the Orders list keeps its short, order-picking list.
export const ANALYTICS_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7_days", label: "7 days" },
  { key: "last_30_days", label: "30 days" },
  { key: "last_90_days", label: "90 days" },
  { key: "this_month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "this_year", label: "This year" },
  { key: "all", label: "All time" },
];

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Civil (BD-local) Y/M/D + weekday for an instant.
function localParts(instant) {
  const d = new Date(instant.getTime() + OFF);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() };
}

// UTC instant for BD-local midnight (00:00 Asia/Dhaka) of a civil Y/M/D.
function bdMidnight(y, m, d) {
  return new Date(Date.UTC(y, m, d) - OFF);
}

function bdMidnightFromStr(str) {
  const [y, m, d] = String(str).split("-").map(Number);
  if (!y || !m || !d) return null;
  return bdMidnight(y, m - 1, d);
}

export function startOfLocalDay(instant) {
  const p = localParts(instant);
  return bdMidnight(p.y, p.m, p.d);
}

// Most recent `weekStartsOn` weekday (0=Sun … 6=Sat) at BD midnight, at/before instant.
export function startOfLocalWeek(instant, weekStartsOn = 6) {
  const sod = startOfLocalDay(instant);
  const dow = localParts(sod).dow;
  const diff = (dow - weekStartsOn + 7) % 7;
  return new Date(sod.getTime() - diff * DAY);
}

// Resolve a filter selection into { start, end } instants (either may be null =
// unbounded). `end` is exclusive. A custom from/to are inclusive civil dates.
export function resolveRange({ range, from, to, weekStartsOn = 6, now = new Date() }) {
  // Explicit custom dates win over any preset.
  if (range === "custom" || from || to) {
    const start = from ? bdMidnightFromStr(from) : null;
    const toStart = to ? bdMidnightFromStr(to) : null;
    const end = toStart ? new Date(toStart.getTime() + DAY) : null; // include the whole "to" day
    return { start, end };
  }

  const sod = startOfLocalDay(now);
  const p = localParts(now);

  switch (range) {
    case "today":
      return { start: sod, end: null };
    case "yesterday":
      return { start: new Date(sod.getTime() - DAY), end: sod };
    case "this_week": {
      return { start: startOfLocalWeek(now, weekStartsOn), end: null };
    }
    case "last_week": {
      const ws = startOfLocalWeek(now, weekStartsOn);
      return { start: new Date(ws.getTime() - 7 * DAY), end: ws };
    }
    case "this_month":
      return { start: bdMidnight(p.y, p.m, 1), end: null };
    case "last_month": {
      const lm = p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 };
      return { start: bdMidnight(lm.y, lm.m, 1), end: bdMidnight(p.y, p.m, 1) };
    }
    // Rolling windows INCLUDE today, so "7 days" = today + the 6 before it.
    case "last_7_days":
      return { start: new Date(sod.getTime() - 6 * DAY), end: null };
    case "last_30_days":
      return { start: new Date(sod.getTime() - 29 * DAY), end: null };
    case "last_90_days":
      return { start: new Date(sod.getTime() - 89 * DAY), end: null };
    case "this_year":
      return { start: bdMidnight(p.y, 0, 1), end: null };
    case "last_year":
      return { start: bdMidnight(p.y - 1, 0, 1), end: bdMidnight(p.y, 0, 1) };
    default:
      return { start: null, end: null };
  }
}

// The equally long window immediately BEFORE {start, end} — what the analytics
// KPIs compare against ("+12% vs previous period"). An open-ended range is
// measured up to `now`. Returns null for all-time, which has nothing before it.
export function previousRange({ start, end, now = new Date() }) {
  if (!start) return null;
  const endAt = end || now;
  const span = endAt.getTime() - start.getTime();
  if (span <= 0) return null;
  return { start: new Date(start.getTime() - span), end: new Date(start.getTime()) };
}

// YYYY-MM-DD for the BD-local civil day an instant falls in. Matches the keys
// MongoDB emits for $dateToString with timezone "Asia/Dhaka".
export function bdDayKey(instant) {
  const p = localParts(instant);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

// Every bucket key from start (inclusive) to end (exclusive) so a chart shows
// zero-sales days as gaps in the line rather than skipping them. `unit` is
// "day" or "month".
export function bucketKeys(start, end, unit = "day") {
  const keys = [];
  if (!start || !end) return keys;
  if (unit === "month") {
    let { y, m } = localParts(start);
    const last = localParts(new Date(end.getTime() - 1));
    while (y < last.y || (y === last.y && m <= last.m)) {
      keys.push(`${y}-${String(m + 1).padStart(2, "0")}`);
      if (++m > 11) { m = 0; y++; }
      if (keys.length > 600) break; // safety valve
    }
    return keys;
  }
  for (let t = startOfLocalDay(start).getTime(); t < end.getTime(); t += DAY) {
    keys.push(bdDayKey(new Date(t)));
    if (keys.length > 1000) break; // safety valve
  }
  return keys;
}

// Daily buckets stay readable up to ~3 months; past that, switch to months.
export function pickGranularity(start, end, now = new Date()) {
  if (!start) return "month";
  const days = ((end || now).getTime() - start.getTime()) / DAY;
  return days > 92 ? "month" : "day";
}
