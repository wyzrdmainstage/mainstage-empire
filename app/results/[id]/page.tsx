import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/src/prisma/db";
import ShareResultsButton from "@/app/results/ShareResultsButton";

type ResultsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function statusLabel(status: string) {
  switch (status) {
    case "JUDGING_COMPLETE":
      return "Judging Complete";
    case "FINALIZED":
      return "Official Results";
    case "ARCHIVED":
      return "Archived Results";
    default:
      return status;
  }
}

export default async function ResultsPage({
  params,
}: ResultsPageProps) {
  const { id } = await params;
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

  const resultsPublished =
    competition.status === "JUDGING_COMPLETE" ||
    competition.status === "FINALIZED" ||
    competition.status === "ARCHIVED";

  if (!resultsPublished) {
    return (
      <main className="min-h-screen bg-black text-white">
        <div className="mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6 py-10">
          <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
              MAINSTAGE EMPIRE
            </p>

            <h1 className="mt-4 text-3xl font-bold">
              Results Not Yet Published
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-zinc-400">
              The official results for this competition
              have not been published yet.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const performers =
    await db.orm.public.Performer.where({
      competitionId,
    }).all();

  const eligiblePerformers =
    performers.filter(
      (performer) =>
        !performer.excludedFromResults
    );

  const assignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  const tiebreaks =
    await db.orm.public.Tiebreak.where({
      competitionId,
    }).all();

  const resolvedTiebreaks =
    tiebreaks.filter(
      (tiebreak) =>
        tiebreak.status === "RESOLVED" &&
        tiebreak.winnerPerformerId !== null
    );

  const resolvedTiebreakDetails =
    await Promise.all(
      resolvedTiebreaks.map(
        async (tiebreak) => {
          const participants =
            await db.orm.public.TiebreakPerformer.where({
              tiebreakId: tiebreak.id,
            }).all();

          const eligibleIds =
            new Set(
              eligiblePerformers.map(
                (performer) => performer.id
              )
            );

          const performerIds =
            participants
              .map(
                (participant) =>
                  participant.performerId
              )
              .filter((performerId) =>
                eligibleIds.has(performerId)
              );

          const winnerStillEligible =
            tiebreak.winnerPerformerId !== null &&
            eligibleIds.has(
              tiebreak.winnerPerformerId
            );

          return {
            id: tiebreak.id,
            placement:
              tiebreak.placement,
            winnerPerformerId:
              winnerStillEligible
                ? tiebreak.winnerPerformerId
                : null,
            performerIds,
          };
        }
      )
    );

  const activeResolvedTiebreakDetails =
    resolvedTiebreakDetails.filter(
      (tiebreak) =>
        tiebreak.winnerPerformerId !== null &&
        tiebreak.performerIds.length >= 2
    );

  const results = await Promise.all(
    eligiblePerformers.map(
      async (performer) => {
        const scorecards =
          await Promise.all(
            assignments.map(
              (assignment) =>
                db.orm.public.Scorecard.first({
                  performerId:
                    performer.id,
                  judgeAssignmentId:
                    assignment.id,
                })
            )
          );

        const submittedScorecards =
          scorecards.filter(
            (scorecard) =>
              scorecard &&
              scorecard.status === "SUBMITTED"
          );

        const totals =
          submittedScorecards.map(
            (scorecard) =>
              (scorecard?.presentation ??
                0) +
              (scorecard?.vocals ??
                0) +
              (scorecard?.lyrics ??
                0) +
              (scorecard?.energy ??
                0) +
              (scorecard?.quality ??
                0) +
              (scorecard?.starFactor ??
                0)
          );

        const finalScore =
          totals.length > 0
            ? totals.reduce(
                (sum, total) =>
                  sum + total,
                0
              ) / totals.length
            : 0;

        return {
          performerId:
            performer.id,
          artistName:
            performer.artistName,
          performanceOrder:
            performer.performanceOrder,
          judgeCount:
            totals.length,
          finalScore,
        };
      }
    )
  );

  const scoreGroups = new Map<
    number,
    typeof results
  >();

  for (const result of results) {
    const group =
      scoreGroups.get(
        result.finalScore
      ) ?? [];

    group.push(result);

    scoreGroups.set(
      result.finalScore,
      group
    );
  }

  const sortedScores = [
    ...scoreGroups.keys(),
  ].sort(
    (a, b) => b - a
  );

  const placementByPerformer =
    new Map<number, number>();

  const tiebreakInfoByPerformer =
    new Map<
      number,
      {
        placement: number;
        winner: boolean;
      }
    >();

  for (const tiebreak of
    activeResolvedTiebreakDetails) {
    for (const performerId of
      tiebreak.performerIds) {
      tiebreakInfoByPerformer.set(
        performerId,
        {
          placement:
            tiebreak.placement,
          winner:
            performerId ===
            tiebreak.winnerPerformerId,
        }
      );
    }
  }

  let nextPlacement = 1;

  for (const score of sortedScores) {
    const group =
      scoreGroups.get(score) ?? [];

    let remaining = [...group];
    let groupPlacement =
      nextPlacement;

    while (remaining.length > 0) {
      const tiebreak =
        activeResolvedTiebreakDetails.find(
          (candidate) => {
            if (
              candidate.placement !==
              groupPlacement
            ) {
              return false;
            }

            const winnerId =
              candidate.winnerPerformerId;

            if (
              winnerId === null ||
              !remaining.some(
                (result) =>
                  result.performerId ===
                  winnerId
              )
            ) {
              return false;
            }

            return candidate.performerIds.some(
              (performerId) =>
                remaining.some(
                  (result) =>
                    result.performerId ===
                    performerId
                )
            );
          }
        );

      if (tiebreak) {
        const winner =
          remaining.find(
            (result) =>
              result.performerId ===
              tiebreak.winnerPerformerId
          );

        if (winner) {
          placementByPerformer.set(
            winner.performerId,
            groupPlacement
          );

          remaining =
            remaining.filter(
              (result) =>
                result.performerId !==
                winner.performerId
            );

          groupPlacement++;
          continue;
        }
      }

      if (remaining.length > 1) {
        for (const result of
          remaining) {
          placementByPerformer.set(
            result.performerId,
            groupPlacement
          );
        }

        groupPlacement +=
          remaining.length;

        remaining = [];
        continue;
      }

      const finalRemaining =
        remaining[0];

      placementByPerformer.set(
        finalRemaining.performerId,
        groupPlacement
      );

      groupPlacement++;
      remaining = [];
    }

    nextPlacement = Math.max(
      nextPlacement,
      groupPlacement
    );
  }

  results.sort((a, b) => {
    const aPlacement =
      placementByPerformer.get(
        a.performerId
      ) ?? 999;

    const bPlacement =
      placementByPerformer.get(
        b.performerId
      ) ?? 999;

    if (
      aPlacement !== bPlacement
    ) {
      return (
        aPlacement -
        bPlacement
      );
    }

    if (
      b.finalScore !==
      a.finalScore
    ) {
      return (
        b.finalScore -
        a.finalScore
      );
    }

    return 0;
  });

  const hasResolvedTiebreak =
    activeResolvedTiebreakDetails.length > 0;

  const isOfficial =
    competition.status === "FINALIZED" ||
    competition.status === "ARCHIVED";

  const firstPlace =
    results.find(
      (result) =>
        placementByPerformer.get(
          result.performerId
        ) === 1
    );

  const secondPlace =
    results.find(
      (result) =>
        placementByPerformer.get(
          result.performerId
        ) === 2
    );

  const thirdPlace =
    results.find(
      (result) =>
        placementByPerformer.get(
          result.performerId
        ) === 3
    );

  const remainingResults =
    results.filter((result) => {
      const place =
        placementByPerformer.get(
          result.performerId
        ) ?? 999;

      return place > 3;
    });

  function TiebreakBadge({
    performerId,
  }: {
    performerId: number;
  }) {
    const tiebreak =
      tiebreakInfoByPerformer.get(
        performerId
      );

    if (!tiebreak) {
      return null;
    }

    return (
      <span className="mt-4 inline-flex rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">
        {tiebreak.winner
          ? "Tiebreak Winner"
          : "Tiebreak Participant"}
      </span>
    );
  }

  function PodiumCard({
    result,
    place,
    champion,
  }: {
    result:
      | (typeof results)[number]
      | undefined;
    place: number;
    champion?: boolean;
  }) {
    if (!result) {
      return null;
    }

    return (
      <article
        className={`flex flex-col items-center rounded-3xl border bg-zinc-950 text-center ${
          champion
            ? "min-h-[420px] border-amber-400/70 px-7 py-10 shadow-[0_0_70px_rgba(245,185,66,0.14)] sm:min-h-[450px] sm:px-10 sm:py-12"
            : "min-h-[310px] border-zinc-700 px-6 py-8"
        }`}
      >
        <div
          className={`flex items-center justify-center rounded-2xl border font-black ${
            champion
              ? "h-24 w-24 border-amber-400/80 bg-amber-400/10 text-4xl text-amber-400 shadow-[0_0_30px_rgba(245,185,66,0.10)]"
              : "h-16 w-16 border-amber-500/50 bg-amber-400/5 text-2xl text-amber-400"
          }`}
        >
          #{place}
        </div>

        <p
          className={`mt-6 text-xs font-bold uppercase tracking-[0.35em] ${
            champion
              ? "text-amber-400"
              : "text-zinc-500"
          }`}
        >
          {champion
            ? "Champion"
            : place === 2
              ? "2nd Place"
              : "3rd Place"}
        </p>

        <h3
          className={`mt-3 font-black leading-tight text-white ${
            champion
              ? "text-3xl sm:text-4xl"
              : "text-2xl"
          }`}
        >
          {result.artistName}
        </h3>

        <p className="mt-2 text-sm text-zinc-500">
          Performance #
          {result.performanceOrder}
        </p>

        <div className="mt-auto pt-8">
          <p
            className={`font-black text-amber-400 ${
              champion
                ? "text-5xl"
                : "text-3xl"
            }`}
          >
            {result.finalScore.toFixed(
              1
            )}
          </p>

          <p className="mt-1 text-xs font-medium uppercase tracking-wider text-zinc-600">
            / 60
          </p>

          <TiebreakBadge
            performerId={
              result.performerId
            }
          />
        </div>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-6">
        <header className="border-b border-zinc-800 pb-10">
          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.45em] text-amber-400">
              MAINSTAGE EMPIRE
            </p>

            <div className="mx-auto mt-5 h-px max-w-24 bg-amber-400/60" />

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.3em] text-zinc-500">
              Competition Results
            </p>

            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              {competition.name}
            </h1>

            {competition.venueName && (
              <p className="mt-4 text-base text-zinc-400">
                {competition.venueName}
              </p>
            )}

            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-400">
                {isOfficial
                  ? statusLabel(
                      competition.status
                    )
                  : "Judging Complete"}
              </span>

              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-400">
                {eligiblePerformers.length}{" "}
                {eligiblePerformers.length === 1
                  ? "Performer"
                  : "Performers"}
              </span>

              <span className="rounded-full border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-zinc-400">
                {assignments.length}{" "}
                {assignments.length === 1
                  ? "Judge"
                  : "Judges"}
              </span>
            </div>
          </div>
        </header>

        <div className="mt-5 flex justify-center">
          <ShareResultsButton />
        </div>

        <section className="mt-10">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400">
              {isOfficial
                ? "Official Rankings"
                : "Final Rankings"}
            </p>

            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              Competition Results
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Rankings are based on judges'
              submitted scorecards.
            </p>
          </div>

          {hasResolvedTiebreak && (
            <div className="mb-10 rounded-2xl border border-amber-500/30 bg-amber-400/5 p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-sm font-bold text-amber-400">
                  !
                </div>

                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-amber-400">
                    Tiebreak Resolved
                  </p>

                  <p className="mt-2 text-sm leading-6 text-zinc-300">
                    One or more tied scores were
                    resolved through the official
                    tiebreak voting process.
                  </p>
                </div>
              </div>
            </div>
          )}

          {results.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
              <h2 className="text-xl font-semibold">
                No Results Available
              </h2>

              <p className="mt-2 text-zinc-500">
                There are currently no eligible
                performers in the official results.
              </p>
            </div>
          ) : (
            <>
              {(firstPlace ||
                secondPlace ||
                thirdPlace) && (
                <div className="mx-auto max-w-4xl">
                  <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-6 md:items-end md:gap-x-6 md:gap-y-12">
                    <div className="md:col-span-6 md:px-20 lg:px-28">
                      <PodiumCard
                        result={firstPlace}
                        place={1}
                        champion
                      />
                    </div>

                    <div className="md:col-span-3 md:pr-3">
                      <PodiumCard
                        result={secondPlace}
                        place={2}
                      />
                    </div>

                    <div className="md:col-span-3 md:pl-3">
                      <PodiumCard
                        result={thirdPlace}
                        place={3}
                      />
                    </div>
                  </div>
                </div>
              )}

              {remainingResults.length > 0 && (
                <section className="mt-14">
                  <div className="mb-5">
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-600">
                      Remaining Rankings
                    </p>

                    <h3 className="mt-2 text-xl font-bold">
                      Competition Standings
                    </h3>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-zinc-800">
                    {remainingResults.map(
                      (result, index) => {
                        const place =
                          placementByPerformer.get(
                            result.performerId
                          ) ?? 0;

                        return (
                          <article
                            key={
                              result.performerId
                            }
                            className={`flex items-center gap-4 px-5 py-5 ${
                              index > 0
                                ? "border-t border-zinc-800"
                                : ""
                            }`}
                          >
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800 bg-black text-sm font-bold text-zinc-400">
                              #{place}
                            </div>

                            <div className="min-w-0 flex-1">
                              <h4 className="truncate font-bold text-white">
                                {
                                  result.artistName
                                }
                              </h4>

                              <p className="mt-1 text-xs text-zinc-600">
                                Performance #
                                {
                                  result.performanceOrder
                                }
                              </p>

                              <TiebreakBadge
                                performerId={
                                  result.performerId
                                }
                              />
                            </div>

                            <div className="shrink-0 text-right">
                              <p className="text-lg font-black text-amber-400">
                                {result.finalScore.toFixed(
                                  1
                                )}
                              </p>

                              <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                                / 60
                              </p>
                            </div>
                          </article>
                        );
                      }
                    )}
                  </div>
                </section>
              )}
            </>
          )}
        </section>

        <footer className="mt-12 border-t border-zinc-800 pt-6 text-center">
          <p className="text-xs font-medium text-zinc-600">
            Mainstage Empire Competition Scoring
          </p>

          <p className="mt-2 text-xs text-zinc-700">
            Competition ID: {competition.id}
          </p>
        </footer>
      </div>
    </main>
  );
}