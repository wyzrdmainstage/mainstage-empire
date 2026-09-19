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

  const results = await Promise.all(
    performers.map(async (performer) => {
      const scorecards = await Promise.all(
        assignments.map((assignment) =>
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

async function createNextTiebreak(
  competitionId: number
) {
  const results =
    await calculateResults(competitionId);

  const tiebreaks =
    await db.orm.public.Tiebreak.where({
      competitionId,
    }).all();

  const unresolved =
    tiebreaks.find(
      (tiebreak) =>
        tiebreak.status !== "RESOLVED"
    );

  if (unresolved) {
    return unresolved;
  }

  const resolved =
    tiebreaks.filter(
      (tiebreak) =>
        tiebreak.status === "RESOLVED"
    );

  const resolvedWinners = new Set(
    resolved
      .map(
        (tiebreak) =>
          tiebreak.winnerPerformerId
      )
      .filter(
        (id): id is number =>
          id !== null
      )
  );

  /*
   * Walk the score ranking from the top.
   *
   * A resolved tiebreak winner occupies the placement
   * recorded on that tiebreak.
   */
  let placement = 1;

  for (let index = 0; index < results.length; ) {
    const current = results[index];

    /*
     * A performer who already won a tiebreak has already
     * been assigned a placement.
     */
    if (
      resolvedWinners.has(
        current.performerId
      )
    ) {
      const resolvedWinner =
        resolved.find(
          (tiebreak) =>
            tiebreak.winnerPerformerId ===
            current.performerId
        );

      if (resolvedWinner) {
        placement =
          resolvedWinner.placement + 1;
      }

      index++;
      continue;
    }

    const score = current.finalScore;

    const group = results.filter(
      (result) =>
        result.finalScore === score &&
        !resolvedWinners.has(
          result.performerId
        )
    );

    /*
     * Multiple performers with the same score require
     * a tiebreak for this placement.
     */
    if (group.length > 1) {
      const existing =
        resolved.find(
          (tiebreak) =>
            tiebreak.placement ===
              placement &&
            tiebreak.status !== "RESOLVED"
        );

      if (existing) {
        return existing;
      }

      const tiebreak =
        await db.orm.public.Tiebreak.create({
          competitionId,
          placement,
          status: "JUDGES_VOTING",
          createdAt:
            new Date().toISOString(),
          updatedAt:
            new Date().toISOString(),
        });

      for (const result of group) {
        await db.orm.public.TiebreakPerformer.create({
          tiebreakId: tiebreak.id,
          performerId:
            result.performerId,
        });
      }

      return tiebreak;
    }

    /*
     * A single performer occupies this placement.
     */
    placement++;
    index++;
  }

  return null;
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
    const expected =
      performers.length *
      judges.length;

    const scorecards =
      await Promise.all(
        performers.flatMap(
          (performer) =>
            judges.map(
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