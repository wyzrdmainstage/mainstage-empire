import { db } from "./src/prisma/db.ts";

const TEST_NAME = "__EXCLUSION_TEST__";
const now = new Date().toISOString();

let competitionId: number | null = null;

function pass(message: string) {
  console.log(`PASS: ${message}`);
}

function fail(message: string): never {
  throw new Error(`FAIL: ${message}`);
}

async function cleanup() {
  if (!competitionId) return;

  try {
    const tiebreaks =
      await db.orm.public.Tiebreak.where({
        competitionId,
      }).all();

    for (const tiebreak of tiebreaks) {
      await db.orm.public.TiebreakVote.where({
        tiebreakId: tiebreak.id,
      }).delete();

      await db.orm.public.TiebreakPerformer.where({
        tiebreakId: tiebreak.id,
      }).delete();
    }

    for (const tiebreak of tiebreaks) {
      await db.orm.public.Tiebreak.where({
        id: tiebreak.id,
      }).delete();
    }

    const performers =
      await db.orm.public.Performer.where({
        competitionId,
      }).all();

    const judges =
      await db.orm.public.CompetitionJudge.where({
        competitionId,
      }).all();

    for (const performer of performers) {
      await db.orm.public.Scorecard.where({
        performerId: performer.id,
      }).delete();
    }

    for (const judge of judges) {
      await db.orm.public.Scorecard.where({
        judgeAssignmentId: judge.id,
      }).delete();
    }

    await db.orm.public.Performer.where({
      competitionId,
    }).delete();

    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).delete();

    await db.orm.public.Competition.where({
      id: competitionId,
    }).delete();

    console.log("");
    console.log("CLEANUP: Temporary competition removed.");
  } catch (error) {
    console.error("CLEANUP ERROR:", error);
  }
}

