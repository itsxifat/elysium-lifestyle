// Protected by the (admin) layout (server-side admin session check).
import FraudsClient from "@/components/admin/FraudsClient";

export const metadata = { title: "Fraud Accounts" };
export const dynamic = "force-dynamic";

export default function FraudsPage() {
  return <FraudsClient />;
}
