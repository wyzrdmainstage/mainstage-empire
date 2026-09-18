import { NextResponse } from "next/server";
import { requireRole } from "@/src/auth/require-user";
import {
  generateToken,
  hashToken,
} from "@/src/auth";
import { db } from "@/src/prisma/db";
import nodemailer from "nodemailer";
import { normalizeEmail } from "@/src/utils/email";

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

async function sendUserInvitationEmail(
  to: string,
  invitationUrl: string,
  name: string,
  roles: UserRole[]
) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = Number(process.env.SMTP_PORT);
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const smtpFrom = process.env.SMTP_FROM;

  if (
    !smtpHost ||
    !smtpPort ||
    !smtpUser ||
    !smtpPassword ||
    !smtpFrom
  ) {
    throw new Error(
      "SMTP environment variables are not fully configured."
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });

  const rolesText = roleLabels(roles);

  const subject = "You're invited to Mainstage Score";

  const text = `Hello ${name},

You have been invited to Mainstage Score with the following role${roles.length === 1 ? "" : "s"}: ${rolesText}.

Use the link below to access your account:

${invitationUrl}

This invitation link expires in 24 hours and can only be used once.

Mainstage Empire`;

  const html = `
    <div style="font-family:Arial,sans-serif;background:#000;color:#fff;padding:32px;">
      <div style="max-width:600px;margin:0 auto;">
        <h1 style="color:#fbbf24;">MAINSTAGE EMPIRE</h1>

        <h2>You're invited to Mainstage Score</h2>

        <p>Hello ${name},</p>

        <p>
          You have been invited to Mainstage Score with the following
          role${roles.length === 1 ? "" : "s"}:
          <strong>${rolesText}</strong>
        </p>

        <p>
          <a
            href="${invitationUrl}"
            style="
              display:inline-block;
              background:#fbbf24;
              color:#000;
              padding:12px 20px;
              border-radius:8px;
              text-decoration:none;
              font-weight:bold;
            "
          >
            Access Mainstage Score
          </a>
        </p>

        <p>
          This invitation link expires in 24 hours and can only be used once.
        </p>

        <p style="color:#a1a1aa;">
          Mainstage Empire
        </p>
      </div>
    </div>
  `;

  return transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html,
  });
}

export async function GET() {
  await requireRole(["ADMIN"]);

  const users = await db.orm.public.User.where({}).all();

  const usersWithStatus = await Promise.all(
    users.map(async (user) => {
      const assignments =
        await db.orm.public.UserRoleAssignment
          .where({ userId: user.id })
          .all();

      const pendingInvitations =
        await db.orm.public.AuthToken.where({
          userId: user.id,
          type: "INVITATION",
          usedAt: null,
        }).all();

      const roles = assignments
        .map(
          (assignment) =>
            assignment.role as UserRole
        )
        .filter((role) =>
          VALID_ROLES.includes(role)
        );

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        roles,
        status:
          pendingInvitations.length > 0
            ? "INVITATION_PENDING"
            : "ACTIVE",
        createdAt: user.createdAt,
      };
    })
  );

  const sortedUsers = usersWithStatus.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return NextResponse.json({
    users: sortedUsers,
  });
}

export async function POST(request: Request) {
  await requireRole(["ADMIN"]);

  try {
    const body = await request.json();

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : "";

    const email =
      typeof body.email === "string"
        ? normalizeEmail(body.email)
        : "";

    const requestedRoles = Array.isArray(body.roles)
      ? body.roles
      : [];

    const roles: UserRole[] = [];

for (const role of requestedRoles) {
  if (
    typeof role === "string" &&
    VALID_ROLES.includes(role as UserRole)
  ) {
    const typedRole = role as UserRole;

    if (!roles.includes(typedRole)) {
      roles.push(typedRole);
    }
  }
}

    const sendInvitation =
      body.sendInvitation !== false;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required." },
        { status: 400 }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        {
          error:
            "Name must be 100 characters or fewer.",
        },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        {
          error:
            "A valid email address is required.",
        },
        { status: 400 }
      );
    }

    if (roles.length === 0) {
      return NextResponse.json(
        {
          error:
            "At least one role must be selected.",
        },
        { status: 400 }
      );
    }

    if (
      requestedRoles.length !== roles.length
    ) {
      return NextResponse.json(
        { error: "Invalid user role." },
        { status: 400 }
      );
    }

    const existing = await db.orm.public.User.first({
      email,
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account already exists with that email address.",
        },
        { status: 409 }
      );
    }

    const user = await db.orm.public.User.create({
      name,
      email,
      updatedAt: new Date().toISOString(),
    });

    for (const role of roles) {
      await db.orm.public.UserRoleAssignment.create({
        userId: user.id,
        role,
      });
    }

    if (!sendInvitation) {
      return NextResponse.json(
        {
          success: true,
          invitationSent: false,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            roles,
            createdAt: user.createdAt,
          },
        },
        { status: 201 }
      );
    }

    const invitationToken = generateToken();
    const tokenHash = hashToken(invitationToken);

    const expiresAt = new Date();
    expiresAt.setHours(
      expiresAt.getHours() + 24
    );

    await db.orm.public.AuthToken.create({
      userId: user.id,
      type: "INVITATION",
      tokenHash,
      expiresAt: expiresAt.toISOString(),
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const invitationUrl =
      `${appUrl}/invite?token=${invitationToken}`;

    try {
      await sendUserInvitationEmail(
        user.email,
        invitationUrl,
        user.name,
        roles
      );
    } catch (error) {
      console.error(
        "USER INVITATION EMAIL FAILED",
        error
      );

      return NextResponse.json(
        {
          error:
            "The user account was created, but the invitation email could not be sent. The invitation remains pending and can be resent from the Admin Center.",
          userCreated: true,
          invitationSent: false,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            roles,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        invitationSent: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          roles,
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Admin user creation error:",
      error
    );

    return NextResponse.json(
      { error: "Unable to create user." },
      { status: 500 }
    );
  }
}