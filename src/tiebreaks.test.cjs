const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function fixture(counts, placement = 1) {
  const rounds = [{ id: 1, competitionId: 1, placement, status: 'RESOLVED', winnerPerformerId: 1 }];
  const entries = counts.map((_, i) => ({ tiebreakId: 1, performerId: i + 1 }));
  const votes = counts.flatMap((count, i) => Array.from({ length: count }, () => ({ tiebreakId: 1, performerId: i + 1, voterType: 'JUDGE' })));
  votes.forEach((v, i) => { v.userId = i + 1; });
  const assignments = votes.map((v) => ({ judgeId: v.userId, excludedFromResults: false }));
  const scores = [...Array.from({ length: placement - 1 }, (_, i) => ({ performerId: 100 + i, finalScore: 100 - i })), ...counts.map((_, i) => ({ performerId: i + 1, finalScore: 50 })), { performerId: 200, finalScore: 40 }];
  const table = (rows) => ({
    where: (query) => ({ all: async () => rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)) }),
    create: async (data) => { const row = { id: rows.length + 1, ...data }; rows.push(row); return row; },
  });
  const db = { orm: { public: { Tiebreak: table(rounds), TiebreakPerformer: table(entries), TiebreakVote: table(votes), CompetitionJudge: { where: () => ({ all: async () => assignments }) } } } };
  const context = { exports: {}, require: () => ({ db }) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/tiebreaks.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  return { rounds, entries, votes, assignments, scores, advance: () => context.exports.advanceTiebreaks(1, scores) };
}

test('4–2–1 settles remaining placements without another ballot, including lower score groups', async () => {
  const f = fixture([4, 2, 1], 12);
  assert.equal(await f.advance(), null);
  assert.equal(f.rounds.find((r) => r.placement === 13).winnerPerformerId, 2);
  assert.equal(f.rounds.length, 2);
  assert.equal(await f.advance(), null);
  assert.equal(f.rounds.length, 2);
});

test('3–2–2 opens a fresh round only for equal totals', async () => {
  const f = fixture([3, 2, 2]);
  const next = await f.advance();
  assert.equal(next.placement, 2);
  assert.equal(next.status, 'JUDGES_VOTING');
  assert.deepEqual(f.entries.filter((e) => e.tiebreakId === next.id).map((e) => e.performerId), [2, 3]);
  assert.equal(await f.advance(), next);
});

test('lower vote tier stays below the runoff candidates', async () => {
  const f = fixture([4, 2, 2, 1]);
  const runoff = await f.advance();
  assert.deepEqual(f.entries.filter((e) => e.tiebreakId === runoff.id).map((e) => e.performerId), [2, 3]);
  runoff.status = 'RESOLVED'; runoff.winnerPerformerId = 2;
  assert.equal(await f.advance(), null);
  assert.equal(f.rounds.find((r) => r.placement === 3).winnerPerformerId, 3);
});

test('organizer resolves top deadlock, remaining distinct totals settle automatically', async () => {
  const f = fixture([3, 3, 1]);
  assert.equal(await f.advance(), null);
  assert.equal(f.rounds.find((r) => r.placement === 2).winnerPerformerId, 2);
});

test('zero-vote ties still require a runoff', async () => {
  const f = fixture([7, 0, 0]);
  assert.equal((await f.advance()).status, 'JUDGES_VOTING');
});

test('excluded judge ballots do not determine ordering', async () => {
  const f = fixture([4, 2, 1]);
  f.assignments.find((a) => a.judgeId === 6).excludedFromResults = true;
  assert.equal((await f.advance()).status, 'JUDGES_VOTING');
});

test('incomplete historical votes are not reused', async () => {
  const f = fixture([4, 2, 1]);
  f.assignments.push({ judgeId: 99, excludedFromResults: false });
  assert.equal((await f.advance()).status, 'JUDGES_VOTING');
});

test('a multiway runoff ranks its whole tier before the lower original tier', async () => {
  const f = fixture([4, 2, 2, 2, 1]);
  const runoff = await f.advance();
  runoff.status = 'RESOLVED'; runoff.winnerPerformerId = 2;
  f.assignments.forEach((a, i) => f.votes.push({ tiebreakId: runoff.id, userId: a.judgeId, voterType: 'JUDGE', performerId: i < 6 ? 2 : i < 9 ? 3 : 4 }));
  assert.equal(await f.advance(), null);
  assert.equal(f.rounds.find((r) => r.placement === 3).winnerPerformerId, 3);
  assert.equal(f.rounds.find((r) => r.placement === 4).winnerPerformerId, 4);
});

