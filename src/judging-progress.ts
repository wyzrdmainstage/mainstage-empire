import { db } from "@/src/prisma/db";

export type JudgingProgress = {
  submitted: number;
  expected: number;
  judges: { id: number; name: string; submitted: number; remaining: number; excluded: boolean }[];
};

export async function getJudgingProgress(competitionId: number): Promise<JudgingProgress> {
  const [performers, assignments] = await Promise.all([
    db.orm.public.Performer.where({ competitionId }).select("id").all(),
    db.orm.public.CompetitionJudge.where({ competitionId }).all(),
  ]);
  const performerIds = performers.map((performer) => performer.id);
  const judgeIds = assignments.map((assignment) => assignment.judgeId);
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const [users, cards] = await Promise.all([
    judgeIds.length ? db.orm.public.User.where((user) => user.id.in(judgeIds)).select("id", "name").all() : Promise.resolve([]),
    performerIds.length && assignmentIds.length
      ? db.orm.public.Scorecard.where((card) => card.performerId.in(performerIds))
        .where((card) => card.judgeAssignmentId.in(assignmentIds)).where({ status: "SUBMITTED" })
        .select("judgeAssignmentId", "performerId").all()
      : Promise.resolve([]),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const submittedByJudge = new Map<number, Set<number>>();
  for (const card of cards) {
    const submitted = submittedByJudge.get(card.judgeAssignmentId) ?? new Set<number>();
    submitted.add(card.performerId);
    submittedByJudge.set(card.judgeAssignmentId, submitted);
  }
  const judges = assignments.map((assignment) => {
    const user = usersById.get(assignment.judgeId);
    const submitted = submittedByJudge.get(assignment.id)?.size ?? 0;
    return {
      id: assignment.id,
      name: user?.name || "Unnamed judge",
      submitted,
      remaining: performers.length - submitted,
      excluded: assignment.excludedFromResults,
    };
  });
  judges.sort((a, b) => Number(a.excluded) - Number(b.excluded) || a.name.localeCompare(b.name) || a.id - b.id);
  const included = judges.filter((judge) => !judge.excluded);
  // Match the existing management progress: all lineup performers, included judges only.
  return {
    submitted: included.reduce((sum, judge) => sum + judge.submitted, 0),
    expected: performers.length * included.length,
    judges,
  };
}
