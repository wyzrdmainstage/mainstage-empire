import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/src/prisma/db";
import {
  createSession,
  hashToken,
  SESSION_COOKIE,
} from "@/src/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || url.origin;

  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/invite/invalid", appUrl)
    );
  }

  const tokenHash = hashToken(token);

  const authToken = await db.orm.public.AuthToken.first({
    tokenHash,
  });

  if (!authToken) {
    return NextResponse.redirect(
      new URL("/invite/invalid", appUrl)
    );
  }

  if (authToken.type !== "INVITATION") {
    return NextResponse.redirect(
      new URL("/invite/invalid", appUrl)
    );
  }

  if (authToken.usedAt) {
    return NextResponse.redirect(
      new URL("/invite/used", appUrl)
    );
  }

  if (new Date(authToken.expiresAt) <= new Date()) {
    return NextResponse.redirect(
      new URL("/invite/expired", appUrl)
    );
  }

  const user = await db.orm.public.User.first({
    id: authToken.userId,
  });

  if (!user) {
    return NextResponse.redirect(
      new URL("/invite/invalid", appUrl)
    );
  }

  /*
   * A competition parameter means this invitation is being
   * used to enter a specific judging assignment.
   *
   * We validate the actual CompetitionJudge assignment rather
   * than relying on the user's role alone.
   */
  let competitionId: number | null = null;

  const competitionParam =
    url.searchParams.get("competition");

  if (competitionParam !== null) {
    const parsedCompetitionId = Number(
      competitionParam
    );

    if (!Number.isInteger(parsedCompetitionId)) {
      return NextResponse.redirect(
        new URL("/invite/invalid", appUrl)
      );
    }

    const assignment =
      await db.orm.public.CompetitionJudge.first({
        competitionId: parsedCompetitionId,
        judgeId: authToken.userId,
      });

    if (!assignment) {
      return NextResponse.redirect(
        new URL("/invite/invalid", appUrl)
      );
    }

    competitionId = parsedCompetitionId;
  }

  /*
   * Atomically claim the invitation token.
   *
   * This prevents the same invitation from creating multiple
   * sessions if the link is opened more than once at nearly
   * the same time.
   */
  const claimedToken =
    await db.orm.public.AuthToken.where({
      id: authToken.id,
      usedAt: null,
    }).update({
      usedAt: new Date().toISOString(),
    });

  if (!claimedToken) {
    return NextResponse.redirect(
      new URL("/invite/used", appUrl)
    );
  }

  const session = await createSession(authToken.userId);

  const cookieStore = await cookies();

  cookieStore.set({
    name: SESSION_COOKIE,
    value: session.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
    expires: session.expiresAt,
  });

  if (competitionId !== null) {
    return NextResponse.redirect(
      new URL(
        `/dashboard/competitions/${competitionId}`,
        appUrl
      )
    );
  }

  return NextResponse.redirect(
    new URL("/dashboard", appUrl)
  );
}