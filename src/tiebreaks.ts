import { db } from "@/src/prisma/db";

export function voteLeaders(ids: number[], votes: Array<{ performerId: number }>) {
  const counts = ids.map((id) => ({ id, count: votes.filter((v) => v.performerId === id).length }));
  const highest = Math.max(...counts.map((entry) => entry.count));
  return counts.filter((entry) => entry.count === highest).map((entry) => entry.id);
}

// Keep one winner per placement so both results pages retain their existing
// ranking contract. Completed ballots can settle several successive placements.
export async function advanceTiebreaks(
  competitionId: number,
  scores: Array<{ performerId: number; finalScore: number }>
) {
  const rounds = await db.orm.public.Tiebreak.where({ competitionId }).all();
  const active = rounds.filter((r) => r.status !== "RESOLVED").sort((a, b) => a.placement - b.placement)[0];
  if (active) return active;

  const assignments = await db.orm.public.CompetitionJudge.where({ competitionId }).all();
  const eligible = new Set(assignments.filter((a) => !a.excludedFromResults).map((a) => a.judgeId));
  const history = await Promise.all(rounds.filter((r) => r.status === "RESOLVED").sort((a, b) => b.placement - a.placement).map(async (round) => {
    const entries = await db.orm.public.TiebreakPerformer.where({ tiebreakId: round.id }).all();
    const ballots = await db.orm.public.TiebreakVote.where({ tiebreakId: round.id }).all();
    const votes = ballots.filter((v) => v.voterType === "JUDGE" && eligible.has(v.userId));
    return { round, ids: entries.map((e) => e.performerId), votes, complete: eligible.size > 0 && new Set(votes.map((v) => v.userId)).size === eligible.size };
  }));

  let placement = 1;
  for (const score of [...new Set(scores.map((s) => s.finalScore))].sort((a, b) => b - a)) {
    let remaining = scores.filter((s) => s.finalScore === score).map((s) => s.performerId);
    while (remaining.length) {
      const settled = rounds.find((r) => r.placement === placement && r.status === "RESOLVED" && r.winnerPerformerId !== null && remaining.includes(r.winnerPerformerId));
      if (settled) {
        remaining = remaining.filter((id) => id !== settled.winnerPerformerId);
        placement++;
        continue;
      }
      if (remaining.length === 1) { placement++; break; }

      const previous = history.find((h) => h.complete && h.round.placement < placement && remaining.some((id) => h.ids.includes(id)));
      // A later runoff ranks its own tier ahead of lower tiers from the
      // original ballot, even while those lower performers remain unplaced.
      const leaders = previous ? voteLeaders(remaining.filter((id) => previous.ids.includes(id)), previous.votes) : remaining;
      const winner = leaders.length === 1 ? leaders[0] : null;
      const round = await db.orm.public.Tiebreak.create({
        competitionId, placement, status: winner === null ? "JUDGES_VOTING" : "RESOLVED",
        winnerPerformerId: winner, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      // An automatic decision retains the compared candidates for results.
      for (const performerId of winner === null ? leaders : remaining) {
        await db.orm.public.TiebreakPerformer.create({ tiebreakId: round.id, performerId });
      }
      if (winner === null) return round;
      rounds.push(round);
      remaining = remaining.filter((id) => id !== winner);
      placement++;
    }
  }
  return null;
}
