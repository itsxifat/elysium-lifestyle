import { configureRoutes } from "@enfinito/demo-kit/routes";
import demoConfig from "@/demo.config";

// Wires the kit's handlers to this site's config once, so each route file is a
// plain re-export. The teardown hook is where side effects that outlive a
// dropped database get cleaned up — CDN objects above all.
export const { claimHandler, statusHandler, endHandler, reapHandler } = configureRoutes(demoConfig, {
  onTeardown: async ({ sid }) => {
    // TODO(firewall phase): purge the demo/<sid>/ CDN prefix. Until uploads are
    // routed there by the storage stub there is nothing to purge, but leaving
    // this unimplemented once uploads are live means a permanent storage leak.
    void sid;
  },
});
