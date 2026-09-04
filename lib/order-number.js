import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// Order numbers, allocated atomically.
//
// They used to be built as `countDocuments() + 1`. Two checkouts landing in the
// same moment both read the same count, both built the same number, and the
// unique index on `orderNumber` rejected the second — which surfaced to the
// customer as "Failed to create order". In a ten-request concurrency test three
// of them died this way. It is not a rare edge case; it is exactly what happens
// whenever the shop is busy, which is the worst possible time to drop orders.
//
// A counter document per year replaces it. `findOneAndUpdate` with `$inc` is
// atomic, so every caller gets a distinct number no matter how many arrive at
// once. `allocateOrderNumber` also retries around the unique index, so even a
// counter that has drifted (restored backup, manual insert) still yields a
// usable number instead of failing the sale.

const counterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false }
);

// Tenant-aware. This is a MODEL living outside models/, and it is the one that
// matters most: bound to the default connection, every sandbox would share a
// single order-number sequence and write it into the control database — so two
// visitors in separate sandboxes could be handed the same order number, and the
// unique index would fail one of their checkouts.
const Counter = tenantModel("Counter", counterSchema);

// Seed a year's counter from the highest number already issued, so numbering
// continues rather than colliding with existing orders. `$setOnInsert` means
// only the first caller to arrive does this; the rest no-op.
async function seedFromExisting(Order, key, prefix, year) {
  const existing = await Counter.findById(key).lean();
  if (existing) return;

  const last = await Order.findOne({ orderNumber: { $regex: `^${prefix}-${year}-` } })
    .sort({ orderNumber: -1 })
    .select("orderNumber")
    .lean();

  const start = last ? parseInt(String(last.orderNumber).split("-").pop(), 10) || 0 : 0;
  await Counter.updateOne({ _id: key }, { $setOnInsert: { seq: start } }, { upsert: true });
}

/** The next number in sequence, e.g. ORV-2026-00042. */
export async function nextOrderNumber(Order, prefix = "ELY") {
  const year = new Date().getFullYear();
  const key = `order:${prefix}:${year}`;

  await seedFromExisting(Order, key, prefix, year);

  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `${prefix}-${year}-${String(doc.seq).padStart(5, "0")}`;
}

/**
 * Create an order, retrying if the allocated number is somehow already taken.
 * `build(orderNumber)` returns the document to insert.
 */
export async function createOrderWithNumber(Order, prefix, build) {
  let lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNumber = await nextOrderNumber(Order, prefix);
    try {
      return await Order.create(build(orderNumber));
    } catch (err) {
      // 11000 = duplicate key. Anything else is a real failure worth surfacing.
      if (err?.code !== 11000) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

export default Counter;
