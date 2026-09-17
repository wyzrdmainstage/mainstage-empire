import Link from "next/link";
import { requireUser } from "@/src/auth/require-user";
import { db } from "@/src/prisma/db";

function statusLabel(status: string) {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "READY":
      return "Ready";
    case "LIVE":
      return "Live";
    case "JUDGING_COMPLETE":
      return "Judging Complete";
    case "FINALIZED":
      return "Finalized";
    case "ARCHIVED":
      return "Archived";
    default:
      return status;
  }
}

function judgeActivePriority(status: string) {
  switch (status) {
    case "LIVE":
      return 1;
    case "JUDGING_COMPLETE":
      return 2;
    case "READY":
      return 3;
    case "DRAFT":
      return 4;
    default:
      return 99;
  }
}

function isCompletedStatus(status: string) {
  return (
    status === "FINALIZED" ||
    status === "ARCHIVED"
  );
}

export default async function CompetitionsPage() {
  const user = await requireUser();

  const isAdmin = user.roles.includes("ADMIN");
  const isOrganizer = user.roles.includes("ORGANIZER");
  const isJudge = user.roles.includes("JUDGE");

  // ADMIN and ORGANIZER users can manage all competitions.
  // JUDGE users only see competitions they are assigned to.
  const isManager = isAdmin || isOrganizer;

  let competitions: Array<{
    id: number;
    name: string;
    venueName: string;
    date: string;
    description: string | null;
    status: string;
  }> = [];

  if (isManager) {
    competitions =
      await db.orm.public.Competition.all();
  } else if (isJudge) {
    const assignments =
      await db.orm.public.CompetitionJudge
        .where({ judgeId: user.id })
        .all();

    const assignedCompetitions =
      await Promise.all(
        assignments.map(async (assignment) => {
          return db.orm.public.Competition.first({
            id: assignment.competitionId,
          });
        })
      );

    competitions =
      assignedCompetitions.filter(
        (
          competition
        ): competition is NonNullable<
          typeof competition
        > => competition !== null
      );
  }

  const pageTitle = isManager
    ? "Competitions"
    : "My Competitions";

  const pageDescription = isManager
    ? "Create, manage, and oversee Mainstage competitions."
    : "Competitions you have been assigned to judge.";

  /*
   * Judges get a workflow-first list:
   * active/upcoming competitions first,
   * completed competitions below them.
   */
  const judgeActiveCompetitions =
    !isManager && isJudge
      ? competitions
          .filter(
            (competition) =>
              !isCompletedStatus(
                competition.status
              )
          )
          .sort((a, b) => {
            const priorityDifference =
              judgeActivePriority(
                a.status
              ) -
              judgeActivePriority(
                b.status
              );

            if (priorityDifference !== 0) {
              return priorityDifference;
            }

            return (
              new Date(b.date).getTime() -
              new Date(a.date).getTime()
            );
          })
      : [];

  const judgeCompletedCompetitions =
    !isManager && isJudge
      ? competitions
          .filter((competition) =>
            isCompletedStatus(
              competition.status
            )
          )
          .sort(
            (a, b) =>
              new Date(b.date).getTime() -
              new Date(a.date).getTime()
          )
      : [];

  const managerActiveCompetitions =
    isManager
      ? competitions
          .filter(
            (competition) =>
              !isCompletedStatus(
                competition.status
              )
          )
          .sort((a, b) => {
            const priority = (status: string) => {
              switch (status) {
                case "LIVE":
                  return 1;
                case "JUDGING_COMPLETE":
                  return 2;
                case "READY":
                  return 3;
                case "DRAFT":
                  return 4;
                default:
                  return 99;
              }
            };

            const difference =
              priority(a.status) -
              priority(b.status);

            if (difference !== 0) {
              return difference;
            }

            return (
              new Date(b.date).getTime() -
              new Date(a.date).getTime()
            );
          })
      : [];

  const managerCompletedCompetitions =
    isManager
      ? competitions
          .filter((competition) =>
            isCompletedStatus(
              competition.status
            )
          )
          .sort(
            (a, b) =>
              new Date(b.date).getTime() -
              new Date(a.date).getTime()
          )
      : [];

  function competitionCard(
    competition: (typeof competitions)[number]
  ) {
    return (
      <div
        key={competition.id}
        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-amber-400/50"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold">
                {competition.name}
              </h2>

              <span
                className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                  competition.status ===
                  "LIVE"
                    ? "border-emerald-900 bg-emerald-950/40 text-emerald-400"
                    : competition.status ===
                        "FINALIZED"
                      ? "border-blue-900 bg-blue-950/40 text-blue-400"
                      : competition.status ===
                          "ARCHIVED"
                        ? "border-zinc-700 bg-zinc-900 text-zinc-400"
                        : "border-amber-900 bg-amber-950/40 text-amber-400"
                }`}
              >
                {statusLabel(
                  competition.status
                )}
              </span>
            </div>

            <div className="mt-4 space-y-1 text-sm text-zinc-400">
              <p>
                {competition.venueName}
              </p>

              <p>
                {new Date(
                  competition.date
                ).toLocaleString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {competition.description && (
              <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-500">
                {competition.description}
              </p>
            )}
          </div>

          <Link
            href={`/dashboard/competitions/${competition.id}`}
            className="shrink-0 rounded-lg bg-amber-400 px-5 py-3 text-center font-semibold text-black transition hover:bg-amber-300"
          >
            {isManager
              ? "Manage Competition"
              : "Open Competition"}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="border-b border-zinc-800 pb-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-amber-400 transition hover:text-amber-300"
            >
              ← Back to Dashboard
            </Link>

            {isManager && (
              <Link
                href="/dashboard/competitions/new"
                className="rounded-lg bg-amber-400 px-5 py-3 text-center text-sm font-semibold text-black transition hover:bg-amber-300"
              >
                + Create Competition
              </Link>
            )}
          </div>

          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.35em] text-amber-400">
            Mainstage Empire
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            {pageTitle}
          </h1>

          <p className="mt-2 text-zinc-400">
            {pageDescription}
          </p>
        </header>

        <section className="mt-10">
          {competitions.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
              <h2 className="text-xl font-semibold">
                {isJudge && !isManager
                  ? "No Competitions Assigned"
                  : "No Competitions Yet"}
              </h2>

              <p className="mt-2 text-sm text-zinc-500">
                {isJudge && !isManager
                  ? "You don't currently have any competitions assigned to you."
                  : "Create your first competition to get started."}
              </p>

              {isManager && (
                <Link
                  href="/dashboard/competitions/new"
                  className="mt-6 inline-block rounded-lg bg-amber-400 px-5 py-3 font-semibold text-black transition hover:bg-amber-300"
                >
                  Create Competition
                </Link>
              )}
            </div>
          ) : !isManager && isJudge ? (
            <div className="space-y-10">
              {judgeActiveCompetitions.length >
                0 && (
                <section>
                  <div className="mb-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-400">
                      Active & Upcoming
                    </p>

                    <p className="mt-1 text-sm text-zinc-500">
                      Competitions that still require
                      your attention.
                    </p>
                  </div>

                  <div className="grid gap-6">
                    {judgeActiveCompetitions.map(
                      competitionCard
                    )}
                  </div>
                </section>
              )}

              {judgeCompletedCompetitions.length >
                0 && (
                <section>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-zinc-700">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">
                          Completed Competitions
                        </p>

                        <p className="mt-1 text-sm text-zinc-600">
                          {
                            judgeCompletedCompetitions.length
                          }{" "}
                          {judgeCompletedCompetitions.length ===
                          1
                            ? "competition"
                            : "competitions"}{" "}
                          • Finalized and archived
                        </p>
                      </div>

                      <span className="text-xl text-zinc-500 transition-transform group-open:rotate-180">
                        ↓
                      </span>
                    </summary>

                    <div className="mt-4 grid gap-6">
                      {judgeCompletedCompetitions.map(
                        competitionCard
                      )}
                    </div>
                  </details>
                </section>
              )}

              {judgeActiveCompetitions.length ===
                0 &&
                judgeCompletedCompetitions.length ===
                  0 && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
                    <h2 className="text-xl font-semibold">
                      No Competitions Assigned
                    </h2>

                    <p className="mt-2 text-sm text-zinc-500">
                      You don't currently have any
                      competitions assigned to you.
                    </p>
                  </div>
                )}
            </div>
          ) : (
            <div className="space-y-10">
              {managerActiveCompetitions.length >
                0 && (
                <section>
                  <div className="mb-5">
                    <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-400">
                      Active & Upcoming
                    </p>

                    <p className="mt-1 text-sm text-zinc-500">
                      Competitions currently being prepared,
                      judged, or awaiting action.
                    </p>
                  </div>

                  <div className="grid gap-6">
                    {managerActiveCompetitions.map(
                      competitionCard
                    )}
                  </div>
                </section>
              )}

              {managerCompletedCompetitions.length >
                0 && (
                <section>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 p-6 transition hover:border-zinc-700">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-zinc-400">
                          Completed Competitions
                        </p>

                        <p className="mt-1 text-sm text-zinc-600">
                          {
                            managerCompletedCompetitions.length
                          }{" "}
                          {managerCompletedCompetitions.length ===
                          1
                            ? "competition"
                            : "competitions"}{" "}
                          • Finalized and archived
                        </p>
                      </div>

                      <span className="text-xl text-zinc-500 transition-transform group-open:rotate-180">
                        ↓
                      </span>
                    </summary>

                    <div className="mt-4 grid gap-6">
                      {managerCompletedCompetitions.map(
                        competitionCard
                      )}
                    </div>
                  </details>
                </section>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}