import { connectTenant } from "@enfinito/demo-kit/db";
import demoConfig from "@/demo.config";
// Side-effect import: registers every schema with the kit before any sandbox
// connection is resolved. See models/_all.js for why this matters.
import "@/models/_all";

// With DEMO_MODE unset this is the same cached global connection it has always
// been. With it set, it returns the sandbox database for the current request,
// resolved from headers stamped by the middleware.
//
// Every model goes through @enfinito/demo-kit/model, so route handlers are
// unchanged either way. See ~/projects/endb/docs/architecture.md §5.
export async function connectDB() {
  return connectTenant(process.env.MONGODB_URI, demoConfig);
}
