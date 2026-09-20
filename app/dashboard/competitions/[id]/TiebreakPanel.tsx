"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TiebreakPerformer = {
  id: number;
  artistName: string;
  performanceOrder: number;
};

type TiebreakData = {
  id: number;
  placement: number;
  status: "JUDGES_VOTING" | "ORGANIZER_VOTING" | "RESOLVED";
  winnerPerformerId: number | null;
  performers: TiebreakPerformer[];
  hasVoted: boolean;
  voteCount: number;
  judgeVotingStatus?: {
    judges: Array<{ id: number; name: string; hasVoted: boolean }>;
    votedCount: number;
    eligibleCount: number;
  };
  voteTotals: Array<{
    performerId: number;
    votes: number;
  }>;
};

type TiebreakPanelProps = {
  competitionId: number;
  role: "ORGANIZER" | "JUDGE";
  excludedFromResults?: boolean;
};

function statusLabel(status: TiebreakData["status"]) {
  switch (status) {
    case "JUDGES_VOTING":
      return "Judges Voting";
    case "ORGANIZER_VOTING":
      return "Organizer Decision";
    case "RESOLVED":
      return "Resolved";
    default:
      return status;
  }
}

export default function TiebreakPanel({
  competitionId,
  role,
  excludedFromResults = false,
}: TiebreakPanelProps) {
  const router = useRouter();

  const [tiebreak, setTiebreak] =
    useState<TiebreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState("");

  const loadTiebreak = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/tiebreak`,
        {
          cache: "no-store",
        }
      );

      if (!response.ok) {
        throw new Error("Unable to load tiebreak.");
      }

      const data = await response.json();
      setTiebreak(data.tiebreak ?? null);
      setError("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load tiebreak."
      );
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    loadTiebreak();

    const interval = window.setInterval(
      loadTiebreak,
      2000
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [loadTiebreak]);

  async function castVote(performerId: number) {
    if (
      !tiebreak ||
      voting ||
      tiebreak.hasVoted ||
      (role === "JUDGE" && excludedFromResults)
    ) {
      return;
    }

    setVoting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/tiebreak`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            performerId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ?? "Unable to record vote."
        );
      }

      await loadTiebreak();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to record vote."
      );
    } finally {
      setVoting(false);
    }
  }

  if (loading) {
    return null;
  }

  if (error) {
    return (
      <section className="mt-10 rounded-2xl border border-red-900 bg-red-950/20 p-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-red-400">
          Tiebreak
        </p>

        <p className="mt-2 text-sm text-red-300">
          {error}
        </p>
      </section>
    );
  }

  if (!tiebreak) {
    return null;
  }

  const winner =
    tiebreak.winnerPerformerId !== null
      ? tiebreak.performers.find(
          (performer) =>
            performer.id ===
            tiebreak.winnerPerformerId
        )
      : null;

  return (
    <section className="mt-10 rounded-2xl border border-amber-500/40 bg-zinc-950 p-6 shadow-[0_0_40px_rgba(245,158,11,0.06)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Tiebreak
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-white">
            {tiebreak.placement === 1
              ? "1st Place"
              : `${tiebreak.placement}th Place`}
          </h2>
        </div>

        <span className="rounded-full border border-amber-500/30 bg-amber-400/10 px-3 py-1 text-sm font-medium text-amber-400">
          {statusLabel(tiebreak.status)}
        </span>
      </div>

      {tiebreak.status === "JUDGES_VOTING" && (
        <>
          <p className="mt-4 text-sm leading-6 text-zinc-400">
            The judges must select the performer who
            should receive this placement.
          </p>

          {excludedFromResults && role === "JUDGE" ? (
            <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/20 p-5">
              <p className="font-semibold text-red-400">
                Excluded from Results
              </p>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                You have been excluded from this competition's official
                results and cannot participate in this tiebreak vote.
              </p>

              <p className="mt-2 text-xs text-zinc-500">
                Your previous vote, if any, has been retained but does
                not count while you are excluded.
              </p>
            </div>
          ) : tiebreak.hasVoted ? (
            <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/20 p-4">
              <p className="font-medium text-emerald-400">
                Your tiebreak vote has been recorded.
              </p>

              <p className="mt-1 text-sm text-zinc-400">
                Waiting for the remaining judges.
              </p>
            </div>
          ) : role === "JUDGE" && !excludedFromResults ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {tiebreak.performers.map(
                (performer) => (
                  <button
                    key={performer.id}
                    type="button"
                    disabled={voting}
                    onClick={() =>
                      castVote(performer.id)
                    }
                    className="rounded-xl border border-zinc-700 bg-black p-5 text-left transition hover:border-amber-400 hover:bg-amber-400/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <p className="text-lg font-semibold text-white">
                      {performer.artistName}
                    </p>

                    <p className="mt-1 text-sm text-zinc-500">
                      Performance #
                      {performer.performanceOrder}
                    </p>

                    <p className="mt-4 text-sm font-semibold text-amber-400">
                      Vote for {performer.artistName} →
                    </p>
                  </button>
                )
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-black p-4">
              <p className="font-medium text-zinc-300">
                Waiting for all judges to cast their
                tiebreak votes.
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                Votes received: {tiebreak.voteCount}
              </p>
            </div>
          )}
          {tiebreak.judgeVotingStatus && (
            <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-4">
              <h3 className="font-medium text-zinc-300">Judge Voting Status</h3>
              <p className="mt-1 text-sm text-zinc-400" role="status">
                {tiebreak.judgeVotingStatus.votedCount} of{" "}
                {tiebreak.judgeVotingStatus.eligibleCount} judges have voted.
              </p>
              <ul className="mt-4 divide-y divide-zinc-800">
                {tiebreak.judgeVotingStatus.judges.map((judge) => (
                  <li key={judge.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                    <span className="min-w-0 break-words text-zinc-300">{judge.name}</span>
                    <span className={`shrink-0 font-medium ${judge.hasVoted ? "text-emerald-400" : "text-amber-400"}`}>
                      {judge.hasVoted ? "Voted" : "Waiting"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {tiebreak.status === "ORGANIZER_VOTING" && (
        <>
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-400/5 p-4">
            <p className="font-medium text-amber-400">
              The judges could not break the tie.
            </p>

            <p className="mt-1 text-sm text-zinc-400">
              The organizer must cast the deciding vote.
            </p>
          </div>

          {role === "ORGANIZER" ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {tiebreak.performers.map(
                (performer) => {
                  const totals =
                    tiebreak.voteTotals.find(
                      (entry) =>
                        entry.performerId ===
                        performer.id
                    );

                  return (
                    <button
                      key={performer.id}
                      type="button"
                      disabled={voting}
                      onClick={() =>
                        castVote(performer.id)
                      }
                      className="rounded-xl border border-zinc-700 bg-black p-5 text-left transition hover:border-amber-400 hover:bg-amber-400/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <p className="text-lg font-semibold text-white">
                        {performer.artistName}
                      </p>

                      <p className="mt-1 text-sm text-zinc-500">
                        Performance #
                        {performer.performanceOrder}
                      </p>

                      <p className="mt-3 text-sm text-zinc-400">
                        Judge votes:{" "}
                        {totals?.votes ?? 0}
                      </p>

                      <p className="mt-4 text-sm font-semibold text-amber-400">
                        Select {performer.artistName} →
                      </p>
                    </button>
                  );
                }
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-zinc-800 bg-black p-4">
              <p className="font-medium text-zinc-300">
                Waiting for the organizer to make the
                deciding selection.
              </p>
            </div>
          )}
        </>
      )}

      {tiebreak.status === "RESOLVED" && (
        <div className="mt-6 rounded-xl border border-emerald-900 bg-emerald-950/20 p-4">
          <p className="font-medium text-emerald-400">
            Tiebreak resolved
          </p>

          <p className="mt-1 text-sm text-zinc-400">
            {winner
              ? `${winner.artistName} receives ${tiebreak.placement === 1 ? "1st place" : `place ${tiebreak.placement}`}.`
              : "The tiebreak winner has been recorded."}
          </p>
        </div>
      )}
    </section>
  );
}
