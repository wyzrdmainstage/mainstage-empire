"use client";

import Link from "next/link";
import { useState } from "react";

type AccountMenuProps = {
  name: string;
  roles: string[];
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

function roleLabels(roles: string[]) {
  const roleOrder = [
    "ADMIN",
    "ORGANIZER",
    "JUDGE",
  ];

  return [...roles]
    .sort(
      (a, b) =>
        roleOrder.indexOf(a) -
        roleOrder.indexOf(b)
    )
    .map(roleLabel)
    .join(" • ");
}

export default function AccountMenu({
  name,
  roles,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = name.trim() || "User";
  const initial =
    displayName.charAt(0).toUpperCase() || "?";

  const displayRoles =
    roles.length > 0 ? roleLabels(roles) : "User";

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-3 rounded-xl border border-transparent px-2 py-1.5 transition hover:border-zinc-800 hover:bg-zinc-950"
      >
        <div className="hidden text-right sm:block">
          <p className="text-sm text-zinc-400">
            Welcome,{" "}
            <span className="font-semibold text-white">
              {displayName}
            </span>
          </p>

          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
            {displayRoles}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/30 bg-amber-400/10 text-sm font-bold text-amber-400">
          {initial}
        </div>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            <div className="border-b border-zinc-800 px-4 py-3">
              <p className="truncate text-sm font-semibold text-white">
                {displayName}
              </p>

              <p className="mt-1 text-xs uppercase tracking-wider text-amber-400">
                {displayRoles}
              </p>
            </div>

            <div className="p-1.5">
              <Link
                href="/dashboard/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-zinc-900 hover:text-white"
              >
                My Account
              </Link>

              <button
                type="button"
                role="menuitem"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full rounded-lg px-3 py-2.5 text-left text-sm text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {signingOut ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}