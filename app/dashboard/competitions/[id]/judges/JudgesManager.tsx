"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Judge = {
  assignmentId: number;
  judgeId: number;
  email: string;
  name: string | null;
  submittedScorecards: number;
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

  const changesLocked =
    competitionStatus === "FINALIZED" ||
    competitionStatus === "ARCHIVED";

  async function addJudge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) {
      setError("Judge name is required.");
      return;
    }

    if (!trimmedEmail) {
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
            name: trimmedName,
            email: trimmedEmail,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to assign judge.");
        return;
      }

      setName("");
      setEmail("");
      router.refresh();
    } catch {
      setError("Something went wrong while assigning the judge.");
    } finally {
      setSaving(false);
    }
  }

  async function removeJudge(
    assignmentId: number,
    name: string | null
  ) {
    const displayName = name || "this judge";

    const confirmed = window.confirm(
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
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            assignmentId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to remove judge.");
        return;
      }

      router.refresh();
    } catch {
      setError("Something went wrong while removing the judge.");
    } finally {
      setSaving(false);
    }
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
              Enter the judge&apos;s name and email address. The
              invitation will be sent to this email address.
            </p>
          </div>

          <form
            onSubmit={addJudge}
            className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
          >
            <div>
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
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Judge name"
                autoComplete="name"
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
                disabled={saving}
              />
            </div>

            <div>
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
                  setEmail(event.target.value)
                }
                placeholder="judge@example.com"
                autoComplete="email"
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
                {saving ? "Assigning..." : "Assign Judge"}
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
            Judges cannot be added or removed after the competition
            has been finalized or archived.
          </p>
        </div>
      )}

      {error && changesLocked && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <section>
        <div className="mb-5">
          <h2 className="text-2xl font-semibold text-white">
            Assigned Judges
          </h2>

          <p className="mt-1 text-sm text-zinc-400">
            {judges.length}{" "}
            {judges.length === 1 ? "judge" : "judges"} assigned
          </p>
        </div>

        {judges.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
            <p className="text-zinc-400">
              No judges have been assigned yet.
            </p>

            {!changesLocked && (
              <p className="mt-2 text-sm text-zinc-600">
                Assign a judge above to begin building the judging
                panel.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {judges.map((judge) => {
              const expectedScorecards = performersCount;
              const submitted = judge.submittedScorecards;

              const complete =
                expectedScorecards > 0 &&
                submitted >= expectedScorecards;

              return (
                <div
                  key={judge.assignmentId}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        {judge.name || "Unnamed Judge"}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-500">
                        {judge.email}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div
                        className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                          complete
                            ? "border-emerald-900 bg-emerald-950/20 text-emerald-400"
                            : "border-zinc-800 bg-black text-zinc-400"
                        }`}
                      >
                        {submitted} / {expectedScorecards} Submitted
                      </div>

                      {!changesLocked && (
                        <button
                          type="button"
                          onClick={() =>
                            removeJudge(
                              judge.assignmentId,
                              judge.name
                            )
                          }
                          disabled={
                            saving || submitted > 0
                          }
                          className="rounded-lg border border-red-900 px-4 py-2 text-sm font-medium text-red-400 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  {submitted > 0 && (
                    <div className="mt-4 border-t border-zinc-800 pt-4 text-sm text-zinc-500">
                      This judge has submitted {submitted}{" "}
                      {submitted === 1
                        ? "scorecard"
                        : "scorecards"}
                      . Submitted scores remain private.
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
