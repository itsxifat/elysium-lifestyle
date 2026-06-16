export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { isStaff, isElevated, hasPermission } from "@/lib/permissions";
import { signToken } from "@/lib/scanner-token";
import ConnectClient from "./ConnectClient";

// Bridge between the website's login (Google or email) and the native scanner
// app. The app opens this page in a Chrome Custom Tab; the admin signs in on the
// real site (so Google works exactly as it does on the web), and we mint a
// scanner token and hand it back to the app via the elyscanner:// deep link
// (with a copy-paste code fallback). No Google native SDK / SHA-1 needed.
export default async function ScannerConnectPage() {
  const session = await getServerSession(authOptions);

  // Not signed in → send through the normal login (Google + email live there),
  // then return here.
  if (!session) redirect("/auth/login?callbackUrl=/scanner-connect");

  const u = session.user;
  const allowed = isStaff(u.role) && (isElevated(u.role) || hasPermission(u, "orders.view"));
  if (!allowed) {
    return <ConnectClient error="This account isn't allowed to use the scanner. Ask an admin for the “View orders” permission." name={u.name} />;
  }

  const token = signToken({ uid: u.id });
  return <ConnectClient token={token} name={u.name || ""} role={u.role || ""} />;
}
