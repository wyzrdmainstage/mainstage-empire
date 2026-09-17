import { NextResponse } from "next/server";
import { sendTestEmail } from "@/src/email/mail";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    await sendTestEmail(email);

    return NextResponse.json({
      success: true,
      message: "Test email sent.",
    });
  } catch (error) {
    console.error("Test email error:", error);

    return NextResponse.json(
      { error: "Unable to send test email." },
      { status: 500 }
    );
  }
}