// Read-only, sequential HTTP sampling. No cookies, login or database writes.
// Usage: node scripts/benchmark-live.mjs [base URL] [samples] [pause ms]
const base = process.argv[2] || 'https://score.mainstageempire.com';
const samples = Number(process.argv[3] || 15);
const pause = Number(process.argv[4] || 300);
const paths = ['/results/2', '/results/3', '/login'];
const startedAt = new Date().toISOString();
const measurements = Object.fromEntries(paths.map(path => [path, []]));
for (let round = -2; round < samples; round++) {
  for (const path of paths) {
    const start = performance.now();
    const response = await fetch(new URL(path, base), {
      headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000),
    });
    const headersMs = performance.now() - start;
    const html = await response.text();
    const totalMs = performance.now() - start;
    if (response.status !== 200 || (path.startsWith('/results/') &&
        (!html.includes('Official Rankings') || html.includes('No Results Available')))) {
      throw new Error(`Invalid benchmark response: ${path}, HTTP ${response.status}`);
    }
    if (round >= 0) measurements[path].push({ headersMs, totalMs, bytes: Buffer.byteLength(html) });
    await new Promise(resolve => setTimeout(resolve, pause));
  }
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p90: sorted[Math.ceil(sorted.length * 0.9) - 1], min: sorted[0], max: sorted.at(-1),
  };
}
console.log(JSON.stringify({ base, startedAt, finishedAt: new Date().toISOString(), samples,
  warmupsPerPath: 2, pauseMs: pause,
  summary: Object.fromEntries(paths.map(path => [path, {
    headersMs: stats(measurements[path].map(row => row.headersMs)),
    totalMs: stats(measurements[path].map(row => row.totalMs)),
  }])), measurements,
}, null, 2));
