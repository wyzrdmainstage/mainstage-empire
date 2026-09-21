import { advanceTiebreaks } from "@/src/tiebreaks";
import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireRole } from "@/src/auth/require-user";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getCompetitionId(id: string) {
  const competitionId = Number(id);

  if (!Number.isInteger(competitionId) || competitionId <= 0) {
    return null;
  }

  return competitionId;
}

async function calculateResults(competitionId: number) {
  const performers =
    await db.orm.public.Performer.where({
      competitionId,
    }).all();

  const assignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  /*
   * Judges excluded from results retain their scorecards
   * in the database, but their scores do not contribute
   * to official result calculations.
   */
  const eligibleAssignments =
    assignments.filter(
      (assignment) =>
        !assignment.excludedFromResults
    );

  const results = await Promise.all(
    performers.filter((performer) => !performer.excludedFromResults).map(async (performer) => {
      const scorecards = await Promise.all(
        eligibleAssignments.map((assignment) =>
          db.orm.public.Scorecard.first({
            performerId: performer.id,
            judgeAssignmentId: assignment.id,
          })
        )
      );

      const submitted = scorecards.filter(
        (scorecard) =>
          scorecard?.status === "SUBMITTED"
      );

      const totals = submitted.map(
        (scorecard) =>
          (scorecard?.presentation ?? 0) +
          (scorecard?.vocals ?? 0) +
          (scorecard?.lyrics ?? 0) +
          (scorecard?.energy ?? 0) +
          (scorecard?.quality ?? 0) +
          (scorecard?.starFactor ?? 0)
      );

      const finalScore =
        totals.length > 0
          ? totals.reduce(
              (sum, total) => sum + total,
              0
            ) / totals.length
          : 0;

      return {
        performerId: performer.id,
        finalScore,
      };
    })
  );

  results.sort(
    (a, b) => b.finalScore - a.finalScore
  );

  return results;
}

