// Category-tree helpers. Categories are self-referential via `parent`; products
// are organized by the tree (gender is no longer used). Pass a flat array of
// lean category docs (each with _id, parent, slug, name).

const idStr = (v) => (v == null ? "" : v._id ? String(v._id) : String(v));

/** Find a category by id OR slug in a flat list. */
export function findCategory(allCats, slugOrId) {
  if (!slugOrId) return null;
  const key = String(slugOrId);
  return allCats.find((c) => String(c._id) === key || c.slug === key) || null;
}

/**
 * Root category + every descendant id (children, grandchildren, …). Used so a
 * parent category's product listing includes everything nested under it.
 * Returns an array of string ids (always includes the root).
 */
export function getSubtreeIds(allCats, rootId) {
  const root = String(rootId);
  const childrenOf = new Map();
  for (const c of allCats) {
    const p = c.parent ? idStr(c.parent) : "";
    if (!childrenOf.has(p)) childrenOf.set(p, []);
    childrenOf.get(p).push(String(c._id));
  }
  const out = [];
  const stack = [root];
  let guard = 0;
  while (stack.length && guard++ < 10000) {
    const id = stack.pop();
    out.push(id);
    for (const child of childrenOf.get(id) || []) stack.push(child);
  }
  return out;
}

/** Ordered ancestor path root → … → category (inclusive), for breadcrumbs. */
export function getAncestors(allCats, catId) {
  const byId = new Map(allCats.map((c) => [String(c._id), c]));
  const path = [];
  let cur = byId.get(String(catId));
  let guard = 0;
  while (cur && guard++ < 20) {
    path.unshift({ _id: String(cur._id), name: cur.name, slug: cur.slug });
    cur = cur.parent ? byId.get(idStr(cur.parent)) : null;
  }
  return path;
}
