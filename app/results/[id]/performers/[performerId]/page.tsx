import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/src/prisma/db";
import ShareResultsButton from "@/app/results/ShareResultsButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performer Scoresheet | Mainstage Empire", robots: { index: false, follow: false } };

const categories = [
  ["presentation", "Presentation"],
  ["vocals", "Vocals"],
  ["lyrics", "Lyrics"],
  ["energy", "Energy"],
  ["quality", "Quality"],
  ["starFactor", "Star Factor"],
] as const;

export default async function PerformerScoresheetPage({ params }: {
  params: Promise<{ id: string; performerId: string }>;
}) {
  const { id, performerId } = await params;
  const competitionId = Number(id);
  const performerIdNumber = Number(performerId);
  if (!Number.isSafeInteger(competitionId) || competitionId <= 0 ||
      !Number.isSafeInteger(performerIdNumber) || performerIdNumber <= 0) notFound();

  const competition = await db.orm.public.Competition.first({ id: competitionId });
  if (!competition || !["FINALIZED", "ARCHIVED"].includes(competition.status)) notFound();

  const performer = await db.orm.public.Performer.first({ id: performerIdNumber, competitionId });
  if (!performer || performer.excludedFromResults) notFound();

  const assignments = await db.orm.public.CompetitionJudge.where({ competitionId }).all();
  const eligibleIds = new Set(assignments.filter((judge) => !judge.excludedFromResults).map((judge) => judge.id));
  const cards = await db.orm.public.Scorecard.where({ performerId: performer.id }).all();
  const submitted = cards.filter((card) => card.status === "SUBMITTED" && eligibleIds.has(card.judgeAssignmentId));
  if (submitted.length === 0) notFound();

  const averages = categories.map(([key, label]) => ({
    key, label,
    score: submitted.reduce((sum, card) => sum + (card[key] ?? 0), 0) / submitted.length,
  }));
  const finalScore = averages.reduce((sum, category) => sum + category.score, 0);

  return (
    <main className="min-h-screen bg-black px-5 py-10 text-white">
      <div className="mx-auto max-w-3xl">
        <header className="border-b border-zinc-800 pb-8">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-amber-400">Mainstage Empire</p>
          <p className="mt-6 text-sm text-zinc-400">Official Performer Scoresheet</p>
          <h1 className="mt-2 break-words text-4xl font-black">{performer.artistName}</h1>
          <p className="mt-3 text-lg text-zinc-300">{competition.name}</p>
          <p className="mt-2 text-sm text-zinc-400">{competition.venueName} · Performance #{performer.performanceOrder}</p>
          <div className="mt-6">
            <ShareResultsButton label="Share Scoresheet" title={`${performer.artistName} — Mainstage Empire Scoresheet`} />
          </div>
        </header>
        <section aria-label="Final score" className="my-8 rounded-2xl border border-amber-400/40 bg-amber-400/5 p-8 text-center">
          <p className="text-sm font-semibold text-zinc-300">Final Score</p>
          <p className="mt-3 text-5xl font-black text-amber-400">{finalScore.toFixed(1)} <span className="text-xl text-zinc-400">/ 60</span></p>
          <p className="mt-3 text-sm text-zinc-400">Average of {submitted.length} submitted {submitted.length === 1 ? "scorecard" : "scorecards"} from judges included in official results.</p>
        </section>
        <section aria-labelledby="category-heading">
          <h2 id="category-heading" className="mb-4 text-xl font-bold">Category Scores</h2>
          <dl className="divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950 px-5">
            {averages.map(({ key, label, score }) => (
              <div key={key} className="flex justify-between gap-4 py-4">
                <dt className="text-zinc-300">{label}</dt>
                <dd className="font-bold text-amber-400">{score.toFixed(1)} <span className="font-normal text-zinc-500">/ 10</span></dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-zinc-500">Each category shows the average across the included judges. Scores are rounded to one decimal place.</p>
        </section>
        <footer className="mt-10 border-t border-zinc-800 pt-6">
          <Link href={`/results/${competitionId}`} className="text-sm font-semibold text-amber-400 hover:text-amber-300">View Competition Results →</Link>
        </footer>
      </div>
    </main>
  );
}
