import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireUser } from "@/src/auth/require-user";

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

async function getActiveTiebreak(competitionId: number) {
  const tiebreaks =
    await db.orm.public.Tiebreak.where({
      competitionId,
    }).all();

  return (
    tiebreaks.find(
      (tiebreak) => tiebreak.status !== "RESOLVED"
    ) ?? null
  );
}

async function getTiebreakPerformers(tiebreakId: number) {
  const entries =
    await db.orm.public.TiebreakPerformer.where({
      tiebreakId,
    }).all();

  return Promise.all(
    entries.map(async (entry) => {
      const performer =
        await db.orm.public.Performer.first({
          id: entry.performerId,
        });

      return {
        id: entry.performerId,
        artistName: performer?.artistName ?? "Unknown Performer",
        performanceOrder: performer?.performanceOrder ?? 0,
      };
    })
  );
}

async function getFinalScores(competitionId: number) {
  const performers =
    await db.orm.public.Performer.where({
      competitionId,
    }).all();

  const assignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const activeAssignments =
    assignments.filter(
      (assignment) =>
        !assignment.excludedFromResults
    );

  return Promise.all(
    performers.map(async (performer) => {
      const scorecards = await Promise.all(
        activeAssignments.map((assignment) =>
          db.orm.public.Scorecard.first({
            performerId: performer.id,
            judgeAssignmentId: assignment.id,
          })
        )
      );

      const submitted = scorecards.filter(
        (scorecard) =>
          scorecard &&
          scorecard.status === "SUBMITTED"
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
}

async function createNextTiebreak(
  competitionId: number
) {
  const scores =
    await getFinalScores(competitionId);

  scores.sort(
    (a, b) => b.finalScore - a.finalScore
  );

  const tiebreaks =
    await db.orm.public.Tiebreak.where({
      competitionId,
    }).all();

  const resolvedTiebreaks = tiebreaks
    .filter(
      (tiebreak) =>
        tiebreak.status === "RESOLVED"
    )
    .sort(
      (a, b) => a.placement - b.placement
    );

  const resolvedWinners = new Set(
    resolvedTiebreaks
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
   * Build the current ranking while respecting
   * already-resolved tiebreak decisions.
   */
  const orderedScores = scores.filter(
    (score) =>
      !resolvedWinners.has(
        score.performerId
      )
  );

  let placement =
    resolvedWinners.size + 1;

  let index = 0;

  while (index < orderedScores.length) {
    const score =
      orderedScores[index].finalScore;

    const group = orderedScores.filter(
      (entry) =>
        entry.finalScore === score
    );

    if (group.length > 1) {
      const existing =
        tiebreaks.find(
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

      for (const entry of group) {
        await db.orm.public.TiebreakPerformer.create(
          {
            tiebreakId: tiebreak.id,
            performerId: entry.performerId,
          }
        );
      }

      return tiebreak;
    }

    placement += group.length;
    index += group.length;
  }

  return null;
}

export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  const user = await requireUser();
  const { id } = await params;

  const competitionId =
    getCompetitionId(id);

  if (!competitionId) {
    return NextResponse.json(
      {
        error: "Invalid competition ID.",
      },
      { status: 400 }
    );
  }

  const competition =
    await db.orm.public.Competition.first({
      id: competitionId,
    });

  if (!competition) {
    return NextResponse.json(
      {
        error: "Competition not found.",
      },
      { status: 404 }
    );
  }

  const isAdmin =
    user.roles.includes("ADMIN");

  const isOrganizer =
    user.roles.includes("ORGANIZER");

  const judgeAssignment =
    await db.orm.public.CompetitionJudge.first(
      {
        competitionId,
        judgeId: user.id,
      }
    );

  const isAssignedJudge =
    Boolean(judgeAssignment);

  /*
   * ADMIN and ORGANIZER users have global competition
   * access. JUDGES must actually be assigned to this
   * competition.
   */
  if (
    !isAdmin &&
    !isOrganizer &&
    !isAssignedJudge
  ) {
    return NextResponse.json(
      {
        error:
          "You are not assigned to this competition.",
      },
      { status: 403 }
    );
  }

  let tiebreak =
    await getActiveTiebreak(
      competitionId
    );

  /*
   * If there is no active tiebreak, determine whether
   * another score tie needs to be resolved.
   */
  if (!tiebreak) {
    tiebreak =
      await createNextTiebreak(
        competitionId
      );
  }

  if (!tiebreak) {
    return NextResponse.json({
      tiebreak: null,
    });
  }

  const performers =
    await getTiebreakPerformers(
      tiebreak.id
    );

  const votes =
    await db.orm.public.TiebreakVote.where(
      {
        tiebreakId: tiebreak.id,
      }
    ).all();

  const allJudgeAssignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const activeJudgeIds =
    new Set(
      allJudgeAssignments
        .filter(
          (assignment) =>
            !assignment.excludedFromResults
        )
        .map(
          (assignment) =>
            assignment.judgeId
        )
    );

  const activeVotes =
    votes.filter((vote) => {
      if (vote.voterType !== "JUDGE") {
        return true;
      }

      return activeJudgeIds.has(
        vote.userId
      );
    });

  const voteTotals = performers.map(
    (performer) => ({
      performerId: performer.id,
      votes: activeVotes.filter(
        (vote) =>
          vote.performerId ===
          performer.id
      ).length,
    })
  );

  const currentVoterType =
    tiebreak.status === "JUDGES_VOTING"
      ? "JUDGE"
      : tiebreak.status === "ORGANIZER_VOTING"
        ? "ORGANIZER"
        : null;

  // Only expose participation, never a judge's ballot selection.
  const judgeVotingStatus =
    (isAdmin || isOrganizer) && tiebreak.status === "JUDGES_VOTING"
      ? await (async () => {
          const votedJudgeIds = new Set(
            activeVotes
              .filter((vote) => vote.voterType === "JUDGE")
              .map((vote) => vote.userId)
          );
          const judges = await Promise.all(
            [...activeJudgeIds].map(async (judgeId) => {
              const judge = await db.orm.public.User.first({ id: judgeId });

              return {
                id: judgeId,
                name: judge?.name ?? "Unknown Judge",
                hasVoted: votedJudgeIds.has(judgeId),
              };
            })
          );
          judges.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);

          return {
            judges,
            votedCount: judges.filter((judge) => judge.hasVoted).length,
            eligibleCount: judges.length,
          };
        })()
      : undefined;

  return NextResponse.json({
    tiebreak: {
      id: tiebreak.id,
      placement: tiebreak.placement,
      status: tiebreak.status,
      winnerPerformerId:
        tiebreak.winnerPerformerId,
      performers,
      ...(judgeVotingStatus ? { judgeVotingStatus } : {}),
      hasVoted:
        currentVoterType !== null &&
        activeVotes.some(
          (vote) =>
            vote.userId === user.id &&
            vote.voterType === currentVoterType
        ),
      voteCount: activeVotes.filter(
        (vote) =>
          vote.voterType === currentVoterType
      ).length,

      /*
       * Judges never see vote totals.
       * ADMIN and ORGANIZER users can see totals
       * when they need to make the final decision.
       */
      voteTotals:
        (isAdmin || isOrganizer) && tiebreak.status === "ORGANIZER_VOTING"
          ? voteTotals
          : [],
    },
  });
}

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  const user = await requireUser();
  const { id } = await params;

  const competitionId =
    getCompetitionId(id);

  if (!competitionId) {
    return NextResponse.json(
      {
        error: "Invalid competition ID.",
      },
      { status: 400 }
    );
  }

  const body =
    await request.json().catch(
      () => null
    );

  const performerId =
    Number(body?.performerId);

  if (
    !Number.isInteger(
      performerId
    ) ||
    performerId <= 0
  ) {
    return NextResponse.json(
      {
        error:
          "A valid performer ID is required.",
      },
      { status: 400 }
    );
  }

  const competition =
    await db.orm.public.Competition.first({
      id: competitionId,
    });

  if (!competition) {
    return NextResponse.json(
      {
        error: "Competition not found.",
      },
      { status: 404 }
    );
  }

  const isAdmin =
    user.roles.includes("ADMIN");

  const isOrganizer =
    user.roles.includes("ORGANIZER");

  const judgeAssignment =
    await db.orm.public.CompetitionJudge.first(
      {
        competitionId,
        judgeId: user.id,
      }
    );

  const isAssignedJudge =
    Boolean(judgeAssignment);

  /*
   * A JUDGE role alone is not enough. The user must
   * actually be assigned to this competition.
   */
  if (
    !isAdmin &&
    !isOrganizer &&
    !isAssignedJudge
  ) {
    return NextResponse.json(
      {
        error:
          "You are not authorized to vote.",
      },
      { status: 403 }
    );
  }

  let tiebreak =
    await getActiveTiebreak(
      competitionId
    );

  if (!tiebreak) {
    tiebreak =
      await createNextTiebreak(
        competitionId
      );
  }

  if (!tiebreak) {
    return NextResponse.json(
      {
        error:
          "There are currently no ties requiring a tiebreak.",
      },
      { status: 409 }
    );
  }

  if (
    tiebreak.status === "RESOLVED"
  ) {
    return NextResponse.json(
      {
        error:
          "This tiebreak has already been resolved.",
      },
      { status: 409 }
    );
  }

  /*
   * During JUDGES_VOTING, an assigned judge votes as
   * a judge even if they also have ADMIN/ORGANIZER roles.
   */
  const shouldVoteAsJudge =
    isAssignedJudge &&
    tiebreak.status === "JUDGES_VOTING";

  /*
   * During ORGANIZER_VOTING, ADMIN/ORGANIZER users
   * provide the deciding vote.
   */
  const shouldVoteAsOrganizer =
    (isAdmin || isOrganizer) &&
    tiebreak.status === "ORGANIZER_VOTING";

  if (
    shouldVoteAsJudge &&
    judgeAssignment?.excludedFromResults
  ) {
    return NextResponse.json(
      {
        error:
          "You have been excluded from this competition's results and cannot vote in tiebreaks.",
      },
      { status: 403 }
    );
  }

  if (
    !shouldVoteAsJudge &&
    !shouldVoteAsOrganizer
  ) {
    if (
      tiebreak.status === "JUDGES_VOTING"
    ) {
      return NextResponse.json(
        {
          error:
            "Judge voting is not currently open.",
        },
        { status: 409 }
      );
    }

    if (
      tiebreak.status ===
      "ORGANIZER_VOTING"
    ) {
      return NextResponse.json(
        {
          error:
            "Organizer voting is not currently open.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          "Voting is not currently open.",
      },
      { status: 409 }
    );
  }

  const candidate =
    await db.orm.public.TiebreakPerformer.first(
      {
        tiebreakId: tiebreak.id,
        performerId,
      }
    );

  if (!candidate) {
    return NextResponse.json(
      {
        error:
          "That performer is not part of this tiebreak.",
      },
      { status: 400 }
    );
  }

  const voterType =
    shouldVoteAsJudge
      ? "JUDGE"
      : "ORGANIZER";

  const existingVote =
    await db.orm.public.TiebreakVote.first(
      {
        tiebreakId: tiebreak.id,
        userId: user.id,
        voterType,
      }
    );

  if (existingVote) {
    return NextResponse.json(
      {
        error:
          "You have already voted in this tiebreak.",
      },
      { status: 409 }
    );
  }

  await db.orm.public.TiebreakVote.create(
    {
      tiebreakId: tiebreak.id,
      userId: user.id,
      performerId,
      voterType,
      createdAt:
        new Date().toISOString(),
    }
  );

  /*
   * Organizer/admin vote is always final.
   */
  if (
    shouldVoteAsOrganizer
  ) {
    const updated =
      await db.orm.public.Tiebreak.where(
        {
          id: tiebreak.id,
        }
      ).update({
        status: "RESOLVED",
        winnerPerformerId:
          performerId,
        updatedAt:
          new Date().toISOString(),
      });

    return NextResponse.json({
      success: true,
      resolved: true,
      status: "RESOLVED",
      winnerPerformerId:
        updated?.winnerPerformerId ??
        performerId,
      message:
        "Organizer tiebreak resolved.",
    });
  }

  /*
   * Judge voting.
   */
  const allVotes =
    await db.orm.public.TiebreakVote.where(
      {
        tiebreakId: tiebreak.id,
      }
    ).all();

  const judgeVotes =
    allVotes.filter(
      (vote) =>
        vote.voterType === "JUDGE"
    );

  const judgeAssignments =
    await db.orm.public.CompetitionJudge.where(
      {
        competitionId,
      }
    ).all();

  const activeJudgeAssignments =
    judgeAssignments.filter(
      (assignment) =>
        !assignment.excludedFromResults
    );

  const activeJudgeIdsForVotes =
    new Set(
      activeJudgeAssignments.map(
        (assignment) =>
          assignment.judgeId
      )
    );

  const activeJudgeVotes =
    judgeVotes.filter((vote) =>
      activeJudgeIdsForVotes.has(
        vote.userId
      )
    );

  if (activeJudgeAssignments.length === 0) {
    return NextResponse.json(
      {
        error:
          "No eligible judges are available for this tiebreak.",
      },
      { status: 409 }
    );
  }

  /*
   * Wait until every active judge has voted.
   */
  if (
    activeJudgeVotes.length <
    activeJudgeAssignments.length
  ) {
    return NextResponse.json({
      success: true,
      resolved: false,
      status:
        "JUDGES_VOTING",
      votesReceived:
        activeJudgeVotes.length,
      votesRequired:
        activeJudgeAssignments.length,
      message:
        "Tiebreak vote recorded.",
    });
  }

  const performers =
    await getTiebreakPerformers(
      tiebreak.id
    );

  const voteCounts =
    performers.map(
      (performer) => ({
        performerId:
          performer.id,
        votes:
          activeJudgeVotes.filter(
            (vote) =>
              vote.performerId ===
              performer.id
          ).length,
      })
    );

  const highestVoteCount =
    Math.max(
      ...voteCounts.map(
        (entry) => entry.votes
      )
    );

  const leaders =
    voteCounts.filter(
      (entry) =>
        entry.votes ===
        highestVoteCount
    );

  /*
   * Unique judge winner.
   */
  if (
    leaders.length === 1
  ) {
    const winnerId =
      leaders[0].performerId;

    const updated =
      await db.orm.public.Tiebreak.where(
        {
          id: tiebreak.id,
        }
      ).update({
        status: "RESOLVED",
        winnerPerformerId:
          winnerId,
        updatedAt:
          new Date().toISOString(),
      });

    /*
     * Automatically look for another tie.
     */
    const nextTiebreak =
      await createNextTiebreak(
        competitionId
      );

    return NextResponse.json({
      success: true,
      resolved: true,
      status: "RESOLVED",
      winnerPerformerId:
        updated?.winnerPerformerId ??
        winnerId,
      nextTiebreakId:
        nextTiebreak?.id ??
        null,
      message:
        "Judge tiebreak resolved.",
    });
  }

  /*
   * Judge deadlock.
   */
  const updated =
    await db.orm.public.Tiebreak.where(
      {
        id: tiebreak.id,
      }
    ).update({
      status:
        "ORGANIZER_VOTING",
      updatedAt:
        new Date().toISOString(),
    });

  return NextResponse.json({
    success: true,
    resolved: false,
    status:
      updated?.status ??
      "ORGANIZER_VOTING",
    message:
      "Judges are tied. The organizer must cast the deciding vote.",
  });
}
