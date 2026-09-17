import { NextResponse } from "next/server";
import { db } from "@/src/prisma/db";
import { requireRole } from "@/src/auth/require-user";
import {
  generateToken,
  hashToken,
} from "@/src/auth";
import nodemailer from "nodemailer";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UserRole = "ADMIN" | "ORGANIZER" | "JUDGE";

const VALID_ROLES: UserRole[] = [
  "ADMIN",
  "ORGANIZER",
  "JUDGE",
];

function roleLabel(role: UserRole) {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "ORGANIZER":
      return "Organizer";
    case "JUDGE":
      return "Judge";
  }
}

function roleLabels(roles: UserRole[]) {
  return roles.map(roleLabel).join(", ");
}

async function sendInvitationEmail({
  name,
  email,
  roles,
  token,
}: {
  name: string;
  email: string;
  roles: UserRole[];
  token: string;
}) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  const invitationUrl =
    `${appUrl}/invite?token=${encodeURIComponent(token)}`;

  const rolesText = roleLabels(roles);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure:
      Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      "Mainstage Empire <wyzrd@mainstageempire.com>",
    to: email,
    subject:
      "Your Mainstage Empire Score Invitation",
    text: `Hello ${name},

You have been invited to Mainstage Score with the following role${roles.length === 1 ? "" : "s"}: ${rolesText}.

Use the link below to activate your account:

${invitationUrl}

This invitation expires in 24 hours.

Mainstage Empire`,
    html: `
      <div style="margin:0;padding:40px 20px;background:#080808;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
        <div style="max-width:600px;margin:0 auto;border:1px solid #3a3a3a;background:#111111;padding:40px;">
          <div style="text-align:center;margin-bottom:30px;">
            <div style="font-size:28px;font-weight:800;letter-spacing:2px;color:#d4af37;">
              MAINSTAGE EMPIRE
            </div>

            <div style="margin-top:8px;font-size:13px;letter-spacing:3px;color:#888888;">
              MAINSTAGE SCORE
            </div>
          </div>

          <h1 style="font-size:24px;color:#ffffff;margin-bottom:20px;">
            You're Invited
          </h1>

          <p style="font-size:16px;line-height:1.6;color:#cccccc;">
            Hello ${name},
          </p>

          <p style="font-size:16px;line-height:1.6;color:#cccccc;">
            You have been invited to Mainstage Score with the following
            role${roles.length === 1 ? "" : "s"}:
            <strong style="color:#d4af37;">${rolesText}</strong>.
          </p>

          <div style="text-align:center;margin:35px 0;">
            <a
              href="${invitationUrl}"
              style="display:inline-block;padding:14px 28px;background:#d4af37;color:#080808;text-decoration:none;font-weight:700;border-radius:6px;"
            >
              Accept Invitation
            </a>
          </div>

          <p style="font-size:14px;line-height:1.6;color:#888888;">
            This invitation expires in 24 hours.
          </p>

          <div style="margin-top:35px;padding-top:20px;border-top:1px solid #333333;font-size:12px;color:#666666;">
            Mainstage Empire
          </div>
        </div>
      </div>
    `,
  });
}

async function getUserRoles(
  userId: number
): Promise<UserRole[]> {
  const assignments =
    await db.orm.public.UserRoleAssignment
      .where({ userId })
      .all();

  return assignments
    .map(
      (assignment) =>
        assignment.role as UserRole
    )
    .filter((role) =>
      VALID_ROLES.includes(role)
    );
}

async function validateRoles(
  roles: unknown
): Promise<UserRole[] | null> {
  if (!Array.isArray(roles)) {
    return null;
  }

  const uniqueRoles = Array.from(
    new Set(roles)
  );

  if (
    uniqueRoles.length === 0 ||
    uniqueRoles.some(
      (role) =>
        typeof role !== "string" ||
        !VALID_ROLES.includes(
          role as UserRole
        )
    )
  ) {
    return null;
  }

  return uniqueRoles as UserRole[];
}

export async function PATCH(
  request: Request,
  { params }: RouteContext
) {
  const admin = await requireRole(["ADMIN"]);

  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId)) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const newRoles = await validateRoles(
    body.roles
  );

  if (!newRoles) {
    return NextResponse.json(
      {
        error:
          "At least one valid role must be selected.",
      },
      { status: 400 }
    );
  }

  const user = await db.orm.public.User.first({
    id: userId,
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 }
    );
  }

  const currentRoles =
    await getUserRoles(user.id);

  const currentlyAdmin =
    currentRoles.includes("ADMIN");

  const willBeAdmin =
    newRoles.includes("ADMIN");

  // Prevent an administrator from removing
  // their own administrator role.
  if (
    user.id === admin.id &&
    currentlyAdmin &&
    !willBeAdmin
  ) {
    return NextResponse.json(
      {
        error:
          "You cannot remove your own administrator role.",
      },
      { status: 400 }
    );
  }

  // Protect the last administrator.
  if (currentlyAdmin && !willBeAdmin) {
    const admins =
      await db.orm.public.UserRoleAssignment
        .where({ role: "ADMIN" })
        .all();

    if (admins.length <= 1) {
      return NextResponse.json(
        {
          error:
            "The last administrator cannot be removed.",
        },
        { status: 400 }
      );
    }
  }

  const rolesToAdd = newRoles.filter(
    (role) => !currentRoles.includes(role)
  );

  const rolesToRemove = currentRoles.filter(
    (role) => !newRoles.includes(role)
  );

  for (const role of rolesToAdd) {
    await db.orm.public.UserRoleAssignment.create({
      userId: user.id,
      role,
    });
  }

  for (const role of rolesToRemove) {
    const assignment =
      await db.orm.public.UserRoleAssignment.first({
        userId: user.id,
        role,
      });

    if (assignment) {
      await db.orm.public.UserRoleAssignment
        .where({
          id: assignment.id,
        })
        .delete();
    }
  }

  await db.orm.public.User.where({
    id: user.id,
  }).update({
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    success: true,
    roles: newRoles,
  });
}

