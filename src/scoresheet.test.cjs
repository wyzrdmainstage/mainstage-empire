const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { renderToStaticMarkup } = require('react-dom/server');

function fixture({ status = 'FINALIZED', excluded = false, cards } = {}) {
  const score = (judgeAssignmentId, value, status = 'SUBMITTED') => ({
    performerId: 2, judgeAssignmentId, status, notes: 'Private feedback',
    presentation: value, vocals: value, lyrics: value, energy: value, quality: value, starFactor: value,
  });
  const table = (rows) => ({
    first: async (query) => rows.find((row) => Object.entries(query).every(([key, value]) => row[key] === value)),
    where: (query) => ({ all: async () => rows.filter((row) => Object.entries(query).every(([key, value]) => row[key] === value)) }),
  });
  const db = { orm: { public: {
    Competition: table([{ id: 1, status, name: 'Final Night', venueName: 'Main Stage' }]),
    Performer: table([{ id: 2, competitionId: 1, artistName: 'Test Artist', performanceOrder: 1, excludedFromResults: excluded }]),
    CompetitionJudge: table([{ id: 10, competitionId: 1 }, { id: 11, competitionId: 1 }, { id: 12, competitionId: 1, excludedFromResults: true }]),
    Scorecard: table(cards ?? [score(10, 8), score(11, 10), score(12, 1), score(13, 1), score(10, 1, 'DRAFT')]),
  } } };
  const context = { exports: {}, require: (name) => {
    if (name === '@/src/prisma/db') return { db };
    if (name === 'next/navigation') return { notFound: () => { throw new Error('NOT_FOUND'); } };
    if (name === 'next/link') return { default: 'a' };
    if (name.includes('ShareResultsButton')) return { default: () => null };
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/results/[id]/performers/[performerId]/page.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return (id = '1', performerId = '2') => context.exports.default({ params: Promise.resolve({ id, performerId }) });
}

test('finished scoresheet averages only submitted scores from included judges and omits private notes', async () => {
  const html = renderToStaticMarkup(await fixture()());
  assert.match(html, /54\.0/);
  assert.match(html, /9\.0/);
  assert.match(html, /Test Artist/);
  assert.doesNotMatch(html, /Private feedback/);
});

test('unpublished and canceled competitions cannot expose a scoresheet', async () => {
  for (const status of ['DRAFT', 'READY', 'LIVE', 'JUDGING_COMPLETE', 'CANCELED']) {
    await assert.rejects(fixture({ status })(), /NOT_FOUND/);
  }
});

test('archived scoresheets remain shareable', async () => {
  assert.match(renderToStaticMarkup(await fixture({ status: 'ARCHIVED' })()), /54\.0/);
});

test('invalid IDs, mismatched performer, exclusions and empty scores are unavailable', async () => {
  for (const ids of [['bad', '2'], ['0', '2'], ['1', '-2'], ['1', '3'], ['2', '2']]) {
    await assert.rejects(fixture()(...ids), /NOT_FOUND/);
  }
  await assert.rejects(fixture({ excluded: true })(), /NOT_FOUND/);
  await assert.rejects(fixture({ cards: [] })(), /NOT_FOUND/);
});
