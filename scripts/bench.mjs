import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

async function waitForBenchResult(page, resultGlobal, errorGlobal, timeoutMs) {
  await page.waitForFunction(
    ({ resultName, errorName }) => Boolean(window[resultName] || window[errorName]),
    { resultName: resultGlobal, errorName: errorGlobal },
    {
      timeout: timeoutMs
    }
  );

  const benchError = await page.evaluate((errorName) => window[errorName] || null, errorGlobal);
  if (benchError) {
    throw new Error(`Bench runtime error (${errorGlobal}): ${benchError}`);
  }

  return page.evaluate((resultName) => window[resultName], resultGlobal);
}

async function runBaselineBench(page, serverUrl) {
  await page.goto(`${serverUrl}/tests/fixtures/bench.html`, { waitUntil: 'domcontentloaded' });
  const result = await waitForBenchResult(page, '__benchResult', '__benchError', 20_000);

  assert.ok(Number.isFinite(result.initialRenderMs), 'initialRenderMs must be finite');
  assert.ok(Number.isFinite(result.scrollUpdateMs), 'scrollUpdateMs must be finite');
  assert.ok(result.initialRenderMs < 1500, `initialRenderMs regression: ${result.initialRenderMs}`);
  assert.ok(result.scrollUpdateMs < 100, `scrollUpdateMs regression: ${result.scrollUpdateMs}`);

  return result;
}

async function run100MBench(page, serverUrl) {
  await page.goto(`${serverUrl}/tests/fixtures/bench-100m.html`, { waitUntil: 'domcontentloaded' });
  const result = await waitForBenchResult(page, '__bench100mResult', '__bench100mError', 25_000);

  assert.ok(Number.isFinite(result.initialRenderMs), '100M initialRenderMs must be finite');
  assert.ok(Number.isFinite(result.jumpBottomMs), '100M jumpBottomMs must be finite');
  assert.ok(Number.isFinite(result.restoreStateMs), '100M restoreStateMs must be finite');
  assert.ok(result.initialRenderMs < 3000, `100M initialRenderMs regression: ${result.initialRenderMs}`);
  assert.ok(result.jumpBottomMs < 500, `100M jumpBottomMs regression: ${result.jumpBottomMs}`);
  assert.ok(result.restoreStateMs < 500, `100M restoreStateMs regression: ${result.restoreStateMs}`);
  assert.ok(
    result.bottomFirstVisibleId > 99_000_000,
    `100M bench bottom first visible id should be deep range, got ${result.bottomFirstVisibleId}`
  );
  assert.ok(
    result.topFirstVisibleId <= 2,
    `100M bench top restore should return near first row, got ${result.topFirstVisibleId}`
  );
  assert.equal(result.rowModelState.baseMappingMode, 'identity', '100M bench must remain in identity mapping mode');
  assert.equal(result.rowModelState.estimatedMappingBytes, 0, '100M bench identity mapping bytes must stay 0');

  return result;
}

async function main() {
  const rootDir = process.cwd();
  const umdPath = path.resolve(rootDir, 'packages/grid-core/dist/grid.umd.js');

  if (!existsSync(umdPath)) {
    throw new Error('Missing build output: packages/grid-core/dist/grid.umd.js. Run pnpm build first.');
  }

  const server = await startStaticServer({ rootDir });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    const baseline = await runBaselineBench(page, server.url);
    const bench100m = await run100MBench(page, server.url);

    console.log('[bench] OK', JSON.stringify({ baseline, bench100m }));
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error('[bench] FAILED');
  console.error(error);
  process.exit(1);
});
