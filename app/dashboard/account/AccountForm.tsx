"use client";

import { useState } from "react";

type AccountFormProps = {
  user: {
    name: string;
    email: string;
    roles: string[];
  };
};

function roleLabel(role: string) {
  switch (role) {
    case "ADMIN":
      return "Administrator";
    case "ORGANIZER":
      return "Organizer";
    case "JUDGE":
      return "Judge";
    default:
      return role;
  }
}

export default function AccountForm({
  user,
}: AccountFormProps) {
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const initial =
    user.name.trim().charAt(0).toUpperCase() || "?";

  const roleOrder = [
  "ADMIN",
  "ORGANIZER",
  "JUDGE",
];

const roleNames =
  user.roles.length > 0
    ? [...user.roles]
        .sort(
          (a, b) =>
            roleOrder.indexOf(a) -
            roleOrder.indexOf(b)
        )
        .map(roleLabel)
        .join(" • ")
    : "User";

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setMessage("");
    setError("");

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to update your account.");
        return;
      }

      setName(data.user.name);
      setMessage("Account updated successfully.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">
            Account
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            Account Information
          </h1>

          <p className="mt-2 text-zinc-400">
            Manage the name associated with your Mainstage Score account.
          </p>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[180px_1fr]">
          <div className="flex flex-col items-center">
            <div className="flex h-32 w-32 items-center justify-center rounded-full border border-amber-500/30 bg-amber-400/10 text-5xl font-bold text-amber-400">
              {initial}
            </div>

            <p className="mt-4 text-center text-xs uppercase tracking-wider text-zinc-500">
              {roleNames}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
          >
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-semibold text-white"
              >
                Full Name
              </label>

              <input
                id="name"
                name="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition focus:border-amber-400"
              />

              <p className="mt-2 text-xs text-zinc-500">
                This is the name displayed to organizers and throughout Mainstage Score.
              </p>
            </div>

            <div className="mt-6">
              <label
                htmlFor="email"
                className="block text-sm font-semibold text-white"
              >
                Email
              </label>

              <input
                id="email"
                type="email"
                value={user.email}
                readOnly
                className="mt-2 w-full cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-500"
              />

              <p className="mt-2 text-xs text-zinc-500">
                Your email address is used for authentication and cannot be changed here.
              </p>
            </div>

            <div className="mt-6">
              <label
                htmlFor="role"
                className="block text-sm font-semibold text-white"
              >
                Roles
              </label>

              <input
                id="role"
                type="text"
                value={roleNames}
                readOnly
                className="mt-2 w-full cursor-not-allowed rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-500"
              />

              <p className="mt-2 text-xs text-zinc-500">
                Roles are managed by Mainstage Empire administrators.
              </p>
            </div>

            {error && (
              <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            {message && (
              <div className="mt-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                {message}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}