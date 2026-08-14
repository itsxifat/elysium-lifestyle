// Allocate SKUs for products that don't have them.
//
// Stock sync addresses variants by SKU, so this is a prerequisite for the
// catalogue migrate and for the /api/ncom-webhook receiver. Reuses the
// Settings-driven scheme from /admin/settings, and deliberately leaves slugs
// alone (see lib/ncom-sync.js).
//
// DRY RUN BY DEFAULT — pass --live to write.
//
//   node scripts/ncom-backfill-skus.mjs                      # preview
//   node scripts/ncom-backfill-skus.mjs --live
//   node scripts/ncom-backfill-skus.mjs --live --enable-scheme
//
// The same thing with a button: /admin/ncom
//
import { connect, finish } from "./_ncom-cli.mjs";
import { backfillSkus } from "../lib/ncom-sync.js";

await connect();

const dryRun = !process.argv.includes("--live");
const enableScheme = process.argv.includes("--enable-scheme");

console.log(`\n=== ncom SKU backfill (${dryRun ? "DRY RUN" : "LIVE"}) ===\n`);

await finish(await backfillSkus({ dryRun, enableScheme }));
