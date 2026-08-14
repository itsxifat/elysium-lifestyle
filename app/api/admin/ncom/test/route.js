export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAdmin } from "@/lib/auth";
import { connectionStatus } from "@/lib/ncom-sync";

// Connectivity check — hits GET /me and reports the workspace, the key's
// permissions, and anything that would silently produce wrong results later
// (workspace currency not BDT, missing write scopes).
export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  return NextResponse.json(await connectionStatus());
}
