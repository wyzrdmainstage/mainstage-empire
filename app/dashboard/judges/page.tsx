import Link from "next/link";
import { requireRole } from "@/src/auth/require-user";
import { db } from "@/src/prisma/db";

export default async function JudgesPage() {
  await requireRole(["ADMIN", "ORGANIZER"]);

  const judgeAssignments =
    await db.orm.public.UserRoleAssignment
      .where({
        role: "JUDGE",
      })
      .all();

  const judgeUsers = await Promise.all(
    judgeAssignments.map(async (assignment) => {
      return db.orm.public.User.first({
        id: assignment.userId,
      });
    })
  );

  const judges = judgeUsers.filter(
    (
      judge
    ): judge is NonNullable<typeof judge> =>
      judge !== null
  );

  judges.sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/dashboard"
          className="text-[#f5b942] hover:underline"
        >
          &larr; Back to Dashboard
        </Link>

        <div className="mt-10">
          <p className="text-sm font-bold tracking-[0.35em] text-[#f5b942]">
            MAINSTAGE EMPIRE
          </p>

          <h1 className="mt-4 text-4xl font-bold">
            Judges
          </h1>

          <p className="mt-3 text-zinc-400">
            Judge accounts available for Mainstage Score competitions.
          </p>
        </div>

        <div className="mt-10 border-t border-zinc-800 pt-8">
          {judges.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8">
              <h2 className="text-xl font-semibold">
                No Judges Yet
              </h2>

              <p className="mt-2 text-zinc-400">
                Judges are created automatically when an organizer
                assigns a new judge to a competition.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {judges.map((judge) => (
                <div
                  key={judge.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
                >
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="text-xl font-semibold">
                        {judge.name}
                      </h2>

                      <p className="mt-1 text-zinc-400">
                        {judge.email}
                      </p>
                    </div>

                    <div className="rounded-lg border border-[#f5b942]/30 px-4 py-2 text-sm text-[#f5b942]">
                      JUDGE
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}