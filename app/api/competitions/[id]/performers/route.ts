import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireRole } from "@/src/auth/require-user";

type Params = {
  params: Promise<{ id: string }>;
};

const MANAGER_ROLES = ["ADMIN", "ORGANIZER"] as const;

function parseCompetitionId(value: string) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function isLocked(status: string) {
  return (
    status === "FINALIZED" ||
    status === "CANCELED" ||
    status === "ARCHIVED"
  );
}

function isScoringLocked(status: string) {
  return (
    status === "JUDGING_COMPLETE" ||
    status === "CANCELED" ||
    status === "FINALIZED" ||
    status === "ARCHIVED"
  );
}

/**
 * POST /api/competitions/[id]/performers
 *
 * Add a performer to a competition.
 */
export async function POST(request: Request, { params }: Params) {
  const { id: idParam } = await params;
  const competitionId = parseCompetitionId(idParam);

  if (!competitionId) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

  const user = await requireRole([...MANAGER_ROLES]);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const competition = await db.orm.public.Competition
    .where({ id: competitionId })
    .first();

  if (!competition) {
    return NextResponse.json(
      { error: "Competition not found." },
      { status: 404 }
    );
  }

  if (
  competition.status === "FINALIZED" ||
  competition.status === "CANCELED" ||
  competition.status === "ARCHIVED"
) {
    return NextResponse.json(
      { error: "Performers cannot be added after the competition is finalized." },
      { status: 400 }
    );
  }

  let body: {
    artistName?: string;
    songCount?: number | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const artistName =
    typeof body.artistName === "string"
      ? body.artistName.trim()
      : "";

  if (!artistName) {
    return NextResponse.json(
      { error: "Artist name is required." },
      { status: 400 }
    );
  }

  let songCount: number | null = null;

  if (body.songCount !== undefined && body.songCount !== null) {
    if (
      typeof body.songCount !== "number" ||
      !Number.isInteger(body.songCount) ||
      body.songCount < 1
    ) {
      return NextResponse.json(
        { error: "Song count must be a whole number of at least 1." },
        { status: 400 }
      );
    }

    songCount = body.songCount;
  }

  const existingPerformers = await db.orm.public.Performer
    .where({ competitionId })
    .all();

  const performanceOrder =
    existingPerformers.length > 0
      ? Math.max(
          ...existingPerformers.map(
            (performer) => performer.performanceOrder
          )
        ) + 1
      : 1;

  const performer = await db.orm.public.Performer.create({
    competitionId,
    artistName,
    songCount,
    supporterCount: 0,
    performanceOrder,
  });

  return NextResponse.json(
    { performer },
    { status: 201 }
  );
}

/**
 * PATCH /api/competitions/[id]/performers
 *
 * Supported actions:
 * - reorder
 * - updateArtistName
 * - updateSongCount
 * - updateSupporterCount
 * - excludeFromResults
 * - restoreFromResults
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id: idParam } = await params;
  const competitionId = parseCompetitionId(idParam);

  if (!competitionId) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

  const user = await requireRole([...MANAGER_ROLES]);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const competition = await db.orm.public.Competition
    .where({ id: competitionId })
    .first();

  if (!competition) {
    return NextResponse.json(
      { error: "Competition not found." },
      { status: 404 }
    );
  }

  let body: {
    action?: string;
    artistName?: string;
    performerId?: number;
    direction?: "up" | "down";
    songCount?: number | null;
    supporterCount?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const action = body.action;
  const performerId = Number(body.performerId);

  if (!Number.isInteger(performerId) || performerId <= 0) {
    return NextResponse.json(
      { error: "Invalid performer ID." },
      { status: 400 }
    );
  }

  const performer = await db.orm.public.Performer
    .where({
      id: performerId,
      competitionId,
    })
    .first();

  if (!performer) {
    return NextResponse.json(
      { error: "Performer not found." },
      { status: 404 }
    );
  }

  if (action === "updateArtistName") {
    if (isLocked(competition.status)) {
      return NextResponse.json(
        { error: "Performer names cannot be changed in canceled, finalized, or archived competitions." },
        { status: 400 }
      );
    }

    const artistName =
      typeof body.artistName === "string" ? body.artistName.trim() : "";

    if (!artistName) {
      return NextResponse.json(
        { error: "Artist name is required." },
        { status: 400 }
      );
    }

    const updatedPerformer = await db.orm.public.Performer
      .where({ id: performerId, competitionId })
      .update({ artistName });

    return NextResponse.json({ performer: updatedPerformer });
  }

  /*
   * ------------------------------------------------------------
   * SUPPORTER COUNT
   * ------------------------------------------------------------
   */
  if (action === "updateSupporterCount") {
    if (isLocked(competition.status)) {
      return NextResponse.json(
        {
          error:
            "Supporter counts cannot be changed after the competition is finalized.",
        },
        { status: 400 }
      );
    }

    const supporterCount = Number(body.supporterCount);

    if (
      !Number.isInteger(supporterCount) ||
      supporterCount < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Supporter count must be a whole number of 0 or greater.",
        },
        { status: 400 }
      );
    }

    const updatedPerformer = await db.orm.public.Performer
      .where({ id: performerId })
      .update({
        supporterCount,
      });

    return NextResponse.json({
      performer: updatedPerformer,
    });
  }

  /*
   * ------------------------------------------------------------
   * RESULT EXCLUSION
   * ------------------------------------------------------------
   */
  if (
    action === "excludeFromResults" ||
    action === "restoreFromResults"
  ) {
    if (!user.roles.includes("ADMIN")) {
      return NextResponse.json(
        {
          error:
            "Only administrators can change result eligibility.",
        },
        { status: 403 }
      );
    }

    const allowedStatuses = [
      "JUDGING_COMPLETE",
      "FINALIZED",
      "ARCHIVED",
    ];

    if (!allowedStatuses.includes(competition.status)) {
      return NextResponse.json(
        {
          error:
            "Result eligibility can only be changed after judging is complete.",
        },
        { status: 400 }
      );
    }

    const excludedFromResults =
      action === "excludeFromResults";

    const updatedPerformer = await db.orm.public.Performer
      .where({ id: performerId })
      .update({
        excludedFromResults,
      });

    return NextResponse.json({
      performer: updatedPerformer,
    });
  }

  /*
   * ------------------------------------------------------------
   * SONG COUNT
   * ------------------------------------------------------------
   */
  if (action === "updateSongCount") {
if (
  competition.status === "JUDGING_COMPLETE" ||
  competition.status === "FINALIZED" ||
  competition.status === "CANCELED" ||
  competition.status === "ARCHIVED"
) {
      return NextResponse.json(
        {
          error:
            "Song count cannot be changed after judging is complete.",
        },
        { status: 400 }
      );
    }

    let songCount: number | null = null;

    if (body.songCount !== undefined && body.songCount !== null) {
      const parsedSongCount = Number(body.songCount);

      if (
        !Number.isInteger(parsedSongCount) ||
        parsedSongCount < 1
      ) {
        return NextResponse.json(
          {
            error:
              "Song count must be a whole number of at least 1.",
          },
          { status: 400 }
        );
      }

      songCount = parsedSongCount;
    }

    const updatedPerformer = await db.orm.public.Performer
      .where({ id: performerId })
      .update({
        songCount,
      });

    return NextResponse.json({
      performer: updatedPerformer,
    });
  }

  /*
   * ------------------------------------------------------------
   * REORDER
   * ------------------------------------------------------------
   */
  if (action === "reorder") {
    if (isScoringLocked(competition.status)) {
      return NextResponse.json(
        {
          error:
            "The performance order cannot be changed after scoring has started.",
        },
        { status: 400 }
      );
    }

    if (
      body.direction !== "up" &&
      body.direction !== "down"
    ) {
      return NextResponse.json(
        { error: "Invalid reorder direction." },
        { status: 400 }
      );
    }

    const performers = await db.orm.public.Performer
      .where({ competitionId })
      .all();

    const sortedPerformers = [...performers].sort(
      (a, b) => a.performanceOrder - b.performanceOrder
    );

    const currentIndex = sortedPerformers.findIndex(
      (item) => item.id === performerId
    );

    if (currentIndex === -1) {
      return NextResponse.json(
        { error: "Performer not found." },
        { status: 404 }
      );
    }

    const targetIndex =
      body.direction === "up"
        ? currentIndex - 1
        : currentIndex + 1;

    if (
      targetIndex < 0 ||
      targetIndex >= sortedPerformers.length
    ) {
      return NextResponse.json({
        performers: sortedPerformers,
      });
    }

    const currentPerformer = sortedPerformers[currentIndex];
    const targetPerformer = sortedPerformers[targetIndex];

    const currentOrder = currentPerformer.performanceOrder;
    const targetOrder = targetPerformer.performanceOrder;

    await db.orm.public.Performer
      .where({ id: currentPerformer.id })
      .update({
        performanceOrder: targetOrder,
      });

    await db.orm.public.Performer
      .where({ id: targetPerformer.id })
      .update({
        performanceOrder: currentOrder,
      });

    const updatedPerformers = await db.orm.public.Performer
      .where({ competitionId })
      .all();

    return NextResponse.json({
      performers: [...updatedPerformers].sort(
        (a, b) => a.performanceOrder - b.performanceOrder
      ),
    });
  }

  return NextResponse.json(
    { error: "Invalid action." },
    { status: 400 }
  );
}

