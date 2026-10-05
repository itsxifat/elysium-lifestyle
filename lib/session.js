import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** The signed-in shopper (their ERP account id), or null for a guest. */
export async function getShopper() {
  const session = await getServerSession(authOptions);
  const accountId = session?.user?.id;
  if (!accountId || !/^[0-9a-f-]{36}$/i.test(accountId)) return null;
  return { accountId, email: session.user.email || "", name: session.user.name || "" };
}
