#!/usr/bin/env node
// Fill in missing product base codes and variant SKUs, using the SKU scheme
// configured in Settings. Also available at /admin/ncom → "Generate SKUs".
//
//   node scripts/backfill-skus.mjs              # preview, writes nothing
//   node scripts/backfill-skus.mjs --live       # write
//   node scripts/backfill-skus.mjs --live --enable-scheme
//
// See scripts/_cli.mjs for why the library is imported dynamically.
import { connect, finish } from "./_cli.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--live");

await connect();
const { backfillSkus } = await import("../lib/sku-backfill.js");

if (dryRun) console.log("— preview only, nothing will be written (pass --live to write) —\n");

await finish(await backfillSkus({ dryRun, enableScheme: args.has("--enable-scheme") }));
