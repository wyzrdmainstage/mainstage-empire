import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/src/auth/require-user";
import { db } from "@/src/prisma/db";

export const metadata = { title: "Judge Feedback | Mainstage Empire" };

export default async function JudgeFeedbackPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "ORGANIZER"]);

  const { id } = await params;
  const competitionId = Number(id);
  if (!Number.isSafeInteger(competitionId) || competitionId <= 0) notFound();

  const competition = await db.orm.public.Competition.first({ id: competitionId });
  if (!competition) notFound();

  const [performers, assignments] = await Promise.all([
    db.orm.public.Performer.where({ competitionId }).all(),
    db.orm.public.CompetitionJudge.where({ competitionId }).all(),
  ]);
  const judges = await Promise.all(assignments.map(async (assignment) => {
    const [user, scorecards] = await Promise.all([
      db.orm.public.User.first({ id: assignment.judgeId }),
      db.orm.public.Scorecard.where({
        judgeAssignmentId: assignment.id,
        status: "SUBMITTED",
      }).all(),
    ]);
    return {
      ...assignment,
      name: user?.name || user?.email || "Unknown judge",
      cards: new Map(scorecards.map((card) => [card.performerId, card])),
    };
  }));
  judges.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  performers.sort((a, b) => a.performanceOrder - b.performanceOrder || a.id - b.id);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="border-b border-zinc-800 pb-8">
          <Link href={`/dashboard/competitions/${competitionId}`} className="text-sm font-medium text-amber-400 hover:text-amber-300">
            &larr; Back to Competition
          </Link>
          <h1 className="mt-8 text-4xl font-bold">Judge Feedback</h1>
          <p className="mt-2 text-zinc-300">{competition.name}</p>
          <p className="mt-4 text-sm text-zinc-400">
            Notes from submitted scorecards, visible only to admins and organizers.
            Judges can submit a scorecard without adding notes.
          </p>
        </header>

        <div className="mt-8 space-y-6">
          {performers.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-800 p-8 text-zinc-400">
              No performers have been added yet.
            </p>
          )}
          {performers.map((performer) => {
            const submittedJudges = judges.filter((judge) => judge.cards.has(performer.id));
            return (
              <section key={performer.id} aria-labelledby={`performer-${performer.id}`} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
                <h2 id={`performer-${performer.id}`} className="break-words text-xl font-semibold">
                  <span className="text-amber-400">#{performer.performanceOrder}</span>{" "}
                  {performer.artistName}
                </h2>
                {performer.excludedFromResults && (
                  <p className="mt-2 text-sm text-red-400">Performer excluded from results</p>
                )}
                {submittedJudges.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-400">No submitted scorecards yet.</p>
                ) : (
                  <div className="mt-5 space-y-4">
                    {submittedJudges.map((judge) => {
                      const card = judge.cards.get(performer.id)!;
                      return (
                        <article key={judge.id} className="rounded-xl border border-zinc-800 bg-black p-4">
                          <h3 className="break-words font-semibold">{judge.name}</h3>
                          {judge.excludedFromResults && (
                            <p className="mt-1 text-sm text-red-400">Judge excluded from results</p>
                          )}
                          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">
                            {card.notes?.trim() || "No written feedback provided."}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
