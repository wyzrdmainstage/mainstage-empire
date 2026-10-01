const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(path, imports) {
  const context = { exports: {}, Date, console: { log() {}, error() {} },
    process: { env: { NEXT_PUBLIC_APP_URL: 'https://score.example.com' } },
    require(name) {
      if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
      return imports[name];
    } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}

function reservationFixture({ total = 0, recent = 0, failure = false } = {}) {
  const created = [];
  let locked = false;
  let tail = Promise.resolve();
  const db = {
    raw: { sql(strings, ...values) {
      const plan = { sql: strings.join('?'), values };
      return { affectedCount: () => ({ build: () => plan }),
        returnsRow: () => ({ build: () => plan }) };
    } },
    transaction(fn) {
      const run = tail.then(async () => {
        try {
          return await fn({
            async execute(plan) {
              assert.match(plan.sql, /FOR UPDATE/);
              assert.equal(plan.values[0], 7);
              locked = true;
            },
            async *query(plan) {
              assert.equal(locked, true, 'check must happen after locking');
              assert.match(plan.sql, /type = 'LOGIN'/);
              assert.match(plan.sql, /interval '1 minute'/);
              assert.match(plan.sql, /interval '1 hour'/);
              yield { total: total + created.length, recent: recent + created.length };
            },
            orm: { public: { AuthToken: { async create(data) {
              assert.equal(locked, true);
              if (failure) throw new Error('Database unavailable');
              created.push(data);
              return { ...data, id: created.length };
            } } } },
          });
        } finally { locked = false; }
      });
      tail = run.catch(() => {});
      return run;
    },
  };
  return { created, helper: load('src/login-token.ts', {
    '@/src/prisma/db': { db },
    '@/src/auth': { generateToken: () => 'test-token', hashToken: () => 'test-hash' },
  }) };
}

test('first request reserves a hashed, 24-hour login token', async () => {
  const { helper, created } = reservationFixture();
  const before = Date.now();
  const result = await helper.reserveLoginToken(7);
  assert.equal(result.token, 'test-token');
  assert.equal(created[0].tokenHash, 'test-hash');
  assert.equal(created[0].type, 'LOGIN');
  assert.equal(created[0].userId, 7);
  assert.ok(Date.parse(created[0].expiresAt) >= before + 86400000);
});

test('cooldown suppresses a second link without deleting the first', async () => {
  const { helper, created } = reservationFixture({ recent: 1, total: 1 });
  assert.equal(await helper.reserveLoginToken(7), null);
  assert.equal(created.length, 0);
});

test('five links in the rolling hour suppress further sends', async () => {
  const { helper, created } = reservationFixture({ total: 5 });
  assert.equal(await helper.reserveLoginToken(7), null);
  assert.equal(created.length, 0);
});

test('fifth link is allowed after the cooldown', async () => {
  const { helper, created } = reservationFixture({ total: 4 });
  assert.ok(await helper.reserveLoginToken(7));
  assert.equal(created.length, 1);
});

test('concurrent requests check and reserve inside the same transaction', async () => {
  const { helper, created } = reservationFixture();
  const results = await Promise.all(Array.from({ length: 10 }, () => helper.reserveLoginToken(7)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(created.length, 1);
});

test('database failure propagates without issuing a token', async () => {
  const { helper, created } = reservationFixture({ failure: true });
  await assert.rejects(helper.reserveLoginToken(7), /Database unavailable/);
  assert.equal(created.length, 0);
});

function routeFixture({ exists = true, limited = false, emailFailure = false } = {}) {
  const lookups = [], reservations = [], sends = [], removed = [];
  const { LOGIN_LINK_MESSAGE } = reservationFixture().helper;
  const route = load('app/api/auth/login/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/src/prisma/db': { db: { orm: { public: {
      User: { first: async filter => { lookups.push(filter); return exists ? { id: 7 } : null; } },
      AuthToken: { where: filter => ({ delete: async () => { removed.push(filter.id); } }) },
    } } } },
    '@/src/login-token': { LOGIN_LINK_MESSAGE, reserveLoginToken: async id => {
      reservations.push(id);
      return limited ? null : { id: 22, token: 'safe-token' };
    } },
    '@/src/utils/email': { normalizeEmail: email => email.trim().toLowerCase() },
    '@/src/email/mail': { sendLoginEmail: async (...args) => {
      sends.push(args);
      if (emailFailure) throw new Error('Provider unavailable');
    } },
  });
  return { ...route, lookups, reservations, sends, removed };
}

const request = email => new Request('https://score.example.com/api/auth/login', {
  method: 'POST', body: JSON.stringify({ email }),
});

test('normalizes email before reserving and sends the reserved link', async () => {
  const f = routeFixture();
  assert.equal((await f.POST(request(' Judge@Example.com '))).status, 200);
  assert.equal(f.lookups[0].email, 'judge@example.com');
  assert.deepEqual(f.reservations, [7]);
  assert.deepEqual(f.sends, [['judge@example.com', 'https://score.example.com/login?token=safe-token']]);
});

test('unknown, limited and successful requests have identical public responses', async () => {
  const responses = [];
  for (const options of [{ exists: false }, { limited: true }, {}]) {
    const f = routeFixture(options);
    const response = await f.POST(request('judge@example.com'));
    assert.equal(response.status, 200);
    responses.push(await response.json());
    assert.equal(f.sends.length, options.exists === false || options.limited ? 0 : 1);
    if (options.exists === false) assert.equal(f.reservations.length, 0);
  }
  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(responses[1], responses[2]);
});

test('provider failure removes only the newly reserved token so retry remains possible', async () => {
  const f = routeFixture({ emailFailure: true });
  assert.equal((await f.POST(request('judge@example.com'))).status, 500);
  assert.deepEqual(f.removed, [22]);
});

test('invalid inputs are rejected before database or email work', async () => {
  for (const email of [null, 5, '', ' ', 'missing-at', 'a@b', 'a b@example.com', `${'a'.repeat(250)}@example.com`]) {
    const f = routeFixture();
    assert.equal((await f.POST(request(email))).status, 400);
    assert.equal(f.lookups.length, 0);
    assert.equal(f.sends.length, 0);
  }
  for (const body of ['{', 'null', '[]']) {
    const f = routeFixture();
    const response = await f.POST(new Request('https://score.example.com/api/auth/login', { method: 'POST', body }));
    assert.equal(response.status, 400);
    assert.equal(f.lookups.length, 0);
  }
});

test('Postgres enforces rolling windows, counts used links, and excludes invitations and other users', async () => {
  // PGlite executes the actual SQL in an isolated in-memory Postgres database.
  // It does not exercise multiple real Postgres connections or Prisma codecs.
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite();
  try {
    await pg.exec(`
      CREATE TABLE public."user" (id integer PRIMARY KEY);
      INSERT INTO public."user" VALUES (7), (8);
      CREATE TABLE public."authToken" (
        id serial PRIMARY KEY, "userId" integer REFERENCES public."user"(id),
        type text, "tokenHash" text UNIQUE, "expiresAt" timestamptz,
        "usedAt" timestamptz, "createdAt" timestamptz DEFAULT now()
      );
      INSERT INTO public."authToken" ("userId", type, "createdAt") VALUES
        (7, 'INVITATION', now()), (8, 'LOGIN', now()),
        (7, 'LOGIN', now() - interval '61 minutes');
    `);
    let sequence = 0;
    const db = {
      raw: { sql(strings, ...values) {
        const plan = { text: strings.reduce((sql, part, i) => sql + (i ? `$${i}` : '') + part, ''), values };
        return { affectedCount: () => ({ build: () => plan }), returnsRow: () => ({ build: () => plan }) };
      } },
      transaction: fn => pg.transaction(async connection => fn({
        execute: plan => connection.query(plan.text, plan.values),
        query: plan => ({ async *[Symbol.asyncIterator]() {
          const { rows } = await connection.query(plan.text, plan.values);
          yield* rows;
        } }),
        orm: { public: { AuthToken: { create: async data => {
          const result = await connection.query(`INSERT INTO public."authToken"
            ("userId", type, "tokenHash", "expiresAt") VALUES ($1, $2, $3, $4) RETURNING id`,
          [data.userId, data.type, data.tokenHash, data.expiresAt]);
          return result.rows[0];
        } } } },
      })),
    };
    const imports = {
      '@/src/prisma/db': { db },
      '@/src/auth': { generateToken: () => `token-${++sequence}`, hashToken: token => `hash-${token}` },
    };
    const helper = load('src/login-token.ts', imports);
    assert.ok(await helper.reserveLoginToken(7), 'invitations, other accounts and old tokens do not block');
    assert.equal(await helper.reserveLoginToken(7), null, 'fresh link triggers cooldown');
    await pg.exec(`UPDATE public."authToken" SET "createdAt" = now() - interval '61 seconds', "usedAt" = now()
      WHERE "tokenHash" IS NOT NULL`);
    for (let i = 0; i < 4; i++) {
      assert.ok(await helper.reserveLoginToken(7), 'another send is allowed after cooldown');
      await pg.exec(`UPDATE public."authToken" SET "createdAt" = now() - interval '61 seconds'
        WHERE "tokenHash" IS NOT NULL`);
    }
    assert.equal(await helper.reserveLoginToken(7), null, 'used link counts toward five per hour');
    const restarted = load('src/login-token.ts', imports);
    assert.equal(await restarted.reserveLoginToken(7), null, 'fresh module retains database allowance');
    await pg.exec(`UPDATE public."authToken" SET "createdAt" = now() - interval '61 minutes'
      WHERE "userId" = 7 AND type = 'LOGIN'`);
    assert.ok(await helper.reserveLoginToken(7), 'allowance recovers when tokens leave rolling hour');
  } finally { await pg.close(); }
});
