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

  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  try {
    await page.goto(`${server.url}/tests/fixtures/csp-smoke.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#status[data-status="ok"]', { timeout: 10_000 });

    const inlineScriptCount = await page.locator('script:not([src])').count();
    const renderedRows = await page.locator('.hgrid__row').count();
    assert.equal(inlineScriptCount, 0, 'CSP smoke page should not require inline scripts');
    assert.ok(renderedRows > 0, 'CSP smoke page should render pooled rows');
    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
    assert.equal(consoleErrors.length, 0, `Unexpected console errors: ${consoleErrors.join(' | ')}`);

    console.log('[csp-smoke] OK');
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error('[csp-smoke] FAILED');
  console.error(error);
  process.exit(1);
});
