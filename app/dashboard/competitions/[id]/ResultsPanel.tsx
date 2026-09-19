import { db } from "@/src/prisma/db";

type ResultsPanelProps = {
  competitionId: number;
  status:
    | "DRAFT"
    | "READY"
    | "LIVE"
    | "JUDGING_COMPLETE"
    | "FINALIZED"
    | "CANCELED"
    | "ARCHIVED";
};

export default async function ResultsPanel({
  competitionId,
  status,
}: ResultsPanelProps) {
  if (status === "CANCELED") {
    return (
      <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-4 text-sm text-red-400">
        This competition was canceled. Official results are not
        available for this competition.
      </div>
    );
  }

  if (
    status !== "JUDGING_COMPLETE" &&
    status !== "FINALIZED" &&
    status !== "ARCHIVED"
  ) {
    return (
      <div className="mt-6 text-sm text-zinc-500">
        Results will be available once judging is complete.
      </div>
    );
  }

  const performers =
    await db.orm.public.Performer.where({
      competitionId,
    }).all();

  /*
   * Excluded performers remain in the database so their
   * scorecards and judging history are preserved, but they
   * are removed from official results and placement calculations.
   */
  const eligiblePerformers =
    performers.filter(
      (performer) =>
        !performer.excludedFromResults
    );

  const assignments =
    await db.orm.public.CompetitionJudge.where({
      competitionId,
    }).all();

  /*
   * Load all tiebreaks for this competition.
   */
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

  /*
   * Load the performers involved in each resolved
   * tiebreak.
   *
   * Excluded performers are removed from the tiebreak
   * details used by official results.
   */
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

  /*
   * Only tiebreaks that still contain at least two
   * eligible participants and an eligible winner can
   * affect official results.
   */
  const activeResolvedTiebreakDetails =
    resolvedTiebreakDetails.filter(
      (tiebreak) =>
        tiebreak.winnerPerformerId !== null &&
        tiebreak.performerIds.length >= 2
    );

  /*
   * Calculate each eligible performer's final score.
   */
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
              scorecard.status ===
                "SUBMITTED"
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

  /*
   * Group eligible performers by identical final score.
   */
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

  /*
   * Official/provisional placement for every
   * eligible performer.
   */
  const placementByPerformer =
    new Map<number, number>();

  /*
   * Whether an eligible performer was involved in a
   * resolved tiebreak and whether they won it.
   */
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

  /*
   * Calculate placements score group by score group.
   *
   * This is deliberately independent of
   * performance order.
   *
   * Example:
   *
   * 50 / 50 / 40
   *
   * Tiebreak at placement 1:
   *   A wins -> A = 1
   *   B remains -> B = 2
   *   C = 3
   *
   * Example:
   *
   * 50 / 50 / 50
   *
   * Tiebreak at placement 1:
   *   A wins -> A = 1
   *   B and C remain tied -> both provisional 2
   *
   * Later tiebreak at placement 2:
   *   B wins -> B = 2
   *   C = 3
   */
  let nextPlacement = 1;

  for (const score of sortedScores) {
    const group =
      scoreGroups.get(score) ?? [];

    let remaining = [...group];
    let groupPlacement =
      nextPlacement;

    while (remaining.length > 0) {
      /*
       * Look for a resolved tiebreak at the
       * current placement involving performers
       * still remaining in this score group.
       */
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

      /*
       * A resolved tiebreak awards the current
       * placement to its winner.
       */
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

      /*
       * No resolved tiebreak exists for this
       * placement.
       *
       * If multiple performers remain, they are
       * still tied and receive the same provisional
       * placement. No performance-order fallback.
       */
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

      /*
       * One performer remains.
       */
      const finalRemaining =
        remaining[0];

      placementByPerformer.set(
        finalRemaining.performerId,
        groupPlacement
      );

      groupPlacement++;
      remaining = [];
    }

    /*
     * The next score group begins after every
     * performer in this group.
     */
    nextPlacement = Math.max(
      nextPlacement,
      groupPlacement
    );
  }

  /*
   * Sort by calculated placement first.
   *
   * If two performers are still tied, their
   * original score is identical and we deliberately
   * return 0 instead of using performance order.
   */
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

  return (
    <div className="mt-8">
      {hasResolvedTiebreak && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-400/5 p-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Tiebreak Resolved
          </p>

          <p className="mt-2 text-sm leading-6 text-zinc-300">
            One or more eligible performers finished
            with identical final scores. Their
            placements were determined through the
            official tiebreak voting process.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <div className="grid grid-cols-[80px_1fr_140px_140px] border-b border-zinc-800 bg-zinc-900/50 px-5 py-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <div>Place</div>

          <div>Performer</div>

          <div>Judges</div>

          <div className="text-right">
            Final Score
          </div>
        </div>

        {results.length === 0 ? (
          <div className="px-5 py-8 text-center text-zinc-500">
            No eligible performers found.
          </div>
        ) : (
          results.map((result) => {
            const place =
              placementByPerformer.get(
                result.performerId
              ) ?? 0;

            const tiebreak =
              tiebreakInfoByPerformer.get(
                result.performerId
              );

            return (
              <div
                key={
                  result.performerId
                }
                className="grid grid-cols-[80px_1fr_140px_140px] items-center border-b border-zinc-800 px-5 py-5 last:border-b-0"
              >
                <div>
                  <span
                    className={
                      place <= 3
                        ? "text-xl font-bold text-amber-400"
                        : "text-lg font-semibold text-zinc-400"
                    }
                  >
                    {place}
                  </span>
                </div>

                <div>
                  <div className="font-semibold text-white">
                    {result.artistName}
                  </div>

                  <div className="mt-1 text-xs text-zinc-500">
                    Performance #
                    {
                      result.performanceOrder
                    }
                  </div>

                  {tiebreak && (
                    <div className="mt-2">
                      <span className="inline-flex rounded-full border border-amber-500/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                        {tiebreak.winner
                          ? "Tiebreak Winner"
                          : "Tiebreak Participant"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-sm text-zinc-400">
                  {result.judgeCount}
                </div>

                <div className="text-right text-lg font-bold text-amber-400">
                  {result.finalScore.toFixed(
                    1
                  )}{" "}
                  / 60
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="mt-4 text-xs text-zinc-600">
        Final Score is the average of the submitted
        judges' totals. Maximum score: 60 points.
        Tied scores are resolved only through the
        official tiebreak process.
      </p>
    </div>
  );
}
