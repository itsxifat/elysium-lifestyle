import { connectorError } from "@/lib/ncom-connector";

export const dynamic = "force-dynamic";

// Anything under the connector base that is not one of the real endpoints.
//
// Without this, a typo answers with Next's HTML 404 page — and "HTML instead of
// JSON" is, by their own account, the most common first-time mistake when
// wiring a product source. A JSON 404 naming the endpoints turns ten minutes of
// confusion into one line in the response.
function notFound() {
  return connectorError(
    404,
    "not_found",
    "No such connector endpoint. This connector serves: /ping, /products, /products/{id}, /stock, /categories, /reserve, /release."
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
