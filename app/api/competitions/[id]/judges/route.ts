import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireRole } from "@/src/auth/require-user";
import {
  generateToken,
  hashToken,
} from "@/src/auth";
import { sendJudgeInvitationEmail } from "@/src/email/mail";
import { normalizeEmail } from "@/src/utils/email";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function getCompetitionForManager(
  competitionId: number
) {
  const competition =
    await db.orm.public.Competition.first({
      id: competitionId,
    });

  return competition ?? null;
}

// GET -- List judges assigned to the competition
export async function GET(
  _request: Request,
  { params }: RouteContext
) {
  await requireRole(["ADMIN", "ORGANIZER"]);

  const { id } = await params;
  const competitionId = Number(id);

  if (!Number.isInteger(competitionId)) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

  const competition =
    await getCompetitionForManager(competitionId);

  if (!competition) {
    return NextResponse.json(
      { error: "Competition not found." },
      { status: 404 }
    );
  }

  const assignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const judges = await Promise.all(
    assignments.map(async (assignment) => {
      const judge = await db.orm.public.User.first({
        id: assignment.judgeId,
      });

      const scorecards =
        await db.orm.public.Scorecard.where({
          judgeAssignmentId: assignment.id,
        }).all();

      const submittedScorecards =
        scorecards.filter(
          (scorecard) =>
            scorecard.status === "SUBMITTED"
        ).length;

      return {
  assignmentId: assignment.id,
  judgeId: assignment.judgeId,
  email: judge?.email ?? "",
  name: judge?.name ?? null,
  submittedScorecards,
  excludedFromResults: assignment.excludedFromResults,
};
    })
  );

  return NextResponse.json({ judges });
}

// PATCH — Exclude or restore a judge from competition results
export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  const user = await requireRole(["ADMIN", "ORGANIZER"]);

  const { id } = await params;
  const competitionId = Number(id);

  if (!Number.isInteger(competitionId)) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

const competition = await getCompetitionForManager(
  competitionId
);

  if (!competition) {
    return NextResponse.json(
      { error: "Competition not found." },
      { status: 404 }
    );
  }

  if (
    competition.status === "FINALIZED" ||
    competition.status === "ARCHIVED"
  ) {
    return NextResponse.json(
      {
        error:
          "Judge result eligibility cannot be changed after the competition is finalized or archived.",
      },
      { status: 400 }
    );
  }

  const body = await request.json();

  const assignmentId = Number(body.assignmentId);
  const action = body.action;

  if (!Number.isInteger(assignmentId)) {
    return NextResponse.json(
      { error: "Invalid judge assignment ID." },
      { status: 400 }
    );
  }

  if (
    action !== "excludeFromResults" &&
    action !== "restoreFromResults"
  ) {
    return NextResponse.json(
      { error: "Invalid judge result action." },
      { status: 400 }
    );
  }

  const assignment =
    await db.orm.public.CompetitionJudge.first({
      id: assignmentId,
      competitionId,
    });

  if (!assignment) {
    return NextResponse.json(
      { error: "Judge assignment not found." },
      { status: 404 }
    );
  }

  const excludedFromResults =
    action === "excludeFromResults";

  await db.orm.public.CompetitionJudge.where({
    id: assignment.id,
  }).update({
    excludedFromResults,
  });

  return NextResponse.json({
    success: true,
    assignmentId: assignment.id,
    excludedFromResults,
  });
}

