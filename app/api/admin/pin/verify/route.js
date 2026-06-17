import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { requirePin } from "@/lib/pin";

// Standalone PIN check (brute-force protected) for "unlock" flows where the
// client wants to confirm the PIN before opening an editor. Critical mutations
// still re-verify server-side via requirePin() in their own routes.
export async function POST(request) {
  const { error, session } = await requireStaff();
  if (error) return error;

  try {
    const { pin } = await request.json();
    const pinError = await requirePin(session, pin, request);
    if (pinError) return pinError;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to verify PIN" }, { status: 500 });
  }
}
