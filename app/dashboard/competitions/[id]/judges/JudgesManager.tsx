"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";

type PerformerStatus = {
  performerId: number;
  artistName: string;
  performanceOrder: number;
  status:
    | "SUBMITTED"
    | "INCOMPLETE"
    | "MISSING";
};

type Judge = {
  assignmentId: number;
  judgeId: number;
  email: string;
  name: string | null;
  submittedScorecards: number;
  incompleteScorecards: number;
  missingScorecards: number;
  performerStatuses: PerformerStatus[];
  excludedFromResults: boolean;
};

type JudgesManagerProps = {
  competitionId: number;
  competitionStatus: string;
  performersCount: number;
  judges: Judge[];
};

export default function JudgesManager({
  competitionId,
  competitionStatus,
  performersCount,
  judges,
}: JudgesManagerProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expandedJudgeId, setExpandedJudgeId] =
    useState<number | null>(null);

  const changesLocked =
    competitionStatus === "FINALIZED" ||
    competitionStatus === "ARCHIVED";

  /*
   * Keep the judging completion display live.
   */
  useEffect(() => {
    const interval = window.setInterval(() => {
      router.refresh();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [router]);

  async function addJudge(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Judge name is required.");
      return;
    }

    if (!email.trim()) {
      setError("Judge email is required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/judges`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Unable to assign judge."
        );
        return;
      }

      setName("");
      setEmail("");
      router.refresh();
    } catch {
      setError(
        "Something went wrong while assigning the judge."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeJudge(
    assignmentId: number,
    name: string | null
  ) {
    const displayName =
      name || "this judge";

    const confirmed =
      window.confirm(
        `Remove ${displayName} from this competition?`
      );

    if (!confirmed) {
      return;
    }

    setError("");
    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/judges`,
        {
          method: "DELETE",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            assignmentId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Unable to remove judge."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Something went wrong while removing the judge."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleJudgeResults(
    assignmentId: number,
    currentlyExcluded: boolean,
    name: string | null
  ) {
    const action = currentlyExcluded
      ? "restoreFromResults"
      : "excludeFromResults";

    const displayName =
      name || "this judge";

    const confirmed =
      window.confirm(
        currentlyExcluded
          ? `Restore ${displayName} to competition results?`
          : `Exclude ${displayName} from competition results? Their scores will be retained, but will no longer count toward results or voting.`
      );

    if (!confirmed) {
      return;
    }

    setError("");
    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/judges`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            assignmentId,
            action,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Unable to update judge result eligibility."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Something went wrong while updating judge result eligibility."
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleJudge(
    assignmentId: number
  ) {
    setExpandedJudgeId((current) =>
      current === assignmentId
        ? null
        : assignmentId
    );
  }

  return (
    <div className="space-y-10">
      {!changesLocked && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-white">
              Assign Judge
            </h2>

            <p className="mt-1 text-sm text-zinc-400">
              Enter the judge&apos;s name and email address to assign them
              and send an invitation.
            </p>
          </div>

          <form
            onSubmit={addJudge}
            className="flex flex-col gap-4 md:flex-row"
          >
            <div className="flex-1">
              <label
                htmlFor="judgeName"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Judge Name
              </label>

              <input
                id="judgeName"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Judge name"
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
                disabled={saving}
                required
              />
            </div>

            <div className="flex-1">
              <label
                htmlFor="judgeEmail"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Judge Email
              </label>

              <input
                id="judgeEmail"
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                placeholder="judge@example.com"
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
                disabled={saving}
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-amber-400 px-5 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
              >
                {saving
                  ? "Assigning..."
                  : "Assign Judge"}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </section>
      )}

      {changesLocked && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-xl font-semibold text-white">
            Judge Assignments Locked
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            Judges cannot be added or removed after the
            competition has been finalized or archived.
          </p>
        </div>
      )}

      {error && changesLocked && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Judging Completion */}
      <section>
        <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Judging Completion
            </h2>

            <p className="mt-1 text-sm text-zinc-400">
              Live status of every judge&apos;s scorecard
              submissions.
            </p>
          </div>

          <div className="text-xs text-zinc-600">
            Updates automatically every 3 seconds
          </div>
        </div>

        {judges.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
            <p className="text-zinc-400">
              No judges have been assigned yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {judges.map((judge) => {
              const expected =
                performersCount;

              const submitted =
                judge.submittedScorecards;

              const incomplete =
                judge.incompleteScorecards;

              const missing =
                judge.missingScorecards;

              const complete =
                expected > 0 &&
                submitted >= expected;

              const expanded =
                expandedJudgeId ===
                judge.assignmentId;

              const progress =
                expected > 0
                  ? Math.min(
                      100,
                      (submitted /
                        expected) *
                        100
                    )
                  : 0;

              return (
                <div
                  key={judge.assignmentId}
                  className={`overflow-hidden rounded-2xl border bg-zinc-950 ${
                    judge.excludedFromResults
                      ? "border-red-900/70"
                      : "border-zinc-800"
                  }`}
                >
                  <div className="p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-lg font-semibold text-white">
                            {judge.name ||
                              "Unnamed Judge"}
                          </h3>

                          {judge.excludedFromResults && (
                            <span className="rounded-full border border-red-900 bg-red-950/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-red-400">
                              Excluded from Results
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-sm text-zinc-500">
                          {judge.email}
                        </p>

                        {judge.excludedFromResults && (
                          <p className="mt-2 text-sm text-red-400/80">
                            Scores are retained but do not
                            count toward results or voting.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                            complete
                              ? "border-emerald-900 bg-emerald-950/20 text-emerald-400"
                              : "border-zinc-800 bg-black text-zinc-300"
                          }`}
                        >
                          {submitted} /{" "}
                          {expected} Complete
                        </div>

                        {missing > 0 && (
                          <div className="rounded-lg border border-red-900 bg-red-950/20 px-3 py-2 text-sm font-medium text-red-400">
                            {missing} Missing
                          </div>
                        )}

                        {incomplete > 0 && (
                          <div className="rounded-lg border border-amber-900 bg-amber-950/20 px-3 py-2 text-sm font-medium text-amber-400">
                            {incomplete} Incomplete
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            toggleJudge(
                              judge.assignmentId
                            )
                          }
                          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-amber-400 hover:text-amber-400"
                        >
                          {expanded
                            ? "Hide Details"
                            : "View Details"}
                        </button>

                        {!changesLocked && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                toggleJudgeResults(
                                  judge.assignmentId,
                                  judge.excludedFromResults,
                                  judge.name
                                )
                              }
                              disabled={saving}
                              className={`rounded-lg border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                judge.excludedFromResults
                                  ? "border-emerald-900 text-emerald-400 hover:border-emerald-500 hover:text-emerald-300"
                                  : "border-amber-900 text-amber-400 hover:border-amber-500 hover:text-amber-300"
                              }`}
                            >
                              {judge.excludedFromResults
                                ? "Restore to Results"
                                : "Exclude from Results"}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                removeJudge(
                                  judge.assignmentId,
                                  judge.name
                                )
                              }
                              disabled={
                                saving ||
                                submitted > 0
                              }
                              className="rounded-lg border border-red-900 px-4 py-2 text-sm font-medium text-red-400 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="text-zinc-500">
                          Completion
                        </span>

                        <span className="text-zinc-400">
                          {Math.round(
                            progress
                          )}
                          %
                        </span>
                      </div>

                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className={`h-full transition-all ${
                            complete
                              ? "bg-emerald-400"
                              : "bg-amber-400"
                          }`}
                          style={{
                            width: `${progress}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="border-t border-zinc-800 bg-black/40 p-5">
                      <div className="mb-4 flex flex-wrap gap-4 text-sm">
                        <span className="text-emerald-400">
                          ✅ {submitted} Complete
                        </span>

                        {incomplete > 0 && (
                          <span className="text-amber-400">
                            ⚠️ {incomplete} Incomplete
                          </span>
                        )}

                        {missing > 0 && (
                          <span className="text-red-400">
                            ❌ {missing} Missing
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {judge.performerStatuses.map(
                          (performer) => {
                            const status =
                              performer.status;

                            return (
                              <div
                                key={
                                  performer.performerId
                                }
                                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <span className="w-8 shrink-0 text-sm font-semibold text-zinc-500">
                                    #
                                    {
                                      performer.performanceOrder
                                    }
                                  </span>

                                  <span className="truncate text-sm text-zinc-200">
                                    {
                                      performer.artistName
                                    }
                                  </span>
                                </div>

                                {status ===
                                  "SUBMITTED" && (
                                  <span className="ml-4 shrink-0 text-sm font-medium text-emerald-400">
                                    ✅ Complete
                                  </span>
                                )}

                                {status ===
                                  "INCOMPLETE" && (
                                  <span className="ml-4 shrink-0 text-sm font-medium text-amber-400">
                                    ⚠️ Incomplete
                                  </span>
                                )}

                                {status ===
                                  "MISSING" && (
                                  <span className="ml-4 shrink-0 text-sm font-medium text-red-400">
                                    ❌ Missing
                                  </span>
                                )}
                              </div>
                            );
                          }
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
