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
  const performerIds = new Set(performers.map((performer) => performer.id));
  const judges = await Promise.all(assignments.map(async (assignment) => {
    const [user, cards] = await Promise.all([
      db.orm.public.User.where({ id: assignment.judgeId }).select("name").first(),
      db.orm.public.Scorecard.where({ judgeAssignmentId: assignment.id, status: "SUBMITTED" })
        .select("performerId").all(),
    ]);
    const submitted = new Set(cards.filter((card) => performerIds.has(card.performerId))
      .map((card) => card.performerId)).size;
    return {
      id: assignment.id,
      name: user?.name || "Unnamed judge",
      submitted,
      remaining: performers.length - submitted,
      excluded: assignment.excludedFromResults,
    };
  }));
  judges.sort((a, b) => Number(a.excluded) - Number(b.excluded) || a.name.localeCompare(b.name) || a.id - b.id);
  const included = judges.filter((judge) => !judge.excluded);
  // Match the existing management progress: all lineup performers, included judges only.
  return {
    submitted: included.reduce((sum, judge) => sum + judge.submitted, 0),
    expected: performers.length * included.length,
    judges,
  };
}
