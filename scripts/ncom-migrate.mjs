// Push the catalogue to ncom.bd: categories, then products, then opening stock.
//
// Re-runnable. Products match on externalId (our Mongo _id), so a second run
// updates rather than duplicates. Categories remember their remote id on
// Category.ncomId, so a rename here updates there instead of making a copy.
//
// DRY RUN BY DEFAULT — pass --live to write.
//
//   node scripts/ncom-migrate.mjs                 # print what would be sent
//   node scripts/ncom-migrate.mjs --live
//   node scripts/ncom-migrate.mjs --live --skip-stock
//
// Run the SKU backfill first: stock sync keys on SKU, and products without one
// can never be reconciled.
//
// The same thing with a button: /admin/ncom
//
import { connect, finish } from "./_ncom-cli.mjs";

await connect();

// Dynamic: env must be loaded before lib/cdn.js evaluates, or every image is
// dropped unsigned. See _ncom-cli.mjs.
const { migrateCatalogue } = await import("../lib/ncom-sync.js");

const dryRun = !process.argv.includes("--live");

console.log(`\n=== ncom migrate (${dryRun ? "DRY RUN" : "LIVE"}) ===\n`);

await finish(
  await migrateCatalogue({
    dryRun,
    skipStock: process.argv.includes("--skip-stock"),
  })
);
