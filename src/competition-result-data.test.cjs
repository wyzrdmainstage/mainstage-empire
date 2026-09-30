const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');

function fixture({ performerCount = 3, judgeCount = 2, status = 'FINALIZED' } = {}) {
  let reads = 0;
  const rows = {
    Competition: [{ id: 1, name: 'Final Night', status }],
    Performer: Array.from({ length: performerCount }, (_, i) => ({ id: i + 1, competitionId: 1, artistName: `Artist ${i + 1}`, performanceOrder: i + 1, excludedFromResults: false })),
    CompetitionJudge: Array.from({ length: judgeCount }, (_, i) => ({ id: i + 10, competitionId: 1, excludedFromResults: false })),
    Tiebreak: [{ id: 1, competitionId: 1, status: 'RESOLVED', winnerPerformerId: 2, placement: 1 }],
    TiebreakPerformer: [{ tiebreakId: 1, performerId: 1 }, { tiebreakId: 1, performerId: 2 }],
    Scorecard: [],
  };
  for (const performer of rows.Performer) for (const judge of rows.CompetitionJudge) {
    rows.Scorecard.push({ performerId: performer.id, judgeAssignmentId: judge.id, status: 'SUBMITTED',
      presentation: 8, vocals: 8, lyrics: 8, energy: 8, quality: 8, starFactor: 8, notes: 'Private feedback' });
  }
  const predicate = filter => typeof filter === 'function'
    ? filter(new Proxy({}, { get: (_, key) => ({ in: values => row => values.includes(row[key]) }) }))
    : row => Object.entries(filter).every(([key, value]) => row[key] === value);
  const table = name => {
    const query = (filters = [], fields) => ({
      where: filter => query([...filters, predicate(filter)], fields),
      select: (...fields) => query(filters, fields),
      all: async () => {
        reads++;
        return rows[name].filter(row => filters.every(fn => fn(row))).map(row => fields
          ? Object.fromEntries(fields.map(key => [key, row[key]])) : row);
      },
      first: async filter => (await query(filter ? [...filters, predicate(filter)] : filters, fields).all())[0] ?? null,
    });
    return query();
  };
  const db = { orm: { public: Object.fromEntries(Object.keys(rows).map(name => [name, table(name)])) } };
  let helper;
  function load(path, source = fs.readFileSync(path, 'utf8')) {
    const context = { exports: {}, require: name => {
      if (name === '@/src/prisma/db') return { db };
      if (name === '@/src/competition-result-data') return helper;
      if (name === 'next/navigation') return { notFound: () => { throw new Error('NOT_FOUND'); } };
      if (name === 'next/link') return { default: 'a' };
      if (name.includes('ShareResultsButton') || name.includes('ScoresheetActions')) return { default: () => null };
      return require(name);
    } };
    vm.runInNewContext(ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText, context);
    return context.exports;
  }
  helper = load('src/competition-result-data.ts');
  return { rows, reads: () => reads, get: () => helper.getCompetitionResultData(1),
    render: async (path, source) => renderToStaticMarkup(await load(path, source).default({ competitionId: 1, status, params: Promise.resolve({ id: '1' }) })) };
}

test('results use five reads for 20 performers, 5 judges, and resolved tiebreaks', async () => {
  const f = fixture({ performerCount: 20, judgeCount: 5 });
  const data = await f.get();
  assert.equal(f.reads(), 5);
  assert.equal(data.scorecardsByPerformer.size, 20);
  assert.equal(data.scorecardsByPerformer.get(1).length, 5);
  assert.equal(data.participantsByTiebreak.get(1).length, 2);
  assert.ok(data.scorecardsByPerformer.get(1).every(card => !('notes' in card)));
});

test('batched results omit drafts, excluded judges and performers, and other competitions', async () => {
  const f = fixture();
  f.rows.Performer[2].excludedFromResults = true;
  f.rows.CompetitionJudge[1].excludedFromResults = true;
  f.rows.Scorecard[0].status = 'DRAFT';
  f.rows.Performer.push({ id: 99, competitionId: 9 });
  f.rows.CompetitionJudge.push({ id: 99, competitionId: 9 });
  f.rows.Scorecard.push({ performerId: 1, judgeAssignmentId: 99, status: 'SUBMITTED' });
  f.rows.TiebreakPerformer.push({ tiebreakId: 99, performerId: 1 });
  const data = await f.get();
  assert.equal(data.performers.length, 3);
  assert.equal(data.scorecardsByPerformer.size, 1);
  assert.equal(data.scorecardsByPerformer.get(2)[0].judgeAssignmentId, 10);
  assert.equal(data.participantsByTiebreak.has(99), false);
});

test('empty inputs skip dependent queries and never issue an unscoped card query', async () => {
  const f = fixture({ performerCount: 0, judgeCount: 0 });
  f.rows.Tiebreak.length = 0;
  const data = await f.get();
  assert.equal(data.scorecardsByPerformer.size, 0);
  assert.equal(data.participantsByTiebreak.size, 0);
  assert.equal(f.reads(), 3);
});

const pages = ['app/dashboard/competitions/[id]/ResultsPanel.tsx', 'app/results/[id]/page.tsx'];
test('both results views preserve averages and resolved tiebreak ordering', async () => {
  for (const path of pages) {
    const f = fixture();
    const html = await f.render(path);
    assert.match(html, /48\.0/);
    assert.ok(html.indexOf('Artist 2') < html.indexOf('Artist 1'));
    assert.doesNotMatch(html, /Private feedback/);
    assert.equal(f.reads(), path.includes('ResultsPanel') ? 5 : 6);
  }
});

test('results remain hidden before publication and after cancellation', async () => {
  for (const status of ['DRAFT', 'READY', 'LIVE', 'CANCELED']) for (const path of pages) {
    const f = fixture({ status });
    assert.doesNotMatch(await f.render(path), /Artist 1|48\.0|Private feedback/);
    assert.equal(f.reads(), path.includes('ResultsPanel') ? 0 : 1);
  }
});

module.exports = { fixture, pages };
