export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAdmin } from "@/lib/auth";
import { connectionStatus } from "@/lib/ncom";

// Connectivity check for the OUTBOUND REST key — hits GET /me and reports the
// workspace, the key's permissions, and anything that would silently produce
// wrong results later (a workspace currency that is not BDT, missing scopes,
// or catalogue-write scopes nothing needs any more).
//
// This says nothing about whether ncom can read our catalogue; that is the
// self-test at /api/admin/ncom/selftest.
export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  return NextResponse.json(await connectionStatus());
}
