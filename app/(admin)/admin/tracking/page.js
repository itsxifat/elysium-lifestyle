// Protected by the (admin) layout, which already enforces an admin session
// server-side (getServerSession + role check + redirect).
import TrackingClient from "@/components/admin/tracking/TrackingClient";

export const metadata = { title: "Tracking" };
export const dynamic = "force-dynamic";

export default function TrackingPage() {
  return <TrackingClient />;
}
