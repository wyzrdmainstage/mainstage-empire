import Link from "next/link";
import { requireUser } from "@/src/auth/require-user";

export default async function Dashboard() {
  const user = await requireUser();

  const isAdmin = user.roles.includes("ADMIN");
  const isOrganizer = user.roles.includes("ORGANIZER");
  const isJudge = user.roles.includes("JUDGE");

  const isManager = isAdmin || isOrganizer;

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <section>
          <h2 className="text-2xl font-semibold">
            Dashboard
          </h2>

          <p className="mt-2 text-zinc-400">
            Your Mainstage Score workspace.
          </p>

          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {isAdmin && (
              <Link
                href="/dashboard/admin"
                className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50"
              >
                <h3 className="text-xl font-semibold text-white">
                  Administration
                </h3>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Manage Mainstage Score users, organizers, and system settings.
                </p>

                <div className="mt-6 inline-block rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-400 hover:text-black">
                  Open
                </div>
              </Link>
            )}

            {isManager && (
              <>
                <Link
                  href="/dashboard/competitions"
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50"
                >
                  <h3 className="text-xl font-semibold text-white">
                    Competitions
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    Create, manage, and oversee Mainstage competitions.
                  </p>

                  <div className="mt-6 inline-block rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-400 hover:text-black">
                    Open
                  </div>
                </Link>

                <Link
                  href="/dashboard/judges"
                  className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50"
                >
                  <h3 className="text-xl font-semibold text-white">
                    Judges
                  </h3>

                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    Manage judges and assign them to competitions.
                  </p>

                  <div className="mt-6 inline-block rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-400 hover:text-black">
                    Open
                  </div>
                </Link>
              </>
            )}

            {isJudge && !isManager && (
              <Link
                href="/dashboard/competitions"
                className="block rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50"
              >
                <h3 className="text-xl font-semibold text-white">
                  My Competitions
                </h3>

                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  View competitions you have been assigned to judge.
                </p>

                <div className="mt-6 inline-block rounded-lg border border-amber-400/40 px-4 py-2 text-sm font-semibold text-amber-400 transition hover:bg-amber-400 hover:text-black">
                  Open
                </div>
              </Link>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}