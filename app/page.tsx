import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getUserFromSessionToken,
  SESSION_COOKIE,
} from "@/src/auth";
import LoginForm from "./LoginForm";

export default async function Home() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    const user = await getUserFromSessionToken(sessionToken);

    if (user) {
      redirect("/dashboard");
    }
  }

  return <LoginForm />;
}