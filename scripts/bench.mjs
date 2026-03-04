import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

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
    await page.goto(`${server.url}/tests/fixtures/bench.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__benchResult || window.__benchError), null, {
      timeout: 20_000
    });

    const benchError = await page.evaluate(() => window.__benchError || null);
    if (benchError) {
      throw new Error(`Bench runtime error: ${benchError}`);
    }

    const result = await page.evaluate(() => window.__benchResult);

    assert.ok(Number.isFinite(result.initialRenderMs), 'initialRenderMs must be finite');
    assert.ok(Number.isFinite(result.scrollUpdateMs), 'scrollUpdateMs must be finite');
    assert.ok(result.initialRenderMs < 1500, `initialRenderMs regression: ${result.initialRenderMs}`);
    assert.ok(result.scrollUpdateMs < 100, `scrollUpdateMs regression: ${result.scrollUpdateMs}`);

    console.log('[bench] OK', JSON.stringify(result));
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
