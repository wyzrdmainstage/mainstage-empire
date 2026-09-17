import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/src/auth/require-user";
import { db } from "@/src/prisma/db";
import JudgesManager from "./JudgesManager";

type JudgesPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function JudgesPage({
  params,
}: JudgesPageProps) {
  const user = await requireRole(["ADMIN", "ORGANIZER"]);

  const { id } = await params;
  const competitionId = Number(id);

  if (!Number.isInteger(competitionId)) {
    notFound();
  }

  const competition = await db.orm.public.Competition.first({
    id: competitionId,
  });

  if (!competition) {
    notFound();
  }

  const performers = await db.orm.public.Performer.where({
    competitionId,
  }).all();

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

      return {
        assignmentId: assignment.id,
        judgeId: assignment.judgeId,
        email: judge?.email ?? "",
        name: judge?.name ?? null,
        submittedScorecards: scorecards.filter(
          (scorecard) => scorecard.status === "SUBMITTED"
        ).length,
      };
    })
  );

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b border-zinc-800 pb-8">
          <Link
            href={`/dashboard/competitions/${competitionId}`}
            className="text-sm font-medium text-amber-400 hover:text-amber-300"
          >
            &larr; Back to Competition
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
            Mainstage Empire
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            Judges
          </h1>

          <p className="mt-2 text-zinc-400">
            {competition.name}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-500">
            <span>
              {judges.length}{" "}
              {judges.length === 1 ? "judge" : "judges"}
            </span>

            <span>&bull;</span>

            <span>
              {performers.length}{" "}
              {performers.length === 1
                ? "performer"
                : "performers"}
            </span>

            <span>&bull;</span>

            <span>{competition.status}</span>
          </div>
        </header>

        <section className="mt-10">
          <JudgesManager
            competitionId={competitionId}
            competitionStatus={competition.status}
            performersCount={performers.length}
            judges={judges}
          />
        </section>
      </div>
    </main>
  );
}
