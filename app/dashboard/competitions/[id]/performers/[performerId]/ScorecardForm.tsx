"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { draftKey, readDraft, writeDraft, type Scores } from "@/src/scorecard-draft";

type Scorecard = {
  id: number;
  presentation: number | null;
  vocals: number | null;
  lyrics: number | null;
  energy: number | null;
  quality: number | null;
  starFactor: number | null;
  notes: string | null;
  status: string;
};

type ScorecardFormProps = {
  judgeAssignmentId: number;
  revision: string;
  competitionId: number;
  performerId: number;
  existingScorecard: Scorecard | null;
  excludedFromResults: boolean;
};

const categories = [
  {
    key: "presentation",
    label: "Presentation",
    description:
      "How effectively the performer presents themselves, their material, and their overall stage presence.",
  },
  {
    key: "vocals",
    label: "Vocals",
    description:
      "Vocal ability, control, delivery, tone, clarity, and consistency.",
  },
  {
    key: "lyrics",
    label: "Lyrics",
    description:
      "The quality, creativity, meaning, structure, and effectiveness of the lyrics.",
  },
  {
    key: "energy",
    label: "Energy",
    description:
      "The performer's energy, engagement, momentum, and ability to command attention.",
  },
  {
    key: "quality",
    label: "Quality",
    description:
      "The overall quality and polish of the performance, including execution and production.",
  },
  {
    key: "starFactor",
    label: "Star Factor",
    description:
      "The overall impact, individuality, charisma, memorability, and potential to stand out.",
  },
] as const;

type CategoryKey = (typeof categories)[number]["key"];

