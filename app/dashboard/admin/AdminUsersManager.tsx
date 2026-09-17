"use client";

import { useEffect, useState } from "react";

type UserRole = "ADMIN" | "ORGANIZER" | "JUDGE";
type UserStatus = "ACTIVE" | "INVITATION_PENDING";

type AdminUser = {
  id: number;
  name: string;
  email: string;
  roles: UserRole[];
  status: UserStatus;
};

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrator",
  ORGANIZER: "Organizer",
  JUDGE: "Judge",
};

const roleGroups: UserRole[] = [
  "ADMIN",
  "ORGANIZER",
  "JUDGE",
];

export default function AdminUsersManager() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<UserRole[]>([
    "JUDGE",
  ]);
  const [sendInvitation, setSendInvitation] =
    useState(true);

  const [expandedSections, setExpandedSections] =
    useState<Record<UserRole, boolean>>({
      ADMIN: true,
      ORGANIZER: false,
      JUDGE: false,
    });

  async function loadUsers() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        "/api/admin/users",
        {
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load users."
        );
      }

      setUsers(data.users || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load users."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function toggleSection(
    userRole: UserRole
  ) {
    setExpandedSections((current) => ({
      ...current,
      [userRole]: !current[userRole],
    }));
  }

  function toggleNewUserRole(
    role: UserRole
  ) {
    setRoles((current) => {
      if (current.includes(role)) {
        return current.filter(
          (currentRole) =>
            currentRole !== role
        );
      }

      return [...current, role];
    });
  }

  async function addUser(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (roles.length === 0) {
      setError(
        "Select at least one role."
      );
      return;
    }

    try {
      setSaving(true);
      setMessage("");
      setError("");

      const response = await fetch(
        "/api/admin/users",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            roles,
            sendInvitation,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to create user."
        );
      }

      setName("");
      setEmail("");
      setRoles(["JUDGE"]);
      setSendInvitation(true);

      setMessage(
        sendInvitation
          ? "User created and invitation sent."
          : "User created successfully."
      );

      setExpandedSections(
        (current) => {
          const next = {
            ...current,
          };

          for (const role of roles) {
            next[role] = true;
          }

          return next;
        }
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create user."
      );
    } finally {
      setSaving(false);
    }
  }

  async function updateRoles(
    userId: number,
    newRoles: UserRole[]
  ) {
    if (newRoles.length === 0) {
      setError(
        "A user must have at least one role."
      );
      return;
    }

    try {
      setMessage("");
      setError("");

      const response = await fetch(
        `/api/admin/users/${userId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            roles: newRoles,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to update user roles."
        );
      }

      setMessage("User roles updated.");

      setExpandedSections(
        (current) => {
          const next = {
            ...current,
          };

          for (const role of newRoles) {
            next[role] = true;
          }

          return next;
        }
      );

      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to update user roles."
      );
    }
  }

  function toggleUserRole(
    user: AdminUser,
    role: UserRole
  ) {
    const newRoles = user.roles.includes(role)
      ? user.roles.filter(
          (currentRole) =>
            currentRole !== role
        )
      : [...user.roles, role];

    updateRoles(user.id, newRoles);
  }

  async function resendInvitation(
    userId: number
  ) {
    try {
      setMessage("");
      setError("");

      const response = await fetch(
        `/api/admin/users/${userId}`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            action: "resendInvitation",
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to resend invitation."
        );
      }

      setMessage("Invitation resent.");
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to resend invitation."
      );
    }
  }

  async function deleteUser(
    userId: number,
    userName: string
  ) {
    const confirmed = window.confirm(
      `Delete ${userName}? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setMessage("");
      setError("");

      const response = await fetch(
        `/api/admin/users/${userId}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to delete user."
        );
      }

      setMessage("User deleted.");
      await loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to delete user."
      );
    }
  }

  function getUsersByRole(
    userRole: UserRole
  ) {
    return users
      .filter((user) =>
        user.roles.includes(userRole)
      )
      .sort((a, b) =>
        a.name.localeCompare(b.name)
      );
  }

  function roleDescription(
    userRole: UserRole
  ) {
    switch (userRole) {
      case "ADMIN":
        return "Full Mainstage Score administration";
      case "ORGANIZER":
        return "Competition creation and management";
      case "JUDGE":
        return "Competition judging and scorecards";
    }
  }

  return (
    <div className="space-y-8">
      {/* Add User */}
      <section className="rounded-2xl border border-white/10 bg-black/40 p-6 shadow-xl">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">
            Add User
          </h2>

          <p className="mt-1 text-sm text-white/50">
            Create a Mainstage Score account and assign one or more roles.
          </p>
        </div>

        <form
          onSubmit={addUser}
          className="space-y-5"
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                required
                maxLength={100}
                placeholder="Full name"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-yellow-500/60 focus:bg-white/[0.07]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Email
              </label>

              <input
                type="email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                required
                placeholder="name@example.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-yellow-500/60 focus:bg-white/[0.07]"
              />
            </div>
          </div>

          <div>
            <label className="mb-3 block text-sm font-medium text-white/80">
              Roles
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              {roleGroups.map((role) => {
                const selected =
                  roles.includes(role);

                return (
                  <label
                    key={role}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${
                      selected
                        ? "border-yellow-500/40 bg-yellow-500/10"
                        : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        toggleNewUserRole(
                          role
                        )
                      }
                      className="h-4 w-4 accent-yellow-500"
                    />

                    <span
                      className={
                        selected
                          ? "text-sm font-medium text-yellow-300"
                          : "text-sm text-white/70"
                      }
                    >
                      {roleLabels[role]}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={
                saving || roles.length === 0
              }
              className="rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-6 py-3 font-semibold text-yellow-300 transition hover:bg-yellow-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Creating..."
                : "Create User"}
            </button>
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/70">
            <input
              type="checkbox"
              checked={sendInvitation}
              onChange={(event) =>
                setSendInvitation(
                  event.target.checked
                )
              }
              className="h-4 w-4 accent-yellow-500"
            />

            Send invitation email
          </label>
        </form>

        {message && (
          <div className="mt-5 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </section>

      {/* Users */}
      <section>
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">
            Users
          </h2>

          <p className="mt-1 text-sm text-white/50">
            Manage Mainstage Score accounts and permissions.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-white/10 bg-black/40 p-8 text-center text-sm text-white/50">
            Loading users...
          </div>
        ) : (
          <div className="space-y-4">
            {roleGroups.map(
              (groupRole) => {
                const groupUsers =
                  getUsersByRole(
                    groupRole
                  );

                const isExpanded =
                  expandedSections[
                    groupRole
                  ];

                return (
                  <section
                    key={groupRole}
                    className="overflow-hidden rounded-2xl border border-white/10 bg-black/30"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        toggleSection(
                          groupRole
                        )
                      }
                      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left transition hover:bg-white/[0.03]"
                      aria-expanded={
                        isExpanded
                      }
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-yellow-500/20 bg-yellow-500/10 text-yellow-300 transition-transform duration-200 ${
                            isExpanded
                              ? "rotate-90"
                              : ""
                          }`}
                        >
                          <span className="text-lg leading-none">
                            &rsaquo;
                          </span>
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-white">
                              {
                                roleLabels[
                                  groupRole
                                ]
                              }
                              s
                            </h3>

                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/60">
                              {
                                groupUsers.length
                              }
                            </span>
                          </div>

                          <p className="mt-0.5 text-xs text-white/40">
                            {roleDescription(
                              groupRole
                            )}
                          </p>
                        </div>
                      </div>

                      <span className="shrink-0 text-xs text-white/30">
                        {isExpanded
                          ? "Collapse"
                          : "Expand"}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-white/10 p-4">
                        {groupUsers.length ===
                        0 ? (
                          <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-5 py-6 text-sm text-white/40">
                            No{" "}
                            {roleLabels[
                              groupRole
                            ].toLowerCase()}
                            s yet.
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {groupUsers.map(
                              (user) => (
                                <div
                                  key={
                                    user.id
                                  }
                                  className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-lg"
                                >
                                  <div className="flex flex-col gap-5">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h4 className="font-semibold text-white">
                                          {
                                            user.name
                                          }
                                        </h4>

                                        {user.roles.map(
                                          (
                                            userRole
                                          ) => (
                                            <span
                                              key={
                                                userRole
                                              }
                                              className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-300"
                                            >
                                              {
                                                roleLabels[
                                                  userRole
                                                ]
                                              }
                                            </span>
                                          )
                                        )}

                                        <span
                                          className={
                                            user.status ===
                                            "INVITATION_PENDING"
                                              ? "rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-300"
                                              : "rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-300"
                                          }
                                        >
                                          {user.status ===
                                          "INVITATION_PENDING"
                                            ? "Invitation Pending"
                                            : "Active"}
                                        </span>
                                      </div>

                                      <p className="mt-1 truncate text-sm text-white/50">
                                        {
                                          user.email
                                        }
                                      </p>
                                    </div>

                                    <div>
                                      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/40">
                                        Assigned Roles
                                      </p>

                                      <div className="grid gap-2 sm:grid-cols-3">
                                        {roleGroups.map(
                                          (
                                            role
                                          ) => {
                                            const selected =
                                              user.roles.includes(
                                                role
                                              );

                                            return (
                                              <label
                                                key={
                                                  role
                                                }
                                                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${
                                                  selected
                                                    ? "border-yellow-500/30 bg-yellow-500/10"
                                                    : "border-white/10 bg-white/5 hover:bg-white/[0.07]"
                                                }`}
                                              >
                                                <input
                                                  type="checkbox"
                                                  checked={
                                                    selected
                                                  }
                                                  onChange={() =>
                                                    toggleUserRole(
                                                      user,
                                                      role
                                                    )
                                                  }
                                                  className="h-4 w-4 accent-yellow-500"
                                                />

                                                <span
                                                  className={
                                                    selected
                                                      ? "text-xs font-medium text-yellow-300"
                                                      : "text-xs text-white/50"
                                                  }
                                                >
                                                  {
                                                    roleLabels[
                                                      role
                                                    ]
                                                  }
                                                </span>
                                              </label>
                                            );
                                          }
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                                      {user.status ===
                                        "INVITATION_PENDING" && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            resendInvitation(
                                              user.id
                                            )
                                          }
                                          className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-sm font-medium text-yellow-300 transition hover:bg-yellow-500/20"
                                        >
                                          Resend Invitation
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() =>
                                          deleteUser(
                                            user.id,
                                            user.name
                                          )
                                        }
                                        className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/10"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              }
            )}
          </div>
        )}
      </section>
    </div>
  );
}