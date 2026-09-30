// Run inside the deployed app. Restrict this benchmark's DB connections to
// read-only mode, and print only durations/counts, never judge details.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
process.env.PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=10000';
(async () => {
  const { default: postgres } = await import('@prisma/orm-postgres/runtime');
  const db = postgres({ contractJson: JSON.parse(fs.readFileSync('src/prisma/contract.json', 'utf8')), url: process.env.DATABASE_URL });
  try {
    const context = { exports: {}, require: name => {
      if (name === '@/src/prisma/db') return { db };
      throw new Error(`Unexpected import: ${name}`);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/judging-progress.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText, context);
    const results = { 2: [], 3: [] };
    const counts = {};
    const startedAt = new Date().toISOString();
    for (let round = -2; round < 15; round++) for (const id of [2, 3]) {
      const start = performance.now();
      const data = await context.exports.getJudgingProgress(id);
      const elapsed = performance.now() - start;
      counts[id] = { submitted: data.submitted, expected: data.expected, judges: data.judges.length };
      if (round >= 0) results[id].push(elapsed);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    const summary = Object.fromEntries(Object.entries(results).map(([id, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return [id, { median: sorted[7], p90: sorted[13], min: sorted[0], max: sorted[14] }];
    }));
    console.log(JSON.stringify({ startedAt, samples: 15, warmupsPerCompetition: 2, pauseMs: 300, counts, summary, measurements: results }, null, 2));
  } finally {
    await db.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
