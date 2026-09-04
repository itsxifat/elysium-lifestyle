import { connectorError } from "@/lib/ncom-connector";
import { CONNECTOR_CONTRACT } from "@/lib/ncom";

export const dynamic = "force-dynamic";

// The base URL itself. Someone pastes it into a browser to check they typed it
// right, so answer the question they are actually asking — is this a connector,
// and which contract — without exposing a single product.
export function GET() {
  return connectorError(
    404,
    "not_found",
    `NCOM product source, contract ${CONNECTOR_CONTRACT}. Append /ping and sign the request.`
  );
}
