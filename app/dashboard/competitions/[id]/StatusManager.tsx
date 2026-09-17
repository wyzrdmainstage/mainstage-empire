"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CompetitionStatus =
  | "DRAFT"
  | "READY"
  | "LIVE"
  | "JUDGING_COMPLETE"
  | "FINALIZED"
  | "ARCHIVED";

type Props = {
  competitionId: number;
  status: CompetitionStatus;
  performerCount: number;
  judgeCount: number;
};

const statusLabels: Record<CompetitionStatus, string> = {
  DRAFT: "Draft",
  READY: "Ready",
  LIVE: "Live",
  JUDGING_COMPLETE: "Judging Complete",
  FINALIZED: "Finalized",
  ARCHIVED: "Archived",
};

const statusDescriptions: Record<CompetitionStatus, string> = {
  DRAFT: "Competition is being prepared.",
  READY: "Competition is ready to begin.",
  LIVE: "Judges can score performances.",
  JUDGING_COMPLETE: "All required judging has been completed.",
  FINALIZED: "Results are finalized and locked.",
  ARCHIVED: "Competition is archived.",
};

const nextStatus: Partial<
  Record<CompetitionStatus, CompetitionStatus>
> = {
  DRAFT: "READY",
  READY: "LIVE",
  LIVE: "JUDGING_COMPLETE",
  JUDGING_COMPLETE: "FINALIZED",
  FINALIZED: "ARCHIVED",
};

const nextButtonLabels: Partial<
  Record<CompetitionStatus, string>
> = {
  DRAFT: "Mark Ready",
  READY: "Start Competition",
  LIVE: "Complete Judging",
  JUDGING_COMPLETE: "Finalize Results",
  FINALIZED: "Archive Competition",
};

export default function StatusManager({
  competitionId,
  status,
  performerCount,
  judgeCount,
}: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const next = nextStatus[status];

  const isReadyToAdvance =
    status !== "DRAFT" ||
    (performerCount > 0 && judgeCount > 0);

  async function changeStatus() {
    if (!next || !isReadyToAdvance) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: next,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "The competition status could not be changed."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Unable to update the competition status."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm uppercase tracking-[0.2em] text-zinc-500">
          Current Status
        </div>

        <div className="mt-2 text-2xl font-bold text-[#f5b942]">
          {statusLabels[status]}
        </div>

        <p className="mt-2 text-sm text-zinc-400">
          {statusDescriptions[status]}
        </p>
      </div>

      {next && (
        <div className="border-t border-zinc-800 pt-5">
          <div className="text-sm text-zinc-400">
            Next step
          </div>

          {status === "DRAFT" &&
            !isReadyToAdvance && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                Add at least one performer and one judge before marking this competition ready.
              </div>
            )}

          <button
            type="button"
            onClick={changeStatus}
            disabled={loading || !isReadyToAdvance}
            className="mt-3 rounded-lg bg-[#f5b942] px-5 py-3 font-semibold text-black transition hover:bg-[#d9a334] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Updating..."
              : nextButtonLabels[status]}
          </button>
        </div>
      )}

      {status === "ARCHIVED" && (
        <div className="border-t border-zinc-800 pt-5 text-sm text-zinc-500">
          This competition is archived. No further changes are
          available.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
