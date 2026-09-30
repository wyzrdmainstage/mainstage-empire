import { db } from "@/src/prisma/db";

// Call only after the caller's authorization/publication checks. Keep reads
// request-local: exclusions, resets and tiebreaks must never use stale caches.
export async function getCompetitionResultData(competitionId: number) {
  const [performers, assignments, tiebreaks] = await Promise.all([
    db.orm.public.Performer.where({ competitionId }).all(),
    db.orm.public.CompetitionJudge.where({ competitionId }).all(),
    db.orm.public.Tiebreak.where({ competitionId }).all(),
  ]);
  const performerIds = performers.filter((row) => !row.excludedFromResults).map((row) => row.id);
  const assignmentIds = assignments.filter((row) => !row.excludedFromResults).map((row) => row.id);
  const tiebreakIds = tiebreaks.filter((row) => row.status === "RESOLVED" && row.winnerPerformerId !== null).map((row) => row.id);
  const [cards, participants] = await Promise.all([
    performerIds.length && assignmentIds.length
      ? db.orm.public.Scorecard.where((card) => card.performerId.in(performerIds))
        .where((card) => card.judgeAssignmentId.in(assignmentIds))
        .where({ status: "SUBMITTED" })
        .select("performerId", "judgeAssignmentId", "status", "presentation", "vocals", "lyrics", "energy", "quality", "starFactor").all()
      : Promise.resolve([]),
    tiebreakIds.length
      ? db.orm.public.TiebreakPerformer.where((row) => row.tiebreakId.in(tiebreakIds))
        .select("tiebreakId", "performerId").all()
      : Promise.resolve([]),
  ]);
  const scorecardsByPerformer = new Map<number, typeof cards>();
  for (const card of cards) {
    const group = scorecardsByPerformer.get(card.performerId) ?? [];
    group.push(card);
    scorecardsByPerformer.set(card.performerId, group);
  }
  const participantsByTiebreak = new Map<number, typeof participants>();
  for (const participant of participants) {
    const group = participantsByTiebreak.get(participant.tiebreakId) ?? [];
    group.push(participant);
    participantsByTiebreak.set(participant.tiebreakId, group);
  }
  return { performers, assignments, tiebreaks, scorecardsByPerformer, participantsByTiebreak };
}
