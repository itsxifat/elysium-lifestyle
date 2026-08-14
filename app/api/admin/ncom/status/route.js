export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongoose";
import { requireAdmin } from "@/lib/auth";
import { syncStatus } from "@/lib/ncom-sync";

// Local vs remote counts, so the panel can show what still needs doing without
// running anything.
export async function GET() {
  const { error } = await requireAdmin("settings.manage");
  if (error) return error;

  await connectDB();
  return NextResponse.json(await syncStatus());
}
