// Nightly stock reconcile: push absolute counts from here to ncom.bd.
//
// Day to day the two systems exchange signed deltas, which compose safely under
// concurrency. But deltas drift over months — a dropped webhook, a failed push,
// a manual edit on one side. This is the correction: once a day, when nothing
// is selling, the system that does the physical counting states the truth.
//
// This is the one script worth keeping on cron (the rest is in /admin/ncom):
//   30 3 * * *  cd /var/www/elyle && node scripts/ncom-reconcile.mjs --live >> /var/log/ncom-reconcile.log 2>&1
//
// DRY RUN BY DEFAULT — pass --live to write.
//
import { connect, finish } from "./_ncom-cli.mjs";
import { reconcileStock } from "../lib/ncom-sync.js";

await connect();

const dryRun = !process.argv.includes("--live");

console.log(`\n=== ncom reconcile (${dryRun ? "DRY RUN" : "LIVE"}) — ${new Date().toISOString()} ===\n`);

await finish(await reconcileStock({ dryRun }));
