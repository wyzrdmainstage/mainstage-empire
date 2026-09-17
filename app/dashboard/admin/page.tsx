import Link from "next/link";
import { requireRole } from "@/src/auth/require-user";
import AdminUsersManager from "./AdminUsersManager";

export default async function AdminPage() {
  await requireRole(["ADMIN"]);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b border-zinc-800 pb-8">
          <Link
            href="/dashboard"
            className="text-sm font-medium text-zinc-400 transition hover:text-amber-400"
          >
            &larr; Back to Dashboard
          </Link>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
            Mainstage Empire
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            Administration
          </h1>

          <p className="mt-3 max-w-2xl text-zinc-400">
            Manage Mainstage Score administrators,
            organizers, and judges.
          </p>
        </header>

        <div className="mt-10">
          <AdminUsersManager />
        </div>
      </div>
    </main>
  );
}