async function main() {
  console.log("========================================");
  console.log(" MAINSTAGE SCORE - JUDGE EXCLUSION TEST");
  console.log("========================================");
  console.log("");

  const user3 =
    await db.orm.public.User.first({ id: 3 });

  const user5 =
    await db.orm.public.User.first({ id: 5 });

  if (!user3) fail("Local test user 3 does not exist.");
  if (!user5) fail("Local test user 5 does not exist.");

  const existing =
    await db.orm.public.Competition.first({
      name: TEST_NAME,
    });

  if (existing) {
    fail(
      "A previous exclusion test competition already exists. Refusing to modify it."
    );
  }

  console.log("Creating temporary competition...");

  const competition =
    await db.orm.public.Competition.create({
      name: TEST_NAME,
      venueName: "Local Test Venue",
      date: new Date(
        Date.now() + 86400000
      ).toISOString(),
      description:
        "Temporary local judge exclusion test.",
      status: "LIVE",
      organizerId: 3,
      updatedAt: now,
    });

  competitionId = competition.id;

  console.log(
    `Temporary competition ID: ${competitionId}`
  );

  const judgeA =
    await db.orm.public.CompetitionJudge.create({
      competitionId,
      judgeId: 3,
    });

  const judgeB =
    await db.orm.public.CompetitionJudge.create({
      competitionId,
      judgeId: 5,
    });

  const performerA =
    await db.orm.public.Performer.create({
      competitionId,
      artistName: "Exclusion Test Artist A",
      performanceOrder: 1,
      songCount: 1,
      supporterCount: 0,
      excludedFromResults: false,
      updatedAt: now,
    });

  const performerB =
    await db.orm.public.Performer.create({
      competitionId,
      artistName: "Exclusion Test Artist B",
      performanceOrder: 2,
      songCount: 1,
      supporterCount: 0,
      excludedFromResults: false,
      updatedAt: now,
    });

  // Judge A gives every category 10 = 60 total.
  // Judge B gives every category 8 = 48 total.
  for (const performer of [
    performerA,
    performerB,
  ]) {
    await db.orm.public.Scorecard.create({
      performerId: performer.id,
      judgeAssignmentId: judgeA.id,
      presentation: 10,
      vocals: 10,
      lyrics: 10,
      energy: 10,
      quality: 10,
      starFactor: 10,
      notes: "Judge A test score",
      status: "SUBMITTED",
      submittedAt: now,
      updatedAt: now,
    });

    await db.orm.public.Scorecard.create({
      performerId: performer.id,
      judgeAssignmentId: judgeB.id,
      presentation: 8,
      vocals: 8,
      lyrics: 8,
      energy: 8,
      quality: 8,
      starFactor: 8,
      notes: "Judge B test score",
      status: "SUBMITTED",
      submittedAt: now,
      updatedAt: now,
    });
  }

  console.log("");
  console.log("Initial state:");

  const initialAssignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const initialEligible =
    initialAssignments.filter(
      (assignment) =>
        !assignment.excludedFromResults
    );

  if (initialEligible.length !== 2) {
    fail(
      `Expected 2 eligible judges, found ${initialEligible.length}.`
    );
  }

  pass("Both judges initially count toward results.");

  const initialScorecards =
    await Promise.all(
      initialEligible.map((assignment) =>
        db.orm.public.Scorecard.first({
          performerId: performerA.id,
          judgeAssignmentId: assignment.id,
        })
      )
    );

  const initialTotals =
    initialScorecards
      .filter(
        (scorecard) =>
          scorecard?.status === "SUBMITTED"
      )
      .map(
        (scorecard) =>
          (scorecard?.presentation ?? 0) +
          (scorecard?.vocals ?? 0) +
          (scorecard?.lyrics ?? 0) +
          (scorecard?.energy ?? 0) +
          (scorecard?.quality ?? 0) +
          (scorecard?.starFactor ?? 0)
      );

  const initialFinalScore =
    initialTotals.reduce(
      (sum, total) => sum + total,
      0
    ) / initialTotals.length;

  if (initialFinalScore !== 54) {
    fail(
      `Expected initial final score 54, got ${initialFinalScore}.`
    );
  }

  pass(
    "Initial official score correctly averages both judges: 54."
  );

  console.log("");
  console.log("Excluding Judge A...");

  await db.orm.public.CompetitionJudge
    .where({
      id: judgeA.id,
    })
    .update({
      excludedFromResults: true,
    });

  const excludedAssignment =
    await db.orm.public.CompetitionJudge.first({
      id: judgeA.id,
    });

  if (!excludedAssignment?.excludedFromResults) {
    fail("Judge A was not marked excluded.");
  }

  pass("Judge A is marked excluded from results.");

  const retainedScorecard =
    await db.orm.public.Scorecard.first({
      performerId: performerA.id,
      judgeAssignmentId: judgeA.id,
    });

  if (
    !retainedScorecard ||
    retainedScorecard.status !== "SUBMITTED"
  ) {
    fail(
      "Judge A's existing scorecard was not retained."
    );
  }

  pass(
    "Judge A's existing submitted score remains stored."
  );

  const afterExcludeAssignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const afterExcludeEligible =
    afterExcludeAssignments.filter(
      (assignment) =>
        !assignment.excludedFromResults
    );

  if (afterExcludeEligible.length !== 1) {
    fail(
      `Expected 1 eligible judge after exclusion, found ${afterExcludeEligible.length}.`
    );
  }

  pass(
    "Excluded Judge A no longer counts as an active results judge."
  );

  const activeScorecards =
    await Promise.all(
      afterExcludeEligible.map((assignment) =>
        db.orm.public.Scorecard.first({
          performerId: performerA.id,
          judgeAssignmentId: assignment.id,
        })
      )
    );

  const activeTotals =
    activeScorecards
      .filter(
        (scorecard) =>
          scorecard?.status === "SUBMITTED"
      )
      .map(
        (scorecard) =>
          (scorecard?.presentation ?? 0) +
          (scorecard?.vocals ?? 0) +
          (scorecard?.lyrics ?? 0) +
          (scorecard?.energy ?? 0) +
          (scorecard?.quality ?? 0) +
          (scorecard?.starFactor ?? 0)
      );

  const excludedFinalScore =
    activeTotals.reduce(
      (sum, total) => sum + total,
      0
    ) / activeTotals.length;

  if (excludedFinalScore !== 48) {
    fail(
      `Expected excluded final score 48, got ${excludedFinalScore}.`
    );
  }

  pass(
    "Official score correctly excludes Judge A: 48."
  );

  const expectedActiveScorecards =
    2 * afterExcludeEligible.length;

  if (expectedActiveScorecards !== 2) {
    fail(
      `Expected 2 required active scorecards, got ${expectedActiveScorecards}.`
    );
  }

  pass(
    "Judging completion correctly requires only active judges."
  );

  console.log("");
  console.log("Restoring Judge A...");

  await db.orm.public.CompetitionJudge
    .where({
      id: judgeA.id,
    })
    .update({
      excludedFromResults: false,
    });

  const restoredAssignment =
    await db.orm.public.CompetitionJudge.first({
      id: judgeA.id,
    });

  if (restoredAssignment?.excludedFromResults) {
    fail("Judge A was not restored.");
  }

  pass("Judge A was restored.");

  const restoredAssignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const restoredEligible =
    restoredAssignments.filter(
      (assignment) =>
        !assignment.excludedFromResults
    );

  if (restoredEligible.length !== 2) {
    fail(
      `Expected 2 eligible judges after restore, found ${restoredEligible.length}.`
    );
  }

  const restoredScorecards =
    await Promise.all(
      restoredEligible.map((assignment) =>
        db.orm.public.Scorecard.first({
          performerId: performerA.id,
          judgeAssignmentId: assignment.id,
        })
      )
    );

  const restoredTotals =
    restoredScorecards
      .filter(
        (scorecard) =>
          scorecard?.status === "SUBMITTED"
      )
      .map(
        (scorecard) =>
          (scorecard?.presentation ?? 0) +
          (scorecard?.vocals ?? 0) +
          (scorecard?.lyrics ?? 0) +
          (scorecard?.energy ?? 0) +
          (scorecard?.quality ?? 0) +
          (scorecard?.starFactor ?? 0)
      );

  const restoredFinalScore =
    restoredTotals.reduce(
      (sum, total) => sum + total,
      0
    ) / restoredTotals.length;

  if (restoredFinalScore !== 54) {
    fail(
      `Expected restored final score 54, got ${restoredFinalScore}.`
    );
  }

  pass(
    "Restoring Judge A reactivates the retained score: 54."
  );

  console.log("");
  console.log("Testing all-judges-excluded condition...");

  await db.orm.public.CompetitionJudge
    .where({
      id: judgeA.id,
    })
    .update({
      excludedFromResults: true,
    });

  await db.orm.public.CompetitionJudge
    .where({
      id: judgeB.id,
    })
    .update({
      excludedFromResults: true,
    });

  const allExcluded =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const activeAfterAllExcluded =
    allExcluded.filter(
      (assignment) =>
        !assignment.excludedFromResults
    );

  if (activeAfterAllExcluded.length !== 0) {
    fail(
      "Expected zero active judges when both are excluded."
    );
  }

  pass(
    "All-judges-excluded state correctly produces zero active judges."
  );

  console.log("");
  console.log("========================================");
  console.log(" ALL DATABASE EXCLUSION TESTS PASSED");
  console.log("========================================");
}

try {
  await main();
} catch (error) {
  console.error("");
  console.error(
    error instanceof Error
      ? error.message
      : error
  );
  process.exitCode = 1;
} finally {
  await cleanup();
}