export async function POST(
  request: Request,
  { params }: RouteContext
) {
  await requireRole(["ADMIN"]);

  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId)) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 }
    );
  }

  const body = await request.json();

  if (
    body.action !== "resendInvitation"
  ) {
    return NextResponse.json(
      { error: "Invalid action." },
      { status: 400 }
    );
  }

  const user = await db.orm.public.User.first({
    id: userId,
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 }
    );
  }

  const roles =
    await getUserRoles(user.id);

  if (roles.length === 0) {
    return NextResponse.json(
      {
        error:
          "This user has no assigned roles.",
      },
      { status: 400 }
    );
  }

  const pendingInvitations =
    await db.orm.public.AuthToken.where({
      userId: user.id,
      type: "INVITATION",
      usedAt: null,
    }).all();

  if (pendingInvitations.length === 0) {
    return NextResponse.json(
      {
        error:
          "This user does not have a pending invitation.",
      },
      { status: 400 }
    );
  }

  for (const invitation of pendingInvitations) {
    await db.orm.public.AuthToken.where({
      id: invitation.id,
    }).delete();
  }

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setHours(
    expiresAt.getHours() + 24
  );

  await db.orm.public.AuthToken.create({
    userId: user.id,
    tokenHash,
    type: "INVITATION",
    expiresAt: expiresAt.toISOString(),
  });

  try {
    await sendInvitationEmail({
      name: user.name,
      email: user.email,
      roles,
      token: rawToken,
    });
  } catch (error) {
    console.error(
      "USER INVITATION EMAIL FAILED",
      error
    );

    return NextResponse.json(
      {
        error:
          "Invitation was created, but the email could not be sent. Try resending the invitation.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
  });
}

export async function DELETE(
  request: Request,
  { params }: RouteContext
) {
  const admin = await requireRole(["ADMIN"]);

  const { id } = await params;
  const userId = Number(id);

  if (!Number.isInteger(userId)) {
    return NextResponse.json(
      { error: "Invalid user ID." },
      { status: 400 }
    );
  }

  const user = await db.orm.public.User.first({
    id: userId,
  });

  if (!user) {
    return NextResponse.json(
      { error: "User not found." },
      { status: 404 }
    );
  }

  if (user.id === admin.id) {
    return NextResponse.json(
      {
        error:
          "You cannot delete your own account.",
      },
      { status: 400 }
    );
  }

  const roles =
    await getUserRoles(user.id);

  if (roles.includes("ADMIN")) {
    const admins =
      await db.orm.public.UserRoleAssignment
        .where({ role: "ADMIN" })
        .all();

    if (admins.length <= 1) {
      return NextResponse.json(
        {
          error:
            "The last administrator cannot be deleted.",
        },
        { status: 400 }
      );
    }
  }

  const organizedCompetitions =
    await db.orm.public.Competition.where({
      organizerId: user.id,
    }).all();

  const judgeAssignments =
    await db.orm.public.CompetitionJudge.where({
      judgeId: user.id,
    }).all();

  const tiebreakVotes =
    await db.orm.public.TiebreakVote.where({
      userId: user.id,
    }).all();

  let scorecardCount = 0;

  for (const assignment of judgeAssignments) {
    const scorecards =
      await db.orm.public.Scorecard.where({
        judgeAssignmentId:
          assignment.id,
      }).all();

    scorecardCount += scorecards.length;
  }

  if (
    organizedCompetitions.length > 0 ||
    judgeAssignments.length > 0 ||
    tiebreakVotes.length > 0 ||
    scorecardCount > 0
  ) {
    return NextResponse.json(
      {
        error:
          "This user has competition history and cannot be deleted. Change the user's roles instead.",
      },
      { status: 400 }
    );
  }

  const authTokens =
    await db.orm.public.AuthToken.where({
      userId: user.id,
    }).all();

  for (const token of authTokens) {
    await db.orm.public.AuthToken.where({
      id: token.id,
    }).delete();
  }

  const sessions =
    await db.orm.public.Session.where({
      userId: user.id,
    }).all();

  for (const session of sessions) {
    await db.orm.public.Session.where({
      id: session.id,
    }).delete();
  }

  const assignments =
    await db.orm.public.UserRoleAssignment
      .where({ userId: user.id })
      .all();

  for (const assignment of assignments) {
    await db.orm.public.UserRoleAssignment
      .where({ id: assignment.id })
      .delete();
  }

  await db.orm.public.User.where({
    id: user.id,
  }).delete();

  return NextResponse.json({
    success: true,
  });
}