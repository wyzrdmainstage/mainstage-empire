import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getUserFromSessionToken,
  hasAnyRole,
  SESSION_COOKIE,
  type UserRole,
} from "@/src/auth";

export async function requireUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    redirect("/");
  }

  const user = await getUserFromSessionToken(sessionToken);

  if (!user) {
    redirect("/");
  }

  return user;
}

export async function requireRole(
  allowedRoles: UserRole[]
) {
  const user = await requireUser();

  if (!hasAnyRole(user, allowedRoles)) {
    redirect("/dashboard");
  }

  return user;
}