import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  getUserFromSessionToken,
  SESSION_COOKIE,
} from "@/src/auth";
import { db } from "@/src/prisma/db";
import ScorecardForm from "./ScorecardForm";

type PerformerPageProps = {
  params: Promise<{
    id: string;
    performerId: string;
  }>;
};

export default async function PerformerScorecardPage({
  params,
}: PerformerPageProps) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;

  if (!sessionToken) {
    redirect("/");
  }

  const user = await getUserFromSessionToken(sessionToken);

  if (!user) {
    redirect("/");
  }

  if (!user.roles.includes("JUDGE")) {
  redirect("/dashboard");
}

  const { id, performerId } = await params;

  const competitionId = Number(id);
  const performerIdNumber = Number(performerId);

  if (
    !Number.isInteger(competitionId) ||
    !Number.isInteger(performerIdNumber)
  ) {
    notFound();
  }

  const assignment = await db.orm.public.CompetitionJudge.first({
    competitionId,
    judgeId: user.id,
  });

  if (!assignment) {
    notFound();
  }

  const competition = await db.orm.public.Competition.first({
    id: competitionId,
  });

  if (!competition) {
    notFound();
  }

  const performer = await db.orm.public.Performer.first({
    id: performerIdNumber,
    competitionId,
  });

  if (!performer) {
    notFound();
  }

  const existingScorecard =
    await db.orm.public.Scorecard.first({
      performerId: performer.id,
      judgeAssignmentId: assignment.id,
    });

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="border-b border-zinc-800 pb-8">
          <Link
            href={`/dashboard/competitions/${competitionId}?view=judge`}
            className="text-sm font-medium text-amber-400 hover:text-amber-300"
          >
            ← Back to Performance Queue
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
            Mainstage Empire
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            {performer.artistName}
          </h1>

          <p className="mt-2 text-zinc-400">
            {competition.name}
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-500">
            <span>
              Performance #{performer.performanceOrder}
            </span>

            <span>•</span>

            <span>
              {performer.songCount
                ? `${performer.songCount} songs`
                : "Song count not provided"}
            </span>
          </div>
        </header>

        <section className="mt-10">
          {existingScorecard?.status === "SUBMITTED" ? (
            <div className="rounded-2xl border border-emerald-900 bg-emerald-950/20 p-8 text-center">
              <h2 className="text-2xl font-semibold text-emerald-400">
                Scorecard Submitted
              </h2>

              <p className="mt-3 text-zinc-400">
                Your scorecard for this performance has been
                submitted and is locked.
              </p>

              <Link
                href={`/dashboard/competitions/${competitionId}?view=judge`}
                className="mt-6 inline-block rounded-lg bg-amber-400 px-5 py-3 font-semibold text-black transition hover:bg-amber-300"
              >
                Return to Queue
              </Link>
            </div>
          ) : (
            <ScorecardForm
              competitionId={competitionId}
              performerId={performer.id}
              existingScorecard={existingScorecard}
            />
          )}
        </section>
      </div>
    </main>
  );
}