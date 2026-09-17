"use client";

import { FormEvent, useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Login request failed.");
        return;
      }

      setMessage(
        data.message ?? "If that email is authorized, a login link has been sent."
      );
    } catch {
      setError("Unable to connect to the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
            Mainstage Empire
          </p>

          <h1 className="mt-2 text-5xl font-bold tracking-tight">
            SCORE
          </h1>

          <p className="mt-4 text-zinc-400">
            Performance judging made simple.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          <h2 className="text-xl font-semibold">
            Welcome
          </h2>

          <p className="mt-2 text-sm text-zinc-400">
            Enter your authorized email to access Mainstage Score.
          </p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-zinc-300"
              >
                Email address
              </label>

              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="judge@example.com"
                className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white placeholder:text-zinc-600 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-400">
                {error}
              </p>
            )}

            {message && (
              <p className="rounded-lg border border-emerald-900 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-400 break-all">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-amber-400 px-4 py-3 font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Login Link"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-zinc-600">
            Authorized users only
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          Mainstage Score
        </p>
      </div>
    </main>
  );
}
