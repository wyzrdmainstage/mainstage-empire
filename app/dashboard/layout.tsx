import Link from "next/link";
import { requireUser } from "@/src/auth/require-user";
import AccountMenu from "./AccountMenu";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="border-b border-zinc-800 bg-black">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="group"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-400">
              Mainstage Empire
            </p>

            <p className="mt-1 text-lg font-bold text-white transition group-hover:text-amber-400">
              Mainstage Score
            </p>
          </Link>

          <AccountMenu
            name={user.name}
            roles={user.roles}
          />
        </div>
      </header>

      {children}
    </div>
  );
}
