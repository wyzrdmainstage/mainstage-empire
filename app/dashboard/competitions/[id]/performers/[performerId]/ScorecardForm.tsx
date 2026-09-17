"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  competitionId: number;
  performerId: number;
  existingScorecard: Scorecard | null;
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
  competitionId,
  performerId,
  existingScorecard,
}: ScorecardFormProps) {
  const router = useRouter();

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
    setScores((current) => ({
      ...current,
      [category]: score,
    }));
  }

    async function handleSubmit() {
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

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        "/api/scorecards",
        {
          method: "POST",
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

      if (!response.ok) {
        setError(
          data.error ?? "Unable to submit scorecard."
        );
        return;
      }

      window.location.href =
        `/dashboard/competitions/${competitionId}?view=judge`;
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
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

      <div className="space-y-5">
        {categories.map((category) => (
          <div
            key={category.key}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold">
                  {category.label}
                </h3>

                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {category.description}
                </p>
              </div>

              <div className="group relative shrink-0">
                <button
                  type="button"
                  aria-label={`Information about ${category.label}`}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 text-sm text-zinc-400 hover:border-amber-400 hover:text-amber-400"
                >
                  i
                </button>

                <div className="pointer-events-none absolute right-0 top-10 z-10 w-64 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs leading-5 text-zinc-300 opacity-0 shadow-xl transition group-hover:opacity-100">
                  {category.description}
                </div>
              </div>
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
          onChange={(event) =>
            setNotes(event.target.value)
          }
          rows={6}
          placeholder="Enter your notes..."
          className="mt-4 w-full resize-y rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-amber-400"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || !allScored}
        className="w-full rounded-lg bg-amber-400 px-6 py-4 text-lg font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting
          ? "Submitting..."
          : "Submit Scorecard"}
      </button>

      <p className="text-center text-xs text-zinc-600">
        Scores are locked after submission and cannot be changed.
      </p>
    </div>
  );
}