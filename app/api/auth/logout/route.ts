import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/src/prisma/db";
import {
  hashToken,
  SESSION_COOKIE,
} from "@/src/auth";

export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    const tokenHash = hashToken(sessionToken);

    await db.orm.public.Session.where({
      tokenHash,
    }).delete();
  }

  const response = NextResponse.json({
    success: true,
  });

  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
