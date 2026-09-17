"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Performer = {
  id: number;
  artistName: string;
  songCount: number | null;
  supporterCount: number;
  performanceOrder: number;
  isScoringLocked: boolean;
  excludedFromResults: boolean;
};

type PerformersManagerProps = {
  competitionId: number;
  competitionStatus: string;
  performers: Performer[];
  isAdmin: boolean;
};

export default function PerformersManager({
  competitionId,
  competitionStatus,
  performers,
  isAdmin,
}: PerformersManagerProps) {
  const router = useRouter();

  const [artistName, setArtistName] = useState("");
  const [songCount, setSongCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [editingSongCountId, setEditingSongCountId] =
    useState<number | null>(null);

  const [editingSongCount, setEditingSongCount] =
    useState("");

  const changesLocked =
    competitionStatus === "FINALIZED" ||
    competitionStatus === "ARCHIVED";

  const songCountLocked =
    competitionStatus === "JUDGING_COMPLETE" ||
    competitionStatus === "FINALIZED" ||
    competitionStatus === "ARCHIVED";

  const canManageResults =
    isAdmin &&
    (competitionStatus === "JUDGING_COMPLETE" ||
      competitionStatus === "FINALIZED" ||
      competitionStatus === "ARCHIVED");

  async function addPerformer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");

    if (!artistName.trim()) {
      setError("Artist name is required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/performers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artistName: artistName.trim(),
            songCount: songCount || null,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error || "Unable to add performer."
        );
        return;
      }

      setArtistName("");
      setSongCount("");

      router.refresh();
    } catch {
      setError(
        "Something went wrong while adding the performer."
      );
    } finally {
      setSaving(false);
    }
  }

  async function movePerformer(
    performerId: number,
    direction: "up" | "down"
  ) {
    setError("");
    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/performers`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            performerId,
            direction,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error || "Unable to reorder performer."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Something went wrong while reordering the lineup."
      );
    } finally {
      setSaving(false);
    }
  }

  function startSongCountEdit(performer: Performer) {
    if (songCountLocked) {
      return;
    }

    setError("");
    setEditingSongCountId(performer.id);
    setEditingSongCount(
      performer.songCount === null
        ? ""
        : String(performer.songCount)
    );
  }

  function cancelSongCountEdit() {
    setEditingSongCountId(null);
    setEditingSongCount("");
  }

  async function saveSongCount(performerId: number) {
    if (songCountLocked) {
      return;
    }

    setError("");

    const trimmedValue = editingSongCount.trim();

    let value: number | null = null;

    if (trimmedValue !== "") {
      const parsedValue = Number(trimmedValue);

      if (
        !Number.isInteger(parsedValue) ||
        parsedValue < 1
      ) {
        setError(
          "Song count must be a whole number of at least 1."
        );
        return;
      }

      value = parsedValue;
    }

    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/performers`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "updateSongCount",
            performerId,
            songCount: value,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error || "Unable to update song count."
        );
        return;
      }

      cancelSongCountEdit();
      router.refresh();
    } catch {
      setError(
        "Something went wrong while updating the song count."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeSupporterCount(
    performerId: number,
    amount: number
  ) {
    const performer = performers.find(
      (item) => item.id === performerId
    );

    if (!performer || changesLocked) {
      return;
    }

    const currentCount = performer.supporterCount ?? 0;
    const newCount = Math.max(0, currentCount + amount);

    setError("");
    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/performers`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "updateSupporterCount",
            performerId,
            supporterCount: newCount,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error || "Unable to update supporter count."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Something went wrong while updating the supporter count."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removePerformer(performerId: number) {
    const performer = performers.find(
      (item) => item.id === performerId
    );

    if (!performer) {
      return;
    }

    const confirmed = window.confirm(
      `Remove "${performer.artistName}" from the lineup?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/performers`,
        {
          method: "DELETE",
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
        setError(
          data.error || "Unable to remove performer."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Something went wrong while removing the performer."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeResultsStatus(
    performerId: number,
    exclude: boolean
  ) {
    const performer = performers.find(
      (item) => item.id === performerId
    );

    if (!performer || !canManageResults) {
      return;
    }

    const message = exclude
      ? `Exclude "${performer.artistName}" from official results?\n\nTheir scorecards and judging history will be preserved, but they will no longer appear in official rankings or public results.`
      : `Restore "${performer.artistName}" to official results?\n\nThey will become eligible to appear in official rankings and public results again.`;

    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    setError("");
    setSaving(true);

    try {
      const response = await fetch(
        `/api/competitions/${competitionId}/performers`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: exclude
              ? "excludeFromResults"
              : "restoreFromResults",
            performerId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Unable to update the performer's results status."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Something went wrong while updating the performer's results status."
      );
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
              Add Performer
            </h2>

            <p className="mt-1 text-sm text-zinc-400">
              Each performer receives one scorecard for their
              entire performance, regardless of song count.
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Song count is informational and can be updated
              while the competition is live.
            </p>
          </div>

          <form
            onSubmit={addPerformer}
            className="grid gap-4 md:grid-cols-[1fr_160px_auto]"
          >
            <div>
              <label
                htmlFor="artistName"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Artist Name
              </label>

              <input
                id="artistName"
                type="text"
                value={artistName}
                onChange={(event) =>
                  setArtistName(event.target.value)
                }
                placeholder="Enter artist or group name"
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
                disabled={saving}
              />
            </div>

            <div>
              <label
                htmlFor="songCount"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Song Count
              </label>

              <input
                id="songCount"
                type="number"
                min="1"
                step="1"
                value={songCount}
                onChange={(event) =>
                  setSongCount(event.target.value)
                }
                placeholder="Optional"
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
                disabled={saving}
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-amber-400 px-5 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Add Performer"}
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
            Lineup Locked
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            Performers cannot be added, removed, or reordered
            after the competition has been finalized or archived.
          </p>

          {isAdmin && (
            <p className="mt-2 text-sm text-amber-400">
              Administrator result controls remain available
              below.
            </p>
          )}
        </div>
      )}

      {error && changesLocked && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <section>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">
              Performance Lineup
            </h2>

            <p className="mt-1 text-sm text-zinc-400">
              {performers.length}{" "}
              {performers.length === 1
                ? "performer"
                : "performers"}{" "}
              scheduled
            </p>
          </div>
        </div>

        {performers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 p-10 text-center">
            <p className="text-zinc-400">
              No performers have been added yet.
            </p>

            {!changesLocked && (
              <p className="mt-2 text-sm text-zinc-600">
                Add your first performer above to build the lineup.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {performers.map((performer, index) => {
              const isFirst = index === 0;
              const isLast =
                index === performers.length - 1;
              const locked = performer.isScoringLocked;
              const editing =
                editingSongCountId === performer.id;

              return (
                <div
                  key={performer.id}
                  className={`rounded-2xl border bg-zinc-950 p-5 ${
                    performer.excludedFromResults
                      ? "border-red-900/50"
                      : "border-zinc-800"
                  }`}
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-400/10 text-lg font-bold text-amber-400">
                        {performer.performanceOrder}
                      </div>

                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-white">
                            {performer.artistName}
                          </h3>

                          {performer.excludedFromResults && (
                            <span className="rounded-full border border-red-900/60 bg-red-950/40 px-2.5 py-1 text-xs font-medium text-red-400">
                              Excluded from Results
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                          {editing ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={editingSongCount}
                                onChange={(event) =>
                                  setEditingSongCount(
                                    event.target.value
                                  )
                                }
                                className="w-20 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-sm text-white outline-none focus:border-amber-400"
                                disabled={saving}
                                autoFocus
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  saveSongCount(performer.id)
                                }
                                disabled={saving}
                                className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
                              >
                                Save
                              </button>

                              <button
                                type="button"
                                onClick={cancelSongCountEdit}
                                disabled={saving}
                                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span>
                                  {performer.songCount
                                    ? `${performer.songCount} ${
                                        performer.songCount === 1
                                          ? "song"
                                          : "songs"
                                      }`
                                    : "Song count not provided"}
                                </span>

                                {!songCountLocked && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startSongCountEdit(
                                        performer
                                      )
                                    }
                                    disabled={saving}
                                    className="font-medium text-amber-400 hover:text-amber-300 disabled:opacity-50"
                                  >
                                    Edit
                                  </button>
                                )}
                              </div>

                              <span className="text-zinc-700">|</span>

                              <div className="flex items-center gap-2">
                                <span>
                                  Supporters:{" "}
                                  <span className="font-medium text-zinc-300">
                                    {performer.supporterCount ?? 0}
                                  </span>
                                </span>

                                {!changesLocked && (
                                  <div className="flex items-center overflow-hidden rounded-lg border border-zinc-700 bg-black">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeSupporterCount(
                                          performer.id,
                                          -1
                                        )
                                      }
                                      disabled={
                                        saving ||
                                        (performer.supporterCount ?? 0) <= 0
                                      }
                                      aria-label={`Remove supporter from ${performer.artistName}`}
                                      className="px-2.5 py-1 text-sm font-bold text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                      −
                                    </button>

                                    <span className="border-x border-zinc-700 px-2 text-xs text-zinc-600">
                                      {performer.supporterCount ?? 0}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeSupporterCount(
                                          performer.id,
                                          1
                                        )
                                      }
                                      disabled={saving}
                                      aria-label={`Add supporter to ${performer.artistName}`}
                                      className="px-2.5 py-1 text-sm font-bold text-amber-400 transition hover:bg-zinc-800 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      +
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {locked && (
                            <>
                              <span className="text-zinc-700">
                                |
                              </span>

                              <span className="font-medium text-amber-400">
                                Scoring Started - Position Locked
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!changesLocked && (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              movePerformer(
                                performer.id,
                                "up"
                              )
                            }
                            disabled={
                              saving ||
                              locked ||
                              isFirst
                            }
                            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-amber-400 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Move Up
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              movePerformer(
                                performer.id,
                                "down"
                              )
                            }
                            disabled={
                              saving ||
                              locked ||
                              isLast
                            }
                            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:border-amber-400 hover:text-amber-400 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Move Down
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              removePerformer(performer.id)
                            }
                            disabled={
                              saving || locked
                            }
                            className="rounded-lg border border-red-900 px-4 py-2 text-sm font-medium text-red-400 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            Remove
                          </button>
                        </>
                      )}

                      {canManageResults &&
                        !performer.excludedFromResults && (
                          <button
                            type="button"
                            onClick={() =>
                              changeResultsStatus(
                                performer.id,
                                true
                              )
                            }
                            disabled={saving}
                            className="rounded-lg border border-red-800 px-4 py-2 text-sm font-medium text-red-400 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Exclude from Results
                          </button>
                        )}

                      {canManageResults &&
                        performer.excludedFromResults && (
                          <button
                            type="button"
                            onClick={() =>
                              changeResultsStatus(
                                performer.id,
                                false
                              )
                            }
                            disabled={saving}
                            className="rounded-lg border border-amber-800 px-4 py-2 text-sm font-medium text-amber-400 transition hover:border-amber-500 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Restore to Results
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {competitionStatus === "JUDGING_COMPLETE" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
          Song counts are locked because judging is complete.
        </div>
      )}
    </div>
  );
}
