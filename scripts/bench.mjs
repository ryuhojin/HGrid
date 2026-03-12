import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const MAX_INITIAL_RENDER_100K_MS = 5000;
const MAX_INITIAL_RENDER_1M_MS = 12000;
const MIN_SCROLL_FPS_1M = 20;
const MAX_SCROLL_P95_MS = 20;
const MAX_SCROLL_LONG_TASK_RATE = 0.03;
const MIN_BOTTOM_VISIBLE_ID_100M = 99_000_000;
const MAX_ROUND_TRIP_DRIFT_ROWS_100M = 1;
const MAX_SORT_UI_GAP_MS = 1000;
const MAX_FILTER_UI_GAP_MS = 1000;
const MAX_CREATE_DESTROY_DURATION_MS = 180000;

function parseArgs(argv) {
  const options = {
    out: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --out');
      }
      options.out = value;
      index += 1;
    }
  }

  return options;
}

function ensureFinite(value, label) {
  assert.ok(Number.isFinite(value), `${label} must be finite`);
}

function validateResult(result) {
  assert.ok(result && typeof result === 'object', 'bench result must be object');

  ensureFinite(result.initialRender100k.initialRenderMs, 'initialRender100k.initialRenderMs');
  ensureFinite(result.initialRender1m.initialRenderMs, 'initialRender1m.initialRenderMs');
  ensureFinite(result.scrollFps1m.avgFps, 'scrollFps1m.avgFps');
  ensureFinite(result.scrollFps1m.frameTimeP95Ms, 'scrollFps1m.frameTimeP95Ms');
  ensureFinite(result.scrollFps1m.longTaskRate, 'scrollFps1m.longTaskRate');
  ensureFinite(result.mapping100m.virtualHeight, 'mapping100m.virtualHeight');
  ensureFinite(result.mapping100m.bottomFirstVisibleId, 'mapping100m.bottomFirstVisibleId');
  ensureFinite(result.mapping100m.roundTripDriftRows, 'mapping100m.roundTripDriftRows');
  ensureFinite(result.sort1m.maxGapMs, 'sort1m.maxGapMs');
  ensureFinite(result.filter1m.maxGapMs, 'filter1m.maxGapMs');
  ensureFinite(result.workerComparison1m.sort.workerOn.maxGapMs, 'workerComparison1m.sort.workerOn.maxGapMs');
  ensureFinite(result.workerComparison1m.sort.workerOff.maxGapMs, 'workerComparison1m.sort.workerOff.maxGapMs');
  ensureFinite(result.workerComparison1m.filter.workerOn.maxGapMs, 'workerComparison1m.filter.workerOn.maxGapMs');
  ensureFinite(result.workerComparison1m.filter.workerOff.maxGapMs, 'workerComparison1m.filter.workerOff.maxGapMs');
  ensureFinite(result.workerComparison1m.sort.workerOn.workerCreatedCount, 'workerComparison1m.sort.workerOn.workerCreatedCount');
  ensureFinite(result.workerComparison1m.sort.workerOff.workerCreatedCount, 'workerComparison1m.sort.workerOff.workerCreatedCount');
  ensureFinite(result.workerComparison1m.filter.workerOn.workerCreatedCount, 'workerComparison1m.filter.workerOn.workerCreatedCount');
  ensureFinite(result.workerComparison1m.filter.workerOff.workerCreatedCount, 'workerComparison1m.filter.workerOff.workerCreatedCount');
  ensureFinite(result.createDestroy200.durationMs, 'createDestroy200.durationMs');
  ensureFinite(result.scrollRegression.headerBodyMismatchCount, 'scrollRegression.headerBodyMismatchCount');
  ensureFinite(result.scrollRegression.pinnedWheelSourceMismatchCount, 'scrollRegression.pinnedWheelSourceMismatchCount');

  assert.ok(
    result.initialRender100k.initialRenderMs < MAX_INITIAL_RENDER_100K_MS,
    `initial render 100k regression: ${result.initialRender100k.initialRenderMs}ms`
  );
  assert.ok(
    result.initialRender1m.initialRenderMs < MAX_INITIAL_RENDER_1M_MS,
    `initial render 1m regression: ${result.initialRender1m.initialRenderMs}ms`
  );
  assert.ok(
    result.scrollFps1m.avgFps >= MIN_SCROLL_FPS_1M,
    `scroll fps 1m regression: ${result.scrollFps1m.avgFps}`
  );
  assert.ok(
    result.scrollFps1m.frameTimeP95Ms <= MAX_SCROLL_P95_MS,
    `scroll p95 frame time regression: ${result.scrollFps1m.frameTimeP95Ms}ms`
  );
  assert.ok(
    result.scrollFps1m.longTaskRate <= MAX_SCROLL_LONG_TASK_RATE,
    `scroll long-task rate regression: ${result.scrollFps1m.longTaskRate}`
  );
  assert.equal(
    result.scrollFps1m.domNodeCountFixed,
    true,
    `scroll DOM pool count must stay fixed, rows=${result.scrollFps1m.poolRowsMin}~${result.scrollFps1m.poolRowsMax}, cells=${result.scrollFps1m.poolCellsMin}~${result.scrollFps1m.poolCellsMax}`
  );
  assert.ok(
    result.mapping100m.bottomFirstVisibleId > MIN_BOTTOM_VISIBLE_ID_100M,
    `100m mapping bottom range mismatch: ${result.mapping100m.bottomFirstVisibleId}`
  );
  assert.ok(
    result.mapping100m.roundTripDriftRows <= MAX_ROUND_TRIP_DRIFT_ROWS_100M,
    `100m round-trip drift regression: ${result.mapping100m.roundTripDriftRows}`
  );
  assert.ok(
    result.sort1m.maxGapMs <= MAX_SORT_UI_GAP_MS,
    `sort 1m UI gap regression: ${result.sort1m.maxGapMs}ms`
  );
  assert.ok(
    result.filter1m.maxGapMs <= MAX_FILTER_UI_GAP_MS,
    `filter 1m UI gap regression: ${result.filter1m.maxGapMs}ms`
  );
  assert.equal(
    result.workerComparison1m.sort.workerOn.workerRuntimeEnabled,
    true,
    'workerComparison1m.sort.workerOn must run with worker runtime enabled'
  );
  assert.equal(
    result.workerComparison1m.sort.workerOff.workerRuntimeEnabled,
    false,
    'workerComparison1m.sort.workerOff must run with worker runtime disabled'
  );
  assert.equal(
    result.workerComparison1m.filter.workerOn.workerRuntimeEnabled,
    true,
    'workerComparison1m.filter.workerOn must run with worker runtime enabled'
  );
  assert.equal(
    result.workerComparison1m.filter.workerOff.workerRuntimeEnabled,
    false,
    'workerComparison1m.filter.workerOff must run with worker runtime disabled'
  );
  assert.ok(
    result.workerComparison1m.sort.workerOn.workerCreatedCount >= 1,
    `workerComparison1m.sort.workerOn should create at least one worker, got ${result.workerComparison1m.sort.workerOn.workerCreatedCount}`
  );
  assert.equal(
    result.workerComparison1m.sort.workerOff.workerCreatedCount,
    0,
    `workerComparison1m.sort.workerOff should not create workers, got ${result.workerComparison1m.sort.workerOff.workerCreatedCount}`
  );
  assert.ok(
    result.workerComparison1m.filter.workerOn.workerCreatedCount >= 1,
    `workerComparison1m.filter.workerOn should create at least one worker, got ${result.workerComparison1m.filter.workerOn.workerCreatedCount}`
  );
  assert.equal(
    result.workerComparison1m.filter.workerOff.workerCreatedCount,
    0,
    `workerComparison1m.filter.workerOff should not create workers, got ${result.workerComparison1m.filter.workerOff.workerCreatedCount}`
  );
  assert.ok(
    result.createDestroy200.durationMs < MAX_CREATE_DESTROY_DURATION_MS,
    `create/destroy duration regression: ${result.createDestroy200.durationMs}ms`
  );
  assert.equal(
    result.createDestroy200.remainingGridNodes,
    0,
    `create/destroy should not retain .hgrid nodes, got ${result.createDestroy200.remainingGridNodes}`
  );
  assert.equal(
    result.createDestroy200.remainingRowNodes,
    0,
    `create/destroy should not retain row nodes, got ${result.createDestroy200.remainingRowNodes}`
  );
  ensureFinite(result.createDestroy200.windowListenerAdds, 'createDestroy200.windowListenerAdds');
  ensureFinite(result.createDestroy200.windowListenerRemoves, 'createDestroy200.windowListenerRemoves');
  assert.equal(
    result.scrollRegression.headerBodyMismatchCount,
    0,
    `header/body transform mismatch detected: ${result.scrollRegression.headerBodyMismatchCount}`
  );
  assert.equal(
    result.scrollRegression.pinnedWheelSourceMismatchCount,
    0,
    `pinned wheel source mismatch detected: ${result.scrollRegression.pinnedWheelSourceMismatchCount}`
  );
}

