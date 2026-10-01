import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { LOGIN_LINK_MESSAGE, reserveLoginToken } from "@/src/login-token";
import { sendLoginEmail } from "@/src/email/mail";
import { normalizeEmail } from "@/src/utils/email";

export async function POST(request: Request) {

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    const email = body && typeof body === "object" && "email" in body
      ? body.email : undefined;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

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
        message: LOGIN_LINK_MESSAGE,
      });
    }

    const tokenRecord = await reserveLoginToken(user.id);
    if (!tokenRecord) {
      return NextResponse.json({ success: true, message: LOGIN_LINK_MESSAGE });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const loginUrl = `${baseUrl}/login?token=${encodeURIComponent(tokenRecord.token)}`;

    try {
      await sendLoginEmail(
        normalizedEmail,
        loginUrl
      );

      console.log("Login email accepted by email provider.");
    } catch (emailError) {
      console.error("LOGIN EMAIL SEND ERROR:", emailError);

      await db.orm.public.AuthToken
        .where({ id: tokenRecord.id })
        .delete();

      throw emailError;
    }

    return NextResponse.json({
      success: true,
      message: LOGIN_LINK_MESSAGE,
    });
  } catch (error) {
    console.error("Login request error:", error);

    return NextResponse.json(
      { error: "Unable to process login request." },
      { status: 500 }
    );
  }
}
