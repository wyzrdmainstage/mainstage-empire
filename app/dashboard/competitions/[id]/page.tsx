import StatusManager from "./StatusManager";
import ResultsPanel from "./ResultsPanel";
import ShareResultsButton from "@/app/results/ShareResultsButton";
import TiebreakPanel from "./TiebreakPanel";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/src/auth/require-user";
import { db } from "@/src/prisma/db";

type CompetitionPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    view?: string;
  }>;
};

function statusLabel(status: string) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "READY":
      return "Ready";
    case "LIVE":
      return "Live";
    case "JUDGING_COMPLETE":
      return "Judging Complete";
    case "FINALIZED":
      return "Finalized";
    case "CANCELED":
      return "Canceled";
    case "ARCHIVED":
      return "Archived";
    default:
      return status;
  }
}

export default async function CompetitionPage({
  params,
  searchParams,
}: CompetitionPageProps) {
  const user = await requireUser();

  const { id } = await params;
  const { view } = await searchParams;

  const competitionId = Number(id);

  if (!Number.isInteger(competitionId)) {
    notFound();
  }

  const competition =
    await db.orm.public.Competition.first({
      id: competitionId,
    });

  if (!competition) {
    notFound();
  }

const canceledByUser =
  competition.canceledBy
    ? await db.orm.public.User.first({
        id: competition.canceledBy,
      })
    : null;

const isLocked =
  competition.status === "FINALIZED" ||
  competition.status === "CANCELED" ||
  competition.status === "ARCHIVED";

  const isAdmin =
    user.roles.includes("ADMIN");

  const isOrganizer =
    user.roles.includes("ORGANIZER");

  /*
   * Check actual judge assignment separately from
   * the user's JUDGE role.
   */
  const judgeAssignment =
    await db.orm.public.CompetitionJudge.first({
      competitionId,
      judgeId: user.id,
    });

  const isAssignedJudge =
    Boolean(judgeAssignment);

  const isJudgeExcluded =
    judgeAssignment?.excludedFromResults ?? false;

  /*
   * A multi-role user can explicitly enter their
   * judge view with ?view=judge.
   *
   * Judge access still requires an actual assignment
   * to this competition.
   */
  const wantsJudgeView =
    view === "judge";

  if (wantsJudgeView) {
    if (!isAssignedJudge) {
      redirect("/dashboard");
    }

    const performers =
      await db.orm.public.Performer.where({
        competitionId,
      }).all();

    const sortedPerformers =
      [...performers].sort(
        (a, b) =>
          a.performanceOrder -
          b.performanceOrder
      );

    const scorecards =
      await db.orm.public.Scorecard.where({
        judgeAssignmentId: judgeAssignment!.id,
      }).all();

    const scorecardByPerformer =
      new Map(
        scorecards.map((scorecard) => [
          scorecard.performerId,
          scorecard,
        ])
      );

    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <header className="border-b border-zinc-800 pb-8">
            <Link
              href="/dashboard/competitions"
              className="text-sm font-medium text-amber-400 hover:text-amber-300"
            >
              &larr; Back to Competitions
            </Link>

            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
              Mainstage Empire
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              {competition.name}
            </h1>

            <p className="mt-2 text-zinc-400">
              Performance Queue
            </p>

            <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-500">
              <span>
                {competition.venueName}
              </span>

              <span>&bull;</span>

              <span>
                {statusLabel(competition.status)}
              </span>
            </div>
          </header>

          {competition.status ===
            "JUDGING_COMPLETE" && (
            <TiebreakPanel
              competitionId={competition.id}
              role="JUDGE"
              excludedFromResults={isJudgeExcluded}
            />
          )}

          <section className="mt-10">
            {sortedPerformers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
                <h2 className="text-xl font-semibold">
                  No Performers Yet
                </h2>

                <p className="mt-2 text-zinc-500">
                  The competition lineup has not been
                  added yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {sortedPerformers.map(
                  (performer) => {
                    const scorecard =
                      scorecardByPerformer.get(
                        performer.id
                      );

                    const submitted =
                      scorecard?.status ===
                      "SUBMITTED";

                    return (
                      <div
                        key={performer.id}
                        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
                      >
                        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                          <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-400/10 font-bold text-amber-400">
                              {
                                performer.performanceOrder
                              }
                            </div>

                            <div>
                              <h2 className="text-xl font-semibold">
                                {
                                  performer.artistName
                                }
                              </h2>

                              <p className="mt-1 text-sm text-zinc-500">
                                {performer.songCount
                                  ? `${performer.songCount} ${
                                      performer.songCount ===
                                      1
                                        ? "song"
                                        : "songs"
                                    }`
                                  : "Song count not provided"}
                              </p>
                            </div>
                          </div>

{competition.status === "CANCELED" ? (
  <div className="rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm font-medium text-red-400">
    Competition Canceled
  </div>
) : submitted ? (
  <div className="rounded-lg border border-emerald-900 bg-emerald-950/20 px-4 py-3 text-sm font-medium text-emerald-400">
    Scorecard Submitted
  </div>
) : (
  <Link
    href={`/dashboard/competitions/${competitionId}/performers/${performer.id}`}
    className="rounded-lg bg-amber-400 px-5 py-3 text-center font-semibold text-black transition hover:bg-amber-300"
  >
    Score Performance
  </Link>
)}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            )}
          </section>

          <footer className="mt-10 border-t border-zinc-800 pt-6 text-sm text-zinc-600">
            Competition ID: {competition.id}
          </footer>
        </div>
      </main>
    );
  }

  /*
   * ADMIN and ORGANIZER see the competition management
   * view. Their access is global and is not restricted
   * to competitions they created.
   */
  if (isAdmin || isOrganizer) {
    const performers =
      await db.orm.public.Performer.where({
        competitionId,
      }).all();

    const judges =
      await db.orm.public.CompetitionJudge.where({
        competitionId,
      }).all();

    const scorecards = (
      await Promise.all(
        performers.map((performer) =>
          db.orm.public.Scorecard.where({
            performerId: performer.id,
          }).all()
        )
      )
    ).flat();

    const activeJudges =
      judges.filter(
        (judge) =>
          !judge.excludedFromResults
      );

    const activeJudgeAssignmentIds =
      new Set(
        activeJudges.map(
          (judge) => judge.id
        )
      );

    const submittedScorecards =
      scorecards.filter(
        (scorecard) =>
          scorecard.status === "SUBMITTED" &&
          activeJudgeAssignmentIds.has(
            scorecard.judgeAssignmentId
          )
      ).length;

    const totalExpectedScorecards =
      performers.length * activeJudges.length;

    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <header className="border-b border-zinc-800 pb-8">
            <Link
              href="/dashboard/competitions"
              className="text-sm font-medium text-amber-400 hover:text-amber-300"
            >
              &larr; Back to Competitions
            </Link>

            <p className="mt-8 text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
              Mainstage Empire
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              {competition.name}
            </h1>

            <p className="mt-2 text-zinc-400">
              Competition Management
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-400">
                {statusLabel(competition.status)}
              </span>

              <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-400">
                {performers.length}{" "}
                {performers.length === 1
                  ? "Performer"
                  : "Performers"}
              </span>

              <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-400">
                {judges.length}{" "}
                {judges.length === 1
                  ? "Judge"
                  : "Judges"}
              </span>
            </div>

            {(competition.status === "JUDGING_COMPLETE" ||
              competition.status === "FINALIZED" ||
              competition.status === "ARCHIVED") && (
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/results/${competitionId}`}
                  className="inline-flex items-center justify-center rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-300"
                >
                  View Results
                </Link>
                <ShareResultsButton href={`/results/${competitionId}`} />
              </div>
            )}
          </header>

{(competition.status === "CANCELED" ||
  (competition.status === "ARCHIVED" &&
    competition.cancellationReason)) && (
  <div className="mt-6 rounded-2xl border border-red-900/50 bg-red-950/20 p-6">
    <p className="text-sm font-semibold uppercase tracking-wider text-red-400">
      Cancellation Record
    </p>

    <p className="mt-3 text-sm leading-6 text-zinc-300">
      {competition.cancellationReason}
    </p>

    {competition.canceledAt && (
      <p className="mt-3 text-xs text-zinc-500">
        Canceled on{" "}
        {new Date(
          competition.canceledAt
        ).toLocaleString()}
      </p>
    )}

    {canceledByUser && (
      <p className="mt-2 text-xs text-zinc-500">
        Canceled by{" "}
        <span className="text-zinc-400">
          {canceledByUser.name || canceledByUser.email}
        </span>
      </p>
    )}
  </div>
)}

          <section className="mt-10 grid gap-6 md:grid-cols-2">
            <Link
              href={`/dashboard/competitions/${competitionId}/feedback`}
              className="group rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50 md:col-span-2"
            >
              <h2 className="text-2xl font-semibold">Judge Feedback</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Review submitted judges&apos; notes for each performer.
              </p>
              <div className="mt-4 text-sm font-medium text-amber-400">
                View Judge Feedback &rarr;
              </div>
            </Link>
            <Link
              href={`/dashboard/competitions/${competitionId}/performers`}
              className="group rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                    {isLocked
                      ? "Finalized Lineup"
                      : "Lineup"}
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Performers
                  </h2>

                  <p className="mt-2 text-sm text-zinc-400">
                    {isLocked
                      ? "View the official performance lineup and locked positions."
                      : "Add performers, manage the performance order, and monitor scoring locks."}
                  </p>
                </div>

                <span className="text-2xl text-zinc-600 transition group-hover:text-amber-400">
                  &rarr;
                </span>
              </div>

              <div className="mt-6 text-sm font-medium text-amber-400">
                {isLocked ? (
                  <>View Lineup &rarr;</>
                ) : (
                  <>Manage Performers &rarr;</>
                )}
              </div>
            </Link>

            <Link
              href={`/dashboard/competitions/${competitionId}/judges`}
              className="group rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                    {isLocked
                      ? "Finalized Judging Panel"
                      : "Judging Panel"}
                  </p>

                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Judges
                  </h2>

                  <p className="mt-2 text-sm text-zinc-400">
                    {isLocked
                      ? "View the official judging panel and submission history."
                      : "Assign and manage judges for this competition, and monitor their submission progress."}
                  </p>
                </div>

                <span className="text-2xl text-zinc-600 transition group-hover:text-amber-400">
                  &rarr;
                </span>
              </div>

              <div className="mt-6 text-sm font-medium text-amber-400">
                {isLocked ? (
                  <>View Judging Panel &rarr;</>
                ) : (
                  <>Manage Judges &rarr;</>
                )}
              </div>
            </Link>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                Competition Status
              </p>

              <div className="mt-4">
                <StatusManager
                  competitionId={competition.id}
                  status={competition.status}
                  performerCount={performers.length}
                  judgeCount={judges.length}
                />
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                Judging Progress
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-white">
                {submittedScorecards} /{" "}
                {totalExpectedScorecards}
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                Submitted scorecards
              </p>

              <div className="mt-6 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full bg-amber-400 transition-all"
                  style={{
                    width:
                      totalExpectedScorecards > 0
                        ? `${Math.min(
                            100,
                            (submittedScorecards /
                              totalExpectedScorecards) *
                              100
                          )}%`
                        : "0%",
                  }}
                />
              </div>
            </div>

            {competition.status ===
              "JUDGING_COMPLETE" && (
              <div className="md:col-span-2">
                <TiebreakPanel
                  competitionId={competition.id}
                  role="ORGANIZER"
                />
              </div>
            )}

            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 md:col-span-2">
              <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                Results
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-white">
                Competition Results
              </h2>

              <p className="mt-2 text-sm text-zinc-400">
                Final rankings are calculated from the
                judges&apos; submitted scorecards.
              </p>

              <ResultsPanel
                competitionId={competition.id}
                status={competition.status}
              />
            </div>
          </section>

          {isAssignedJudge && competition.status !== "CANCELED" && (
            <section className="mt-6">
              <Link
                href={`/dashboard/competitions/${competitionId}?view=judge`}
                className={`block rounded-2xl border p-6 transition ${
                isJudgeExcluded
                  ? "border-red-900/60 bg-red-950/20"
                  : "border-amber-500/30 bg-amber-400/5 hover:border-amber-400/60"
              }`}
              >
                <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                  Judge Assignment
                </p>

                <h2 className="mt-2 text-xl font-semibold text-white">
                  Open Your Judge View
                </h2>

                {isJudgeExcluded ? (
                  <>
                    <p className="mt-2 text-sm text-red-400">
                      You have been excluded from this competition&apos;s
                      official results. Your previous scores are retained,
                      but you cannot submit additional scores or vote in
                      tiebreaks while excluded.
                    </p>

                    <div className="mt-4 text-sm font-medium text-red-400">
                      Excluded from Results
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-zinc-400">
                      You are assigned as a judge for this
                      competition. Use your assigned performer
                      queue to submit scorecards.
                    </p>

                    <div className="mt-4 text-sm font-medium text-amber-400">
                      Open Judge Queue &rarr;
                    </div>
                  </>
                )}
              </Link>
            </section>
          )}

          <footer className="mt-10 border-t border-zinc-800 pt-6 text-sm text-zinc-600">
            Competition ID: {competition.id}
          </footer>
        </div>
      </main>
    );
  }

  /*
   * Users without ADMIN or ORGANIZER access must be
   * assigned as a judge to view this competition.
   */
  if (!isAssignedJudge) {
    redirect("/dashboard");
  }

  const performers =
    await db.orm.public.Performer.where({
      competitionId,
    }).all();

  const sortedPerformers =
    [...performers].sort(
      (a, b) =>
        a.performanceOrder -
        b.performanceOrder
    );

  const scorecards =
    await db.orm.public.Scorecard.where({
      judgeAssignmentId: judgeAssignment!.id,
    }).all();

  const scorecardByPerformer =
    new Map(
      scorecards.map((scorecard) => [
        scorecard.performerId,
        scorecard,
      ])
    );

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <header className="border-b border-zinc-800 pb-8">
          <Link
            href="/dashboard/competitions"
            className="text-sm font-medium text-amber-400 hover:text-amber-300"
          >
            &larr; Back to Competitions
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
            Mainstage Empire
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            {competition.name}
          </h1>

          <p className="mt-2 text-zinc-400">
            Performance Queue
          </p>

          <div className="mt-4 flex flex-wrap gap-3 text-sm text-zinc-500">
            <span>{competition.venueName}</span>
            <span>&bull;</span>
            <span>
              {statusLabel(competition.status)}
            </span>
          </div>
        </header>

        {competition.status ===
          "JUDGING_COMPLETE" && (
          <TiebreakPanel
            competitionId={competition.id}
            role="JUDGE"
          />
        )}

        <section className="mt-10">
          {sortedPerformers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
              <h2 className="text-xl font-semibold">
                No Performers Yet
              </h2>

              <p className="mt-2 text-zinc-500">
                The competition lineup has not been
                added yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {sortedPerformers.map(
                (performer) => {
                  const scorecard =
                    scorecardByPerformer.get(
                      performer.id
                    );

                  const submitted =
                    scorecard?.status ===
                    "SUBMITTED";

                  return (
                    <div
                      key={performer.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
                    >
                      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-400/10 font-bold text-amber-400">
                            {
                              performer.performanceOrder
                            }
                          </div>

                          <div>
                            <h2 className="text-xl font-semibold">
                              {
                                performer.artistName
                              }
                            </h2>

                            <p className="mt-1 text-sm text-zinc-500">
                              {performer.songCount
                                ? `${performer.songCount} ${
                                    performer.songCount ===
                                    1
                                      ? "song"
                                      : "songs"
                                  }`
                                : "Song count not provided"}
                            </p>
                          </div>
                        </div>

                        {submitted ? (
                          <div className="rounded-lg border border-emerald-900 bg-emerald-950/20 px-4 py-3 text-sm font-medium text-emerald-400">
                            Scorecard Submitted
                          </div>
                        ) : (
                          <Link
                            href={`/dashboard/competitions/${competitionId}/performers/${performer.id}`}
                            className="rounded-lg bg-amber-400 px-5 py-3 text-center font-semibold text-black transition hover:bg-amber-300"
                          >
                            Score Performance
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
