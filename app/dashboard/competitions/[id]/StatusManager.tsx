"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CompetitionStatus =
  | "DRAFT"
  | "READY"
  | "LIVE"
  | "JUDGING_COMPLETE"
  | "FINALIZED"
  | "CANCELED"
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
  CANCELED: "Canceled",
  ARCHIVED: "Archived",
};

const statusDescriptions: Record<CompetitionStatus, string> = {
  DRAFT: "Competition is being prepared.",
  READY: "Competition is ready to begin.",
  LIVE: "Judges can score performances.",
  JUDGING_COMPLETE: "All required judging has been completed.",
  FINALIZED: "Results are finalized and locked.",
  CANCELED: "Competition has been canceled. No further competition activity is allowed.",
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
  CANCELED: "ARCHIVED",
};

const nextButtonLabels: Partial<
  Record<CompetitionStatus, string>
> = {
  DRAFT: "Mark Ready",
  READY: "Start Competition",
  LIVE: "Complete Judging",
  JUDGING_COMPLETE: "Finalize Results",
  FINALIZED: "Archive Competition",
  CANCELED: "Archive Competition",
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

  const [showCancelForm, setShowCancelForm] =
    useState(false);

  const [cancellationReason, setCancellationReason] =
    useState("");

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

  async function cancelCompetition() {
    const reason =
      cancellationReason.trim();

    if (reason.length < 10) {
      setError(
        "Please provide a cancellation reason of at least 10 characters."
      );
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to cancel this competition?\n\n" +
        "This action is permanent. The competition will be locked and cannot be returned to an active status.\n\n" +
        "Click OK to permanently cancel the competition."
    );

    if (!confirmed) {
      return;
    }

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
            status: "CANCELED",
            cancellationReason: reason,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "The competition could not be canceled."
        );
        return;
      }

      setCancellationReason("");
      setShowCancelForm(false);

      router.refresh();
    } catch {
      setError(
        "Unable to cancel the competition."
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

        <div
          className={`mt-2 text-2xl font-bold ${
            status === "CANCELED"
              ? "text-red-400"
              : "text-[#f5b942]"
          }`}
        >
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
                Add at least one performer and one
                judge before marking this competition
                ready.
              </div>
            )}

          <button
            type="button"
            onClick={changeStatus}
            disabled={
              loading || !isReadyToAdvance
            }
            className="mt-3 rounded-lg bg-[#f5b942] px-5 py-3 font-semibold text-black transition hover:bg-[#d9a334] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Updating..."
              : nextButtonLabels[status]}
          </button>
        </div>
      )}

      {status !== "CANCELED" &&
        status !== "ARCHIVED" && (
          <div className="border-t border-zinc-800 pt-5">
            {!showCancelForm ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setShowCancelForm(true);
                }}
                disabled={loading}
                className="rounded-lg border border-red-900 bg-red-950/30 px-5 py-3 font-semibold text-red-400 transition hover:border-red-700 hover:bg-red-950/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel Competition
              </button>
            ) : (
              <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-5">
                <div className="text-sm font-semibold uppercase tracking-[0.15em] text-red-400">
                  Cancel Competition
                </div>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  This action is permanent. The
                  competition will be locked and all
                  judging and competition activity will
                  stop.
                </p>

                <label
                  htmlFor="cancellation-reason"
                  className="mt-4 block text-sm font-medium text-zinc-300"
                >
                  Cancellation Reason
                </label>

                <textarea
                  id="cancellation-reason"
                  value={cancellationReason}
                  onChange={(event) =>
                    setCancellationReason(
                      event.target.value
                    )
                  }
                  placeholder="Explain why this competition is being canceled..."
                  rows={4}
                  maxLength={1000}
                  disabled={loading}
                  className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-red-500 disabled:opacity-50"
                />

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span
                    className={
                      cancellationReason.trim()
                        .length < 10
                        ? "text-red-400"
                        : "text-emerald-400"
                    }
                  >
                    {cancellationReason.trim().length <
                    10
                      ? "Minimum 10 characters required."
                      : "Reason meets the minimum length."}
                  </span>

                  <span className="text-zinc-600">
                    {
                      cancellationReason.length
                    }{" "}
                    / 1000
                  </span>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={cancelCompetition}
                    disabled={
                      loading ||
                      cancellationReason.trim()
                        .length < 10
                    }
                    className="rounded-lg bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading
                      ? "Canceling..."
                      : "Permanently Cancel Competition"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCancellationReason("");
                      setShowCancelForm(false);
                      setError("");
                    }}
                    disabled={loading}
                    className="rounded-lg border border-zinc-700 px-5 py-3 font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Keep Competition
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      {status === "CANCELED" && (
        <div className="border-t border-zinc-800 pt-5 text-sm text-red-400">
          This competition has been canceled. No
          further competition changes are available
          except archiving.
        </div>
      )}

      {status === "ARCHIVED" && (
        <div className="border-t border-zinc-800 pt-5 text-sm text-zinc-500">
          This competition is archived. No further
          changes are available.
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