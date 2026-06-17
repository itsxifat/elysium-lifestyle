import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth";
import { setPin } from "@/lib/pin";

// Create (force) or change the current member's 6-digit PIN.
// Body: { pin, currentPin? }. currentPin is required only when one already exists.
export async function POST(request) {
  const { error, session } = await requireStaff();
  if (error) return error;

  try {
    const { pin, currentPin } = await request.json();
    const result = await setPin(session.user.id, pin, currentPin);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to set PIN" }, { status: 500 });
  }
}
