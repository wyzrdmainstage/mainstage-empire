import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getUserFromSessionToken,
  SESSION_COOKIE,
} from "@/src/auth";
import { db } from "@/src/prisma/db";

const scoreFields = [
  "presentation",
  "vocals",
  "lyrics",
  "energy",
  "quality",
  "starFactor",
] as const;

type ScoreField = (typeof scoreFields)[number];

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 }
      );
    }

    const user = await getUserFromSessionToken(sessionToken);

    if (!user) {
      return NextResponse.json(
        { error: "Your session has expired." },
        { status: 401 }
      );
    }

    if (!user.roles.includes("JUDGE")) {
      return NextResponse.json(
        { error: "Only judges can submit scorecards." },
        { status: 403 }
      );
    }

    const body = await request.json();

    const competitionId = Number(body.competitionId);
    const performerId = Number(body.performerId);

    if (
      !Number.isInteger(competitionId) ||
      !Number.isInteger(performerId)
    ) {
      return NextResponse.json(
        { error: "Invalid competition or performer." },
        { status: 400 }
      );
    }

    const scores: Record<ScoreField, number> = {
      presentation: Number(body.presentation),
      vocals: Number(body.vocals),
      lyrics: Number(body.lyrics),
      energy: Number(body.energy),
      quality: Number(body.quality),
      starFactor: Number(body.starFactor),
    };

    for (const field of scoreFields) {
      const score = scores[field];

      if (
        !Number.isInteger(score) ||
        score < 1 ||
        score > 10
      ) {
        return NextResponse.json(
          {
            error: `${field} must be a whole number from 1 to 10.`,
          },
          { status: 400 }
        );
      }
    }

    const notes =
      typeof body.notes === "string"
        ? body.notes.trim()
        : null;

    const assignment =
      await db.orm.public.CompetitionJudge.first({
        competitionId,
        judgeId: user.id,
      });

    if (!assignment) {
      return NextResponse.json(
        {
          error:
            "You are not assigned to judge this competition.",
        },
        { status: 403 }
      );
    }

    // Excluded judges retain their existing scorecards,
    // but cannot submit or modify scores while excluded.
    if (assignment.excludedFromResults) {
      return NextResponse.json(
        {
          error:
            "You have been excluded from this competition's results and cannot submit scorecards.",
        },
        { status: 403 }
      );
    }

    const competition =
      await db.orm.public.Competition.first({
        id: competitionId,
      });

    if (!competition) {
      return NextResponse.json(
        { error: "Competition not found." },
        { status: 404 }
      );
    }

    const performer =
      await db.orm.public.Performer.first({
        id: performerId,
        competitionId,
      });

    if (!performer) {
      return NextResponse.json(
        { error: "Performer not found." },
        { status: 404 }
      );
    }

    const existingScorecard =
      await db.orm.public.Scorecard.first({
        performerId,
        judgeAssignmentId: assignment.id,
      });

    function submissionReceipt(card: typeof existingScorecard) {
      if (card?.status !== "SUBMITTED") return null;
      if (scoreFields.every((field) => card[field] === scores[field]) &&
          (card.notes ?? "").trim() === (notes ?? "")) {
        return NextResponse.json({ success: true, message: "Scorecard submission confirmed." });
      }
      return NextResponse.json(
        {
          error:
            "This scorecard has already been submitted and is locked.",
        },
        { status: 409 }
      );
    }

    // A lost response can be retried even after judging closes. Never change
    // an already submitted card, and only acknowledge matching contents.
    const receipt = submissionReceipt(existingScorecard);
    if (receipt) return receipt;

    if (competition.status !== "LIVE") {
      return NextResponse.json(
        { error: "Scorecards can only be submitted while the competition is live." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const submission = {
      ...scores,
      notes,
      status: "SUBMITTED" as const,
      submittedAt: now,
      updatedAt: now,
    };

    try {
      if (existingScorecard) {
        const updated = await db.orm.public.Scorecard
          .where({ id: existingScorecard.id, status: "DRAFT" })
          .update(submission);
        if (!updated) {
          const current = await db.orm.public.Scorecard.first({ performerId, judgeAssignmentId: assignment.id });
          return submissionReceipt(current) ?? NextResponse.json(
            { error: "This scorecard changed. Refresh the page before submitting." }, { status: 409 }
          );
        }
      } else {
        await db.orm.public.Scorecard.create({
          performerId,
          judgeAssignmentId: assignment.id,
          ...submission,
        });
      }
    } catch (writeError) {
      // The unique performer/assignment constraint decides concurrent creates.
      // Re-read after a competing request (or an uncertain write response).
      const current = await db.orm.public.Scorecard.first({ performerId, judgeAssignmentId: assignment.id });
      const receipt = submissionReceipt(current);
      if (receipt) return receipt;
      throw writeError;
    }

    return NextResponse.json({
      success: true,
      message: "Scorecard submitted successfully.",
    });
  } catch (error) {
    console.error("Scorecard submission error:", error);

    return NextResponse.json(
      { error: "Unable to submit scorecard." },
      { status: 500 }
    );
  }
}
