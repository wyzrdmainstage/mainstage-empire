const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, dependencies, globals = {}) {
  const context = { exports: {}, console, ...globals, require: name => dependencies[name] ?? require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context.exports;
}

function fixture({ roles = ['ORGANIZER'], signedIn = true } = {}) {
  const rows = {
    Competition: [{ id: 1 }],
    Performer: [{ id: 2, competitionId: 1 }, { id: 3, competitionId: 1 }, { id: 4, competitionId: 9 }],
    CompetitionJudge: [
      { id: 10, competitionId: 1, judgeId: 20, excludedFromResults: false },
      { id: 11, competitionId: 1, judgeId: 21, excludedFromResults: true },
      { id: 12, competitionId: 9, judgeId: 22, excludedFromResults: false },
    ],
    User: [{ id: 20, name: 'Judge A' }, { id: 21, name: 'Judge B' }],
    Scorecard: [
      { performerId: 2, judgeAssignmentId: 10, status: 'SUBMITTED', notes: 'private', vocals: 8 },
      { performerId: 3, judgeAssignmentId: 10, status: 'DRAFT' },
      { performerId: 2, judgeAssignmentId: 11, status: 'SUBMITTED' },
      { performerId: 4, judgeAssignmentId: 10, status: 'SUBMITTED' },
    ],
  };
  let reads = 0;
  const predicate = filter => typeof filter === 'function'
    ? filter(new Proxy({}, { get: (_, key) => ({ in: values => row => values.includes(row[key]) }) }))
    : row => Object.entries(filter).every(([key, value]) => row[key] === value);
  const table = name => {
    const query = (filters = [], fields) => ({
      where: filter => query([...filters, predicate(filter)], fields), select: (...fields) => query(filters, fields),
      all: async () => {
        reads++;
        return rows[name].filter(row => filters.every(test => test(row)))
          .map(row => fields ? Object.fromEntries(fields.map(key => [key, row[key]])) : row);
      },
      first: async filter => (await query(filter ? [...filters, predicate(filter)] : filters, fields).all())[0] ?? null,
    });
    return query();
  };
  const db = { orm: { public: Object.fromEntries(Object.keys(rows).map(name => [name, table(name)])) } };
  const helper = load('src/judging-progress.ts', { '@/src/prisma/db': { db } });
  const route = load('app/api/competitions/[id]/progress/route.ts', {
    '@/src/prisma/db': { db }, '@/src/judging-progress': helper,
    '@/src/auth': { SESSION_COOKIE: 'session', getUserFromSessionToken: async () => signedIn ? { roles } : null },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'session' }) }) },
    'next/server': { NextResponse: { json: (data, options = {}) => ({ data, status: options.status ?? 200, headers: options.headers }) } },
  });
  return { rows, reads: () => reads, progress: () => helper.getJudgingProgress(1), get: (id = '1') => route.GET({}, { params: Promise.resolve({ id }) }) };
}

test('progress uses four reads even for a large panel of judges', async () => {
  const f = fixture();
  for (let i = 30; i < 130; i++) {
    f.rows.CompetitionJudge.push({ id: i, competitionId: 1, judgeId: i, excludedFromResults: false });
    f.rows.User.push({ id: i, name: `Judge ${i}` });
  }
  const data = await f.progress();
  assert.equal(data.judges.length, 102);
  assert.equal(f.reads(), 4);
});

test('progress counts only submitted cards in this lineup, excluding judges excluded from totals', async () => {
  const f = fixture();
  const result = await f.get();
  assert.equal(result.status, 200);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal(result.data.submitted, 1);
  assert.equal(result.data.expected, 2);
  assert.equal(result.data.judges.length, 2);
  assert.equal(result.data.judges[0].remaining, 1);
  assert.equal(result.data.judges[1].excluded, true);
  assert.doesNotMatch(JSON.stringify(result.data), /private|vocals|performerId|email/);
});

test('submissions, resets, lineup changes and exclusions are reflected on the next read', async () => {
  const f = fixture();
  f.rows.Scorecard[1].status = 'SUBMITTED';
  assert.equal((await f.progress()).submitted, 2);
  f.rows.Performer.reverse();
  assert.equal((await f.progress()).submitted, 2);
  f.rows.Scorecard.splice(0, 1);
  assert.equal((await f.progress()).submitted, 1);
  f.rows.Performer.push({ id: 5, competitionId: 1 });
  assert.equal((await f.progress()).expected, 3);
  f.rows.CompetitionJudge[0].excludedFromResults = true;
  assert.equal((await f.progress()).expected, 0);
  assert.equal((await f.progress()).submitted, 0);
});

test('empty competitions produce zero progress', async () => {
  const f = fixture();
  f.rows.Performer.length = 0;
  assert.equal((await f.progress()).submitted, 0);
  assert.equal((await f.progress()).expected, 0);
  f.rows.CompetitionJudge.length = 0;
  assert.equal((await f.progress()).judges.length, 0);
});

test('progress is restricted to organizers and admins, including expired sessions and invalid IDs', async () => {
  assert.equal((await fixture({ roles: ['JUDGE'] }).get()).status, 403);
  assert.equal((await fixture({ signedIn: false }).get()).status, 401);
  assert.equal((await fixture({ roles: ['ADMIN'] }).get()).status, 200);
  assert.equal((await fixture().get('9')).status, 404);
  for (const id of ['bad', '0', '-1', '1.5']) assert.equal((await fixture().get(id)).status, 400);
});

test('panel refreshes in place, reports failures, skips hidden tabs and stops after session expiry', async () => {
  const states = [], timers = new Map(), listeners = new Map();
  let cursor = 0, effect, timerId = 0, requests = 0, failure = false, status = 200;
  const doc = { visibilityState: 'visible', addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) };
  const data = { submitted: 1, expected: 2, judges: [{ id: 1, name: 'Judge A', submitted: 1, remaining: 1, excluded: false }] };
  const Panel = load('app/dashboard/competitions/[id]/LiveJudgingProgress.tsx', {
    react: {
      useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; },
      useEffect: fn => { effect = fn; },
    },
  }, {
    document: doc, window: { addEventListener() {}, removeEventListener() {} }, AbortController,
    setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: async () => { requests++; if (failure) throw new Error('offline'); return { status, ok: status === 200, json: async () => data }; },
  }).default;
  const render = () => { cursor = 0; return Panel({ competitionId: 1 }); };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const tick = () => { const entry = [...timers].find(([, timer]) => timer.delay === 10000); assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); };
  render();
  const cleanup = effect();
  await settle();
  assert.equal(states[0].submitted, 1);
  failure = true;
  tick(); await settle();
  assert.equal(states[0].submitted, 1);
  assert.match(states[1], /out of date/);
  doc.visibilityState = 'hidden';
  const count = requests;
  tick(); await settle();
  assert.equal(requests, count);
  doc.visibilityState = 'visible'; failure = false; status = 401;
  listeners.get('visibilitychange')(); await settle();
  assert.equal(states[0], null);
  assert.match(states[1], /Session expired/);
  assert.equal(timers.size, 0);
  cleanup();
  assert.equal(listeners.size, 0);
});
