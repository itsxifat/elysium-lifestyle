import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { connectDB } from "@/lib/mongoose";
import { mergeCustomers } from "@/lib/customer-link";

// Fold duplicate customer records into one. Every order moves to the target,
// contact details and address fill any gap on it, and the emptied records are
// deleted — so nothing is orphaned and no history is lost.
//
// A record that can SIGN IN is never absorbed: merging it would destroy a
// password someone uses. Those come back in `skipped` and must be the target.
export async function POST(request) {
  const { error, session } = await requireAdmin("users.manage");
  if (error) return error;

  const { targetId, sourceIds } = await request.json();

  if (!targetId || !Array.isArray(sourceIds) || sourceIds.length === 0)
    return NextResponse.json({ error: "Pick a record to keep and at least one to merge into it" }, { status: 400 });

  if (sourceIds.some((id) => String(id) === String(session.user.id)))
    return NextResponse.json({ error: "You cannot merge away your own account" }, { status: 400 });

  await connectDB();

  try {
    const result = await mergeCustomers(targetId, sourceIds);
    return NextResponse.json({
      success: true,
      ordersMoved: result.moved,
      recordsDeleted: result.deleted,
      skipped: result.skipped,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Merge failed" }, { status: 400 });
  }
}