// POST -- Assign a judge by name and email
export async function POST(
  request: Request,
  { params }: RouteContext
) {
  await requireRole(["ADMIN", "ORGANIZER"]);

  const { id } = await params;
  const competitionId = Number(id);

  if (!Number.isInteger(competitionId)) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

  const competition =
    await getCompetitionForManager(competitionId);

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
      {
        error:
          "Judges cannot be changed after the competition is canceled, finalized, or archived.",
      },
      { status: 400 }
    );
  }

  const body = await request.json();

  const name =
    typeof body.name === "string"
      ? body.name.trim()
      : "";

  const email =
    typeof body.email === "string"
     ? normalizeEmail(body.email)
     : "";

  if (!name) {
    return NextResponse.json(
      { error: "Judge name is required." },
      { status: 400 }
    );
  }

  if (!email) {
    return NextResponse.json(
      { error: "Judge email is required." },
      { status: 400 }
    );
  }

  let judge = await db.orm.public.User.first({
    email,
  });

  let isNewJudge = false;

  /*
   * If the judge doesn't have an account yet,
   * create one with the organizer-provided name.
   */
  if (!judge) {
    judge = await db.orm.public.User.create({
      email,
      name,
      updatedAt: new Date().toISOString(),
    });

    isNewJudge = true;
  }

  /*
   * Existing roles are preserved.
   *
   * A user can be an ADMIN, ORGANIZER, and JUDGE at
   * the same time. Assigning someone as a competition
   * judge must never remove their existing roles.
   */
  const existingJudgeRole =
    await db.orm.public.UserRoleAssignment.first({
      userId: judge.id,
      role: "JUDGE",
    });

  if (!existingJudgeRole) {
    await db.orm.public.UserRoleAssignment.create({
      userId: judge.id,
      role: "JUDGE",
    });
  }

  const existingAssignment =
    await db.orm.public.CompetitionJudge.first({
      competitionId,
      judgeId: judge.id,
    });

  if (existingAssignment) {
    return NextResponse.json(
      {
        error:
          "This judge is already assigned to the competition.",
      },
      { status: 409 }
    );
  }

  const assignment =
    await db.orm.public.CompetitionJudge.create({
      competitionId,
      judgeId: judge.id,
    });

  /*
   * Create a one-time invitation token.
   * Only the SHA-256 hash is stored in the database.
   */
  const invitationToken = generateToken();
  const tokenHash = hashToken(invitationToken);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await db.orm.public.AuthToken.create({
    userId: judge.id,
    type: "INVITATION",
    tokenHash,
    expiresAt: expiresAt.toISOString(),
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const invitationUrl =
    `${appUrl}/invite?token=${invitationToken}` +
    `&competition=${competitionId}`;

  try {
    await sendJudgeInvitationEmail(
      judge.email,
      invitationUrl,
      competition.name
    );
  } catch (error) {
    /*
     * The assignment and account remain intact if email delivery
     * fails. The organizer gets a clear error so the issue can
     * be addressed without silently losing the assignment.
     */
    console.error(
      "JUDGE INVITATION EMAIL FAILED",
      error
    );

    return NextResponse.json(
      {
        error:
          "The judge was assigned, but the invitation email could not be sent.",
        assignmentCreated: true,
        judgeCreated: isNewJudge,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      judge: {
        assignmentId: assignment.id,
        judgeId: judge.id,
        email: judge.email,
        name: judge.name ?? null,
        submittedScorecards: 0,
      },
      invitationSent: true,
      judgeCreated: isNewJudge,
    },
    { status: 201 }
  );
}

// DELETE -- Remove a judge
export async function DELETE(
  request: Request,
  { params }: RouteContext
) {
  await requireRole(["ADMIN", "ORGANIZER"]);

  const { id } = await params;
  const competitionId = Number(id);

  if (!Number.isInteger(competitionId)) {
    return NextResponse.json(
      { error: "Invalid competition ID." },
      { status: 400 }
    );
  }

  const competition =
    await getCompetitionForManager(competitionId);

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
      {
        error:
          "Judges cannot be changed after the competition is canceled, finalized, or archived.",
      },
      { status: 400 }
    );
  }

  const body = await request.json();
  const assignmentId = Number(body.assignmentId);

  if (!Number.isInteger(assignmentId)) {
    return NextResponse.json(
      { error: "Invalid judge assignment ID." },
      { status: 400 }
    );
  }

  const assignment =
    await db.orm.public.CompetitionJudge.first({
      id: assignmentId,
      competitionId,
    });

  if (!assignment) {
    return NextResponse.json(
      { error: "Judge assignment not found." },
      { status: 404 }
    );
  }

  const scorecards =
    await db.orm.public.Scorecard.where({
      judgeAssignmentId: assignment.id,
    }).all();

  if (scorecards.length > 0) {
    return NextResponse.json(
      {
        error:
          "This judge cannot be removed because they have already started scoring.",
      },
      { status: 400 }
    );
  }

  await db.orm.public.CompetitionJudge.where({
    id: assignment.id,
  }).delete();

  return NextResponse.json({
    success: true,
  });
}