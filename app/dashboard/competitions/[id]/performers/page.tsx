import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/src/auth/require-user";
import { db } from "@/src/prisma/db";
import PerformersManager from "./PerformersManager";

type PerformersPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function PerformersPage({
  params,
}: PerformersPageProps) {
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

  const sortedPerformers = [...performers].sort(
    (a, b) => a.performanceOrder - b.performanceOrder
  );

  const performersWithLockStatus = await Promise.all(
    sortedPerformers.map(async (performer) => {
      const scorecards = await db.orm.public.Scorecard.where({
        performerId: performer.id,
      }).all();

      return {
        id: performer.id,
        artistName: performer.artistName,
        songCount: performer.songCount,
        supporterCount: performer.supporterCount,
        performanceOrder: performer.performanceOrder,
        isScoringLocked: scorecards.length > 0,
        excludedFromResults: performer.excludedFromResults,
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
            Performers
          </h1>

          <p className="mt-2 text-zinc-400">
            {competition.name}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-500">
            <span>
              {performersWithLockStatus.length}{" "}
              {performersWithLockStatus.length === 1
                ? "performer"
                : "performers"}
            </span>

            <span>|</span>

            <span>{competition.status}</span>
          </div>
        </header>

        <section className="mt-10">
          <PerformersManager
            competitionId={competitionId}
            competitionStatus={competition.status}
            performers={performersWithLockStatus}
            isAdmin={user.roles.includes("ADMIN")}
          />
        </section>
      </div>
    </main>
  );
}