export default function ScorecardForm({
  judgeAssignmentId,
  revision,
  competitionId,
  performerId,
  existingScorecard,
  excludedFromResults,
}: ScorecardFormProps) {
  const storageKey = draftKey(judgeAssignmentId, performerId, revision);
  const router = useRouter();
  const inFlight = useRef(false);
  const [ready, setReady] = useState(false);
  const [draftMessage, setDraftMessage] = useState("");
  const [offline, setOffline] = useState(false);
  const [retry, setRetry] = useState(false);

  const [scores, setScores] = useState<
    Record<CategoryKey, number | null>
  >({
    presentation: existingScorecard?.presentation ?? null,
    vocals: existingScorecard?.vocals ?? null,
    lyrics: existingScorecard?.lyrics ?? null,
    energy: existingScorecard?.energy ?? null,
    quality: existingScorecard?.quality ?? null,
    starFactor: existingScorecard?.starFactor ?? null,
  });

  const [notes, setNotes] = useState(
    existingScorecard?.notes ?? ""
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Hydrate browser-only storage after SSR, before enabling any edits.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const draft = readDraft(localStorage.getItem(storageKey));
      if (draft && !excludedFromResults) {
        setScores(draft.scores);
        setNotes(draft.notes);
        setDraftMessage("Draft restored from this browser. It has not been submitted.");
      }
    } catch {
      setDraftMessage("Draft saving is unavailable in this browser. Keep this page open until you submit.");
    }
    setReady(true);
    setOffline(!navigator.onLine);
    /* eslint-enable react-hooks/set-state-in-effect */
    const online = () => setOffline(false);
    const offline = () => setOffline(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [storageKey, excludedFromResults]);

  function saveDraft(nextScores: Scores, nextNotes: string) {
    try {
      writeDraft(localStorage, storageKey, nextScores, nextNotes);
      setDraftMessage("Draft saved in this browser for 24 hours. Not yet submitted.");
    } catch {
      setDraftMessage("Could not save your draft. Keep this page open until you submit.");
    }
  }

  const total = useMemo(() => {
  return Object.values(scores).reduce<number>(
    (sum, score) => sum + (score ?? 0),
    0
  );
}, [scores]);

  const allScored = Object.values(scores).every(
    (score) => score !== null
  );

  function selectScore(
    category: CategoryKey,
    score: number
  ) {
    if (excludedFromResults || !ready || inFlight.current) {
      return;
    }

    const nextScores = {
      ...scores,
      [category]: score,
    };
    setScores(nextScores);
    saveDraft(nextScores, notes);
  }

  async function handleSubmit() {
    if (!ready || inFlight.current) return;
    if (excludedFromResults) {
      setError(
        "You have been excluded from this competition's results and cannot submit scorecards."
      );
      return;
    }

    if (!allScored) {
      setError("Please score every category before submitting.");
      return;
    }

    const confirmed = window.confirm(
      "Submit this scorecard? Once submitted, your scores cannot be changed."
    );

    if (!confirmed) {
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    setError("");
    saveDraft(scores, notes);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(
        "/api/scorecards",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            competitionId,
            performerId,
            presentation: scores.presentation,
            vocals: scores.vocals,
            lyrics: scores.lyrics,
            energy: scores.energy,
            quality: scores.quality,
            starFactor: scores.starFactor,
            notes,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || data.success !== true) {
        setRetry(true);
        setError(
          data.error ?? "Unable to submit scorecard."
        );
        return;
      }

      try { localStorage.removeItem(storageKey); } catch { /* Submission is already confirmed. */ }
      router.push(`/dashboard/competitions/${competitionId}?view=judge`);
      router.refresh();
    } catch {
      setRetry(true);
      setError("We could not confirm your submission. Your entries are still here. Reconnect and retry; scores already received will not be submitted twice.");
    } finally {
      window.clearTimeout(timeout);
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (excludedFromResults) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-red-900/60 bg-red-950/20 p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-400">
            Judge Status
          </p>

          <h2 className="mt-3 text-2xl font-semibold text-white">
            Excluded from Results
          </h2>

          <p className="mt-3 leading-7 text-zinc-400">
            You have been excluded from this competition&apos;s official results.
            Your previous scorecards have been retained, but you cannot
            submit or modify scores while excluded.
          </p>

          <p className="mt-4 text-sm text-zinc-500">
            If you are restored to the judging panel, your existing
            scorecards will become active again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">
          Performance Scorecard
        </h2>

        <p className="mt-2 text-sm text-zinc-400">
          Score each category from 1 to 10 based on the overall
          performance.
        </p>
      </div>

      <p role="status" className="text-sm text-amber-300">
        {!ready ? "Restoring draft…" : draftMessage || "Unfinished scores are saved in this browser as you work."}
      </p>
      {offline && <p role="status" className="text-sm text-amber-300">You appear to be offline. You can keep scoring; reconnect before submitting.</p>}
      <div className="space-y-5">
        {categories.map((category) => (
          <div
            key={category.key}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
          >
            <div>
              <h3 className="text-xl font-semibold">
                {category.label}
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-400">
                {category.description}
              </p>
            </div>

            <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10">
              {Array.from({ length: 10 }, (_, index) => {
                const score = index + 1;
                const selected =
                  scores[category.key] === score;

                return (
                  <button
                    key={score}
                    type="button"
                    disabled={!ready || submitting}
                    onClick={() =>
                      selectScore(category.key, score)
                    }
                    className={`rounded-lg border px-2 py-3 text-sm font-semibold transition ${
                      selected
                        ? "border-amber-400 bg-amber-400 text-black"
                        : "border-zinc-700 bg-black text-zinc-400 hover:border-amber-400/60 hover:text-amber-400"
                    }`}
                  >
                    {score}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-xl font-semibold">
              Current Total
            </h3>

            <p className="mt-1 text-sm text-zinc-500">
              Maximum possible score: 60
            </p>
          </div>

          <div className="text-4xl font-bold text-amber-400">
            {total}
            <span className="ml-1 text-lg text-zinc-500">
              / 60
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <label
          htmlFor="notes"
          className="text-xl font-semibold"
        >
          Judge Notes
        </label>

        <p className="mt-2 text-sm text-zinc-500">
          Optional notes about the overall performance.
        </p>

        <textarea
          id="notes"
          value={notes}
          disabled={!ready || submitting}
          onChange={(event) => {
            setNotes(event.target.value);
            saveDraft(scores, event.target.value);
          }}
          rows={6}
          placeholder="Enter your notes..."
          className="mt-4 w-full resize-y rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!ready || submitting || !allScored}
        className="w-full rounded-lg bg-amber-400 px-6 py-4 text-lg font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting
          ? "Submitting..."
          : retry ? "Retry Submission" : "Submit Scorecard"}
      </button>

      <p className="text-center text-xs text-zinc-600">
        Scores are locked after submission and cannot be changed.
      </p>
    </div>
  );
}
