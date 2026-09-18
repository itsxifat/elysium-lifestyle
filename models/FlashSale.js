import mongoose from "mongoose";
import { tenantModel } from "@enfinito/demo-kit/model";

// A flash sale campaign: a scheduled, limited-stock promotion with its own page
// at /flash-sale/<slug>. Several campaigns can run at the same time.
//
// Price and allocation are set per SIZE, because stock lives on sizes:
//
//   item.salePrice          the product's sale price; every size on sale uses it
//                           unless that size sets its own
//   item.sizes[].salePrice  the size's own price (null → item.salePrice)
//   item.sizes[].limit      units of that size offered at the sale price
//   item.sizes[].allStock   offer every unit on the shelf instead of a fixed
//                           number — the live stock is then the only cap
//   item.stockLimit         optional cap across all sizes of the product (0 = none)
//
// `sizes[].sold` and `soldCount` grow as orders claim units and shrink when a
// cancelled order hands them back (lib/flashSale.js). The storefront's "X left"
// comes from them, and checkout enforces them — the sale price is never taken
// from the client.
//
// Items saved before per-size pricing existed have no `sizes` array: every size
// of the product is on sale at item.salePrice, sharing item.stockLimit. They
// keep working as they are, and the editor converts them the next time the sale
// is saved (lib/flash-pricing.js → isLegacyItem).

const flashSizeSchema = new mongoose.Schema(
  {
    size: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    salePrice: { type: Number, default: null, min: 0 },
    limit: { type: Number, default: 0, min: 0 },
    allStock: { type: Boolean, default: false },
    sold: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const flashItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    salePrice: { type: Number, required: true, min: 0 },
    // `default: undefined`, not []: an absent array is how a pre-size item is
    // told apart from one whose sizes were all taken off sale.
    sizes: { type: [flashSizeSchema], default: undefined },
    stockLimit: { type: Number, default: 0, min: 0 },
    soldCount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const flashSaleSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Flash Sale", trim: true },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    // The campaign's page, /flash-sale/<slug>. Sales created before campaign
    // pages existed have none and are reachable by id until they are re-saved.
    slug: { type: String, trim: true, lowercase: true, default: undefined },
    bannerImage: { type: String, default: "" },
    enabled: { type: Boolean, default: false },
    showOnHomepage: { type: Boolean, default: true },
    // Higher first wherever several campaigns are listed together.
    priority: { type: Number, default: 0 },
    // Optional schedule — null start means "live now", null end means "no end".
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    items: { type: [flashItemSchema], default: [] },
  },
  { timestamps: true }
);

flashSaleSchema.index({ slug: 1 }, { unique: true, sparse: true });
// The live-campaign lookup every storefront page and checkout makes.
flashSaleSchema.index({ enabled: 1, startsAt: 1, endsAt: 1 });

// Tenant-aware: resolves to the current request's sandbox database in
// demo mode, and to the default connection otherwise. Import sites unchanged.
const FlashSale = tenantModel("FlashSale", flashSaleSchema);
export default FlashSale;
