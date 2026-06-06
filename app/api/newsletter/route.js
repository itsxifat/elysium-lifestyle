import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request) {
  try {
    const limited = checkRateLimit(request, "newsletter", { limit: 5, windowMs: 10 * 60 * 1000 });
    if (limited) return limited;

    const { email } = await request.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    // In a production setup, save to a Newsletter model or send to an email service
    // For now, just return success
    console.log("Newsletter subscription:", email);

    return NextResponse.json({ message: "Subscribed successfully" });
  } catch {
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
