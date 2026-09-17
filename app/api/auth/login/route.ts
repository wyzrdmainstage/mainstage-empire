import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { generateToken, hashToken } from "@/src/auth";
import { sendLoginEmail } from "@/src/email/mail";

export async function POST(request: Request) {

  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await db.orm.public.User.first({
      email: normalizedEmail,
    });

    /*
     * Do not reveal whether an email address belongs to a Mainstage
     * Score account.
     */
    if (!user) {
      return NextResponse.json({
        success: true,
        message:
          "If that email is authorized, a login link has been sent.",
      });
    }

    const token = generateToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const tokenRecord = await db.orm.public.AuthToken.create({
      userId: user.id,
      type: "LOGIN",
      tokenHash,
      expiresAt: expiresAt.toISOString(),
    });

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const loginUrl = `${baseUrl}/login?token=${encodeURIComponent(token)}`;

    try {
      const emailInfo = await sendLoginEmail(
        normalizedEmail,
        loginUrl
      );

      console.log("LOGIN EMAIL SENT:", {
        messageId: emailInfo.messageId,
        accepted: emailInfo.accepted,
        rejected: emailInfo.rejected,
        response: emailInfo.response,
      });
    } catch (emailError) {
      console.error("LOGIN EMAIL SEND ERROR:", emailError);

      await db.orm.public.AuthToken
        .where({ id: tokenRecord.id })
        .delete();

      throw emailError;
    }

    return NextResponse.json({
      success: true,
      message:
        "If that email is authorized, a login link has been sent.",
    });
  } catch (error) {
    console.error("Login request error:", error);

    return NextResponse.json(
      { error: "Unable to process login request." },
      { status: 500 }
    );
  }
}