/**
 * DELETE /api/competitions/[id]/performers
 *
 * Remove a performer.
 */
export async function DELETE(
  request: Request,
  { params }: Params
) {
  const { id: idParam } = await params;
  const competitionId = parseCompetitionId(idParam);

  if (!competitionId) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

  const user = await requireRole([...MANAGER_ROLES]);

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  const competition = await db.orm.public.Competition
    .where({ id: competitionId })
    .first();

  if (!competition) {
    return NextResponse.json(
      { error: "Competition not found." },
      { status: 404 }
    );
  }

if (
  competition.status === "CANCELED" ||
  competition.status === "FINALIZED" ||
  competition.status === "ARCHIVED"
) {
  return NextResponse.json(
    {
      error:
        "Performers cannot be removed after the competition is canceled or finalized.",
    },
    { status: 400 }
  );
}

  let body: {
    performerId?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const performerId = Number(body.performerId);

  if (!Number.isInteger(performerId) || performerId <= 0) {
    return NextResponse.json(
      { error: "Invalid performer ID." },
      { status: 400 }
    );
  }

  const performer = await db.orm.public.Performer
    .where({
      id: performerId,
      competitionId,
    })
    .first();

  if (!performer) {
    return NextResponse.json(
      { error: "Performer not found." },
      { status: 404 }
    );
  }

  const scorecards = await db.orm.public.Scorecard
    .where({ performerId })
    .all();

  if (scorecards.length > 0) {
    return NextResponse.json(
      {
        error:
          "This performer cannot be removed because scorecards already exist.",
      },
      { status: 400 }
    );
  }

  await db.orm.public.Performer
    .where({ id: performerId })
    .delete();

  const remainingPerformers = await db.orm.public.Performer
    .where({ competitionId })
    .all();

  const sortedPerformers = [...remainingPerformers].sort(
    (a, b) => a.performanceOrder - b.performanceOrder
  );

  for (let index = 0; index < sortedPerformers.length; index++) {
    const expectedOrder = index + 1;

    if (
      sortedPerformers[index].performanceOrder !== expectedOrder
    ) {
      await db.orm.public.Performer
        .where({ id: sortedPerformers[index].id })
        .update({
          performanceOrder: expectedOrder,
        });
    }
  }

  const updatedPerformers = await db.orm.public.Performer
    .where({ competitionId })
    .all();

  return NextResponse.json({
    performers: [...updatedPerformers].sort(
      (a, b) => a.performanceOrder - b.performanceOrder
    ),
  });
}
