"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewCompetitionPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setError("");
    setSaving(true);

    try {
      const response = await fetch("/api/competitions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          venueName,
          date,
          description,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.message ?? "Unable to create competition."
        );
        return;
      }

      setMessage("Competition created successfully.");

      setTimeout(() => {
        router.push(`/dashboard/competitions/${data.competition.id}`);
      }, 500);
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <header className="border-b border-zinc-800 pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
            Mainstage Empire
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            Create Competition
          </h1>

          <p className="mt-2 text-zinc-400">
            Set up a new Mainstage competition.
          </p>
        </header>

        <section className="mt-10 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-semibold text-zinc-200"
              >
                Competition Name
              </label>

              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Mainstage Empire Showcase"
                required
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-amber-400"
              />
            </div>

            <div>
              <label
                htmlFor="venueName"
                className="mb-2 block text-sm font-semibold text-zinc-200"
              >
                Venue Name
              </label>

              <input
                id="venueName"
                type="text"
                value={venueName}
                onChange={(event) =>
                  setVenueName(event.target.value)
                }
                placeholder="Venue Name"
                required
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-amber-400"
              />
            </div>

            <div>
              <label
                htmlFor="date"
                className="mb-2 block text-sm font-semibold text-zinc-200"
              >
                Competition Date
              </label>

              <input
                id="date"
                type="datetime-local"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-amber-400"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-2 block text-sm font-semibold text-zinc-200"
              >
                Description
                <span className="ml-2 font-normal text-zinc-500">
                  Optional
                </span>
              </label>

              <textarea
                id="description"
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                placeholder="Competition details, rules, or other notes..."
                rows={5}
                className="w-full resize-none rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-amber-400"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
                {message}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-400 px-6 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Creating..." : "Create Competition"}
              </button>

              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}