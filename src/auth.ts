import { createHash, randomBytes } from "crypto";
import { db } from "@/src/prisma/db";

export const SESSION_COOKIE = "mainstage_session";

export type UserRole = "ADMIN" | "ORGANIZER" | "JUDGE";

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getUserRoles(
  userId: number
): Promise<UserRole[]> {
  const roles = await db.orm.public.UserRoleAssignment
    .where({ userId })
    .all();

  return roles.map(
    (assignment) => assignment.role as UserRole
  );
}

export async function createSession(userId: number) {
  const token = generateToken();
  const tokenHash = hashToken(token);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  await db.orm.public.Session.create({
    userId,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    token,
    expiresAt,
  };
}

export async function getUserFromSessionToken(
  token: string
) {
  const tokenHash = hashToken(token);

  const session = await db.orm.public.Session.first({
    tokenHash,
  });

  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt) <= new Date()) {
    return null;
  }

  const user = await db.orm.public.User.first({
    id: session.userId,
  });

  if (!user) {
    return null;
  }

  const roles = await getUserRoles(user.id);

  return {
    ...user,
    roles,
  };
}

export function hasRole(
  user: { roles: UserRole[] },
  role: UserRole
): boolean {
  return user.roles.includes(role);
}

export function hasAnyRole(
  user: { roles: UserRole[] },
  roles: UserRole[]
): boolean {
  return roles.some((role) =>
    user.roles.includes(role)
  );
}