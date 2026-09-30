const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, dependencies = {}, globals = {}) {
  const context = { exports: {}, console, ...globals, require: name => dependencies[name] ?? require(name) };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, context);
  return context.exports;
}

const { readDraft, draftKey } = load('src/scorecard-draft.ts');
const scores = { presentation: 8, vocals: 8, lyrics: 8, energy: 8, quality: 8, starFactor: 8 };
const body = { competitionId: 1, performerId: 2, ...scores, notes: 'Good performance' };

test('drafts restore partial scores and notes, with judge and revision isolation', () => {
  const partial = { ...scores, vocals: null };
  const result = readDraft(JSON.stringify({ scores: partial, notes: 'unfinished', savedAt: 1000 }), 2000);
  assert.equal(result.scores.vocals, null);
  assert.equal(result.notes, 'unfinished');
  assert.notEqual(draftKey(1, 2, 'new'), draftKey(3, 2, 'new'));
  assert.notEqual(draftKey(1, 2, 'old'), draftKey(1, 2, 'new'));
});

test('expired, corrupt, future-dated and out-of-range drafts are ignored', () => {
  for (const raw of ['broken', 'null', '{}', JSON.stringify({ scores, notes: '', savedAt: 0 }),
    JSON.stringify({ scores, notes: '', savedAt: 1e15 }),
    JSON.stringify({ scores: { ...scores, vocals: 11 }, notes: '', savedAt: 1e8 })]) {
    assert.equal(readDraft(raw, 1e8), null);
  }
});

function fixture({ initial, status = 'LIVE', excluded = false, assigned = true } = {}) {
  let card = initial ? { id: 5, performerId: 2, judgeAssignmentId: 10, ...initial } : null;
  let writes = 0;
  const Scorecard = {
    first: async () => card ? { ...card } : null,
    where: query => ({ update: async data => {
      if (!card || card.id !== query.id || card.status !== query.status) return null;
      writes++;
      card = { ...card, ...data };
      return card;
    } }),
    create: async data => {
      if (card) throw new Error('unique constraint');
      writes++;
      card = { id: 5, ...data };
      return card;
    },
  };
  const { POST } = load('app/api/scorecards/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => ({ status: options?.status ?? 200, data }) } },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'session' }) }) },
    '@/src/auth': { SESSION_COOKIE: 'session', getUserFromSessionToken: async () => ({ id: 3, roles: ['JUDGE'] }) },
    '@/src/prisma/db': { db: { orm: { public: {
      CompetitionJudge: { first: async () => assigned ? { id: 10, excludedFromResults: excluded } : null },
      Competition: { first: async () => ({ id: 1, status }) },
      Performer: { first: async () => ({ id: 2, competitionId: 1 }) },
      Scorecard,
    } } } },
  });
  return { post: (data = body) => POST({ json: async () => data }), writes: () => writes, card: () => card };
}

test('retry after a lost response confirms receipt without another write', async () => {
  const f = fixture();
  assert.equal((await f.post()).status, 200);
  assert.equal((await f.post()).data.success, true);
  assert.equal(f.writes(), 1);
});

test('matching retries after judging closes succeed, changed scores remain locked', async () => {
  const f = fixture({ initial: { ...body, status: 'SUBMITTED' }, status: 'FINALIZED' });
  assert.equal((await f.post()).status, 200);
  assert.equal((await f.post({ ...body, vocals: 9 })).status, 409);
  assert.equal((await f.post({ ...body, notes: 'changed' })).status, 409);
  assert.equal(f.writes(), 0);
});

test('concurrent identical creates and draft submissions produce one write', async () => {
  for (const initial of [undefined, { status: 'DRAFT' }]) {
    const f = fixture({ initial });
    const results = await Promise.all([f.post(), f.post()]);
    assert.ok(results.every(result => result.status === 200));
    assert.equal(f.writes(), 1);
  }
});

test('concurrent different submissions cannot overwrite the winner', async () => {
  for (const initial of [undefined, { status: 'DRAFT' }]) {
    const f = fixture({ initial });
    const results = await Promise.all([f.post(), f.post({ ...body, vocals: 10 })]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(f.writes(), 1);
    assert.equal(f.card().vocals, 8);
  }
});

test('authorization, live status, and score validation remain enforced', async () => {
  assert.equal((await fixture({ excluded: true }).post()).status, 403);
  assert.equal((await fixture({ assigned: false }).post()).status, 403);
  assert.equal((await fixture({ status: 'FINALIZED' }).post()).status, 400);
  assert.equal((await fixture().post({ ...body, vocals: 0 })).status, 400);
});

function formFixture({ failStorage = false, saved, respond } = {}) {
  const state = [], effects = [], storage = new Map();
  const key = draftKey(10, 2, 'new');
  if (saved) storage.set(key, JSON.stringify(saved));
  let cursor = 0, mounted = false, navigation;
  const hooks = {
    useState: initial => {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = value; }];
    },
    useRef: initial => {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useMemo: fn => fn(),
    useEffect: fn => { if (!mounted) effects.push(fn); },
  };
  const Form = load('app/dashboard/competitions/[id]/performers/[performerId]/ScorecardForm.tsx', {
    react: hooks,
    'next/navigation': { useRouter: () => ({ push: url => { navigation = url; }, refresh() {} }) },
    '@/src/scorecard-draft': load('src/scorecard-draft.ts'),
  }, {
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { if (failStorage) throw new Error('quota'); storage.set(key, value); },
      removeItem: key => storage.delete(key),
    },
    navigator: { onLine: true },
    window: { addEventListener() {}, removeEventListener() {}, confirm: () => true, setTimeout, clearTimeout },
    AbortController,
    fetch: async () => respond ? respond() : { ok: true, json: async () => ({ success: true }) },
  }).default;
  const render = () => {
    cursor = 0;
    return Form({ judgeAssignmentId: 10, performerId: 2, competitionId: 1, revision: 'new', existingScorecard: null, excludedFromResults: false });
  };
  render();
  mounted = true;
  effects.forEach(fn => fn());
  return { render, draft: () => storage.get(key), navigation: () => navigation };
}

function elements(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

test('form restores scores and notes before edits, retains failed submissions, clears confirmed drafts', async () => {
  let connected = false;
  const f = formFixture({ saved: { scores, notes: 'restored notes', savedAt: Date.now() }, respond: () => {
    if (!connected) throw new Error('connection lost');
    return { ok: true, json: async () => ({ success: true }) };
  } });
  let nodes = elements(f.render());
  assert.equal(nodes.find(node => node.type === 'textarea').props.value, 'restored notes');
  const submit = () => elements(f.render()).filter(node => node.type === 'button').at(-1);
  assert.equal(submit().props.disabled, false);
  await submit().props.onClick();
  assert.ok(f.draft());
  assert.equal(submit().props.children, 'Retry Submission');
  assert.equal(f.navigation(), undefined);
  connected = true;
  await submit().props.onClick();
  assert.equal(f.draft(), undefined);
  assert.equal(f.navigation(), '/dashboard/competitions/1?view=judge');
});

test('form saves notes immediately and reports storage failures without discarding edits', () => {
  for (const failStorage of [false, true]) {
    const f = formFixture({ failStorage });
    elements(f.render()).find(node => node.type === 'textarea').props.onChange({ target: { value: 'New note' } });
    const nodes = elements(f.render());
    assert.equal(nodes.find(node => node.type === 'textarea').props.value, 'New note');
    if (failStorage) assert.ok(nodes.some(node => String(node.props?.children).includes('Could not save your draft')));
    else assert.equal(JSON.parse(f.draft()).notes, 'New note');
  }
});
