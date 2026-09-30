import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUserFromSessionToken, SESSION_COOKIE } from "@/src/auth";
import { db } from "@/src/prisma/db";
import { getJudgingProgress } from "@/src/judging-progress";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const user = token ? await getUserFromSessionToken(token) : null;
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401, headers });
    if (!user.roles.some((role) => role === "ADMIN" || role === "ORGANIZER")) {
      return NextResponse.json({ error: "Organizer access required." }, { status: 403, headers });
    }
    const { id } = await params;
    const competitionId = Number(id);
    if (!Number.isSafeInteger(competitionId) || competitionId < 1) {
      return NextResponse.json({ error: "Invalid competition." }, { status: 400, headers });
    }
    if (!await db.orm.public.Competition.first({ id: competitionId })) {
      return NextResponse.json({ error: "Competition not found." }, { status: 404, headers });
    }
    return NextResponse.json(await getJudgingProgress(competitionId), { headers });
  } catch (error) {
    console.error("Judging progress error:", error);
    return NextResponse.json({ error: "Progress is temporarily unavailable." }, { status: 500, headers });
  }
}
