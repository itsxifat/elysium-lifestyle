// Every unit of stock this shop sells passes through here.
//
// WHY THIS EXISTS
// Before this module, each route decremented `variants.$.stock` on its own with
// an unguarded `$inc`. Three things followed from that, all of them reproducible:
//
//   * `$inc` does not run schema validators, so `min: 0` never applied and a
//     variant with 2 in stock could be driven to -48 by a single request.
//   * The check ("is there stock?") and the write ("take it") were separate, so
//     ten concurrent buyers all read stock: 1 and all ten were served. Seven
//     orders came out of one unit in a local test.
//   * Nothing gave the units back, so a cancelled order kept its stock held for
//     ever.
//
// HOW IT WORKS
// A reservation is one atomic conditional update per line:
//
//     { _id, variants: { $elemMatch: { size, stock: { $gte: qty } } } }
//     { $inc: { "variants.$.stock": -qty } }
//
// The filter and the write are a single operation on a single document, so the
// stock check cannot be separated from the decrement — whoever loses the race
// simply matches nothing and is told the size is gone.
//
// The database here is a standalone mongod, not a replica set, so multi-document
// transactions are not available. A basket therefore uses the pattern you use
// without them: reserve line by line, and if any line fails, hand back the ones
// already taken. The result is all-or-nothing without holding a lock.
//
// Callers must treat reserve/release as a pair. `Order.stockReserved` records
// whether an order is currently holding its units, so a double-cancel (or a
// cancel after a partial return) can never release twice.

// A single line's worth of movement. `size` identifies the variant within the
// product, exactly as the order item stores it.
const key = (i) => `${String(i.product || i.productId)}|${i.size}`;

/**
 * Take `quantity` units of one variant, but only if that many are actually
 * there. Returns true when the units were taken.
 */
async function takeOne(Product, productId, size, quantity) {
  const res = await Product.updateOne(
    { _id: productId, variants: { $elemMatch: { size, stock: { $gte: quantity } } } },
    { $inc: { "variants.$.stock": -quantity } }
  );
  return res.modifiedCount === 1;
}

/** Hand `quantity` units of one variant back. Always safe to call. */
async function giveBackOne(Product, productId, size, quantity) {
  if (!(quantity > 0)) return;
  await Product.updateOne(
    { _id: productId, "variants.size": size },
    { $inc: { "variants.$.stock": quantity } }
  );
}

/**
 * Reserve a whole basket, all or nothing.
 *
 * `lines` are `{ product, size, quantity, name? }`. Lines for the same variant
 * are summed first, so a basket that lists the same size twice cannot slip two
 * separate checks past a stock of one.
 *
 * Resolves to `{ ok: true }` or `{ ok: false, unavailable: [...] }` where each
 * entry carries what was asked for and what is actually left, so the caller can
 * tell the customer which size ran out rather than failing the whole order with
 * a blank message.
 */
export async function reserveStock(Product, lines) {
  const merged = new Map();
  for (const l of lines || []) {
    const k = key(l);
    const prev = merged.get(k);
    if (prev) prev.quantity += Number(l.quantity) || 0;
    else
      merged.set(k, {
        product: String(l.product || l.productId),
        size: l.size,
        name: l.name || "",
        quantity: Number(l.quantity) || 0,
      });
  }

  const wanted = [...merged.values()].filter((l) => l.quantity > 0);
  const taken = [];

  for (const line of wanted) {
    const ok = await takeOne(Product, line.product, line.size, line.quantity);
    if (ok) {
      taken.push(line);
      continue;
    }

    // Lost the race, or never had the stock. Give back whatever this basket
    // already took before reporting, so a failed attempt leaves no trace.
    for (const t of taken) await giveBackOne(Product, t.product, t.size, t.quantity);

    const doc = await Product.findById(line.product).select("name variants").lean();
    const variant = doc?.variants?.find((v) => v.size === line.size);
    return {
      ok: false,
      unavailable: [
        {
          product: line.product,
          name: line.name || doc?.name || "That product",
          size: line.size,
          requested: line.quantity,
          available: Math.max(0, variant?.stock ?? 0),
        },
      ],
    };
  }

  return { ok: true, reserved: taken };
}

/** Give a basket's units back. Used on cancellation and on rollback. */
export async function releaseStock(Product, lines) {
  for (const l of lines || []) {
    const qty = Number(l.quantity) || 0;
    if (qty > 0) await giveBackOne(Product, String(l.product || l.productId), l.size, qty);
  }
}

/**
 * The units an order is still holding: everything ordered that has not already
 * come back as a return. This is what a cancellation hands over.
 */
export function heldLines(order) {
  return (order.items || [])
    .map((i) => ({
      product: i.product,
      size: i.size,
      name: i.name,
      quantity: Math.max(0, (i.quantity || 0) - (i.returnedQuantity || 0)),
    }))
    .filter((l) => l.product && l.quantity > 0);
}

/**
 * Hand back whatever an order is still holding, exactly once.
 *
 * Every path that kills an order — admin cancel, gateway failure, customer
 * abandoning the payment page — goes through here, so none of them can forget
 * and none of them can double-credit. Mutates `order` but does not save it;
 * the caller is already saving.
 *
 * Returns true if units were actually returned.
 */
export async function releaseIfHeld(Product, order) {
  if (!order?.stockReserved) return false;
  await releaseStock(Product, heldLines(order));
  order.stockReserved = false;
  return true;
}

/**
 * Re-take the units for an order that is coming back to life (a cancellation
 * reversed in the admin panel). Returns the `reserveStock` result so the caller
 * can refuse the un-cancel if the stock has since gone to someone else.
 */
export async function reserveIfNotHeld(Product, order) {
  if (order?.stockReserved) return { ok: true };
  const res = await reserveStock(Product, heldLines(order));
  if (res.ok) order.stockReserved = true;
  return res;
}

/**
 * Move an order's reservation to match a new set of items (an admin edit).
 * Only the difference moves: taking more is checked against real stock, giving
 * some back always succeeds. Returns the same shape as `reserveStock`.
 */
export async function adjustReservation(Product, oldItems, newItems) {
  const tally = (items) => {
    const m = new Map();
    for (const i of items || []) {
      if (!i.product) continue;
      const k = key(i);
      m.set(k, {
        product: String(i.product),
        size: i.size,
        name: i.name || "",
        quantity: (m.get(k)?.quantity || 0) + (Number(i.quantity) || 0),
      });
    }
    return m;
  };

  const before = tally(oldItems);
  const after = tally(newItems);

  const takes = [];
  const gives = [];
  for (const k of new Set([...before.keys(), ...after.keys()])) {
    const b = before.get(k)?.quantity || 0;
    const a = after.get(k)?.quantity || 0;
    const delta = a - b;
    if (delta === 0) continue;
    const meta = after.get(k) || before.get(k);
    const line = { product: meta.product, size: meta.size, name: meta.name, quantity: Math.abs(delta) };
    (delta > 0 ? takes : gives).push(line);
  }

  // Give first: freeing units the edit no longer needs can be exactly what
  // makes room for the ones it does (swapping a size, say).
  await releaseStock(Product, gives);

  const res = await reserveStock(Product, takes);
  if (!res.ok) {
    // reserveStock already undid its own partial takes, so the only thing left
    // to undo is the freeing above — re-take it so a rejected edit changes
    // nothing at all. Best effort: if another order claimed those units in the
    // gap there is nothing to re-take, and the edit is rejected either way.
    for (const g of gives) await takeOne(Product, g.product, g.size, g.quantity);
    return res;
  }

  return { ok: true };
}
