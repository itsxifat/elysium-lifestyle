import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

export async function POST(request) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  try {
    const { to } = await request.json();
    const email = to || session.user.email;

    const result = await sendEmail({
      to: email,
      subject: "Test Email — Elysium Lifestyle",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;background:#F5F0E8;">
          <h2 style="color:#2C1810;">Test Email</h2>
          <p style="color:#8B7355;">Your email settings are working correctly. This is a test email from Elysium Lifestyle admin panel.</p>
          <p style="color:#B85C3A;font-size:12px;margin-top:24px;">Sent at ${new Date().toLocaleString()}</p>
        </div>
      `,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to send email" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Test email sent to ${email}` });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