function writeOutputIfNeeded(outPath, payload) {
  if (!outPath) {
    return;
  }

  const absoluteOutPath = path.resolve(process.cwd(), outPath);
  mkdirSync(path.dirname(absoluteOutPath), { recursive: true });
  writeFileSync(absoluteOutPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const umdPath = path.resolve(rootDir, 'packages/grid-core/dist/grid.umd.js');

  if (!existsSync(umdPath)) {
    throw new Error('Missing build output: packages/grid-core/dist/grid.umd.js. Run pnpm build first.');
  }

  const server = await startStaticServer({ rootDir });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  try {
    await page.goto(`${server.url}/tests/fixtures/bench-phase14.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__benchPhase14), null, { timeout: 30_000 });

    const startedAt = Date.now();
    const phase14Result = await page.evaluate(async () => window.__benchPhase14.runAll());

    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
    validateResult(phase14Result);

    const payload = {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      thresholds: {
        maxInitialRender100kMs: MAX_INITIAL_RENDER_100K_MS,
        maxInitialRender1mMs: MAX_INITIAL_RENDER_1M_MS,
        minScrollFps1m: MIN_SCROLL_FPS_1M,
        maxScrollP95Ms: MAX_SCROLL_P95_MS,
        maxScrollLongTaskRate: MAX_SCROLL_LONG_TASK_RATE,
        minBottomVisibleId100m: MIN_BOTTOM_VISIBLE_ID_100M,
        maxRoundTripDriftRows100m: MAX_ROUND_TRIP_DRIFT_ROWS_100M,
        maxSortUiGapMs: MAX_SORT_UI_GAP_MS,
        maxFilterUiGapMs: MAX_FILTER_UI_GAP_MS,
        maxCreateDestroyDurationMs: MAX_CREATE_DESTROY_DURATION_MS
      },
      result: phase14Result
    };

    writeOutputIfNeeded(options.out, payload);
    console.log('[bench] OK', JSON.stringify(payload));
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