async function createNextTiebreak(competitionId: number) {
  return advanceTiebreaks(competitionId, await calculateResults(competitionId));
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  const user = await requireRole([
    "ADMIN",
    "ORGANIZER",
  ]);

  const { id } = await params;
  const competitionId =
    getCompetitionId(id);

  if (!competitionId) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

  const body =
    await request.json().catch(
      () => null
    );

  const requestedStatus =
    body?.status;

  const allowedStatuses = [
    "DRAFT",
    "READY",
    "LIVE",
    "JUDGING_COMPLETE",
    "FINALIZED",
    "CANCELED",
    "ARCHIVED",
  ] as const;

  if (
    !allowedStatuses.includes(
      requestedStatus
    )
  ) {
    return NextResponse.json(
      { error: "Invalid competition status." },
      { status: 400 }
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

  /*
   * Cancellation is permanent through the normal UI.
   * Once canceled, the only allowed lifecycle change
   * is CANCELED -> ARCHIVED.
   */
  const transitions: Record<
    string,
    string[]
  > = {
    DRAFT: [
      "READY",
      "CANCELED",
    ],
    READY: [
      "DRAFT",
      "LIVE",
      "CANCELED",
    ],
    LIVE: [
      "JUDGING_COMPLETE",
      "CANCELED",
    ],
    JUDGING_COMPLETE: [
      "LIVE",
      "FINALIZED",
      "CANCELED",
    ],
    FINALIZED: [
      "ARCHIVED",
      "CANCELED",
    ],
    CANCELED: [
      "ARCHIVED",
    ],
    ARCHIVED: [],
  };

  if (
    !transitions[
      competition.status
    ]?.includes(requestedStatus)
  ) {
    return NextResponse.json(
      {
        error: `Cannot change competition from ${competition.status} to ${requestedStatus}.`,
      },
      { status: 409 }
    );
  }

  /*
   * Reopening judging is only safe before tiebreak activity begins.
   *
   * Existing scorecards are intentionally retained. Excluded judges also
   * remain excluded. Once a tiebreak exists, reopening could make its
   * participants, votes, or resolved placement stale.
   */
  if (
    competition.status === "JUDGING_COMPLETE" &&
    requestedStatus === "LIVE"
  ) {
    const existingTiebreaks =
      await db.orm.public.Tiebreak.where({
        competitionId,
      }).all();

    if (existingTiebreaks.length > 0) {
      return NextResponse.json(
        {
          error:
            "Judging cannot be reopened after tiebreak activity has started.",
        },
        { status: 409 }
      );
    }
  }

  /*
   * Cancellation requires an explicit reason.
   * This is intentionally enforced server-side so the
   * requirement cannot be bypassed by the UI.
   */
  if (requestedStatus === "CANCELED") {
    const cancellationReason =
      typeof body?.cancellationReason ===
      "string"
        ? body.cancellationReason.trim()
        : "";

    if (cancellationReason.length < 10) {
      return NextResponse.json(
        {
          error:
            "A cancellation reason of at least 10 characters is required.",
        },
        { status: 400 }
      );
    }

    const updated =
      await db.orm.public.Competition.where({
        id: competitionId,
      }).update({
        status: "CANCELED",
        canceledAt:
          new Date().toISOString(),
        canceledBy: user.id,
        cancellationReason,
        updatedAt:
          new Date().toISOString(),
      });

    if (!updated) {
      return NextResponse.json(
        {
          error:
            "Competition could not be canceled.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      competition: updated,
    });
  }

  /*
   * A canceled competition can only be archived.
   * No judging, performer, supporter, judge assignment,
   * or tiebreak activity should be possible after this point.
   */
  const performers =
    await db.orm.public.Performer.where({
      competitionId,
    }).all();

  const judges =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  /*
   * Judges excluded from results remain assigned and their
   * data remains intact, but they are not considered active
   * judges for competition requirements.
   */
  const activeJudges =
    judges.filter(
      (judge) =>
        !judge.excludedFromResults
    );

  if (
    requestedStatus === "READY" ||
    requestedStatus === "LIVE"
  ) {
    if (performers.length === 0) {
      return NextResponse.json(
        {
          error:
            "Competition must have at least one performer.",
        },
        { status: 400 }
      );
    }

    if (judges.length === 0) {
      return NextResponse.json(
        {
          error:
            "Competition must have at least one judge.",
        },
        { status: 400 }
      );
    }
  }

  if (
    requestedStatus ===
    "JUDGING_COMPLETE"
  ) {
    /*
     * At least one judge must remain active.
     *
     * If every judge has been excluded from results,
     * the competition cannot be considered complete.
     */
    if (activeJudges.length === 0) {
      return NextResponse.json(
        {
          error:
            "Judging cannot be completed because all judges are excluded from results. Restore at least one judge before completing judging.",
        },
        { status: 400 }
      );
    }

    /*
     * Only active judges count toward judging completion.
     */
    const expected =
      performers.length *
      activeJudges.length;

    const scorecards =
      await Promise.all(
        performers.flatMap(
          (performer) =>
            activeJudges.map(
              (judge) =>
                db.orm.public.Scorecard.first(
                  {
                    performerId:
                      performer.id,
                    judgeAssignmentId:
                      judge.id,
                  }
                )
            )
        )
      );

    const submitted =
      scorecards.filter(
        (scorecard) =>
          scorecard?.status ===
          "SUBMITTED"
      ).length;

    if (
      submitted !== expected
    ) {
      return NextResponse.json(
        {
          error: `Judging is not complete. ${submitted} of ${expected} scorecards have been submitted.`,
        },
        { status: 400 }
      );
    }
  }

  if (
    requestedStatus === "FINALIZED"
  ) {
    if (performers.length === 0) {
      return NextResponse.json(
        {
          error:
            "Competition must have at least one performer.",
        },
        { status: 400 }
      );
    }

    /*
     * Make sure at least one judge is still contributing
     * to the official results before finalization.
     */
    if (activeJudges.length === 0) {
      return NextResponse.json(
        {
          error:
            "Competition cannot be finalized because all judges are excluded from results. Restore at least one judge before finalizing.",
        },
        { status: 400 }
      );
    }

    const tiebreak =
      await createNextTiebreak(
        competitionId
      );

    if (tiebreak) {
      return NextResponse.json(
        {
          error:
            "A tiebreak must be resolved before results can be finalized.",
          tiebreakId: tiebreak.id,
          placement:
            tiebreak.placement,
          status:
            tiebreak.status,
        },
        { status: 409 }
      );
    }
  }

  const updated =
    await db.orm.public.Competition.where({
      id: competitionId,
    }).update({
      status: requestedStatus,
      updatedAt:
        new Date().toISOString(),
    });

  if (!updated) {
    return NextResponse.json(
      {
        error:
          "Competition could not be updated.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    competition: updated,
  });
}