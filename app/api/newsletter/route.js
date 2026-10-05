import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

// The home page's newsletter box. The brand ERP has no newsletter list yet, so
// the address is accepted and not kept (the old site only logged it). An owner
// question: where should sign-ups go? Never log the address itself.
export async function POST(request) {
  try {
    const limited = checkRateLimit(request, "newsletter", { limit: 5, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;
    const { email } = await request.json();
    if (!email || !String(email).includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    return NextResponse.json({ message: "Subscribed successfully" });
  } catch {
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
