import { NextResponse } from "next/server";
import {
  createSession,
  getUserRoles,
  hashToken,
  SESSION_COOKIE,
} from "@/src/auth";
import { db } from "@/src/prisma/db";

export async function POST(request: Request) {
  try {
    const { token } = await request.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { error: "Authentication token is required." },
        { status: 400 }
      );
    }

    const tokenHash = hashToken(token);

    const tokenRecord =
      await db.orm.public.AuthToken.first({
        tokenHash,
      });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Invalid or expired login token." },
        { status: 401 }
      );
    }

    if (tokenRecord.type !== "LOGIN") {
      return NextResponse.json(
        { error: "This token cannot be used for login." },
        { status: 401 }
      );
    }

    if (tokenRecord.usedAt) {
      return NextResponse.json(
        { error: "This login token has already been used." },
        { status: 401 }
      );
    }

    if (
      new Date(tokenRecord.expiresAt) <= new Date()
    ) {
      return NextResponse.json(
        { error: "This login token has expired." },
        { status: 401 }
      );
    }

    const user = await db.orm.public.User.first({
      id: tokenRecord.userId,
    });

    if (!user) {
      return NextResponse.json(
        { error: "User account not found." },
        { status: 401 }
      );
    }

    const claimedToken =
      await db.orm.public.AuthToken
        .where({
          id: tokenRecord.id,
          usedAt: null,
        })
        .update({
          usedAt: new Date().toISOString(),
        });

    if (!claimedToken) {
      return NextResponse.json(
        {
          error:
            "This login token has already been used.",
        },
        { status: 401 }
      );
    }

    const roles = await getUserRoles(user.id);

    const {
      token: sessionToken,
      expiresAt,
    } = await createSession(user.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        roles,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });

    return response;
  } catch (error) {
    console.error(
      "Session creation error:",
      error
    );

    return NextResponse.json(
      { error: "Unable to create session." },
      { status: 500 }
    );
  }
}