import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

const TEXT_EDITOR_SELECTOR = '.hgrid__editor-input:not(.hgrid__editor-input--select)';

async function waitAnimationFrame(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve(true);
        });
      })
  );
}

async function measureUiThreadLagDuring(page, operationPath, timeoutMs = 120_000) {
  return page.evaluate(
    async ({ operationPath, timeoutMs: operationTimeoutMs }) => {
      function resolveOperation(pathExpression) {
        const parts = pathExpression.split('.');
        let cursor = window;
        for (let index = 0; index < parts.length; index += 1) {
          cursor = cursor?.[parts[index]];
        }
        return cursor;
      }

      const operation = resolveOperation(operationPath);
      if (typeof operation !== 'function') {
        throw new Error(`Missing operation: ${operationPath}`);
      }

      let maxGapMs = 0;
      let tickCount = 0;
      let lastTick = performance.now();
      const interval = window.setInterval(() => {
        const now = performance.now();
        const gap = now - lastTick;
        if (gap > maxGapMs) {
          maxGapMs = gap;
        }
        lastTick = now;
        tickCount += 1;
      }, 16);

      const timeoutPromise = new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(`Operation timeout: ${operationPath}`));
        }, operationTimeoutMs);
      });

      try {
        await new Promise((resolve) => {
          window.setTimeout(() => {
            lastTick = performance.now();
            resolve(true);
          }, 0);
        });

        await Promise.race([operation(), timeoutPromise]);
        await new Promise((resolve) => {
          requestAnimationFrame(() => resolve(true));
        });
      } finally {
        window.clearInterval(interval);
      }

      return {
        maxGapMs,
        tickCount
      };
    },
    {
      operationPath,
      timeoutMs
    }
  );
}

function parseTranslate3d(transformValue) {
  if (!transformValue) {
    return { x: Number.NaN, y: Number.NaN };
  }

  const match = transformValue.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0(?:px)?\)/);
  if (!match) {
    return { x: Number.NaN, y: Number.NaN };
  }

  return {
    x: Number(match[1]),
    y: Number(match[2])
  };
}

const MAX_GROUPING_WORKER_EXAMPLE_UI_GAP_MS = 420;
const MAX_TREE_WORKER_EXAMPLE_UI_GAP_MS = 420;
const MAX_PIVOT_WORKER_EXAMPLE_UI_GAP_MS = 420;

async function runExample1Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example1.html`, { waitUntil: 'domcontentloaded' });

  const globalType = await page.evaluate(() => typeof window.HGrid?.Grid);
  assert.equal(globalType, 'function', 'HGrid.Grid global must be available in UMD example');

  await page.waitForSelector('.hgrid__row--center', { timeout: 10_000 });

  const beforeRowCount = await page.locator('.hgrid__row--center').count();

  await page.evaluate(() => {
    const verticalScroll = document.querySelector('.hgrid__v-scroll') ?? document.querySelector('.hgrid__viewport');
    if (!verticalScroll) {
      throw new Error('Missing vertical scroll source');
    }
    verticalScroll.scrollTop = 12_000;
    verticalScroll.dispatchEvent(new Event('scroll'));
  });

  await waitAnimationFrame(page);

  const afterRowCount = await page.locator('.hgrid__row--center').count();
  assert.equal(afterRowCount, beforeRowCount, 'row pool size must stay constant while scrolling');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample2Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example2.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 10_000 });

  const log = page.locator('#log');
  await page.click('#set-columns');
  await expectLogContains(log, 'setColumns() applied');

  await page.click('#set-options');
  await expectLogContains(log, 'setOptions() applied');

  await page.click('#set-theme');
  await expectLogContains(log, 'setTheme() applied');

  await page.evaluate(() => {
    const verticalScroll = document.querySelector('.hgrid__v-scroll') ?? document.querySelector('.hgrid__viewport');
    if (!verticalScroll) {
      throw new Error('Missing vertical scroll source');
    }
    verticalScroll.scrollTop = 7000;
    verticalScroll.dispatchEvent(new Event('scroll'));
  });
  await waitAnimationFrame(page);

  await page.click('#save-state');
  await expectLogContains(log, 'getState() =>');

  await page.evaluate(() => {
    const verticalScroll = document.querySelector('.hgrid__v-scroll') ?? document.querySelector('.hgrid__viewport');
    if (!verticalScroll) {
      throw new Error('Missing vertical scroll source');
    }
    verticalScroll.scrollTop = 0;
    verticalScroll.dispatchEvent(new Event('scroll'));
  });
  await waitAnimationFrame(page);

  await page.click('#restore-state');
  await expectLogContains(log, 'setState() <=');

  await page.click('#unbind-event');
  await expectLogContains(log, 'off(cellClick) applied');

  await page.click('.hgrid__row--center .hgrid__cell');
  await expectLogContains(log, 'off(cellClick) applied');

  await page.click('#bind-event');
  await expectLogContains(log, 'on(cellClick) applied');

  await page.click('.hgrid__row--center .hgrid__cell');
  await expectLogContains(log, 'cellClick row=');

  await page.click('#destroy-grid');
  await expectLogContains(log, 'destroy() applied');
  assert.equal(await page.locator('.hgrid__row').count(), 0, 'destroy() must remove row DOM elements');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample3Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example3.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 10_000 });

  const log = page.locator('#log');

  const firstRow = page.locator('.hgrid__row--center').first();
  const beforeVisibilityCellCount = await firstRow.locator('.hgrid__cell').count();

  await page.click('#toggle-status');
  await expectLogContains(log, 'setColumnVisibility(status, true)');

  const afterVisibilityCellCount = await firstRow.locator('.hgrid__cell').count();
  assert.ok(afterVisibilityCellCount > beforeVisibilityCellCount, 'visibility toggle should increase visible cell count');

  await page.click('#reorder-columns');
  await expectLogContains(log, 'setColumnOrder() applied');

  const firstColumnId = await firstRow.locator('.hgrid__cell').first().getAttribute('data-column-id');
  assert.equal(firstColumnId, 'score', 'column order update should move score to first position');

  await page.click('#resize-id');
  await expectLogContains(log, 'setColumnWidth(id, 10)');

  const idCell = firstRow.locator('.hgrid__cell[data-column-id=\"id\"]');
  const idCellWidth = await idCell.evaluate((element) => element.style.width);
  assert.equal(idCellWidth, '80px', 'column width should be clamped by minWidth');

  await page.click('#replace-columns');
  await expectLogContains(log, 'setColumns() replaced schema');

  const replacedFirstRow = page.locator('.hgrid__row--center').first();
  const hasDisplayNameColumn = (await replacedFirstRow.locator('.hgrid__cell[data-column-id=\"displayName\"]').count()) > 0;
  assert.equal(hasDisplayNameColumn, true, 'replaced schema should include displayName column');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample4Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example4.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 10_000 });

  const log = page.locator('#log');

  const firstNameCell = page.locator('.hgrid__row--center').first().locator('.hgrid__cell[data-column-id=\"name\"]').first();
  await expect(firstNameCell).toHaveText('Local-1');

  await page.click('#swap-provider');
  await expectLogContains(log, 'setOptions({ dataProvider: fallback })');
  await expect(firstNameCell).toHaveText('Backup-1');

  await page.click('#swap-provider');
  await expectLogContains(log, 'setOptions({ dataProvider: primary })');
  await expect(firstNameCell).toHaveText('Local-1');

  await page.click('#apply-tx');
  await expectLogContains(log, 'applyTransactions()');
  await expect(firstNameCell).toHaveText('Tx-Added');

  await page.click('#update-cell');
  await expectLogContains(log, 'setValue(0, name, Mutated-Name)');
  await expect(firstNameCell).toHaveText('Mutated-Name');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample5Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example5.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 10_000 });

  const log = page.locator('#log');
  const firstIdCell = page.locator('.hgrid__row--center').first().locator('.hgrid__cell[data-column-id=\"id\"]').first();

  await expect(firstIdCell).toHaveText('1');

  await page.click('#set-reverse');
  await expectLogContains(log, 'setRowOrder(reverse) applied');
  await waitAnimationFrame(page);
  await expect(firstIdCell).toHaveText('10000');

  await page.click('#set-filter');
  await expectLogContains(log, 'setFilteredRowOrder(top 100) applied');
  await waitAnimationFrame(page);
  await expect(firstIdCell).toHaveText('1');

  await page.click('#toggle-index');
  await expectLogContains(log, 'enableDataToViewIndex=true');
  await page.click('#show-state');
  await expectLogContains(log, '\"hasDataToViewIndex\":true');
  await expectLogContains(log, '\"viewRowCount\":100');

  await page.click('#clear-filter');
  await expectLogContains(log, 'setFilteredRowOrder(null) applied');
  await page.click('#show-state');
  await expectLogContains(log, '\"hasFilterMapping\":false');
  await expectLogContains(log, '\"viewRowCount\":10000');

  await page.click('#reset-order');
  await expectLogContains(log, 'resetRowOrder() applied');
  await waitAnimationFrame(page);
  await expect(firstIdCell).toHaveText('1');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample6Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example6.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__header', { timeout: 10_000 });
  await page.waitForSelector('.hgrid__body', { timeout: 10_000 });
  await page.waitForSelector('.hgrid__overlay', { timeout: 10_000 });

  const log = page.locator('#log');

  const before = await page.evaluate(() => {
    const grid = document.querySelector('.hgrid');
    const leftCell = document.querySelector('.hgrid__header-left .hgrid__header-cell[data-column-id=\"id\"]');
    const centerCell = document.querySelector('.hgrid__header-center .hgrid__header-cell[data-column-id=\"name\"]');
    const rightCell = document.querySelector('.hgrid__header-right .hgrid__header-cell[data-column-id=\"updatedAt\"]');
    const rightBodyCell = document.querySelector('.hgrid__row--right .hgrid__cell[data-column-id=\"updatedAt\"]');
    const viewport = document.querySelector('.hgrid__viewport');
    const vScroll = document.querySelector('.hgrid__v-scroll');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    if (!leftCell || !centerCell || !rightCell || !rightBodyCell) {
      throw new Error('Missing header/body cells for pin check');
    }
    if (!grid) {
      throw new Error('Missing .hgrid root');
    }
    if (!viewport) {
      throw new Error('Missing .hgrid__viewport');
    }
    if (!vScroll) {
      throw new Error('Missing .hgrid__v-scroll');
    }
    if (!hScroll) {
      throw new Error('Missing .hgrid__h-scroll');
    }

    const rightRect = rightCell.getBoundingClientRect();
    const rightBodyRect = rightBodyCell.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const vScrollRect = vScroll.getBoundingClientRect();
    const hScrollRect = hScroll.getBoundingClientRect();
    const leftRect = leftCell.getBoundingClientRect();

    return {
      leftX: leftCell.getBoundingClientRect().left,
      centerX: centerCell.getBoundingClientRect().left,
      rightX: rightCell.getBoundingClientRect().left,
      rightEdge: rightRect.right,
      rightBodyEdge: rightBodyRect.right,
      leftEdge: leftRect.left,
      leftRight: leftRect.right,
      viewportRight: viewportRect.right,
      gridRight: gridRect.right,
      vScrollLeft: vScrollRect.left,
      vScrollWidth: vScrollRect.width,
      hScrollLeft: hScrollRect.left,
      hScrollRight: hScrollRect.right,
      viewportOverflowY: getComputedStyle(viewport).overflowY,
      verticalScrollOverflowY: getComputedStyle(vScroll).overflowY,
      verticalScrollDisplay: getComputedStyle(vScroll).display,
      horizontalScrollDisplay: getComputedStyle(hScroll).display
    };
  });

  assert.ok(Math.abs(before.viewportRight - before.gridRight) <= 1, 'single viewport must reach right edge of the grid');
  assert.ok(before.vScrollWidth >= 0, `y-scroll width should be non-negative, got ${before.vScrollWidth}`);
  assert.equal(before.viewportOverflowY, 'hidden', 'viewport y-overflow should be hidden in AG-like layout');
  assert.equal(before.verticalScrollOverflowY, 'auto', 'vertical scroll viewport should follow default auto policy');

  const hasVisibleVerticalScrollTrack = before.verticalScrollDisplay !== 'none' && before.vScrollWidth > 0;
  if (hasVisibleVerticalScrollTrack) {
    const vScrollRightEdge = before.vScrollLeft + before.vScrollWidth;
    assert.ok(
      Math.abs(vScrollRightEdge - before.gridRight) <= 1,
      `y scrollbar should align with grid right edge, got right=${vScrollRightEdge}, gridRight=${before.gridRight}`
    );
  }

  const hasVisibleHorizontalScrollTrack = before.horizontalScrollDisplay !== 'none' && before.hScrollRight > before.hScrollLeft;
  if (hasVisibleHorizontalScrollTrack) {
    assert.ok(before.hScrollLeft >= before.leftRight - 1, 'x-scroll should start after pinned-left area');
    assert.ok(before.hScrollRight <= before.rightBodyEdge + 1, 'x-scroll should end before/at pinned-right edge');
  }

  const xScrollFromCenterWheel = await page.evaluate(() => {
    const centerCell = document.querySelector('.hgrid__row--center .hgrid__cell');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    if (!centerCell || !hScroll) {
      throw new Error('Missing center cell or h-scroll for wheel test');
    }

    hScroll.scrollLeft = 0;
    centerCell.dispatchEvent(
      new WheelEvent('wheel', {
        deltaX: 160,
        bubbles: true,
        cancelable: true
      })
    );

    return hScroll.scrollLeft;
  });
  assert.ok(xScrollFromCenterWheel > 0, `center wheel horizontal input should move x-scroll, got ${xScrollFromCenterWheel}`);

  const xScrollFromHeaderWheel = await page.evaluate(() => {
    const centerHeaderCell = document.querySelector('.hgrid__header-center .hgrid__header-cell[data-column-id=\"name\"]');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    if (!centerHeaderCell || !hScroll) {
      throw new Error('Missing center header cell or h-scroll for header wheel test');
    }

    hScroll.scrollLeft = 0;
    centerHeaderCell.dispatchEvent(
      new WheelEvent('wheel', {
        deltaX: 140,
        bubbles: true,
        cancelable: true
      })
    );

    return hScroll.scrollLeft;
  });
  assert.ok(xScrollFromHeaderWheel > 0, `header wheel horizontal input should move x-scroll, got ${xScrollFromHeaderWheel}`);

  const pinnedWheelBehavior = await page.evaluate(() => {
    const leftCell = document.querySelector('.hgrid__row--left .hgrid__cell[data-column-id=\"id\"]');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    const verticalScroll = document.querySelector('.hgrid__v-scroll') ?? document.querySelector('.hgrid__viewport');
    if (!leftCell || !hScroll || !verticalScroll) {
      throw new Error('Missing left pinned cell/h-scroll/vertical scroll source for pinned wheel test');
    }

    hScroll.scrollLeft = 0;
    verticalScroll.scrollTop = 0;

    leftCell.dispatchEvent(
      new WheelEvent('wheel', {
        deltaX: 160,
        bubbles: true,
        cancelable: true
      })
    );

    const leftAfterHorizontal = hScroll.scrollLeft;

    leftCell.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: 260,
        bubbles: true,
        cancelable: true
      })
    );

    return {
      leftAfterHorizontal,
      topAfterVertical: verticalScroll.scrollTop
    };
  });
  assert.equal(
    Math.round(pinnedWheelBehavior.leftAfterHorizontal),
    0,
    `pinned-zone horizontal wheel must not move x-scroll, got ${pinnedWheelBehavior.leftAfterHorizontal}`
  );
  assert.ok(
    pinnedWheelBehavior.topAfterVertical > 0,
    `pinned-zone vertical wheel should move y-scroll, got ${pinnedWheelBehavior.topAfterVertical}`
  );

  await page.evaluate(() => {
    const hScroll = document.querySelector('.hgrid__h-scroll');
    if (!hScroll) {
      throw new Error('Missing h-scroll reset target');
    }
    hScroll.scrollLeft = 0;
    hScroll.dispatchEvent(new Event('scroll'));
  });

  await page.click('#scroll-right');
  const headerTransformImmediate = await page
    .locator('.hgrid__header-viewport')
    .evaluate((element) => element.style.transform);
  assert.ok(
    headerTransformImmediate.includes('-200px'),
    `header transform should sync immediately on scroll, got ${headerTransformImmediate}`
  );
  await waitAnimationFrame(page);

  const headerTransformAfterX = await page.locator('.hgrid__header-viewport').evaluate((element) => element.style.transform);
  const rowsTransformAfterX = await page.locator('.hgrid__rows-viewport--center').evaluate((element) => element.style.transform);
  assert.ok(headerTransformAfterX.includes('-200px'), `header transform should include -200px, got ${headerTransformAfterX}`);
  assert.ok(rowsTransformAfterX.includes('translate3d(-200px'), `center rows should move with horizontal scroll, got ${rowsTransformAfterX}`);

  const after = await page.evaluate(() => {
    const leftCell = document.querySelector('.hgrid__header-left .hgrid__header-cell[data-column-id=\"id\"]');
    const centerCell = document.querySelector('.hgrid__header-center .hgrid__header-cell[data-column-id=\"name\"]');
    const rightCell = document.querySelector('.hgrid__header-right .hgrid__header-cell[data-column-id=\"updatedAt\"]');
    if (!leftCell || !centerCell || !rightCell) {
      throw new Error('Missing header cells for pin check after scroll');
    }

    return {
      leftX: leftCell.getBoundingClientRect().left,
      centerX: centerCell.getBoundingClientRect().left,
      rightX: rightCell.getBoundingClientRect().left
    };
  });

  assert.ok(Math.abs(after.leftX - before.leftX) < 1, 'left pinned header should not move on horizontal scroll');
  assert.ok(Math.abs(after.rightX - before.rightX) < 1, 'right pinned header should not move on horizontal scroll');
  assert.ok(after.centerX < before.centerX - 20, 'center header should move left on horizontal scroll');

  await page.click('#scroll-down');
  await waitAnimationFrame(page);

  const rowsTransformAfterY = await page.locator('.hgrid__rows-viewport--center').evaluate((element) => element.style.transform);
  const rowsLeftTransformAfterY = await page.locator('.hgrid__rows-viewport--left').evaluate((element) => element.style.transform);
  const viewportScrollTopAfterY = await page
    .locator('.hgrid__v-scroll')
    .evaluate((element) => element.scrollTop);
  const leftPinnedFirstIdBefore = await page
    .locator('.hgrid__row--left .hgrid__cell[data-column-id=\"id\"]')
    .first()
    .textContent();
  await page.click('#scroll-down');
  await waitAnimationFrame(page);
  const leftPinnedFirstIdAfter = await page
    .locator('.hgrid__row--left .hgrid__cell[data-column-id=\"id\"]')
    .first()
    .textContent();

  assert.ok(rowsTransformAfterY.includes('px, '), 'rows transform should include Y offset after vertical scroll');
  assert.ok(rowsLeftTransformAfterY.includes('-'), `pinned rows viewport should compensate scrollTop, got ${rowsLeftTransformAfterY}`);
  assert.ok(viewportScrollTopAfterY > 700, `vertical scrollTop should move on native y-scroll, got ${viewportScrollTopAfterY}`);
  assert.notEqual(leftPinnedFirstIdAfter, leftPinnedFirstIdBefore, 'left pinned content should update on vertical scroll');

  await page.click('#pin-swap');
  await expectLogContains(log, 'pin mode = swap');

  await page.click('#inspect-layout');
  await expectLogContains(log, '\"leftHeaderCount\":1');
  await expectLogContains(log, '\"rightHeaderCount\":1');

  await page.click('#pin-clear');
  await expectLogContains(log, 'pin mode = none');
  await page.click('#inspect-layout');
  await expectLogContains(log, '\"leftHeaderCount\":0');
  await expectLogContains(log, '\"rightHeaderCount\":0');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample7Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example7.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__viewport', { timeout: 10_000 });
  await page.waitForSelector('.hgrid__v-scroll', { timeout: 10_000, state: 'attached' });
  await page.waitForSelector('.hgrid__h-scroll', { timeout: 10_000, state: 'attached' });

  const log = page.locator('#log');

  const initial = await page.evaluate(() => {
    const viewport = document.querySelector('.hgrid__viewport');
    const vScroll = document.querySelector('.hgrid__v-scroll');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    if (!viewport || !vScroll || !hScroll) {
      throw new Error('Missing viewport/v-scroll/h-scroll');
    }

    const hRect = hScroll.getBoundingClientRect();
    const vRect = vScroll.getBoundingClientRect();

    return {
      viewportOverflowY: viewport.style.overflowY,
      verticalOverflowY: vScroll.style.overflowY,
      overflowX: hScroll.style.overflowX,
      display: hScroll.style.display,
      hHeight: hRect.height,
      vWidth: vRect.width
    };
  });

  assert.equal(initial.viewportOverflowY, 'hidden', 'viewport y-overflow should stay hidden in AG-like layout');
  assert.equal(initial.verticalOverflowY, 'auto', 'default vertical policy should be auto');
  assert.equal(initial.overflowX, 'auto', 'default horizontal policy should be auto');
  assert.equal(initial.display, 'block', 'horizontal scroll source should exist in auto policy');
  assert.ok(initial.hHeight >= 0, `horizontal scrollbar geometry should be valid, got ${initial.hHeight}`);
  assert.ok(initial.vWidth >= 0, `vertical scrollbar geometry should be valid, got ${initial.vWidth}`);

  await page.click('#policy-always');
  await expectLogContains(log, 'vertical=always');

  const alwaysPolicyState = await page.evaluate(() => {
    const vScroll = document.querySelector('.hgrid__v-scroll');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    const hRect = hScroll ? hScroll.getBoundingClientRect() : null;
    const vRect = vScroll ? vScroll.getBoundingClientRect() : null;
    return {
      verticalOverflowY: vScroll ? vScroll.style.overflowY : null,
      horizontalOverflowX: hScroll ? hScroll.style.overflowX : null,
      horizontalDisplay: hScroll ? hScroll.style.display : null,
      hHeight: hRect ? hRect.height : 0,
      vWidth: vRect ? vRect.width : 0
    };
  });
  assert.equal(alwaysPolicyState.verticalOverflowY, 'scroll', 'always vertical policy should set scroll overflow');
  assert.equal(alwaysPolicyState.horizontalOverflowX, 'scroll', 'always horizontal policy should set scroll overflow');
  assert.equal(alwaysPolicyState.horizontalDisplay, 'block', 'always horizontal policy should keep scroll source visible');
  assert.ok(alwaysPolicyState.hHeight >= 10, `always mode should reserve horizontal bar size, got ${alwaysPolicyState.hHeight}`);
  assert.ok(alwaysPolicyState.vWidth >= 10, `always mode should reserve vertical bar size, got ${alwaysPolicyState.vWidth}`);

  const nativeScrollResult = await page.evaluate(() => {
    const vScroll = document.querySelector('.hgrid__v-scroll') ?? document.querySelector('.hgrid__viewport');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    if (!vScroll || !hScroll) {
      throw new Error('Missing vertical scroll/h-scroll for native scroll test');
    }

    vScroll.scrollTop = 0;
    hScroll.scrollLeft = 0;
    vScroll.scrollTop = 420;
    vScroll.dispatchEvent(new Event('scroll'));
    hScroll.scrollLeft = 180;
    hScroll.dispatchEvent(new Event('scroll'));

    return {
      scrollTop: vScroll.scrollTop,
      scrollLeft: hScroll.scrollLeft
    };
  });
  assert.ok(nativeScrollResult.scrollTop > 0, `native vertical scrollTop should move, got ${nativeScrollResult.scrollTop}`);
  assert.ok(nativeScrollResult.scrollLeft > 0, `native h-scroll left should move, got ${nativeScrollResult.scrollLeft}`);

  await page.click('#policy-hidden');
  await expectLogContains(log, 'vertical=hidden');

  const hiddenPolicyState = await page.evaluate(() => {
    const viewport = document.querySelector('.hgrid__viewport');
    const vScroll = document.querySelector('.hgrid__v-scroll');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    return {
      viewportOverflowY: viewport ? viewport.style.overflowY : null,
      verticalOverflowY: vScroll ? vScroll.style.overflowY : null,
      verticalDisplay: vScroll ? vScroll.style.display : null,
      overflowX: hScroll ? hScroll.style.overflowX : null,
      display: hScroll ? hScroll.style.display : null
    };
  });
  assert.equal(hiddenPolicyState.viewportOverflowY, 'hidden', 'viewport y-overflow should stay hidden');
  assert.equal(hiddenPolicyState.verticalOverflowY, 'hidden', 'vertical hidden policy should be applied');
  assert.equal(hiddenPolicyState.verticalDisplay, 'none', 'vertical hidden policy should hide y-scroll area');
  assert.equal(hiddenPolicyState.overflowX, 'hidden', 'horizontal hidden policy should be applied');
  assert.equal(hiddenPolicyState.display, 'none', 'horizontal hidden policy should hide h-scroll area');

  await page.click('#policy-auto');
  await expectLogContains(log, 'vertical=auto');

  await page.click('#scroll-x');
  await page.click('#scroll-y');
  await page.click('#inspect');

  await expectLogContains(log, '\"verticalOverflowY\":\"auto\"');
  await expectLogContains(log, '\"hScrollOverflowX\":\"auto\"');
  await expectLogContains(log, '\"hScrollLeft\":');
  await expectLogContains(log, '\"verticalScrollTop\":');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample8Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example8.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__header-viewport', { timeout: 10_000, state: 'attached' });
  await page.waitForSelector('.hgrid__rows-viewport--center', { timeout: 10_000, state: 'attached' });
  await page.waitForSelector('.hgrid__rows-viewport--left', { timeout: 10_000, state: 'attached' });
  await page.waitForSelector('.hgrid__h-scroll', { timeout: 10_000, state: 'attached' });
  await page.waitForSelector('.hgrid__v-scroll', { timeout: 10_000, state: 'attached' });

  await page.click('#stress-wheel');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const stressState = await page.evaluate(() => {
    const headerViewport = document.querySelector('.hgrid__header-viewport');
    const centerViewport = document.querySelector('.hgrid__rows-viewport--center');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    const vScroll = document.querySelector('.hgrid__v-scroll') ?? document.querySelector('.hgrid__viewport');
    if (!headerViewport || !centerViewport || !hScroll || !vScroll) {
      throw new Error('Missing orchestration elements after stress wheel');
    }

    return {
      headerTransform: headerViewport.style.transform,
      centerTransform: centerViewport.style.transform,
      scrollLeft: hScroll.scrollLeft,
      scrollTop: vScroll.scrollTop,
      hMax: hScroll.scrollWidth - hScroll.clientWidth
    };
  });

  const stressHeader = parseTranslate3d(stressState.headerTransform);
  const stressCenter = parseTranslate3d(stressState.centerTransform);
  assert.ok(stressState.scrollLeft > 0, `stress wheel should move horizontal source, got ${stressState.scrollLeft}`);
  assert.ok(stressState.scrollTop > 0, `stress wheel should move vertical source, got ${stressState.scrollTop}`);
  assert.ok(!Number.isNaN(stressHeader.x), `header transform must be parseable, got ${stressState.headerTransform}`);
  assert.ok(!Number.isNaN(stressCenter.x), `center transform must be parseable, got ${stressState.centerTransform}`);
  assert.ok(Math.abs(stressHeader.x - stressCenter.x) <= 1, 'header and center x transform must stay synchronized');
  assert.ok(stressState.scrollLeft <= Math.max(0, stressState.hMax) + 1, 'horizontal scroll must stay within max range');

  await page.click('#resize-narrow');
  await waitAnimationFrame(page);
  await page.click('#pin-swap');
  await waitAnimationFrame(page);
  await page.click('#stress-wheel');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const resizeState = await page.evaluate(() => {
    const grid = document.querySelector('.hgrid');
    const vScroll = document.querySelector('.hgrid__v-scroll');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    const headerViewport = document.querySelector('.hgrid__header-viewport');
    const centerViewport = document.querySelector('.hgrid__rows-viewport--center');
    const shell = document.querySelector('#grid-shell');
    if (!grid || !vScroll || !hScroll || !headerViewport || !centerViewport || !shell) {
      throw new Error('Missing resize verification elements');
    }

    const gridRect = grid.getBoundingClientRect();
    const vRect = vScroll.getBoundingClientRect();

    return {
      shellWidth: shell.getBoundingClientRect().width,
      gridRight: gridRect.right,
      vRight: vRect.right,
      scrollLeft: hScroll.scrollLeft,
      hMax: hScroll.scrollWidth - hScroll.clientWidth,
      headerTransform: headerViewport.style.transform,
      centerTransform: centerViewport.style.transform
    };
  });

  const resizeHeader = parseTranslate3d(resizeState.headerTransform);
  const resizeCenter = parseTranslate3d(resizeState.centerTransform);
  assert.ok(resizeState.shellWidth <= 642, `narrow resize should apply shell width, got ${resizeState.shellWidth}`);
  assert.ok(Math.abs(resizeState.vRight - resizeState.gridRight) <= 1, 'y-scroll should stay aligned to grid right edge');
  assert.ok(resizeState.scrollLeft >= 0, `scrollLeft must be non-negative after resize/pin change, got ${resizeState.scrollLeft}`);
  assert.ok(
    resizeState.scrollLeft <= Math.max(0, resizeState.hMax) + 1,
    `scrollLeft must be clamped after resize/pin change, left=${resizeState.scrollLeft}, max=${resizeState.hMax}`
  );
  assert.ok(!Number.isNaN(resizeHeader.x), `header transform must remain parseable, got ${resizeState.headerTransform}`);
  assert.ok(!Number.isNaN(resizeCenter.x), `center transform must remain parseable, got ${resizeState.centerTransform}`);
  assert.ok(Math.abs(resizeHeader.x - resizeCenter.x) <= 1, 'header and center must remain synchronized after resize/pin change');

  await page.click('#resize-wide');
  await waitAnimationFrame(page);
  await page.click('#pin-clear');
  await waitAnimationFrame(page);

  const wideState = await page.evaluate(() => {
    const shell = document.querySelector('#grid-shell');
    const hScroll = document.querySelector('.hgrid__h-scroll');
    if (!shell || !hScroll) {
      throw new Error('Missing wide-state elements');
    }
    return {
      shellWidth: shell.getBoundingClientRect().width,
      scrollLeft: hScroll.scrollLeft,
      hMax: hScroll.scrollWidth - hScroll.clientWidth
    };
  });
  assert.ok(wideState.shellWidth >= 918, `wide resize should apply shell width, got ${wideState.shellWidth}`);
  assert.ok(wideState.scrollLeft <= Math.max(0, wideState.hMax) + 1, 'scrollLeft should stay clamped in wide state');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample9Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example9.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000 });

  await page.click('#inspect');
  const initialState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example9 log payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(initialState.rowCount, 1_000_000, `example9 should start at 1M rows, got ${initialState.rowCount}`);
  assert.equal(initialState.centerRowDom, initialState.expectedPoolSize, 'center row DOM should match poolSize at 1M');

  await page.click('#jump-bottom');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const afterJumpState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example9 jump-bottom payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(afterJumpState.centerRowDom, afterJumpState.expectedPoolSize, 'pool size must remain fixed after deep scroll');
  assert.ok(afterJumpState.firstVisibleId > 1, `deep scroll should move first visible row, got ${afterJumpState.firstVisibleId}`);
  assert.ok(
    afterJumpState.firstVisibleId <= afterJumpState.rowCount,
    `first visible row must stay in range, got ${afterJumpState.firstVisibleId}`
  );

  await page.click('#set-10m');
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });
  await page.click('#inspect');

  const tenMillionState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example9 10M payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(tenMillionState.rowCount, 10_000_000, `example9 should switch to 10M rows, got ${tenMillionState.rowCount}`);
  assert.equal(tenMillionState.centerRowDom, tenMillionState.expectedPoolSize, 'center row DOM should stay fixed at 10M');

  await page.click('#jump-bottom');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const tenMillionBottomState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example9 10M bottom payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.ok(
    tenMillionBottomState.firstVisibleId > 9_000_000,
    `10M bottom jump should reach deep rows, got ${tenMillionBottomState.firstVisibleId}`
  );
  assert.ok(
    tenMillionBottomState.scrollTopVirtual > tenMillionBottomState.scrollTopNative,
    `scaled scroll should expose larger virtual top, virtual=${tenMillionBottomState.scrollTopVirtual}, native=${tenMillionBottomState.scrollTopNative}`
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample10Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example10.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center .hgrid__cell--center', { timeout: 15_000, state: 'attached' });
  await page.waitForSelector('.hgrid__header-cell--center', { timeout: 15_000, state: 'attached' });

  await page.click('#inspect');
  const initialState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example10 initial payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.ok(
    initialState.centerCellPool < initialState.centerColumnCount,
    `center pool should be virtualized, pool=${initialState.centerCellPool}, columns=${initialState.centerColumnCount}`
  );
  assert.equal(
    initialState.centerCellPool,
    initialState.headerCenterPool,
    'header center pool and body center pool must have identical slot count'
  );

  await page.click('#jump-8k');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const scrolledState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example10 scrolled payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(
    scrolledState.centerCellPool,
    initialState.centerCellPool,
    'center pool size must stay fixed while horizontal scrolling'
  );
  assert.notEqual(
    scrolledState.firstVisibleColumnId,
    initialState.firstVisibleColumnId,
    'horizontal scroll should advance visible column window'
  );
  assert.ok(
    scrolledState.scrollLeft <= Math.max(0, scrolledState.scrollMax) + 1,
    `scrollLeft must remain clamped, left=${scrolledState.scrollLeft}, max=${scrolledState.scrollMax}`
  );

  await page.click('#jump-end');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const endState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example10 end payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(endState.centerCellPool, initialState.centerCellPool, 'pool size must stay fixed at end scroll');
  assert.ok(endState.scrollLeft >= scrolledState.scrollLeft, 'end jump should not move backward');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample11Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example11.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#inspect');
  const initialState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example11 initial payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(initialState.rowNodeDelta, 0, `initial row delta must be 0, got ${initialState.rowNodeDelta}`);
  assert.equal(
    initialState.centerCellPool,
    initialState.headerCenterPool,
    'center header/body pool capacity should match in initial state'
  );

  await page.click('#stress-120');
  await page.waitForFunction(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      return false;
    }
    try {
      const payload = JSON.parse(logElement.textContent);
      return payload.label === 'stress-complete';
    } catch (_error) {
      return false;
    }
  });

  const stressedState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example11 stress payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(stressedState.rowNodeCount, initialState.rowNodeCount, 'row node count must remain constant after stress');
  assert.equal(
    stressedState.centerRowNodeCount,
    initialState.centerRowNodeCount,
    'center row node count must remain constant after stress'
  );
  assert.equal(stressedState.centerCellPool, initialState.centerCellPool, 'center cell pool must remain constant after stress');
  assert.equal(
    stressedState.headerCenterPool,
    initialState.headerCenterPool,
    'header center pool must remain constant after stress'
  );
  assert.equal(stressedState.totalNodeDelta, 0, `total node delta must remain 0, got ${stressedState.totalNodeDelta}`);
  assert.equal(stressedState.rowNodeDelta, 0, `row node delta must remain 0, got ${stressedState.rowNodeDelta}`);
  assert.ok(stressedState.firstVisibleId > 1, `stress should move visible rows, got ${stressedState.firstVisibleId}`);
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample12Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example12.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#burst-scroll');
  await page.waitForFunction(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      return false;
    }
    try {
      const payload = JSON.parse(logElement.textContent);
      return payload.label === 'burst-scroll-after-raf';
    } catch (_error) {
      return false;
    }
  });

  const burstScrollState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example12 burst-scroll payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(
    burstScrollState.renderPassCountBeforeRaf,
    0,
    `burst-scroll should not render before RAF, got ${burstScrollState.renderPassCountBeforeRaf}`
  );
  assert.equal(
    burstScrollState.renderPassCountAfterRaf,
    1,
    `burst-scroll should coalesce into a single render, got ${burstScrollState.renderPassCountAfterRaf}`
  );
  assert.ok(
    burstScrollState.firstVisibleIdAfterRaf > burstScrollState.firstVisibleIdBeforeRaf,
    `burst-scroll should move visible rows, before=${burstScrollState.firstVisibleIdBeforeRaf}, after=${burstScrollState.firstVisibleIdAfterRaf}`
  );

  await page.click('#burst-wheel');
  await page.waitForFunction(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      return false;
    }
    try {
      const payload = JSON.parse(logElement.textContent);
      return payload.label === 'burst-wheel-after-raf';
    } catch (_error) {
      return false;
    }
  });

  const burstWheelState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example12 burst-wheel payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(
    burstWheelState.renderPassCountBeforeRaf,
    0,
    `burst-wheel should not render before RAF, got ${burstWheelState.renderPassCountBeforeRaf}`
  );
  assert.equal(
    burstWheelState.renderPassCountAfterRaf,
    1,
    `burst-wheel should coalesce into a single render, got ${burstWheelState.renderPassCountAfterRaf}`
  );
  assert.ok(
    burstWheelState.firstVisibleIdAfterRaf > burstWheelState.firstVisibleIdBeforeRaf,
    `burst-wheel should move visible rows, before=${burstWheelState.firstVisibleIdBeforeRaf}, after=${burstWheelState.firstVisibleIdAfterRaf}`
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample13Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example13.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  await page.waitForFunction(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      return false;
    }
    try {
      const payload = JSON.parse(logElement.textContent);
      return payload.label === 'initial';
    } catch (_error) {
      return false;
    }
  });

  const initialState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example13 initial payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.equal(initialState.rowCount, 100_000_000, `example13 should start at 100M, got ${initialState.rowCount}`);
  assert.equal(initialState.virtualHeight, 2_800_000_000, `example13 virtualHeight mismatch: ${initialState.virtualHeight}`);
  assert.equal(initialState.physicalHeight, 16_000_000, `example13 physicalHeight mismatch: ${initialState.physicalHeight}`);
  assert.ok(initialState.scale > 100, `example13 scale should be high for 100M, got ${initialState.scale}`);

  await page.evaluate(() => {
    const verticalScroll = document.querySelector('.hgrid__v-scroll');
    if (!verticalScroll) {
      throw new Error('Missing vertical scroll source in example13');
    }
    verticalScroll.scrollTop = verticalScroll.scrollHeight;
    verticalScroll.dispatchEvent(new Event('scroll'));
  });
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);
  await page.click('#inspect');

  const thumbBottomState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example13 thumb-bottom payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.ok(
    thumbBottomState.firstVisibleId > 99_000_000,
    `example13 thumb-bottom should reach deep rows, got ${thumbBottomState.firstVisibleId}`
  );
  assert.ok(
    thumbBottomState.scrollTopNative >= thumbBottomState.physicalMaxScrollTop - 1,
    `example13 thumb-bottom native top should reach max, top=${thumbBottomState.scrollTopNative}, max=${thumbBottomState.physicalMaxScrollTop}`
  );

  await page.evaluate(() => {
    const verticalScroll = document.querySelector('.hgrid__v-scroll');
    if (!verticalScroll) {
      throw new Error('Missing vertical scroll source in example13');
    }
    verticalScroll.scrollTop = 0;
    verticalScroll.dispatchEvent(new Event('scroll'));
  });
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);
  await page.click('#inspect');

  const thumbTopState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example13 thumb-top payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.ok(
    thumbTopState.firstVisibleId <= 2,
    `example13 thumb-top should return near first row, got ${thumbTopState.firstVisibleId}`
  );
  assert.ok(
    thumbTopState.scrollTopVirtual <= 1,
    `example13 thumb-top virtual top should be near zero, got ${thumbTopState.scrollTopVirtual}`
  );

  await page.click('#jump-bottom');
  await page.waitForFunction(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      return false;
    }
    try {
      const payload = JSON.parse(logElement.textContent);
      return payload.label === 'jump-bottom';
    } catch (_error) {
      return false;
    }
  });

  const bottomState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example13 jump-bottom payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.ok(
    bottomState.firstVisibleId > 99_000_000,
    `example13 bottom jump should reach deep rows, got ${bottomState.firstVisibleId}`
  );
  assert.ok(
    bottomState.scrollTopVirtual >= bottomState.virtualMaxScrollTop - 1,
    `example13 bottom virtual top should reach max, top=${bottomState.scrollTopVirtual}, max=${bottomState.virtualMaxScrollTop}`
  );

  await page.click('#jump-top');
  await page.waitForFunction(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      return false;
    }
    try {
      const payload = JSON.parse(logElement.textContent);
      return payload.label === 'jump-top';
    } catch (_error) {
      return false;
    }
  });

  await page.click('#roundtrip');
  await page.waitForFunction(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      return false;
    }
    try {
      const payload = JSON.parse(logElement.textContent);
      return payload.label === 'roundtrip';
    } catch (_error) {
      return false;
    }
  });

  const roundtripState = await page.evaluate(() => {
    const logElement = document.querySelector('#log');
    if (!logElement || !logElement.textContent) {
      throw new Error('Missing example13 roundtrip payload');
    }
    return JSON.parse(logElement.textContent);
  });

  assert.ok(roundtripState.driftRows <= 1, `example13 roundtrip drift must be <=1 row, got ${roundtripState.driftRows}`);
  assert.ok(
    roundtripState.topAfter.firstVisibleId <= 2,
    `example13 top restore should return near first row, got ${roundtripState.topAfter.firstVisibleId}`
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample14Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example14.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 90_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example14 initial payload');
  assert.equal(initialState.rowCount, 100_000_000, `example14 should start at 100M, got ${initialState.rowCount}`);
  assert.equal(initialState.baseMappingMode, 'identity', `example14 should start in identity mode, got ${initialState.baseMappingMode}`);
  assert.equal(initialState.estimatedMappingBytes, 0, `example14 identity bytes should be 0, got ${initialState.estimatedMappingBytes}`);

  await page.click('#jump-bottom');
  await waitForLogLabel('jump-bottom');
  const jumpBottomState = await readLogPayload('Missing example14 jump-bottom payload');
  assert.ok(
    jumpBottomState.firstVisibleId > 99_000_000,
    `example14 jump-bottom should reach deep rows, got ${jumpBottomState.firstVisibleId}`
  );

  await page.click('#save-state');
  await waitForLogLabel('save-state');
  await page.click('#jump-top');
  await waitForLogLabel('jump-top');
  await page.click('#restore-state');
  await waitForLogLabel('restore-state');
  const restoredState = await readLogPayload('Missing example14 restore-state payload');
  assert.ok(
    restoredState.firstVisibleId > 99_000_000,
    `example14 restore-state should restore deep position, got ${restoredState.firstVisibleId}`
  );

  await page.click('#jump-top');
  await waitForLogLabel('jump-top');
  await page.click('#apply-sparse');
  await waitForLogLabel('sparse-on');
  const sparseOnState = await readLogPayload('Missing example14 sparse-on payload');
  assert.equal(sparseOnState.baseMappingMode, 'sparse', `example14 sparse mode mismatch: ${sparseOnState.baseMappingMode}`);
  assert.equal(sparseOnState.sparseOverrideCount, 2, `example14 sparse override count mismatch: ${sparseOnState.sparseOverrideCount}`);
  assert.equal(sparseOnState.materializedBaseBytes, 0, `example14 sparse should not materialize base bytes`);
  assert.equal(
    sparseOnState.firstVisibleId,
    sparseOnState.rowCount,
    `example14 sparse swap should bring last row first, got ${sparseOnState.firstVisibleId}`
  );

  await page.click('#clear-sparse');
  await waitForLogLabel('sparse-off');
  const sparseOffState = await readLogPayload('Missing example14 sparse-off payload');
  assert.equal(
    sparseOffState.baseMappingMode,
    'identity',
    `example14 sparse clear should restore identity mode, got ${sparseOffState.baseMappingMode}`
  );
  assert.ok(
    sparseOffState.firstVisibleId <= 2,
    `example14 sparse clear should restore top rows, got ${sparseOffState.firstVisibleId}`
  );

  await page.click('button[data-row-count=\"200000\"]');
  await waitForLogLabel('set-row-count');
  await page.click('#run-materialize-loop');
  await waitForLogLabel('materialize-loop');
  const materializeLoopState = await readLogPayload('Missing example14 materialize-loop payload');
  assert.equal(materializeLoopState.rowCount, 200_000, `example14 materialize loop rowCount mismatch`);
  assert.equal(
    materializeLoopState.baseMappingMode,
    'identity',
    `example14 materialize loop should return identity mode, got ${materializeLoopState.baseMappingMode}`
  );
  assert.equal(
    materializeLoopState.hasFilterMapping,
    false,
    `example14 materialize loop should clear filter mapping`
  );
  assert.equal(
    materializeLoopState.estimatedMappingBytes,
    0,
    `example14 materialize loop should release mappings, got ${materializeLoopState.estimatedMappingBytes}`
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample15Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example15.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  function parsePx(value) {
    if (typeof value !== 'string') {
      return Number.NaN;
    }

    const numericValue = Number.parseFloat(value.replace('px', ''));
    return Number.isFinite(numericValue) ? numericValue : Number.NaN;
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example15 initial payload');
  assert.equal(initialState.mode, 'measured', `example15 should start in measured mode, got ${initialState.mode}`);
  assert.equal(initialState.snapshot.isPinnedAligned, true, 'example15 measured mode must align pinned zones');
  assert.ok(
    initialState.snapshot.maxVisibleCenterHeight > 28,
    `example15 measured row height should exceed base height, got ${initialState.snapshot.maxVisibleCenterHeight}`
  );

  await page.click('#jump-bottom');
  await waitForLogLabel('jump-bottom');
  const jumpBottomState = await readLogPayload('Missing example15 jump-bottom payload');
  assert.ok(
    jumpBottomState.snapshot.firstVisibleId > 4_500,
    `example15 jump-bottom should reach deep rows, got ${jumpBottomState.snapshot.firstVisibleId}`
  );
  assert.equal(jumpBottomState.snapshot.isPinnedAligned, true, 'example15 jump-bottom must keep pinned alignment');

  await page.click('#mode-estimated');
  await waitForLogLabel('mode-estimated');

  await page.click('#estimated-compact');
  await waitForLogLabel('estimated-compact');
  const compactState = await readLogPayload('Missing example15 estimated-compact payload');

  await page.click('#estimated-spacious');
  await waitForLogLabel('estimated-spacious');
  const spaciousState = await readLogPayload('Missing example15 estimated-spacious payload');

  const compactHeight = parsePx(compactState.snapshot.centerHeight);
  const spaciousHeight = parsePx(spaciousState.snapshot.centerHeight);
  assert.ok(Number.isFinite(compactHeight), `example15 compact height must be numeric, got ${compactState.snapshot.centerHeight}`);
  assert.ok(Number.isFinite(spaciousHeight), `example15 spacious height must be numeric, got ${spaciousState.snapshot.centerHeight}`);
  assert.ok(spaciousHeight > compactHeight, `example15 estimated mode height should increase, compact=${compactHeight}, spacious=${spaciousHeight}`);

  await page.click('#reset-heights');
  await waitForLogLabel('reset-row-heights');
  const resetState = await readLogPayload('Missing example15 reset-row-heights payload');
  assert.equal(resetState.snapshot.isPinnedAligned, true, 'example15 resetRowHeights must preserve pinned alignment');

  await page.click('#data-100m');
  await waitForLogLabel('data-100m');
  const data100mState = await readLogPayload('Missing example15 data-100m payload');
  assert.equal(data100mState.dataMode, '100m', `example15 data mode should be 100m, got ${data100mState.dataMode}`);
  assert.equal(data100mState.mode, 'estimated', `example15 100m mode should switch to estimated, got ${data100mState.mode}`);
  assert.equal(data100mState.rowCount, 100_000_000, `example15 100m rowCount mismatch`);

  await page.click('#jump-bottom');
  await waitForLogLabel('jump-bottom');
  const data100mBottomState = await readLogPayload('Missing example15 100m jump-bottom payload');
  assert.ok(
    data100mBottomState.snapshot.firstVisibleId > 99_000_000,
    `example15 100m jump-bottom should reach deep rows, got ${data100mBottomState.snapshot.firstVisibleId}`
  );
  assert.equal(
    data100mBottomState.snapshot.isPinnedAligned,
    true,
    'example15 100m jump-bottom must keep pinned alignment'
  );

  await page.click('#jump-top');
  await waitForLogLabel('jump-top');
  const data100mTopState = await readLogPayload('Missing example15 100m jump-top payload');
  assert.ok(
    data100mTopState.snapshot.firstVisibleId <= 2,
    `example15 100m jump-top should restore near first row, got ${data100mTopState.snapshot.firstVisibleId}`
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample16Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example16.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');

  await page.click('#probe-left');
  await waitForLogLabel('probe-left');
  const probeLeft = await readLogPayload('Missing example16 probe-left payload');
  assert.equal(probeLeft.snapshot.lastCellClick.columnId, 'id', `example16 left probe column mismatch`);

  await page.click('#probe-center-c0');
  await waitForLogLabel('probe-center-c0');
  const probeCenter0 = await readLogPayload('Missing example16 probe-center-c0 payload');
  assert.equal(probeCenter0.snapshot.lastCellClick.columnId, 'c0', `example16 center c0 probe mismatch`);

  await page.click('#probe-center-c5');
  await waitForLogLabel('probe-center-c5');
  const probeCenter5 = await readLogPayload('Missing example16 probe-center-c5 payload');
  assert.equal(probeCenter5.snapshot.lastCellClick.columnId, 'c5', `example16 center c5 probe mismatch`);

  await page.click('#probe-right');
  await waitForLogLabel('probe-right');
  const probeRight = await readLogPayload('Missing example16 probe-right payload');
  assert.equal(probeRight.snapshot.lastCellClick.columnId, 'status', `example16 right probe column mismatch`);

  await page.click('#header-wheel');
  await waitForLogLabel('header-wheel');
  const headerWheelState = await readLogPayload('Missing example16 header-wheel payload');
  assert.ok(
    headerWheelState.after.hScrollLeft > headerWheelState.before.hScrollLeft,
    `example16 header wheel should propagate horizontal scroll`
  );
  assert.ok(
    headerWheelState.after.vScrollTopVirtual > headerWheelState.before.vScrollTopVirtual,
    `example16 header wheel should propagate vertical scroll`
  );

  await page.click('#pinned-wheel-x');
  await waitForLogLabel('pinned-wheel-x');
  const pinnedWheelXState = await readLogPayload('Missing example16 pinned-wheel-x payload');
  assert.equal(
    Math.round(pinnedWheelXState.after.hScrollLeft),
    Math.round(pinnedWheelXState.before.hScrollLeft),
    `example16 pinned x-only wheel should not move horizontal scroll`
  );

  await page.click('#pinned-wheel-y');
  await waitForLogLabel('pinned-wheel-y');
  const pinnedWheelYState = await readLogPayload('Missing example16 pinned-wheel-y payload');
  assert.ok(
    pinnedWheelYState.after.vScrollTopVirtual > pinnedWheelYState.before.vScrollTopVirtual,
    `example16 pinned y-only wheel should move vertical scroll`
  );

  await page.click('#burst-wheel');
  await waitForLogLabel('burst-wheel');
  const burstState = await readLogPayload('Missing example16 burst-wheel payload');
  assert.ok(
    burstState.after.vScrollTopVirtual > burstState.before.vScrollTopVirtual,
    `example16 burst wheel should move virtual scroll forward`
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample17Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example17.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 30_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');

  const pointerDragPoints = await page.evaluate(() => {
    const visibleRows = Array.from(document.querySelectorAll('.hgrid__row--center')).filter(
      (row) => (row).style.display !== 'none'
    );
    if (visibleRows.length < 2) {
      throw new Error('Missing visible rows for pointer drag in example17');
    }

    const startCell = visibleRows[0].querySelector('.hgrid__cell[data-column-id="c1"]');
    const endRow = visibleRows[Math.min(3, visibleRows.length - 1)];
    const endCell = endRow.querySelector('.hgrid__cell[data-column-id="c3"]');
    if (!startCell || !endCell) {
      throw new Error('Missing start/end cells for pointer drag in example17');
    }

    const startRect = startCell.getBoundingClientRect();
    const endRect = endCell.getBoundingClientRect();

    return {
      startX: startRect.left + startRect.width * 0.5,
      startY: startRect.top + startRect.height * 0.5,
      endX: endRect.left + endRect.width * 0.5,
      endY: endRect.top + endRect.height * 0.5
    };
  });

  await page.mouse.move(pointerDragPoints.startX, pointerDragPoints.startY);
  await page.mouse.down();
  await page.mouse.move(pointerDragPoints.endX, pointerDragPoints.endY, { steps: 12 });
  await page.mouse.up();
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);
  await page.click('#inspect');
  await waitForLogLabel('inspect');
  const pointerDragState = await readLogPayload('Missing example17 pointer-drag inspect payload');
  assert.ok(
    pointerDragState.snapshot.selection.cellRanges.length > 0,
    'example17 pointer drag should create selection ranges'
  );
  assert.ok(pointerDragState.snapshot.selectedCellDom > 0, 'example17 pointer drag should paint selected cells');
  assert.equal(pointerDragState.snapshot.lastSelectionSource, 'pointer', 'example17 pointer drag source should be pointer');

  await page.click('#set-cell-range-api');
  await waitForLogLabel('set-cell-range-api');
  const cellRangeState = await readLogPayload('Missing example17 set-cell-range-api payload');
  assert.equal(cellRangeState.snapshot.selection.cellRanges.length, 1, 'example17 should create one cell range from api');
  assert.equal(cellRangeState.snapshot.selection.rowRanges.length, 1, 'example17 should derive one row range from api cell range');
  assert.ok(cellRangeState.snapshot.selectedCellDom > 0, 'example17 selected cell DOM should be visible after api range');
  assert.ok(cellRangeState.snapshot.selectedRowDom > 0, 'example17 selected row DOM should be visible after api range');
  assert.equal(cellRangeState.snapshot.lastSelectionSource, 'api', 'example17 selection source should be api after setSelection');

  await page.click('#set-row-range-api');
  await waitForLogLabel('set-row-range-api');
  const rowRangeState = await readLogPayload('Missing example17 set-row-range-api payload');
  assert.ok(
    rowRangeState.snapshot.selection.rowRanges.some((range) => range.r1 === 200_000 && range.r2 === 200_120),
    'example17 should keep explicit row range'
  );
  assert.equal(rowRangeState.snapshot.lastSelectionSource, 'api', 'example17 row-range source should be api');

  await page.click('#drag-1m');
  await waitForLogLabel('drag-1m');
  const dragState = await readLogPayload('Missing example17 drag-1m payload');
  assert.ok(
    dragState.snapshot.selection.cellRanges.length > 0,
    'example17 drag-1m should keep at least one selected cell range'
  );
  const dragRange = dragState.snapshot.selection.cellRanges[0];
  const dragBottom = Math.max(dragRange.r1, dragRange.r2);
  assert.ok(dragBottom > 900_000, `example17 drag-1m should reach deep rows, got ${dragBottom}`);
  assert.ok(dragState.snapshot.selectedCellDom > 0, 'example17 drag-1m should keep selected cell DOM');
  assert.ok(
    dragState.snapshot.selectedCellDom < 5_000,
    `example17 selected cell DOM should remain bounded by viewport, got ${dragState.snapshot.selectedCellDom}`
  );
  assert.ok(
    dragState.snapshot.selectionEventCount >= 50,
    `example17 drag-1m should emit repeated range updates, got ${dragState.snapshot.selectionEventCount}`
  );
  assert.equal(dragState.snapshot.lastSelectionSource, 'api', 'example17 drag source should be api');

  await page.click('#clear-selection');
  await waitForLogLabel('clear-selection');
  const clearState = await readLogPayload('Missing example17 clear-selection payload');
  assert.equal(clearState.snapshot.selection.cellRanges.length, 0, 'example17 clear should reset cell ranges');
  assert.equal(clearState.snapshot.selection.rowRanges.length, 0, 'example17 clear should reset row ranges');
  assert.equal(clearState.snapshot.selectedCellDom, 0, 'example17 clear should remove selected cell class');
  assert.equal(clearState.snapshot.selectedRowDom, 0, 'example17 clear should remove selected row class');
  assert.equal(clearState.snapshot.lastSelectionSource, 'clear', 'example17 clear source should be clear');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample18Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example18.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example18 initial payload');
  assert.equal(initialState.snapshot.focusedOnGrid, true, 'example18 grid should be focused for keyboard navigation');

  await page.click('#run-arrows');
  await waitForLogLabel('run-arrows');
  const arrowsState = await readLogPayload('Missing example18 run-arrows payload');
  assert.deepEqual(
    arrowsState.snapshot.selection.activeCell,
    { rowIndex: 1, colIndex: 2 },
    `example18 arrows should move active cell to row 1 col 2`
  );
  assert.equal(arrowsState.snapshot.lastSource, 'keyboard', 'example18 arrows should emit keyboard source');

  await page.click('#run-shift-range');
  await waitForLogLabel('run-shift-range');
  const shiftState = await readLogPayload('Missing example18 run-shift-range payload');
  assert.equal(shiftState.snapshot.selection.cellRanges.length, 1, 'example18 shift should keep one range');
  const range = shiftState.snapshot.selection.cellRanges[0];
  assert.ok(range.r2 >= range.r1, `example18 shift range should grow rows, got ${JSON.stringify(range)}`);
  assert.ok(range.c2 >= range.c1, `example18 shift range should grow cols, got ${JSON.stringify(range)}`);
  assert.ok(shiftState.snapshot.selectedCellDom > 0, 'example18 shift should paint selected cells');

  await page.click('#run-page');
  await waitForLogLabel('run-page');
  const pageState = await readLogPayload('Missing example18 run-page payload');
  assert.ok(
    pageState.afterDown.selection.activeCell.rowIndex > shiftState.snapshot.selection.activeCell.rowIndex,
    'example18 PageDown should increase active row index'
  );
  assert.ok(
    pageState.afterUp.selection.activeCell.rowIndex < pageState.afterDown.selection.activeCell.rowIndex,
    'example18 PageUp should decrease active row index'
  );

  await page.click('#run-edge');
  await waitForLogLabel('run-edge');
  const edgeState = await readLogPayload('Missing example18 run-edge payload');
  assert.ok(
    edgeState.afterEnd.selection.activeCell.rowIndex >= 4_990,
    `example18 ctrl+End should jump near bottom, got ${edgeState.afterEnd.selection.activeCell.rowIndex}`
  );
  assert.equal(
    edgeState.afterHome.selection.activeCell.rowIndex,
    0,
    `example18 ctrl+Home should jump top row, got ${edgeState.afterHome.selection.activeCell.rowIndex}`
  );
  assert.equal(
    edgeState.afterHome.selection.activeCell.colIndex,
    0,
    `example18 ctrl+Home should jump first column, got ${edgeState.afterHome.selection.activeCell.colIndex}`
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample19Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example19.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example19 initial payload');
  const initialRow1Score = initialState.snapshot.rendered.row1Score;
  const initialRow0DueDate = initialState.snapshot.rendered.row0DueDate;
  const initialRow1Name = initialState.snapshot.rendered.row1Name;

  await page.click('#run-enter-commit');
  await waitForLogLabel('run-enter-commit');
  const enterCommitState = await readLogPayload('Missing example19 run-enter-commit payload');
  assert.equal(enterCommitState.snapshot.rendered.row0Score, 321, 'example19 enter commit should update row0.score');
  assert.equal(enterCommitState.snapshot.editorVisible, false, 'example19 editor should close after enter commit');
  assert.ok(enterCommitState.snapshot.counters.start >= 1, 'example19 should emit editStart');
  assert.ok(enterCommitState.snapshot.counters.commit >= 1, 'example19 should emit editCommit');

  await page.click('#run-dblclick-cancel');
  await waitForLogLabel('run-dblclick-cancel');
  const dblclickCancelState = await readLogPayload('Missing example19 run-dblclick-cancel payload');
  assert.equal(
    dblclickCancelState.snapshot.rendered.row1Score,
    initialRow1Score,
    'example19 escape cancel should not mutate row1.score'
  );
  assert.equal(
    dblclickCancelState.snapshot.counters.lastCancelReason,
    'escape',
    'example19 cancel reason should be escape'
  );

  await page.click('#run-sync-invalid');
  await waitForLogLabel('run-sync-invalid');
  const syncInvalidState = await readLogPayload('Missing example19 run-sync-invalid payload');
  assert.equal(syncInvalidState.invalidSnapshot.editorInvalid, true, 'example19 sync validator should mark editor invalid');
  assert.ok(
    String(syncInvalidState.invalidSnapshot.editorMessage || '').includes('YYYY-MM-DD'),
    'example19 sync validator message should mention date format'
  );
  assert.equal(
    syncInvalidState.invalidSnapshot.rendered.row0DueDate,
    initialRow0DueDate,
    'example19 sync invalid should not mutate dueDate'
  );
  assert.equal(syncInvalidState.afterEscape.editorVisible, false, 'example19 editor should close after escape');

  await page.click('#run-async-validation');
  await waitForLogLabel('run-async-validation');
  const asyncValidationState = await readLogPayload('Missing example19 run-async-validation payload');
  assert.equal(asyncValidationState.pendingSeen, true, 'example19 async validation should show pending state');
  assert.equal(asyncValidationState.afterReject.editorInvalid, true, 'example19 async reject should keep editor invalid');
  assert.ok(
    String(asyncValidationState.afterReject.editorMessage || '').includes('exists'),
    'example19 async reject should expose duplicate message'
  );
  assert.equal(
    asyncValidationState.afterReject.rendered.row1Name,
    initialRow1Name,
    'example19 async reject should not mutate row1.name'
  );
  assert.equal(
    asyncValidationState.afterCommit.rendered.row1Name,
    'approved-name',
    'example19 async valid commit should update row1.name'
  );
  assert.equal(asyncValidationState.afterCommit.editorVisible, false, 'example19 editor should close after async commit');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample20Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example20.html`, { waitUntil: 'domcontentloaded' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');

  await page.click('#make-request');
  await waitForLogLabel('make-request');
  const requestState = await readLogPayload('Missing example20 make-request payload');
  assert.equal(requestState.snapshot.requestType, 'sort', 'example20 request envelope should use sort type');
  assert.equal(requestState.snapshot.guards.request, true, 'example20 request guard should be true');
  assert.ok(requestState.snapshot.transferablesFromRequest >= 1, 'example20 request should expose transferable buffers');

  await page.click('#make-cancel');
  await waitForLogLabel('make-cancel');
  const cancelState = await readLogPayload('Missing example20 make-cancel payload');
  assert.equal(cancelState.snapshot.cancelType, 'cancel', 'example20 cancel envelope should use cancel type');
  assert.equal(cancelState.snapshot.guards.cancel, true, 'example20 cancel guard should be true');

  await page.click('#make-response');
  await waitForLogLabel('make-response');
  const responseState = await readLogPayload('Missing example20 make-response payload');
  assert.equal(responseState.snapshot.responseStatus.ok, 'ok', 'example20 ok response status mismatch');
  assert.equal(responseState.snapshot.responseStatus.canceled, 'canceled', 'example20 canceled response status mismatch');
  assert.equal(responseState.snapshot.responseStatus.error, 'error', 'example20 error response status mismatch');
  assert.equal(responseState.snapshot.guards.ok, true, 'example20 ok response guard should be true');
  assert.equal(responseState.snapshot.guards.canceled, true, 'example20 canceled response guard should be true');
  assert.equal(responseState.snapshot.guards.error, true, 'example20 error response guard should be true');
  assert.ok(responseState.snapshot.transferablesFromResponse >= 1, 'example20 response should expose transferable buffers');

  await page.click('#post-message');
  await waitForLogLabel('post-message');
  const postState = await readLogPayload('Missing example20 post-message payload');
  assert.ok(postState.snapshot.postCallTransferables >= 1, 'example20 postMessage should carry transferables');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample21Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example21.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 90_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');

  await page.click('#sort-score-asc');
  await waitForLogLabel('sort-score-asc');
  const scoreAscState = await readLogPayload('Missing example21 score-asc payload');
  assert.equal(scoreAscState.snapshot.sortModel.length, 1, 'example21 single sort model should have one item');
  assert.equal(scoreAscState.snapshot.sortModel[0].columnId, 'score', 'example21 sort key should be score');
  assert.equal(scoreAscState.snapshot.sortModel[0].direction, 'asc', 'example21 sort direction should be asc');
  assert.ok(scoreAscState.snapshot.topRows.r0.score <= scoreAscState.snapshot.topRows.r1.score, 'example21 asc order mismatch');

  await page.click('#sort-score-desc-name-asc');
  await waitForLogLabel('sort-score-desc-name-asc');
  const multiState = await readLogPayload('Missing example21 multi-sort payload');
  assert.equal(multiState.snapshot.sortModel.length, 2, 'example21 multi-sort should keep two keys');
  assert.equal(multiState.snapshot.sortModel[0].columnId, 'score', 'example21 first sort key should be score');
  assert.equal(multiState.snapshot.sortModel[0].direction, 'desc', 'example21 first sort key direction should be desc');
  assert.equal(multiState.snapshot.sortModel[1].columnId, 'name', 'example21 second sort key should be name');
  assert.equal(multiState.snapshot.sortModel[1].direction, 'asc', 'example21 second sort key direction should be asc');

  await page.click('#clear-sort');
  await waitForLogLabel('clear-sort');
  const clearState = await readLogPayload('Missing example21 clear-sort payload');
  assert.equal(clearState.snapshot.sortModel.length, 0, 'example21 clear-sort should reset sort model');

  await page.click('#swap-1m');
  await waitForLogLabel('swap-1m');
  const swapState = await readLogPayload('Missing example21 swap-1m payload');
  assert.equal(swapState.snapshot.isSynthetic, true, 'example21 should switch to synthetic provider');

  await page.click('#sort-1m');
  await waitForLogLabel('sort-1m');
  const syntheticSortState = await readLogPayload('Missing example21 sort-1m payload');
  assert.equal(syntheticSortState.snapshot.sortModel.length, 2, 'example21 synthetic sort should keep two keys');
  assert.equal(syntheticSortState.snapshot.sortModel[0].columnId, 'score', 'example21 synthetic first key should be score');
  assert.equal(syntheticSortState.snapshot.sortModel[0].direction, 'desc', 'example21 synthetic first key direction should be desc');
  assert.ok(
    syntheticSortState.extra && syntheticSortState.extra.elapsedMs >= 0,
    'example21 synthetic sort should expose elapsedMs'
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample22Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example22.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 90_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');

  await page.click('#filter-text');
  await waitForLogLabel('filter-text');
  const textState = await readLogPayload('Missing example22 text filter payload');
  assert.equal(textState.snapshot.filterModel.name.kind, 'text', 'example22 text filter kind should be text');
  assert.ok(
    String(textState.snapshot.topRows.r0.name || '').toLowerCase().includes('alpha'),
    'example22 text filter should keep alpha rows on top'
  );

  await page.click('#filter-number');
  await waitForLogLabel('filter-number');
  const numberState = await readLogPayload('Missing example22 number filter payload');
  assert.equal(numberState.snapshot.filterModel.score.kind, 'number', 'example22 number filter kind should be number');
  assert.ok(numberState.snapshot.topRows.r0.score >= 200, 'example22 number filter lower bound mismatch');
  assert.ok(numberState.snapshot.topRows.r0.score <= 400, 'example22 number filter upper bound mismatch');

  await page.click('#filter-date');
  await waitForLogLabel('filter-date');
  const dateState = await readLogPayload('Missing example22 date filter payload');
  assert.equal(dateState.snapshot.filterModel.dueDate.kind, 'date', 'example22 date filter kind should be date');

  await page.click('#filter-set');
  await waitForLogLabel('filter-set');
  const setState = await readLogPayload('Missing example22 set filter payload');
  assert.equal(setState.snapshot.filterModel.region.kind, 'set', 'example22 set filter kind should be set');
  assert.ok(['KR', 'JP'].includes(setState.snapshot.topRows.r0.region), 'example22 set filter should keep KR/JP');

  await page.click('#filter-combined');
  await waitForLogLabel('filter-combined');
  const combinedState = await readLogPayload('Missing example22 combined filter payload');
  assert.ok(
    combinedState.snapshot.filterModel.name && combinedState.snapshot.filterModel.score && combinedState.snapshot.filterModel.region,
    'example22 combined filter should include multiple columns'
  );

  await page.click('#clear-filter');
  await waitForLogLabel('clear-filter');
  const clearState = await readLogPayload('Missing example22 clear filter payload');
  assert.equal(Object.keys(clearState.snapshot.filterModel).length, 0, 'example22 clear should reset filter model');

  await page.click('#swap-1m');
  await waitForLogLabel('swap-1m');
  const swapState = await readLogPayload('Missing example22 swap-1m payload');
  assert.equal(swapState.snapshot.isSynthetic, true, 'example22 should switch to synthetic provider');

  await page.click('#filter-1m');
  await waitForLogLabel('filter-1m');
  const syntheticState = await readLogPayload('Missing example22 filter-1m payload');
  assert.ok(
    syntheticState.snapshot.filterModel.score && syntheticState.snapshot.filterModel.region,
    'example22 synthetic filter should keep score and region clauses'
  );
  assert.ok(syntheticState.extra && syntheticState.extra.elapsedMs >= 0, 'example22 synthetic filter should expose elapsedMs');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample23Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example23.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 90_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');

  await page.click('#sort-only');
  await waitForLogLabel('sort-only');
  const sortOnlyState = await readLogPayload('Missing example23 sort-only payload');
  assert.equal(sortOnlyState.snapshot.sortModel.length, 2, 'example23 sort-only should set two sort keys');
  assert.equal(Object.keys(sortOnlyState.snapshot.filterModel).length, 0, 'example23 sort-only should clear filter model');
  assert.ok(
    sortOnlyState.snapshot.topRows.r0.score >= sortOnlyState.snapshot.topRows.r1.score,
    'example23 sort-only should be descending by score'
  );

  await page.click('#filter-only');
  await waitForLogLabel('filter-only');
  const filterOnlyState = await readLogPayload('Missing example23 filter-only payload');
  assert.equal(filterOnlyState.snapshot.sortModel.length, 0, 'example23 filter-only should clear sort model');
  assert.ok(
    filterOnlyState.snapshot.filterModel.name && filterOnlyState.snapshot.filterModel.score,
    'example23 filter-only should include name+score clauses'
  );
  assert.ok(
    String(filterOnlyState.snapshot.topRows.r0.name || '').toLowerCase().includes('target'),
    'example23 filter-only should keep target rows'
  );

  await page.click('#sort-filter');
  await waitForLogLabel('sort-filter');
  const sortFilterState = await readLogPayload('Missing example23 sort-filter payload');
  assert.equal(sortFilterState.snapshot.sortModel.length, 2, 'example23 sort-filter should keep sort model');
  assert.ok(
    sortFilterState.snapshot.filterModel.name && sortFilterState.snapshot.filterModel.region,
    'example23 sort-filter should keep filter model'
  );
  assert.ok(
    sortFilterState.snapshot.topRows.r0.score >= sortFilterState.snapshot.topRows.r1.score,
    'example23 sort-filter should preserve score desc on filtered rows'
  );

  await page.click('#clear-filter');
  await waitForLogLabel('clear-filter');
  const clearFilterState = await readLogPayload('Missing example23 clear-filter payload');
  assert.equal(Object.keys(clearFilterState.snapshot.filterModel).length, 0, 'example23 clear-filter should reset filter model');
  assert.equal(clearFilterState.snapshot.sortModel.length, 2, 'example23 clear-filter should preserve sort model');

  await page.click('#clear-all');
  await waitForLogLabel('clear-all');
  const clearAllState = await readLogPayload('Missing example23 clear-all payload');
  assert.equal(clearAllState.snapshot.sortModel.length, 0, 'example23 clear-all should reset sort model');
  assert.equal(Object.keys(clearAllState.snapshot.filterModel).length, 0, 'example23 clear-all should reset filter model');

  await page.click('#swap-1m');
  await waitForLogLabel('swap-1m');
  const swapState = await readLogPayload('Missing example23 swap-1m payload');
  assert.equal(swapState.snapshot.isSynthetic, true, 'example23 should switch to synthetic provider');

  await page.click('#run-1m');
  await waitForLogLabel('run-1m');
  const run1mState = await readLogPayload('Missing example23 run-1m payload');
  assert.equal(run1mState.snapshot.sortModel.length, 2, 'example23 run-1m should set sort model');
  assert.ok(
    run1mState.snapshot.filterModel.name && run1mState.snapshot.filterModel.score,
    'example23 run-1m should set filter model'
  );
  assert.ok(run1mState.snapshot.viewRowCount < 1_000_000, 'example23 run-1m should reduce row count via filter');
  assert.ok(run1mState.extra && run1mState.extra.elapsedMs >= 0, 'example23 run-1m should expose elapsedMs');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample24Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example24.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example24 initial payload');
  assert.equal(initialState.snapshot.width.header, 180, 'example24 should start at width 180');
  assert.equal(initialState.snapshot.width.body, 180, 'example24 body width should start at 180');
  const initialCenterRowDom = initialState.snapshot.dom.centerRowDom;

  await page.click('#run-min');
  await waitForLogLabel('run-min');
  const minState = await readLogPayload('Missing example24 run-min payload');
  assert.equal(minState.snapshot.width.header, 120, 'example24 run-min should clamp header width to min');
  assert.equal(minState.snapshot.width.body, 120, 'example24 run-min should clamp body width to min');
  assert.equal(minState.snapshot.events.moveCount, 1, 'example24 run-min should coalesce move events');
  assert.deepEqual(
    minState.snapshot.events.tail.slice(-3).map((event) => event.phase),
    ['start', 'move', 'end'],
    'example24 run-min should emit start/move/end phases'
  );
  assert.equal(
    minState.snapshot.events.tail[minState.snapshot.events.tail.length - 1].width,
    120,
    'example24 run-min end width mismatch'
  );

  await page.click('#run-max');
  await waitForLogLabel('run-max');
  const maxState = await readLogPayload('Missing example24 run-max payload');
  assert.equal(maxState.snapshot.width.header, 280, 'example24 run-max should clamp header width to max');
  assert.equal(maxState.snapshot.width.body, 280, 'example24 run-max should clamp body width to max');
  assert.equal(maxState.snapshot.events.moveCount, 2, 'example24 run-max should append one move event');
  assert.deepEqual(
    maxState.snapshot.events.tail.slice(-3).map((event) => event.phase),
    ['start', 'move', 'end'],
    'example24 run-max should emit start/move/end phases'
  );
  assert.equal(
    maxState.snapshot.events.tail[maxState.snapshot.events.tail.length - 1].width,
    280,
    'example24 run-max end width mismatch'
  );

  await page.click('#reset');
  await waitForLogLabel('reset');
  const resetState = await readLogPayload('Missing example24 reset payload');
  assert.equal(resetState.snapshot.width.header, 180, 'example24 reset should restore header width');
  assert.equal(resetState.snapshot.width.body, 180, 'example24 reset should restore body width');
  assert.equal(
    resetState.snapshot.dom.centerRowDom,
    initialCenterRowDom,
    'example24 reset should keep row pool size stable'
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample25Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example25.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example25 initial payload');
  assert.deepEqual(initialState.snapshot.headerOrder, ['name', 'score', 'region'], 'example25 initial center order mismatch');
  assert.equal(initialState.snapshot.dropIndicator.display, 'none', 'example25 indicator should be hidden initially');

  await page.click('#drag-name-after-score');
  await waitForLogLabel('drag-name-after-score');
  const afterDrag1 = await readLogPayload('Missing example25 drag-name-after-score payload');
  assert.deepEqual(afterDrag1.snapshot.headerOrder, ['score', 'name', 'region'], 'example25 drag-1 header order mismatch');
  assert.deepEqual(afterDrag1.snapshot.rowOrder, ['score', 'name', 'region'], 'example25 drag-1 row order mismatch');
  assert.ok(afterDrag1.snapshot.reorderEvents.length >= 1, 'example25 drag-1 should emit reorder event');
  assert.equal(afterDrag1.snapshot.dropIndicator.display, 'none', 'example25 indicator must be hidden after commit');
  assert.equal(
    afterDrag1.snapshot.reorderEvents[afterDrag1.snapshot.reorderEvents.length - 1].toIndex,
    2,
    'example25 drag-1 target index mismatch'
  );

  await page.click('#save-state');
  await waitForLogLabel('save-state');
  const savedState = await readLogPayload('Missing example25 save-state payload');
  assert.deepEqual(
    savedState.snapshot.state.columnOrder,
    ['id', 'score', 'name', 'region', 'status'],
    'example25 saved state columnOrder mismatch'
  );

  await page.click('#drag-region-before-score');
  await waitForLogLabel('drag-region-before-score');
  const afterDrag2 = await readLogPayload('Missing example25 drag-region-before-score payload');
  assert.deepEqual(afterDrag2.snapshot.rowOrder, ['region', 'score', 'name'], 'example25 drag-2 center order mismatch');

  await page.click('#restore-state');
  await waitForLogLabel('restore-state');
  const restoredState = await readLogPayload('Missing example25 restore-state payload');
  assert.deepEqual(
    restoredState.snapshot.state.columnOrder,
    ['id', 'score', 'name', 'region', 'status'],
    'example25 restore state columnOrder mismatch'
  );
  assert.deepEqual(restoredState.snapshot.headerOrder, ['score', 'name', 'region'], 'example25 restore header order mismatch');
  assert.deepEqual(restoredState.snapshot.rowOrder, ['score', 'name', 'region'], 'example25 restore row order mismatch');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample26Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example26.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example26 initial payload');
  assert.deepEqual(initialState.snapshot.header.left, ['id'], 'example26 initial left pinned mismatch');
  assert.deepEqual(initialState.snapshot.header.right, ['status'], 'example26 initial right pinned mismatch');
  const initialCenterRowDom = initialState.snapshot.dom.centerRowDom;

  await page.click('#swap-1m');
  await waitForLogLabel('swap-1m');
  const swappedState = await readLogPayload('Missing example26 swap-1m payload');
  assert.equal(swappedState.snapshot.isSynthetic, true, 'example26 should switch to synthetic provider');
  assert.equal(swappedState.snapshot.rowModel.viewRowCount, 1_000_000, 'example26 synthetic rowCount mismatch');

  await page.click('#stress-ops');
  await waitForLogLabel('stress-ops');
  const stressState = await readLogPayload('Missing example26 stress-ops payload');
  assert.equal(stressState.snapshot.isSynthetic, true, 'example26 stress should stay synthetic');
  assert.equal(stressState.snapshot.rowModel.viewRowCount, 1_000_000, 'example26 stress rowCount mismatch');
  assert.equal(stressState.extra.iterations, 120, 'example26 stress iteration mismatch');
  assert.equal(stressState.extra.rowDomStable, true, 'example26 stress should keep row DOM stable');
  assert.equal(stressState.extra.centerCellStable, true, 'example26 stress should keep center cell pool stable');
  assert.ok(
    stressState.extra.maxFrameDeltaMs < 85,
    `example26 stress max frame delta should stay bounded, got ${stressState.extra.maxFrameDeltaMs}`
  );
  assert.ok(
    stressState.extra.frameOver50Count <= 6,
    `example26 stress frameOver50Count should stay low, got ${stressState.extra.frameOver50Count}`
  );

  await page.click('#pin-name-left');
  await waitForLogLabel('pin-name-left');
  const pinLeftState = await readLogPayload('Missing example26 pin-name-left payload');
  assert.deepEqual(pinLeftState.snapshot.header.left, ['id', 'name'], 'example26 pin-name-left mismatch');
  assert.equal(pinLeftState.snapshot.state.pinnedColumns.name, 'left', 'example26 name pin state mismatch');

  await page.click('#pin-region-right');
  await waitForLogLabel('pin-region-right');
  const pinRightState = await readLogPayload('Missing example26 pin-region-right payload');
  assert.deepEqual(pinRightState.snapshot.header.right, ['region', 'status'], 'example26 pin-region-right mismatch');
  assert.equal(pinRightState.snapshot.state.pinnedColumns.region, 'right', 'example26 region pin state mismatch');

  await page.click('#hide-score');
  await waitForLogLabel('hide-score');
  const hideState = await readLogPayload('Missing example26 hide-score payload');
  assert.ok(
    Array.isArray(hideState.snapshot.state.hiddenColumnIds) && hideState.snapshot.state.hiddenColumnIds.includes('score'),
    'example26 hide-score should record hidden column'
  );
  assert.ok(
    !hideState.snapshot.header.center.includes('score'),
    `example26 hide-score should remove score from center headers: ${hideState.snapshot.header.center.join(',')}`
  );

  await page.click('#save-state');
  await waitForLogLabel('save-state');
  const savedState = await readLogPayload('Missing example26 save-state payload');
  assert.equal(savedState.snapshot.hasSavedState, true, 'example26 should keep saved state flag');

  await page.click('#mutate');
  await waitForLogLabel('mutate');
  const mutatedState = await readLogPayload('Missing example26 mutate payload');
  assert.equal(mutatedState.snapshot.state.pinnedColumns.name ?? null, null, 'example26 mutate should unpin name');
  assert.equal(mutatedState.snapshot.state.pinnedColumns.region ?? null, null, 'example26 mutate should unpin region');
  assert.ok(!mutatedState.snapshot.state.hiddenColumnIds.includes('score'), 'example26 mutate should show score');

  await page.click('#restore-state');
  await waitForLogLabel('restore-state');
  const restoredState = await readLogPayload('Missing example26 restore-state payload');
  assert.equal(restoredState.snapshot.state.pinnedColumns.name, 'left', 'example26 restore should recover name pin');
  assert.equal(restoredState.snapshot.state.pinnedColumns.region, 'right', 'example26 restore should recover region pin');
  assert.ok(restoredState.snapshot.state.hiddenColumnIds.includes('score'), 'example26 restore should hide score again');
  assert.deepEqual(restoredState.snapshot.header.left, ['id', 'name'], 'example26 restore left pinned mismatch');
  assert.deepEqual(restoredState.snapshot.header.right, ['region', 'status'], 'example26 restore right pinned mismatch');
  assert.equal(
    restoredState.snapshot.dom.centerRowDom,
    initialCenterRowDom,
    'example26 should preserve row pool size while toggling pin/hide'
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample27Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example27.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readLogPayload(missingMessage) {
    return page.evaluate((message) => {
      const logElement = document.querySelector('#log');
      if (!logElement || !logElement.textContent) {
        throw new Error(message);
      }
      return JSON.parse(logElement.textContent);
    }, missingMessage);
  }

  await waitForLogLabel('initial');
  const initialState = await readLogPayload('Missing example27 initial payload');
  assert.deepEqual(initialState.snapshot.header.left, ['id'], 'example27 initial left pinned mismatch');
  assert.deepEqual(initialState.snapshot.header.center, ['name', 'score', 'region'], 'example27 initial center order mismatch');
  assert.deepEqual(initialState.snapshot.header.right, ['status'], 'example27 initial right pinned mismatch');
  assert.equal(initialState.snapshot.nameWidth, 220, 'example27 initial width mismatch');

  await page.click('#run-resize');
  await waitForLogLabel('run-resize');
  const resizeState = await readLogPayload('Missing example27 run-resize payload');
  assert.equal(resizeState.snapshot.nameWidth, 260, 'example27 resize width mismatch');
  const resizePhases = resizeState.snapshot.events.resizeTail.map((event) => event.phase);
  assert.ok(resizePhases.includes('start'), `example27 resize should include start, got ${resizePhases.join(',')}`);
  assert.ok(resizePhases.includes('move'), `example27 resize should include move, got ${resizePhases.join(',')}`);

  await page.click('#run-reorder');
  await waitForLogLabel('run-reorder');
  const reorderState = await readLogPayload('Missing example27 run-reorder payload');
  assert.deepEqual(reorderState.snapshot.header.center, ['name', 'region', 'score'], 'example27 reorder center order mismatch');
  assert.equal(reorderState.snapshot.dropIndicator.display, 'none', 'example27 drop indicator should be hidden after drop');
  assert.ok(reorderState.snapshot.events.reorderTail.length > 0, 'example27 reorder event should be emitted');

  await page.click('#run-pin-hide');
  await waitForLogLabel('run-pin-hide');
  const pinHideState = await readLogPayload('Missing example27 run-pin-hide payload');
  assert.deepEqual(pinHideState.snapshot.header.left, ['id', 'name'], 'example27 pin-left result mismatch');
  assert.deepEqual(pinHideState.snapshot.header.center, ['region'], 'example27 hide result mismatch');
  assert.ok(pinHideState.snapshot.state.hiddenColumnIds.includes('score'), 'example27 hidden score state mismatch');
  assert.equal(pinHideState.snapshot.state.pinnedColumns.name, 'left', 'example27 name pin state mismatch');

  await page.click('#run-all');
  await waitForLogLabel('run-all');
  const runAllState = await readLogPayload('Missing example27 run-all payload');
  assert.equal(runAllState.snapshot.nameWidth, 260, 'example27 run-all width mismatch');
  assert.deepEqual(runAllState.snapshot.header.left, ['id', 'name'], 'example27 run-all left pinned mismatch');
  assert.deepEqual(runAllState.snapshot.header.center, ['region'], 'example27 run-all center order mismatch');
  assert.ok(runAllState.snapshot.state.hiddenColumnIds.includes('score'), 'example27 run-all hidden score mismatch');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample28Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example28.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--left .hgrid__indicator-checkbox', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readSnapshot() {
    return page.evaluate(() => {
      const exampleApi = window.__example28;
      if (!exampleApi || typeof exampleApi.getSnapshot !== 'function') {
        throw new Error('Missing window.__example28.getSnapshot');
      }
      return exampleApi.getSnapshot();
    });
  }

  await waitForLogLabel('initial');
  const initialSnapshot = await readSnapshot();
  assert.equal(initialSnapshot.checkAllScope, 'filtered', 'example28 initial checkAllScope mismatch');
  assert.equal(Boolean(initialSnapshot.checkAll), true, 'example28 should render indicator checkAll');
  assert.equal(Boolean(initialSnapshot.firstVisibleIndicator), true, 'example28 should render first indicator snapshot');
  assert.equal(
    /^\d+$/.test(String(initialSnapshot.firstVisibleIndicator.rowNumber ?? '')),
    true,
    'example28 row number indicator should render numeric text'
  );
  assert.equal(
    typeof initialSnapshot.firstVisibleIndicator.status === 'string',
    true,
    'example28 status indicator should render text'
  );
  const externalStateColumnCount = await page.locator('.hgrid__cell[data-column-id="__state"]').count();
  assert.equal(externalStateColumnCount, 0, 'example28 should not render external __state column');

  await page.click('.hgrid__row--left .hgrid__indicator-checkbox');
  await waitAnimationFrame(page);
  const afterFirstRowToggle = await readSnapshot();
  assert.equal(afterFirstRowToggle.selection.rowRanges.length, 1, 'example28 row checkbox should create one row range');
  assert.equal(afterFirstRowToggle.checkAll.indeterminate, true, 'example28 checkAll should become indeterminate after single toggle');

  await page.click('.hgrid__indicator-checkall');
  await waitAnimationFrame(page);
  const afterCheckAll = await readSnapshot();
  assert.equal(afterCheckAll.checkAll.checked, true, 'example28 checkAll click should mark all rows in scope');
  assert.equal(afterCheckAll.selection.rowRanges.length > 0, true, 'example28 checkAll should keep rowRanges');

  await page.click('#filter-active');
  await waitForLogLabel('filter-active');
  const filteredSnapshot = await readSnapshot();
  assert.equal(filteredSnapshot.hasActiveFilter, true, 'example28 should mark active filter');

  await page.click('#scope-viewport');
  await waitForLogLabel('scope-viewport');
  const viewportScopeSnapshot = await readSnapshot();
  assert.equal(viewportScopeSnapshot.checkAllScope, 'viewport', 'example28 scope should switch to viewport');

  await page.click('#filter-clear');
  await waitForLogLabel('filter-clear');
  const clearedSnapshot = await readSnapshot();
  assert.equal(clearedSnapshot.hasActiveFilter, false, 'example28 should clear active filter flag');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample29Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example29.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__header-row--group .hgrid__header-cell--group', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readSnapshot() {
    return page.evaluate(() => {
      const exampleApi = window.__example29;
      if (!exampleApi || typeof exampleApi.getSnapshot !== 'function') {
        throw new Error('Missing window.__example29.getSnapshot');
      }
      return exampleApi.getSnapshot();
    });
  }

  await waitForLogLabel('initial');
  const initialSnapshot = await readSnapshot();
  assert.ok(initialSnapshot.groupRowCount > 0, 'example29 should render group header rows');
  assert.ok(initialSnapshot.groupCellCount > 0, 'example29 should render group header cells');
  assert.equal(initialSnapshot.cssHeaderRowHeight, '32px', 'example29 header row height token mismatch');
  assert.equal(initialSnapshot.headerZones.left.groupRows.length >= 1, true, 'example29 left zone group rows missing');
  assert.equal(initialSnapshot.headerZones.center.groupRows.length >= 1, true, 'example29 center zone group rows missing');
  assert.ok(
    initialSnapshot.headerZones.center.groupRows[0].some((cell) => cell.text === 'Participant'),
    'example29 center top group row should include Participant'
  );
  assert.ok(
    initialSnapshot.headerZones.center.groupRows[0].every((cell) => cell.ariaColspan !== null),
    'example29 group cells should include aria-colspan'
  );
  assert.equal(
    initialSnapshot.headerZones.left.visibleLeafColumns.includes('id'),
    true,
    'example29 left pinned leaf should include id'
  );
  assert.equal(
    initialSnapshot.headerZones.right.visibleLeafColumns.includes('updatedAt'),
    true,
    'example29 right pinned leaf should include updatedAt'
  );

  await page.click('#pin-country-right');
  await waitForLogLabel('pin-country-right');
  const pinnedSnapshot = await readSnapshot();
  assert.equal(
    pinnedSnapshot.headerZones.right.visibleLeafColumns.includes('country'),
    true,
    'example29 country should move to right pinned leaf columns'
  );
  assert.equal(
    pinnedSnapshot.headerZones.center.visibleLeafColumns.includes('country'),
    false,
    'example29 country should leave center leaf columns after pin'
  );

  await page.click('#toggle-balance');
  await waitForLogLabel('hide-balance');
  const hiddenSnapshot = await readSnapshot();
  assert.equal(
    hiddenSnapshot.headerZones.center.visibleLeafColumns.includes('balance'),
    false,
    'example29 balance should be hidden from center leaf columns'
  );

  await page.click('#reorder-language');
  await waitForLogLabel('reorder-language');
  const reorderSnapshot = await readSnapshot();
  const centerLeafColumns = reorderSnapshot.headerZones.center.visibleLeafColumns;
  assert.equal(
    centerLeafColumns[centerLeafColumns.length - 1],
    'language',
    `example29 language should move to center tail, got ${centerLeafColumns.join(',')}`
  );

  await page.click('#reset');
  await waitForLogLabel('reset');
  const resetSnapshot = await readSnapshot();
  assert.equal(
    resetSnapshot.headerZones.center.visibleLeafColumns.includes('country'),
    true,
    'example29 reset should restore country center pin'
  );
  assert.equal(
    resetSnapshot.headerZones.center.visibleLeafColumns.includes('balance'),
    true,
    'example29 reset should restore balance visibility'
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample30Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example30.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function waitForLogLabel(label) {
    await page.waitForFunction(
      (expectedLabel) => {
        const logElement = document.querySelector('#log');
        if (!logElement || !logElement.textContent) {
          return false;
        }
        try {
          const payload = JSON.parse(logElement.textContent);
          return payload.label === expectedLabel;
        } catch (_error) {
          return false;
        }
      },
      label,
      { timeout: 20_000 }
    );
  }

  async function readSnapshot() {
    return page.evaluate(() => {
      const exampleApi = window.__example30;
      if (!exampleApi || typeof exampleApi.getSnapshot !== 'function') {
        throw new Error('Missing window.__example30.getSnapshot');
      }
      return exampleApi.getSnapshot();
    });
  }

  await waitForLogLabel('initial');
  const initialSnapshot = await readSnapshot();
  assert.equal(initialSnapshot.rowCount, 10_000_000, 'example30 should start with 10M remote rows');
  assert.ok(initialSnapshot.serverRequestCount > 0, 'example30 should request remote data on first paint');

  await page.click('#sort-desc');
  await waitForLogLabel('sort-desc');
  const sortSnapshot = await readSnapshot();
  assert.equal(
    sortSnapshot.queryModel.sortModel[0]?.direction,
    'desc',
    'example30 sort-desc should update remote sort query'
  );

  await page.click('#filter-active');
  await waitForLogLabel('filter-active');
  await page.waitForFunction(
    () => {
      const api = window.__example30;
      if (!api || typeof api.getSnapshot !== 'function') {
        return false;
      }
      const snapshot = api.getSnapshot();
      return typeof snapshot.rowCount === 'number' && snapshot.rowCount < 10_000_000;
    },
    { timeout: 20_000 }
  );
  const filterSnapshot = await readSnapshot();
  assert.ok(filterSnapshot.rowCount > 0, 'example30 filter should keep positive row count');
  assert.ok(filterSnapshot.rowCount < 10_000_000, 'example30 filter should reduce row count');

  await page.click('#clear-query');
  await waitForLogLabel('clear-query');
  await page.waitForFunction(
    () => {
      const api = window.__example30;
      if (!api || typeof api.getSnapshot !== 'function') {
        return false;
      }
      const snapshot = api.getSnapshot();
      return snapshot.rowCount === 10_000_000;
    },
    { timeout: 20_000 }
  );
  const clearSnapshot = await readSnapshot();
  assert.equal(clearSnapshot.rowCount, 10_000_000, 'example30 clear-query should restore total row count');

  await page.click('#scroll-bottom');
  await waitForLogLabel('scroll-bottom');
  await page.waitForFunction(
    () => {
      const api = window.__example30;
      if (!api || typeof api.getSnapshot !== 'function') {
        return false;
      }
      const snapshot = api.getSnapshot();
      return typeof snapshot.firstVisibleId === 'number' && snapshot.firstVisibleId > 0;
    },
    { timeout: 20_000 }
  );
  const bottomSnapshot = await readSnapshot();
  assert.ok(
    typeof bottomSnapshot.firstVisibleId === 'number' && bottomSnapshot.firstVisibleId > 9_000_000,
    `example30 bottom scroll should move near tail rows, got ${bottomSnapshot.firstVisibleId}`
  );

  await page.click('#inspect');
  await waitForLogLabel('inspect');
  const inspectSnapshot = await readSnapshot();
  assert.ok(
    inspectSnapshot.cacheState.cachedBlockIndexes.length > 0,
    'example30 should expose non-empty cache snapshot'
  );
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample31Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example31.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function readSnapshot() {
    return page.evaluate(() => {
      const exampleApi = window.__example31;
      if (!exampleApi || typeof exampleApi.getSnapshot !== 'function') {
        throw new Error('Missing window.__example31.getSnapshot');
      }
      return exampleApi.getSnapshot();
    });
  }

  const initialSnapshot = await readSnapshot();
  assert.equal(initialSnapshot.groupingMode, 'client', 'example31 should start in client grouping mode');
  assert.ok(Array.isArray(initialSnapshot.groupModel), 'example31 should expose group model');
  assert.ok(initialSnapshot.groupModel.length > 0, 'example31 should start with group model');
  assert.ok(initialSnapshot.groupRowCount > 0, 'example31 should render group rows');

  await page.evaluate(async () => {
    const api = window.__example31;
    if (!api || typeof api.collapseFirstGroup !== 'function') {
      throw new Error('Missing window.__example31.collapseFirstGroup');
    }
    await api.collapseFirstGroup();
  });
  await waitAnimationFrame(page);
  const collapsedSnapshot = await readSnapshot();
  assert.equal(collapsedSnapshot.firstGroupExpanded, false, 'example31 first group should be collapsed');

  await page.evaluate(async () => {
    const api = window.__example31;
    if (!api || typeof api.expandFirstGroup !== 'function') {
      throw new Error('Missing window.__example31.expandFirstGroup');
    }
    await api.expandFirstGroup();
  });
  await waitAnimationFrame(page);
  const expandedSnapshot = await readSnapshot();
  assert.equal(expandedSnapshot.firstGroupExpanded, true, 'example31 first group should be expanded');

  await page.click('#mode-server');
  await waitAnimationFrame(page);
  const serverModeSnapshot = await readSnapshot();
  assert.equal(serverModeSnapshot.groupingMode, 'server', 'example31 should switch grouping mode to server');

  await page.click('#mode-client');
  await waitAnimationFrame(page);
  const clientModeSnapshot = await readSnapshot();
  assert.equal(clientModeSnapshot.groupingMode, 'client', 'example31 should switch grouping mode back to client');

  const perfMetrics = await measureUiThreadLagDuring(page, '__example31.runPerfScenario');
  assert.ok(perfMetrics.tickCount > 4, 'example31 perf probe should collect heartbeat ticks');
  assert.ok(
    perfMetrics.maxGapMs < MAX_GROUPING_WORKER_EXAMPLE_UI_GAP_MS,
    `example31 grouping should avoid long UI freeze, maxGap=${perfMetrics.maxGapMs.toFixed(1)}ms`
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample32Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example32.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function readSnapshot() {
    return page.evaluate(() => {
      const api = window.__example32;
      if (!api || typeof api.getSnapshot !== 'function') {
        throw new Error('Missing window.__example32.getSnapshot');
      }
      return api.getSnapshot();
    });
  }

  const initialSnapshot = await readSnapshot();
  assert.equal(initialSnapshot.mode, 'client', 'example32 should start in client mode');
  assert.ok(initialSnapshot.rowCount >= 4, 'example32 should render client tree rows');
  assert.equal(initialSnapshot.hasTreeCell, true, 'example32 should render tree cells');

  await page.click('#mode-server');
  await waitAnimationFrame(page);
  const serverSnapshot = await readSnapshot();
  assert.equal(serverSnapshot.mode, 'server', 'example32 should switch to server tree mode');

  await page.click('#expand-root-100');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);
  await page.waitForFunction(() => {
    const api = window.__example32;
    if (!api || typeof api.getSnapshot !== 'function') {
      return false;
    }
    const snapshot = api.getSnapshot();
    return snapshot.lazyLoadCount > 0 && snapshot.rowCount >= 3;
  });
  const expandedSnapshot = await readSnapshot();
  assert.ok(expandedSnapshot.rowCount >= 3, 'example32 root expand should materialize lazy children');
  assert.ok(expandedSnapshot.lazyLoadCount >= 1, 'example32 should invoke lazy loader on expand');

  const perfMetrics = await measureUiThreadLagDuring(page, '__example32.runPerfScenario');
  assert.ok(perfMetrics.tickCount > 4, 'example32 perf probe should collect heartbeat ticks');
  assert.ok(
    perfMetrics.maxGapMs < MAX_TREE_WORKER_EXAMPLE_UI_GAP_MS,
    `example32 tree should avoid long UI freeze, maxGap=${perfMetrics.maxGapMs.toFixed(1)}ms`
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample33Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example33.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function readSnapshot() {
    return page.evaluate(() => {
      const api = window.__example33;
      if (!api || typeof api.getSnapshot !== 'function') {
        throw new Error('Missing window.__example33.getSnapshot');
      }
      return api.getSnapshot();
    });
  }

  await page.waitForFunction(() => {
    const api = window.__example33;
    if (!api || typeof api.getSnapshot !== 'function') {
      return false;
    }
    const snapshot = api.getSnapshot();
    return (
      snapshot &&
      Array.isArray(snapshot.headerTexts) &&
      snapshot.headerTexts.some((text) => text.includes('Jan'))
    );
  });
  const initialSnapshot = await readSnapshot();
  assert.equal(initialSnapshot.pivotingMode, 'client', 'example33 should start in client pivot mode');
  assert.equal(initialSnapshot.pivotModel[0]?.columnId, 'month', 'example33 initial pivot column should be month');
  assert.equal(initialSnapshot.pivotValues[0]?.columnId, 'sales', 'example33 initial pivot value should target sales');
  assert.equal(initialSnapshot.groupModel[0]?.columnId, 'region', 'example33 initial row group should be region');
  assert.ok(initialSnapshot.bodyTexts.includes('KR'), 'example33 should render region aggregate row');

  await page.click('#pivot-product-month');
  await waitAnimationFrame(page);
  await page.waitForFunction(() => {
    const api = window.__example33;
    if (!api || typeof api.getSnapshot !== 'function') {
      return false;
    }
    const snapshot = api.getSnapshot();
    return (
      snapshot &&
      Array.isArray(snapshot.groupModel) &&
      snapshot.groupModel[0]?.columnId === 'product' &&
      Array.isArray(snapshot.pivotValues) &&
      snapshot.pivotValues[0]?.type === 'avg'
    );
  });
  const productSnapshot = await readSnapshot();
  assert.equal(productSnapshot.groupModel[0]?.columnId, 'product', 'example33 should switch row group to product');
  assert.equal(productSnapshot.pivotValues[0]?.type, 'avg', 'example33 should switch pivot aggregate to avg');

  await page.click('#clear-pivot');
  await waitAnimationFrame(page);
  await page.waitForFunction(() => {
    const api = window.__example33;
    if (!api || typeof api.getSnapshot !== 'function') {
      return false;
    }
    const snapshot = api.getSnapshot();
    return (
      snapshot &&
      Array.isArray(snapshot.pivotModel) &&
      snapshot.pivotModel.length === 0 &&
      Array.isArray(snapshot.headerTexts) &&
      snapshot.headerTexts.some((text) => typeof text === 'string' && text.toLowerCase() === 'month')
    );
  });
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);
  let clearedSnapshot = await readSnapshot();
  if (!clearedSnapshot.headerTexts.some((text) => typeof text === 'string' && text.toLowerCase() === 'month')) {
    await page.waitForFunction(() => {
      const api = window.__example33;
      if (!api || typeof api.getSnapshot !== 'function') {
        return false;
      }
      const snapshot = api.getSnapshot();
      return (
        snapshot &&
        Array.isArray(snapshot.headerTexts) &&
        snapshot.headerTexts.some((text) => typeof text === 'string' && text.toLowerCase() === 'month')
      );
    });
    clearedSnapshot = await readSnapshot();
  }
  assert.equal(clearedSnapshot.pivotModel.length, 0, 'example33 clear-pivot should reset pivot model');
  assert.ok(
    clearedSnapshot.headerTexts.some((text) => typeof text === 'string' && text.toLowerCase() === 'month'),
    'example33 clear should restore base month column'
  );

  await page.click('#set-100k');
  await waitAnimationFrame(page);
  await page.click('#pivot-region-month');
  await waitAnimationFrame(page);
  await page.waitForFunction(() => {
    const api = window.__example33;
    if (!api || typeof api.getSnapshot !== 'function') {
      return false;
    }
    const snapshot = api.getSnapshot();
    return snapshot && snapshot.pivotModel[0]?.columnId === 'month' && snapshot.groupModel[0]?.columnId === 'region';
  }, null, { timeout: 60_000 });

  const perfMetrics = await measureUiThreadLagDuring(page, '__example33.runPerfScenario');
  assert.ok(perfMetrics.tickCount > 4, 'example33 perf probe should collect heartbeat ticks');
  assert.ok(
    perfMetrics.maxGapMs < MAX_PIVOT_WORKER_EXAMPLE_UI_GAP_MS,
    `example33 pivot should avoid long UI freeze, maxGap=${perfMetrics.maxGapMs.toFixed(1)}ms`
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample34Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example34.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  async function readSnapshot() {
    return page.evaluate(() => {
      const api = window.__example34;
      if (!api || typeof api.getSnapshot !== 'function') {
        throw new Error('Missing window.__example34.getSnapshot');
      }
      return api.getSnapshot();
    });
  }

  const initialSnapshot = await readSnapshot();
  assert.equal(initialSnapshot.row0.name, 'Customer-1', 'example34 should render initial row0 name');
  assert.equal(initialSnapshot.row1.name, 'Customer-2', 'example34 should render initial row1 name');

  const copiedTsv = await page.evaluate(() => {
    const api = window.__example34;
    if (!api || typeof api.simulateCopy !== 'function') {
      throw new Error('Missing window.__example34.simulateCopy');
    }
    return api.simulateCopy();
  });
  assert.equal(
    copiedTsv,
    'Customer-2\tidle\nCustomer-3\tactive\nCustomer-4\tidle',
    'example34 should copy selected B2:C4 range as TSV'
  );

  await page.evaluate(async () => {
    const api = window.__example34;
    if (!api || typeof api.simulatePaste !== 'function') {
      throw new Error('Missing window.__example34.simulatePaste');
    }
    await api.simulatePaste('<b>Safe</b>\tactive\nLiteral\tidle');
  });
  await waitAnimationFrame(page);

  const afterPasteSnapshot = await readSnapshot();
  assert.equal(afterPasteSnapshot.row1.name, '<b>Safe</b>', 'example34 should paste plain text into editable name cell');
  assert.equal(afterPasteSnapshot.row1.status, 'active', 'example34 should paste status cell');
  assert.equal(afterPasteSnapshot.row2.name, 'Literal', 'example34 should paste second row name');
  assert.equal(afterPasteSnapshot.row2.status, 'idle', 'example34 should paste second row status');
  assert.equal(afterPasteSnapshot.hasInjectedHtmlNode, false, 'example34 should not inject HTML nodes from clipboard');

  await page.evaluate(async () => {
    const api = window.__example34;
    if (!api || typeof api.simulateHtmlOnlyPaste !== 'function') {
      throw new Error('Missing window.__example34.simulateHtmlOnlyPaste');
    }
    await api.simulateHtmlOnlyPaste();
  });
  await waitAnimationFrame(page);

  const afterHtmlOnlySnapshot = await readSnapshot();
  assert.equal(afterHtmlOnlySnapshot.row1.name, '<b>Safe</b>', 'example34 html-only paste should not overwrite name');
  assert.equal(afterHtmlOnlySnapshot.row1.status, 'active', 'example34 html-only paste should not overwrite status');
  assert.equal(afterHtmlOnlySnapshot.row2.name, 'Literal', 'example34 html-only paste should keep second row name');
  assert.equal(afterHtmlOnlySnapshot.hasInjectedHtmlNode, false, 'example34 html-only paste should not inject HTML nodes');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample35Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example35.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const visibleExportSummary = await page.evaluate(async () => {
    const api = window.__example35;
    if (!api || typeof api.exportVisibleCsv !== 'function' || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example35 exportVisibleCsv/getSnapshot');
    }

    const result = await api.exportVisibleCsv();
    const snapshot = api.getSnapshot();
    return {
      format: result.format,
      scope: result.scope,
      rowCount: result.rowCount,
      canceled: result.canceled,
      firstLine: result.content.split('\n')[0],
      preview: snapshot.preview
    };
  });

  assert.equal(visibleExportSummary.format, 'csv', 'example35 visible export should produce csv');
  assert.equal(visibleExportSummary.scope, 'visible', 'example35 visible export should use visible scope');
  assert.equal(visibleExportSummary.canceled, false, 'example35 visible export should not cancel');
  assert.ok(visibleExportSummary.rowCount > 0, 'example35 visible export should include rows');
  assert.ok(visibleExportSummary.rowCount < 30_000, 'example35 visible export should not export all rows');
  assert.equal(
    visibleExportSummary.firstLine,
    'ID,Name,Status,Region,Score,Updated At',
    'example35 visible export should include csv header'
  );

  const selectionExportSummary = await page.evaluate(async () => {
    const api = window.__example35;
    if (!api || typeof api.selectDemoRange !== 'function' || typeof api.exportSelectionTsv !== 'function') {
      throw new Error('Missing window.__example35 selection APIs');
    }

    api.selectDemoRange();
    const result = await api.exportSelectionTsv();
    return {
      format: result.format,
      scope: result.scope,
      rowCount: result.rowCount,
      canceled: result.canceled,
      firstLine: result.content.split('\n')[0]
    };
  });

  assert.equal(selectionExportSummary.format, 'tsv', 'example35 selection export should produce tsv');
  assert.equal(selectionExportSummary.scope, 'selection', 'example35 selection export should use selection scope');
  assert.equal(selectionExportSummary.canceled, false, 'example35 selection export should not cancel');
  assert.equal(selectionExportSummary.rowCount, 5, 'example35 selection export should include selected rows only');
  assert.ok(
    selectionExportSummary.firstLine.includes('Customer-11\tactive'),
    'example35 selection export should start from selected range'
  );

  const cancelSummary = await page.evaluate(async () => {
    const api = window.__example35;
    if (!api || typeof api.runCancelableAllExport !== 'function') {
      throw new Error('Missing window.__example35.runCancelableAllExport');
    }

    const outcome = await api.runCancelableAllExport();
    const snapshot = api.getSnapshot();
    return {
      canceled: outcome.result.canceled,
      rowCount: outcome.result.rowCount,
      status: outcome.progress.status,
      processedRows: outcome.progress.processedRows,
      totalRows: outcome.progress.totalRows,
      preview: snapshot.preview
    };
  });

  assert.equal(cancelSummary.canceled, true, 'example35 all export should support cancellation');
  assert.ok(cancelSummary.rowCount >= 2000, 'example35 cancel path should process chunked rows before cancellation');
  assert.ok(cancelSummary.rowCount < 30_000, 'example35 cancel path should stop before all rows');
  assert.equal(cancelSummary.status, 'canceled', 'example35 cancel path should report canceled progress status');
  assert.equal(cancelSummary.totalRows, 30_000, 'example35 should report total rows for all export progress');
  assert.ok(cancelSummary.preview.startsWith('ID,Name,Status,Region,Score,Updated At'), 'example35 preview should show csv header');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample36Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example36.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const exportSummary = await page.evaluate(async () => {
    const api = window.__example36;
    if (!api || typeof api.exportSelectionSummary !== 'function') {
      throw new Error('Missing window.__example36.exportSelectionSummary');
    }
    return api.exportSelectionSummary();
  });

  assert.equal(exportSummary.scope, 'selection', 'example36 should export selection scope');
  assert.equal(exportSummary.rowCount, 5, 'example36 selection export should include 5 rows');
  assert.equal(exportSummary.canceled, false, 'example36 export should not be canceled');
  assert.equal(exportSummary.delegated, false, 'example36 export should run client-side');
  assert.equal(exportSummary.headerName, 'Name', 'example36 export should include Name header in column B');
  assert.equal(exportSummary.scoreType, 'n', 'example36 score column should be numeric in xlsx');
  assert.ok(
    typeof exportSummary.dateFormat === 'string' && exportSummary.dateFormat.includes('yyyy-mm-dd'),
    `example36 date format should be applied, got ${exportSummary.dateFormat}`
  );
  assert.equal(exportSummary.hasBuffer, true, 'example36 export result should include binary buffer');

  const headerImportResult = await page.evaluate(async () => {
    const api = window.__example36;
    if (!api || typeof api.runImport !== 'function') {
      throw new Error('Missing window.__example36.runImport');
    }
    return api.runImport('header');
  });

  assert.equal(headerImportResult.importedRows, 2, 'example36 header import should import 2 valid rows');
  assert.equal(headerImportResult.updatedRows, 2, 'example36 header import should update 2 rows');
  assert.equal(headerImportResult.addedRows, 0, 'example36 header import should not append rows');
  assert.equal(headerImportResult.issues.length, 1, 'example36 header import should report 1 validation issue');
  assert.ok(
    headerImportResult.mappedColumns.includes('name') && headerImportResult.mappedColumns.includes('score'),
    'example36 header import should map expected columns'
  );

  const afterHeaderSnapshot = await page.evaluate(() => {
    const api = window.__example36;
    if (!api || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example36.getSnapshot');
    }
    return api.getSnapshot();
  });
  assert.equal(afterHeaderSnapshot.row0.name, 'Imported-A', 'example36 row0 should be updated by import');
  assert.equal(afterHeaderSnapshot.row1.name, 'Imported-C', 'example36 row1 should be updated by import');

  const idImportResult = await page.evaluate(async () => {
    const api = window.__example36;
    if (!api || typeof api.runImport !== 'function') {
      throw new Error('Missing window.__example36.runImport');
    }
    return api.runImport('id');
  });

  assert.equal(idImportResult.importedRows, 2, 'example36 id import should import 2 valid rows');
  assert.equal(idImportResult.updatedRows, 2, 'example36 id import should update 2 rows');
  assert.equal(idImportResult.issues.length, 1, 'example36 id import should preserve validation pipeline');

  const fileImportResult = await page.evaluate(async () => {
    const api = window.__example36;
    if (!api || typeof api.simulateFileImportWithWorkbook !== 'function') {
      throw new Error('Missing window.__example36.simulateFileImportWithWorkbook');
    }
    return api.simulateFileImportWithWorkbook('header');
  });
  assert.equal(fileImportResult.importedRows, 2, 'example36 file import should import 2 valid rows');
  assert.equal(fileImportResult.updatedRows, 2, 'example36 file import should update rows');
  assert.equal(fileImportResult.issues.length, 1, 'example36 file import should report validation issue');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample37Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example37.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => {
    const api = window.__example37;
    if (!api || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example37.getSnapshot');
    }
    return api.getSnapshot();
  });

  assert.ok(
    initialSnapshot.shellClassName.includes('h-theme-light'),
    `example37 should start in light class, got ${initialSnapshot.shellClassName}`
  );
  assert.equal(
    initialSnapshot.cssVars.headerBg,
    '#f8fafc',
    `example37 light header token mismatch: ${initialSnapshot.cssVars.headerBg}`
  );

  const darkSnapshot = await page.evaluate(() => {
    const api = window.__example37;
    if (!api || typeof api.applyDarkTheme !== 'function' || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example37 dark APIs');
    }
    api.applyDarkTheme();
    return api.getSnapshot();
  });

  assert.ok(
    darkSnapshot.shellClassName.includes('h-theme-dark'),
    `example37 should switch to dark class, got ${darkSnapshot.shellClassName}`
  );
  assert.equal(darkSnapshot.cssVars.headerBg, '#111827', 'example37 dark header token should be applied');
  assert.equal(
    darkSnapshot.computed.gridBackground,
    'rgb(15, 23, 42)',
    `example37 dark background mismatch: ${darkSnapshot.computed.gridBackground}`
  );

  const brandSnapshot = await page.evaluate(() => {
    const api = window.__example37;
    if (!api || typeof api.applyBrandTheme !== 'function' || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example37 brand APIs');
    }
    api.applyBrandTheme();
    return api.getSnapshot();
  });
  assert.equal(brandSnapshot.cssVars.headerBg, '#fffbeb', 'example37 brand header token should be applied via setTheme');
  assert.equal(
    brandSnapshot.cssVars.borderColor,
    '#fcd34d',
    `example37 brand border token mismatch: ${brandSnapshot.cssVars.borderColor}`
  );
  assert.ok(
    brandSnapshot.cssVars.fontFamily.includes('Pretendard'),
    `example37 brand font token should include Pretendard, got ${brandSnapshot.cssVars.fontFamily}`
  );

  const resetSnapshot = await page.evaluate(() => {
    const api = window.__example37;
    if (!api || typeof api.resetTokensByCurrentClass !== 'function' || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example37 reset APIs');
    }
    api.resetTokensByCurrentClass();
    api.applyLightTheme();
    return api.getSnapshot();
  });
  assert.ok(
    resetSnapshot.shellClassName.includes('h-theme-light'),
    `example37 should restore light class, got ${resetSnapshot.shellClassName}`
  );
  assert.equal(resetSnapshot.cssVars.headerBg, '#f8fafc', 'example37 reset should restore light header token');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample38Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example38.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => {
    const api = window.__example38;
    if (!api || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example38.getSnapshot');
    }
    return api.getSnapshot();
  });
  assert.equal(initialSnapshot.root.role, 'grid', 'example38 root role should be grid');
  assert.equal(initialSnapshot.root.rowcount, '1502', 'example38 aria-rowcount should include header rows');
  assert.equal(initialSnapshot.root.colcount, '6', 'example38 aria-colcount mismatch');
  assert.ok(initialSnapshot.root.activedescendant, 'example38 should expose aria-activedescendant on init');
  assert.equal(initialSnapshot.activeCell?.ariaColIndex, '2', 'example38 active cell should start at Name column');

  await page.evaluate(() => {
    const api = window.__example38;
    if (!api || typeof api.setActive !== 'function') {
      throw new Error('Missing window.__example38 APIs');
    }
    api.setActive(0, 4);
  });
  await waitAnimationFrame(page);
  const scoreSnapshot = await page.evaluate(() => window.__example38.getSnapshot());
  assert.equal(scoreSnapshot.activeCell?.ariaColIndex, '5', 'example38 active cell should move to Score column');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample39Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example39.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => {
    const api = window.__example39;
    if (!api || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example39.getSnapshot');
    }
    return api.getSnapshot();
  });
  assert.equal(initialSnapshot.root.role, 'grid', 'example39 root role should be grid');
  assert.deepEqual(initialSnapshot.selection.activeCell, { rowIndex: 0, colIndex: 1 }, 'example39 initial active cell mismatch');

  await page.evaluate(() => {
    const api = window.__example39;
    if (!api || typeof api.focusGrid !== 'function') {
      throw new Error('Missing window.__example39.focusGrid');
    }
    api.focusGrid();
  });

  const selectAllShortcut = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
  await page.keyboard.press(selectAllShortcut);
  await waitAnimationFrame(page);

  const selectAllSnapshot = await page.evaluate(() => {
    const api = window.__example39;
    return api.getSnapshot();
  });
  assert.deepEqual(
    selectAllSnapshot.selection.cellRanges[0],
    { r1: 0, c1: 0, r2: 1199, c2: 4 },
    'example39 Ctrl/Cmd+A should select full range'
  );

  await page.keyboard.press('F2');
  await page.waitForSelector('.hgrid__editor-host--visible', { timeout: 10_000, state: 'attached' });
  await page.fill(TEXT_EDITOR_SELECTOR, 'Customer-1-Edited');
  await page.keyboard.press('Tab');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const afterTabSnapshot = await page.evaluate(() => window.__example39.getSnapshot());
  assert.equal(afterTabSnapshot.editor.isEditing, true, 'example39 should stay editing after Tab');
  assert.deepEqual(
    afterTabSnapshot.selection.activeCell,
    { rowIndex: 0, colIndex: 2 },
    'example39 Tab should move editor to next editable cell'
  );
  const editedNameCellText = await page
    .locator('.hgrid__row--center[data-row-index=\"0\"] .hgrid__cell[data-column-id=\"name\"]')
    .first()
    .textContent();
  assert.equal(editedNameCellText, 'Customer-1-Edited', 'example39 name should be committed by Tab');

  await page.fill(TEXT_EDITOR_SELECTOR, '999');
  await page.keyboard.press('Shift+Tab');
  await waitAnimationFrame(page);
  await waitAnimationFrame(page);

  const afterShiftTabSnapshot = await page.evaluate(() => window.__example39.getSnapshot());
  assert.equal(afterShiftTabSnapshot.editor.isEditing, true, 'example39 should stay editing after Shift+Tab');
  assert.deepEqual(
    afterShiftTabSnapshot.selection.activeCell,
    { rowIndex: 0, colIndex: 1 },
    'example39 Shift+Tab should move editor to previous editable cell'
  );
  const editedScoreCellText = await page
    .locator('.hgrid__row--center[data-row-index=\"0\"] .hgrid__cell[data-column-id=\"score\"]')
    .first()
    .textContent();
  assert.equal(editedScoreCellText, '999', 'example39 score should be committed by Shift+Tab');

  await page.keyboard.press('Escape');
  await waitAnimationFrame(page);
  const afterEscapeSnapshot = await page.evaluate(() => window.__example39.getSnapshot());
  assert.equal(afterEscapeSnapshot.editor.isEditing, false, 'example39 Escape should close editor');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample40Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example40.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => {
    const api = window.__example40;
    if (!api || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example40.getSnapshot');
    }
    return api.getSnapshot();
  });
  assert.equal(initialSnapshot.locale, 'en-US', 'example40 should start with en-US locale');
  assert.equal(initialSnapshot.rootDir, 'ltr', 'example40 should start with LTR dir');
  assert.equal(initialSnapshot.amountText, initialSnapshot.expectedAmountText, 'example40 en-US amount text mismatch');
  assert.equal(initialSnapshot.dateText, initialSnapshot.expectedDateText, 'example40 en-US date text mismatch');

  await page.evaluate(() => {
    const api = window.__example40;
    api.setLocale('de-DE');
  });
  await waitAnimationFrame(page);
  const deSnapshot = await page.evaluate(() => window.__example40.getSnapshot());
  assert.equal(deSnapshot.locale, 'de-DE', 'example40 should switch to de-DE locale');
  assert.equal(deSnapshot.amountText, deSnapshot.expectedAmountText, 'example40 de-DE amount text mismatch');
  assert.equal(deSnapshot.dateText, deSnapshot.expectedDateText, 'example40 de-DE date text mismatch');

  await page.evaluate(() => {
    const api = window.__example40;
    api.setLocale('ko-KR');
    api.setRtl(true);
  });
  await waitAnimationFrame(page);
  const koRtlSnapshot = await page.evaluate(() => window.__example40.getSnapshot());
  assert.equal(koRtlSnapshot.locale, 'ko-KR', 'example40 should switch to ko-KR locale');
  assert.equal(koRtlSnapshot.rtl, true, 'example40 rtl state should be true');
  assert.equal(koRtlSnapshot.rootDir, 'rtl', 'example40 root dir should switch to rtl');
  assert.ok(
    String(koRtlSnapshot.rootClassName).includes('hgrid--rtl'),
    `example40 root class should include hgrid--rtl, got ${koRtlSnapshot.rootClassName}`
  );
  assert.equal(koRtlSnapshot.amountText, koRtlSnapshot.expectedAmountText, 'example40 ko-KR amount text mismatch');
  assert.equal(koRtlSnapshot.dateText, koRtlSnapshot.expectedDateText, 'example40 ko-KR date text mismatch');
  assert.ok(
    String(koRtlSnapshot.checkAllAriaLabel).includes('모든 행 선택'),
    `example40 checkAll aria label should be localized, got ${koRtlSnapshot.checkAllAriaLabel}`
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample41Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example41.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => {
    const api = window.__example41;
    if (!api || typeof api.getSnapshot !== 'function') {
      throw new Error('Missing window.__example41.getSnapshot');
    }
    return api.getSnapshot();
  });
  assert.equal(initialSnapshot.mode, 'strict-sanitize', 'example41 should start in strict sanitize mode');
  assert.equal(initialSnapshot.unsafeHtmlPolicy, 'sanitizedOnly', 'example41 should default to sanitizedOnly policy');
  assert.equal(initialSnapshot.safeTextCell, '<strong>Literal</strong>', 'example41 default text cell should stay literal');
  assert.equal(initialSnapshot.hasUnsafeBold, true, 'example41 unsafeHtml opt-in should render strong element');
  assert.equal(initialSnapshot.hasUnsafeImage, false, 'example41 sanitize-on should remove unsafe img');

  await page.evaluate(() => {
    const api = window.__example41;
    api.setMode('strict-no-sanitize');
  });
  await page.waitForFunction(() => {
    const api = window.__example41;
    const snapshot = api && api.getSnapshot();
    return snapshot && snapshot.mode === 'strict-no-sanitize' && snapshot.hasUnsafeBold === false && snapshot.hasUnsafeImage === false;
  });
  const strictFallbackSnapshot = await page.evaluate(() => window.__example41.getSnapshot());
  assert.equal(strictFallbackSnapshot.mode, 'strict-no-sanitize', 'example41 should switch to strict no sanitizer mode');
  assert.equal(strictFallbackSnapshot.unsafeHtmlPolicy, 'sanitizedOnly', 'example41 strict fallback should keep sanitizedOnly policy');
  assert.equal(strictFallbackSnapshot.hasUnsafeBold, false, 'example41 strict fallback should render literal text instead of strong');
  assert.equal(strictFallbackSnapshot.hasUnsafeImage, false, 'example41 strict fallback should not expose img element');

  await page.evaluate(() => {
    const api = window.__example41;
    api.setMode('legacy-raw');
  });
  await page.waitForFunction(() => {
    const api = window.__example41;
    const snapshot = api && api.getSnapshot();
    return snapshot && snapshot.mode === 'legacy-raw' && snapshot.hasUnsafeImage === true;
  });
  const legacySnapshot = await page.evaluate(() => window.__example41.getSnapshot());
  assert.equal(legacySnapshot.mode, 'legacy-raw', 'example41 should switch to legacy raw mode');
  assert.equal(legacySnapshot.unsafeHtmlPolicy, 'allowRaw', 'example41 legacy mode should use allowRaw policy');
  assert.equal(legacySnapshot.hasUnsafeImage, true, 'example41 legacy mode should expose img element');

  await page.evaluate(() => {
    const api = window.__example41;
    api.setMode('strict-sanitize');
  });
  await page.waitForFunction(() => {
    const api = window.__example41;
    const snapshot = api && api.getSnapshot();
    return snapshot && snapshot.mode === 'strict-sanitize' && snapshot.hasUnsafeImage === false;
  });
  const restoredSnapshot = await page.evaluate(() => window.__example41.getSnapshot());
  assert.equal(restoredSnapshot.mode, 'strict-sanitize', 'example41 should switch sanitize mode on');
  assert.equal(restoredSnapshot.hasUnsafeImage, false, 'example41 sanitize-on should remove img again');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample89Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example89.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example89?.getSnapshot), null, { timeout: 15_000 });

  await page.waitForFunction(() => {
    const snapshot = window.__example89?.refresh?.();
    return snapshot && snapshot.strict && snapshot.sanitized && snapshot.legacy;
  }, null, { timeout: 10_000 });

  const snapshot = await page.evaluate(() => window.__example89.getSnapshot());
  assert.equal(snapshot.strict.hasStrong, false, 'example89 strict policy should not render strong element without sanitizer');
  assert.equal(snapshot.strict.hasImage, false, 'example89 strict policy should not render image without sanitizer');
  assert.equal(snapshot.sanitized.hasStrong, true, 'example89 sanitized policy should render allowed strong element');
  assert.equal(snapshot.sanitized.hasImage, false, 'example89 sanitized policy should strip image');
  assert.equal(snapshot.legacy.hasStrong, true, 'example89 legacy policy should render raw strong element');
  assert.equal(snapshot.legacy.hasImage, true, 'example89 legacy policy should render raw image element');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample90Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example90.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example90?.getSnapshot), null, { timeout: 15_000 });

  const snapshot = await page.evaluate(() => window.__example90.getSnapshot());
  assert.equal(snapshot.policyName, 'hgrid-example90', 'example90 should expose the configured TT policy name');
  assert.equal(snapshot.hasStrong, true, 'example90 should render sanitized strong element');
  assert.equal(snapshot.hasImage, false, 'example90 should strip unsafe image');
  assert.equal(snapshot.hasLink, true, 'example90 should keep safe anchor element');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample91Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example91.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example91?.getSnapshot), null, { timeout: 15_000 });

  await page.evaluate(async () => window.__example91.applyEmailEdit());
  await page.waitForFunction(() => {
    const snapshot = window.__example91?.getSnapshot?.();
    return snapshot && Array.isArray(snapshot.auditLogs) && snapshot.auditLogs.length >= 1;
  }, null, { timeout: 10_000 });

  const snapshot = await page.evaluate(() => window.__example91.getSnapshot());
  assert.equal(snapshot.auditSchemaVersion, 1, 'example91 should expose audit schema version 1');
  assert.equal(snapshot.auditLogs[0].schemaVersion, 1, 'example91 latest audit log should carry schemaVersion=1');
  assert.equal(snapshot.auditLogs[0].columnId, 'email', 'example91 first audit log should track email edit');
  assert.equal(snapshot.auditLogs[0].maskedValue, 'ah***@example.com', 'example91 should mask email values in consumer');
  assert.equal(snapshot.auditLogs[0].maskedPreviousValue, 'ah***@example.com', 'example91 should mask previous email values in consumer');

  await page.evaluate(async () => window.__example91.applyPhoneEdit());
  await page.waitForFunction(() => {
    const currentSnapshot = window.__example91?.getSnapshot?.();
    return currentSnapshot && currentSnapshot.auditLogs && currentSnapshot.auditLogs[0] && currentSnapshot.auditLogs[0].columnId === 'phone';
  }, null, { timeout: 10_000 });

  const phoneSnapshot = await page.evaluate(() => window.__example91.getSnapshot());
  assert.equal(phoneSnapshot.auditLogs[0].maskedValue, '***-***-9900', 'example91 should mask phone values in consumer');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample44Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example44.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example44?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#sort-score');
  await page.waitForFunction(() => {
    const snapshot = window.__example44?.getSnapshot?.();
    return snapshot && snapshot.workerCounts.sort >= 1 && snapshot.state.sortModel.length === 1;
  });
  const sortSnapshot = await page.evaluate(() => window.__example44.getSnapshot());
  assert.ok(sortSnapshot.workerCounts.sort >= 1, `example44 sort should create worker, got ${sortSnapshot.workerCounts.sort}`);
  assert.equal(sortSnapshot.state.sortModel.length, 1, 'example44 sort should apply sort model');

  await page.click('#filter-active');
  await page.waitForFunction(() => {
    const snapshot = window.__example44?.getSnapshot?.();
    return snapshot && snapshot.workerCounts.filter >= 1;
  });

  await page.click('#group-region');
  await page.waitForFunction(() => {
    const snapshot = window.__example44?.getSnapshot?.();
    return snapshot && snapshot.workerCounts.group >= 1 && snapshot.state.groupedRows.some((row) => row.kind === 'group');
  });
  const groupSnapshot = await page.evaluate(() => window.__example44.getSnapshot());
  assert.ok(groupSnapshot.state.groupedRows.some((row) => row.kind === 'group'), 'example44 group should expose group rows');

  await page.click('#pivot-status');
  await page.waitForFunction(() => {
    const snapshot = window.__example44?.getSnapshot?.();
    return snapshot && snapshot.workerCounts.pivot >= 1;
  });

  await page.click('#tree-view');
  await page.waitForFunction(() => {
    const snapshot = window.__example44?.getSnapshot?.();
    return snapshot && snapshot.workerCounts.tree >= 1 && snapshot.state.treeRows.length > 0;
  });

  await page.click('#export-visible');
  const preview = page.locator('#preview-panel');
  await preview.waitFor({ state: 'visible', timeout: 10_000 });
  const previewText = await preview.textContent();
  assert.ok(previewText && previewText !== 'No export yet.', `example44 export preview should be populated, got "${previewText}"`);
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample45Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example45.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example45?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#auto-worker');
  await page.waitForFunction(() => {
    const snapshot = window.__example45?.getSnapshot?.();
    return snapshot && snapshot.workerCounts.sort >= 1 && snapshot.sortModel.length === 1;
  });
  const autoWorkerSnapshot = await page.evaluate(() => window.__example45.getSnapshot());
  assert.ok(autoWorkerSnapshot.workerCounts.sort >= 1, 'example45 auto-worker should create a sort worker');
  assert.equal(autoWorkerSnapshot.currentPolicy.lastError, null, 'example45 auto-worker should not leave an error');

  const autoWorkerSortCount = autoWorkerSnapshot.workerCounts.sort;

  await page.click('#comparator-error');
  await page.waitForFunction(() => {
    const snapshot = window.__example45?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.currentPolicy.columnsMode === 'comparator' &&
      snapshot.currentPolicy.fallbackPolicy === 'lowVolumeOnly' &&
      snapshot.currentPolicy.lastError === null &&
      snapshot.sortModel.length === 1
    );
  });
  const comparatorProjectionSnapshot = await page.evaluate(() => window.__example45.getSnapshot());
  assert.equal(comparatorProjectionSnapshot.currentPolicy.lastError, null, 'example45 comparator projection should not error');
  assert.ok(
    comparatorProjectionSnapshot.workerCounts.sort >= autoWorkerSortCount,
    'example45 comparator projection should keep worker runtime active'
  );

  await page.click('#allow-fallback');
  await page.waitForFunction(() => {
    const snapshot = window.__example45?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.currentPolicy.columnsMode === 'comparator' &&
      snapshot.currentPolicy.fallbackPolicy === 'allowAlways' &&
      snapshot.currentPolicy.lastError === null
    );
  });
  const allowFallbackSnapshot = await page.evaluate(() => window.__example45.getSnapshot());
  assert.equal(allowFallbackSnapshot.currentPolicy.lastError, null, 'example45 allow-fallback should keep comparator worker path valid');

  await page.click('#explicit-main-thread');
  await page.waitForFunction(() => {
    const snapshot = window.__example45?.getSnapshot?.();
    return snapshot && snapshot.currentPolicy.enabled === false && snapshot.currentPolicy.lastError === null;
  });
  const explicitMainThreadSnapshot = await page.evaluate(() => window.__example45.getSnapshot());
  assert.equal(
    explicitMainThreadSnapshot.workerCounts.sort,
    autoWorkerSortCount,
    'example45 explicit-main-thread should not create an additional worker'
  );

  await page.click('#export-top');
  const preview = page.locator('#preview-panel');
  await preview.waitFor({ state: 'visible', timeout: 10_000 });
  const previewText = await preview.textContent();
  assert.ok(previewText && previewText !== 'No export yet.', `example45 export preview should be populated, got "${previewText}"`);
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample46Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example46.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example46?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  const coldSnapshot = await page.evaluate(() => window.__example46.getSnapshot());
  assert.equal(coldSnapshot.currentMode, 'cold', 'example46 should start in cold mode');
  assert.deepEqual(
    coldSnapshot.workerCounts,
    {
      sort: 0,
      filter: 0,
      group: 0,
      pivot: 0,
      tree: 0
    },
    'example46 cold mode should not create workers before first heavy operation'
  );

  await page.click('#create-prewarmed');
  await page.waitForFunction(() => {
    const snapshot = window.__example46?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.currentMode === 'prewarm' &&
      snapshot.workerCounts.sort >= 1 &&
      snapshot.workerCounts.filter >= 1 &&
      snapshot.workerCounts.group >= 1 &&
      snapshot.workerCounts.pivot >= 1 &&
      snapshot.workerCounts.tree >= 1
    );
  });

  const warmSnapshot = await page.evaluate(() => window.__example46.getSnapshot());
  const warmSortWorkerCount = warmSnapshot.workerCounts.sort;

  await page.click('#run-sort');
  await page.waitForFunction(() => {
    const snapshot = window.__example46?.getSnapshot?.();
    return snapshot && snapshot.sortModel.length === 1 && snapshot.workerMessages.some((entry) => entry.kind === 'sort');
  });
  const postWarmSortSnapshot = await page.evaluate(() => window.__example46.getSnapshot());
  assert.equal(
    postWarmSortSnapshot.workerCounts.sort,
    warmSortWorkerCount,
    'example46 prewarmed sort should reuse the existing sort worker'
  );

  await page.click('#create-cold');
  await page.waitForFunction(() => {
    const snapshot = window.__example46?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.currentMode === 'cold' &&
      snapshot.workerCounts.sort === 0 &&
      snapshot.workerCounts.filter === 0 &&
      snapshot.workerCounts.group === 0 &&
      snapshot.workerCounts.pivot === 0 &&
      snapshot.workerCounts.tree === 0
    );
  });

  await page.click('#run-sort');
  await page.waitForFunction(() => {
    const snapshot = window.__example46?.getSnapshot?.();
    return snapshot && snapshot.currentMode === 'cold' && snapshot.workerCounts.sort === 1 && snapshot.sortModel.length === 1;
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample47Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example47.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example47?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#run-custom-group');
  await page.waitForFunction(() => {
    const snapshot = window.__example47?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.workerCounts.group >= 1 &&
      snapshot.groupedRows.some((row) => row.kind === 'group' && row.groupKey === 'region=string:KR' && row.values.score === 120) &&
      snapshot.groupedRows.some((row) => row.kind === 'group' && row.groupKey === 'region=string:US' && row.values.score === 240)
    );
  });

  const groupedSnapshot = await page.evaluate(() => window.__example47.getSnapshot());
  assert.ok(groupedSnapshot.workerCounts.group >= 1, 'example47 should create a group worker');

  await page.click('#reset-flat');
  await page.waitForFunction(() => {
    const snapshot = window.__example47?.getSnapshot?.();
    return snapshot && snapshot.groupedRows.every((row) => row.kind === 'data');
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample48Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example48.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example48?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#run-custom-pivot');
  await page.waitForFunction(() => {
    const snapshot = window.__example48?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.workerCounts.pivot >= 1 &&
      snapshot.visibleColumns.some((header) => String(header).includes('Jan')) &&
      snapshot.visibleColumns.some((header) => String(header).includes('Feb')) &&
      typeof snapshot.preview === 'string' &&
      snapshot.preview.includes('KR,60,60') &&
      snapshot.preview.includes('US,120,120')
    );
  });

  const pivotSnapshot = await page.evaluate(() => window.__example48.getSnapshot());
  assert.ok(pivotSnapshot.workerCounts.pivot >= 1, 'example48 should create a pivot worker');

  await page.click('#reset-flat');
  await page.waitForFunction(() => {
    const snapshot = window.__example48?.getSnapshot?.();
    return snapshot && snapshot.visibleColumns.includes('Sales') && !snapshot.visibleColumns.some((header) => String(header).includes('Jan'));
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample49Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example49.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example49?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#sort-full-name');
  await page.waitForFunction(() => {
    const snapshot = window.__example49?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.workerCounts.sort >= 1 &&
      Array.isArray(snapshot.sortModel) &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].columnId === 'fullName' &&
      typeof snapshot.preview === 'string' &&
      snapshot.preview.includes('1,Ada,Lovelace,Ada Lovelace')
    );
  });

  const sortedSnapshot = await page.evaluate(() => window.__example49.getSnapshot());
  assert.ok(sortedSnapshot.workerCounts.sort >= 1, 'example49 should create a sort worker');

  await page.click('#filter-hopper');
  await page.waitForFunction(() => {
    const snapshot = window.__example49?.getSnapshot?.();
    const filterModel = snapshot?.filterModel ?? {};
    return (
      snapshot &&
      snapshot.workerCounts.filter >= 1 &&
      filterModel.fullName &&
      typeof snapshot.preview === 'string' &&
      snapshot.preview.includes('Grace,Hopper,Grace Hopper') &&
      !snapshot.preview.includes('Ada,Lovelace,Ada Lovelace')
    );
  });

  const filteredSnapshot = await page.evaluate(() => window.__example49.getSnapshot());
  assert.ok(filteredSnapshot.workerCounts.filter >= 1, 'example49 should create a filter worker');

  await page.click('#reset-flat');
  await page.waitForFunction(() => {
    const snapshot = window.__example49?.getSnapshot?.();
    return snapshot && Object.keys(snapshot.filterModel || {}).length === 0 && Array.isArray(snapshot.sortModel) && snapshot.sortModel.length === 0;
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample50Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example50.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example50?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  await page.click('#sort-length-asc');
  await page.waitForFunction(() => {
    const snapshot = window.__example50?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.workerCounts.sort >= 1 &&
      Array.isArray(snapshot.sortModel) &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].columnId === 'label' &&
      snapshot.sortModel[0].direction === 'asc' &&
      typeof snapshot.preview === 'string' &&
      snapshot.preview.indexOf('2,a,compiler') === 0
    );
  });

  const ascSnapshot = await page.evaluate(() => window.__example50.getSnapshot());
  assert.ok(ascSnapshot.workerCounts.sort >= 1, 'example50 should create a sort worker');

  await page.click('#sort-length-desc');
  await page.waitForFunction(() => {
    const snapshot = window.__example50?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.workerCounts.sort >= 1 &&
      Array.isArray(snapshot.sortModel) &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].direction === 'desc' &&
      typeof snapshot.preview === 'string' &&
      snapshot.preview.indexOf('3,cccc,logic') === 0
    );
  });

  await page.click('#reset-flat');
  await page.waitForFunction(() => {
    const snapshot = window.__example50?.getSnapshot?.();
    return snapshot && Array.isArray(snapshot.sortModel) && snapshot.sortModel.length === 0;
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample51Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example51.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example51?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });
  await page.waitForFunction(() => {
    const snapshot = window.__example51?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.workerCounts.sort >= 1 &&
      snapshot.workerCounts.filter >= 1 &&
      snapshot.workerCounts.group >= 1 &&
      snapshot.workerCounts.pivot >= 1 &&
      snapshot.workerCounts.tree >= 1 &&
      Array.isArray(snapshot.urls) &&
      snapshot.urls.length >= 5 &&
      snapshot.workerRuntime &&
      snapshot.workerRuntime.poolSize === 2 &&
      snapshot.workerRuntime.prewarm === true
    );
  });

  const prewarmSnapshot = await page.evaluate(() => window.__example51.getSnapshot());
  assert.ok(prewarmSnapshot.workerCounts.sort >= 1, 'example51 should prewarm the worker runtime');

  await page.click('#run-parallel-sorts');
  await page.waitForFunction(() => {
    const snapshot = window.__example51?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.workerCounts.sort >= 3 &&
      Array.isArray(snapshot.sortModel) &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].columnId === 'score' &&
      snapshot.sortModel[0].direction === 'desc'
    );
  });

  const poolSnapshot = await page.evaluate(() => window.__example51.getSnapshot());
  assert.ok(poolSnapshot.workerCounts.sort >= 3, 'example51 should grow sort workers when concurrent sorts are queued');
  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample52Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example52.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const snapshot = window.__example52?.getSnapshot?.();
    return Boolean(snapshot && snapshot.isReady === true);
  }, null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => window.__example52.getSnapshot());
  assert.equal(initialSnapshot.fullNameGetterCalls, 0, 'example52 should start with zero valueGetter calls');
  assert.equal(initialSnapshot.fullNameComparatorCalls, 0, 'example52 should start with zero comparator calls');

  await page.click('#sort-length-asc');
  await page.waitForFunction(() => {
    const snapshot = window.__example52?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].columnId === 'fullName' &&
      snapshot.sortModel[0].direction === 'asc' &&
      snapshot.fullNameGetterCalls > 0 &&
      snapshot.fullNameComparatorCalls > 0
    );
  });
  const sortAscSnapshot = await page.evaluate(() => window.__example52.getSnapshot());

  await page.click('#sort-length-desc');
  await page.waitForFunction(() => {
    const snapshot = window.__example52?.getSnapshot?.();
    return snapshot && snapshot.sortModel.length === 1 && snapshot.sortModel[0].direction === 'desc';
  });
  const sortDescSnapshot = await page.evaluate(() => window.__example52.getSnapshot());
  assert.equal(
    sortDescSnapshot.fullNameGetterCalls,
    sortAscSnapshot.fullNameGetterCalls,
    'example52 repeated sort should reuse cached valueGetter projection'
  );
  assert.equal(
    sortDescSnapshot.fullNameComparatorCalls,
    sortAscSnapshot.fullNameComparatorCalls,
    'example52 repeated sort should reuse cached comparator projection'
  );

  await page.click('#filter-grace');
  await page.waitForFunction(() => {
    const snapshot = window.__example52?.getSnapshot?.();
    return snapshot && snapshot.filterModel.fullName && String(snapshot.preview || '').includes('Grace,Hopper');
  });
  const filteredSnapshot = await page.evaluate(() => window.__example52.getSnapshot());
  assert.equal(
    filteredSnapshot.fullNameGetterCalls,
    sortAscSnapshot.fullNameGetterCalls,
    'example52 repeated filter should reuse cached valueGetter projection'
  );

  await page.click('#clear-filter');
  await page.waitForFunction(() => {
    const snapshot = window.__example52?.getSnapshot?.();
    return snapshot && Object.keys(snapshot.filterModel || {}).length === 0;
  });

  await page.click('#replace-rows');
  await page.waitForFunction(() => {
    const snapshot = window.__example52?.getSnapshot?.();
    return snapshot && snapshot.dataset === 'replacement' && String(snapshot.preview || '').includes('Barbara,Liskov');
  });

  await page.click('#sort-length-asc');
  await page.waitForFunction(() => {
    const snapshot = window.__example52?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.dataset === 'replacement' &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].direction === 'asc' &&
      snapshot.fullNameGetterCalls > 120 &&
      snapshot.fullNameComparatorCalls > 0
    );
  });
  const replacedSnapshot = await page.evaluate(() => window.__example52.getSnapshot());
  assert.ok(
    replacedSnapshot.fullNameGetterCalls > filteredSnapshot.fullNameGetterCalls,
    'example52 row replacement should invalidate cached valueGetter projection'
  );
  assert.ok(
    replacedSnapshot.fullNameComparatorCalls > filteredSnapshot.fullNameComparatorCalls,
    'example52 row replacement should invalidate cached comparator projection'
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample53Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example53.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const snapshot = window.__example53?.getSnapshot?.();
    return Boolean(snapshot && snapshot.isReady === true);
  }, null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 15_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => window.__example53.getSnapshot());
  assert.equal(initialSnapshot.prefixNameGetterCalls, 0, 'example53 should start with zero prefix getter calls');
  assert.equal(initialSnapshot.fullNameGetterCalls, 0, 'example53 should start with zero fullName getter calls');
  assert.equal(initialSnapshot.tailBadgeGetterCalls, 0, 'example53 should start with zero tail getter calls');

  await page.click('#sort-full-name');
  await page.waitForFunction(() => {
    const snapshot = window.__example53?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].columnId === 'fullName' &&
      snapshot.sortModel[0].direction === 'asc' &&
      snapshot.prefixNameGetterCalls > 0 &&
      snapshot.fullNameGetterCalls > 0 &&
      snapshot.tailBadgeGetterCalls === 0
    );
  });
  const sortAscSnapshot = await page.evaluate(() => window.__example53.getSnapshot());

  await page.click('#sort-full-name-desc');
  await page.waitForFunction(() => {
    const snapshot = window.__example53?.getSnapshot?.();
    return snapshot && snapshot.sortModel.length === 1 && snapshot.sortModel[0].direction === 'desc';
  });
  const sortDescSnapshot = await page.evaluate(() => window.__example53.getSnapshot());
  assert.equal(
    sortDescSnapshot.prefixNameGetterCalls,
    sortAscSnapshot.prefixNameGetterCalls,
    'example53 repeated sort should reuse cached prefix projection'
  );
  assert.equal(
    sortDescSnapshot.fullNameGetterCalls,
    sortAscSnapshot.fullNameGetterCalls,
    'example53 repeated sort should reuse cached target projection'
  );
  assert.equal(sortDescSnapshot.tailBadgeGetterCalls, 0, 'example53 should not evaluate trailing derived getter');

  await page.click('#filter-hopper');
  await page.waitForFunction(() => {
    const snapshot = window.__example53?.getSnapshot?.();
    return snapshot && snapshot.filterModel.fullName && String(snapshot.preview || '').includes('Grace,Hopper');
  });
  const filteredSnapshot = await page.evaluate(() => window.__example53.getSnapshot());
  assert.equal(filteredSnapshot.tailBadgeGetterCalls, 0, 'example53 filter should still skip trailing derived getter');

  await page.click('#reset-flat');
  await page.waitForFunction(() => {
    const snapshot = window.__example53?.getSnapshot?.();
    return snapshot && snapshot.sortModel.length === 0 && Object.keys(snapshot.filterModel || {}).length === 0;
  });

  await page.click('#replace-rows');
  await page.waitForFunction(() => {
    const snapshot = window.__example53?.getSnapshot?.();
    return snapshot && snapshot.dataset === 'replacement' && String(snapshot.preview || '').includes('Barbara,Liskov');
  });
  await page.click('#sort-full-name');
  await page.waitForFunction(() => {
    const snapshot = window.__example53?.getSnapshot?.();
    return snapshot && snapshot.dataset === 'replacement' && snapshot.sortModel[0]?.direction === 'asc';
  });
  const replacedSnapshot = await page.evaluate(() => window.__example53.getSnapshot());
  assert.ok(
    replacedSnapshot.prefixNameGetterCalls > filteredSnapshot.prefixNameGetterCalls,
    'example53 row replacement should invalidate prefix projection cache'
  );
  assert.ok(
    replacedSnapshot.fullNameGetterCalls > filteredSnapshot.fullNameGetterCalls,
    'example53 row replacement should invalidate target projection cache'
  );
  assert.equal(replacedSnapshot.tailBadgeGetterCalls, 0, 'example53 should keep trailing derived getter untouched after replacement');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample54Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example54.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const snapshot = window.__example54?.getSnapshot?.();
    return Boolean(snapshot && snapshot.isReady === true);
  }, null, { timeout: 20_000 });
  await page.waitForSelector('.hgrid__row--center', { timeout: 20_000, state: 'attached' });

  const initialSnapshot = await page.evaluate(() => window.__example54.getSnapshot());
  assert.equal(initialSnapshot.searchNameGetterCalls, 0, 'example54 should start with zero derived getter calls');

  await page.click('#sort-derived');
  await page.waitForFunction(() => {
    const snapshot = window.__example54?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.lastAction &&
      snapshot.lastAction.kind === 'sortDerivedAsc' &&
      snapshot.sortModel.length === 1 &&
      snapshot.sortModel[0].columnId === 'searchName' &&
      snapshot.sortModel[0].direction === 'asc' &&
      snapshot.searchNameGetterCalls > 0 &&
      snapshot.lastAction.heartbeatDelta > 0 &&
      snapshot.lastAction.workerMessagesDuring > 0
    );
  }, null, { timeout: 20_000 });
  const sortSnapshot = await page.evaluate(() => window.__example54.getSnapshot());
  assert.ok(sortSnapshot.workerCounts.sort >= 1, 'example54 should create at least one sort worker');

  await page.click('#filter-grace');
  await page.waitForFunction(() => {
    const snapshot = window.__example54?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.lastAction &&
      snapshot.lastAction.kind === 'filterGrace' &&
      snapshot.filterModel.searchName &&
      snapshot.lastAction.heartbeatDelta > 0 &&
      String(snapshot.preview || '').includes('Grace')
    );
  }, null, { timeout: 20_000 });
  const filterSnapshot = await page.evaluate(() => window.__example54.getSnapshot());
  assert.ok(filterSnapshot.workerCounts.filter >= 1, 'example54 should create at least one filter worker');

  await page.click('#reset-grid');
  await page.waitForFunction(() => {
    const snapshot = window.__example54?.getSnapshot?.();
    return snapshot && snapshot.sortModel.length === 0 && Object.keys(snapshot.filterModel || {}).length === 0;
  }, null, { timeout: 20_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample55Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example55.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example55?.getSnapshot), null, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const snapshot = window.__example55?.getSnapshot?.();
    return snapshot && snapshot.serverRequestCount >= 1 && snapshot.firstVisibleId !== null;
  }, null, { timeout: 20_000 });

  await page.click('#filter-active');
  await page.waitForFunction(() => {
    const snapshot = window.__example55?.getSnapshot?.();
    const statusFilter = snapshot?.queryModel?.filterModel?.status;
    return snapshot && statusFilter && (statusFilter.kind === 'set' || statusFilter.type === 'set');
  }, null, { timeout: 20_000 });

  await page.click('#children-full');
  await page.waitForFunction(() => {
    const snapshot = window.__example55?.getSnapshot?.();
    return snapshot && snapshot.serverSideQueryModel?.requestKind === 'children';
  }, null, { timeout: 20_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample56Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example56.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example56?.inspect), null, { timeout: 20_000 });
  await page.waitForSelector('#status', { timeout: 20_000, state: 'attached' });

  await page.click('#mode-tree');
  await page.waitForFunction(() => String(document.getElementById('status')?.textContent || '').includes('remote tree'), null, {
    timeout: 20_000
  });
  await page.click('#expand-first');
  await page.click('#inspect');
  await page.waitForFunction(() => String(document.getElementById('contract-log')?.textContent || '').includes('"requestKind"'), null, {
    timeout: 20_000
  });

  await page.click('#mode-group-pivot');
  await page.waitForFunction(
    () => String(document.getElementById('status')?.textContent || '').includes('grouping + pivot'),
    null,
    {
      timeout: 20_000
    }
  );
  await page.click('#inspect');
  await page.waitForFunction(
    () => String(document.getElementById('preview-log')?.textContent || '').includes('pivotResultColumnIds'),
    null,
    {
      timeout: 20_000
    }
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample57Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example57.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example57?.inspect), null, { timeout: 20_000 });
  await page.waitForSelector('#state-log', { timeout: 20_000, state: 'attached' });

  await page.click('#sort-desc');
  await page.waitForFunction(
    () => String(document.getElementById('state-log')?.textContent || '').includes('"sortModel"'),
    null,
    {
      timeout: 20_000
    }
  );

  await page.click('#filter-active');
  await page.waitForFunction(
    () => String(document.getElementById('state-log')?.textContent || '').includes('"filterModel"'),
    null,
    {
      timeout: 20_000
    }
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample58Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example58.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example58?.getPendingChanges), null, { timeout: 20_000 });
  await page.waitForSelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]', {
    timeout: 20_000,
    state: 'attached'
  });

  await page.locator('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]').dblclick();
  await page.waitForSelector(TEXT_EDITOR_SELECTOR, { timeout: 10_000, state: 'attached' });
  await page.locator(TEXT_EDITOR_SELECTOR).fill('Remote-1-Edited');
  await page.locator(TEXT_EDITOR_SELECTOR).press('Enter');
  await page.waitForFunction(() => window.__example58?.getPendingChanges?.().length === 1, null, { timeout: 20_000 });

  await page.evaluate(() => window.__example58.saveChanges());
  await page.waitForFunction(() => {
    const payload = window.__example58?.getPendingChanges?.();
    const serverRows = window.__example58?.getServerRows?.();
    return Array.isArray(payload) && payload.length === 0 && Array.isArray(serverRows) && serverRows[0]?.name === 'Remote-1-Edited';
  }, null, { timeout: 20_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample59Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example59.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example59?.inspect), null, { timeout: 20_000 });
  await page.click('#expand-apac');
  await page.waitForFunction(
    () => String(document.getElementById('status')?.textContent || '').includes('APAC'),
    null,
    {
      timeout: 20_000
    }
  );
  await page.click('#filter-emea');
  await page.waitForFunction(
    () => String(document.getElementById('contract-log')?.textContent || '').includes('"EMEA"'),
    null,
    {
      timeout: 20_000
    }
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample60Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example60.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example60?.inspect), null, { timeout: 20_000 });
  await page.click('#sort-feb');
  await page.waitForFunction(
    () => String(document.getElementById('contract-log')?.textContent || '').includes('sales::'),
    null,
    {
      timeout: 20_000
    }
  );
  await page.click('#filter-apac');
  await page.waitForFunction(
    () => String(document.getElementById('contract-log')?.textContent || '').includes('"APAC"'),
    null,
    {
      timeout: 20_000
    }
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample61Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example61.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example61?.inspect), null, { timeout: 20_000 });
  await page.click('#expand-root1');
  await page.waitForFunction(
    () => String(document.getElementById('status')?.textContent || '').includes('root-1'),
    null,
    {
      timeout: 20_000
    }
  );
  await page.click('#filter-node1');
  await page.waitForFunction(
    () => String(document.getElementById('contract-log')?.textContent || '').includes('"contains"'),
    null,
    {
      timeout: 20_000
    }
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample63Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example63.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]', {
    timeout: 20_000,
    state: 'attached'
  });

  await page.locator('.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]').click({ button: 'right' });
  await page.locator('.hgrid__column-menu-item', { hasText: 'Inspect cell context' }).click();

  await page.waitForFunction(() => {
    const payload = window.__example63?.getLastPayload?.();
    return (
      payload &&
      payload.kind === 'cell' &&
      payload.rowIndex === 1 &&
      payload.dataIndex === 1 &&
      payload.rowKey === 2 &&
      payload.columnId === 'name' &&
      payload.selection?.activeCell?.rowIndex === 1 &&
      payload.selection?.activeCell?.colIndex === 1
    );
  }, null, { timeout: 20_000 });

  await page.locator('.hgrid__row[data-row-index="2"] .hgrid__cell[data-column-id="status"]').click({ button: 'right' });
  await page.locator('.hgrid__column-menu-item', { hasText: 'Mark row reviewed' }).click();

  await page.waitForFunction(() => window.__example63?.getStatusByRowIndex?.(2) === 'reviewed', null, {
    timeout: 20_000
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample73Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example73.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example73?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__cell[data-column-id="name"]', {
    timeout: 20_000,
    state: 'attached'
  });

  const openBodyMenuAtNameCell = async () => {
    await page.locator('.hgrid__cell[data-column-id="name"]').filter({ hasText: 'Beta' }).first().click({ button: 'right' });
  };

  await openBodyMenuAtNameCell();
  await page.locator('.hgrid__column-menu-item', { hasText: 'Copy cell' }).click();
  await page.waitForFunction(() => window.__example73?.getSnapshot?.().clipboardText === 'Beta', null, {
    timeout: 10_000
  });

  await openBodyMenuAtNameCell();
  await page.locator('.hgrid__column-menu-item', { hasText: 'Copy row' }).click();
  await page.waitForFunction(() => window.__example73?.getSnapshot?.().clipboardText === '2\tBeta\treview\t2026-03-11', null, {
    timeout: 10_000
  });

  await page.click('#seedSelection');
  await openBodyMenuAtNameCell();
  await page.locator('.hgrid__column-menu-item', { hasText: 'Copy selection' }).click();
  await page.waitForFunction(() => window.__example73?.getSnapshot?.().clipboardText === 'Beta\treview\nGamma\tactive', null, {
    timeout: 10_000
  });

  await openBodyMenuAtNameCell();
  await page.locator('.hgrid__column-menu-item', { hasText: 'Filter by this value' }).click();
  await page.waitForFunction(() => {
    const snapshot = window.__example73?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.name?.kind === 'set' &&
      snapshot.filterModel?.name?.values?.[0] === 'Beta' &&
      snapshot.visibleIds?.join(',') === '2'
    );
  }, null, { timeout: 10_000 });

  await openBodyMenuAtNameCell();
  await page.locator('.hgrid__column-menu-item', { hasText: 'Clear column filter' }).click();
  await page.waitForFunction(() => {
    const snapshot = window.__example73?.getSnapshot?.();
    return snapshot && Object.keys(snapshot.filterModel ?? {}).length === 0 && snapshot.visibleIds?.join(',') === '1,2,3,4';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample74Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example74.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example74?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__tool-panel--open', { timeout: 15_000, state: 'visible' });

  await page.click('[data-tool-panel-filter-surface="builder"]');
  await page.selectOption('[data-advanced-filter-role="match"]', 'or');
  await page.selectOption('[data-advanced-filter-role="column"][data-advanced-filter-path="0"]', 'name');
  await page.fill('[data-advanced-filter-role="value"][data-advanced-filter-path="0"]', 'mm');
  await page.click('[data-advanced-filter-action="add-rule"]');
  await page.selectOption('[data-advanced-filter-role="column"][data-advanced-filter-path="1"]', 'region');
  await page.selectOption('[data-advanced-filter-role="condition-operator"][data-advanced-filter-path="1"]', 'equals');
  await page.fill('[data-advanced-filter-role="value"][data-advanced-filter-path="1"]', 'EMEA');
  await page.click('[data-advanced-filter-action="apply"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example74?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.advancedFilterModel?.operator === 'or' &&
      snapshot.advancedFilterModel?.rules?.length === 2 &&
      snapshot.visibleIds?.join(',') === '2,3'
    );
  }, null, { timeout: 10_000 });

  await page.click('#seedQuick');
  await page.waitForFunction(() => {
    const snapshot = window.__example74?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.status?.kind === 'set' &&
      snapshot.visibleIds?.join(',') === '2'
    );
  }, null, { timeout: 10_000 });

  await page.click('#clearAll');
  await page.waitForFunction(() => {
    const snapshot = window.__example74?.getSnapshot?.();
    return (
      snapshot &&
      Object.keys(snapshot.filterModel ?? {}).length === 0 &&
      snapshot.advancedFilterModel === null &&
      snapshot.visibleIds?.join(',') === '1,2,3,4,5'
    );
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample64Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example64.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.hgrid__header-cell[data-column-id="name"]', {
    timeout: 20_000,
    state: 'attached'
  });

  const openHeaderFilter = async (columnId) => {
    await page.locator(`.hgrid__header-cell[data-column-id="${columnId}"]`).click({ button: 'right' });
    await page.locator('.hgrid__column-menu-item', { hasText: 'Open filter' }).click();
  };

  await page.locator('.hgrid__header-cell[data-column-id="name"]').click({ button: 'right' });
  const initialMenuMetrics = await page.evaluate(() => window.__example64?.getColumnMenuMetrics?.());
  assert.ok(initialMenuMetrics, 'example64 should expose column menu metrics when the menu is open');
  assert.ok(
    initialMenuMetrics.menuTop >= initialMenuMetrics.rootTop - 1 &&
      initialMenuMetrics.menuBottom <= initialMenuMetrics.rootBottom + 1 &&
      initialMenuMetrics.menuRight <= initialMenuMetrics.rootRight + 1,
    `example64 column menu should stay within grid height, actual=${JSON.stringify(initialMenuMetrics)}`
  );
  assert.ok(
    initialMenuMetrics.menuScrollHeight >= initialMenuMetrics.menuHeight,
    `example64 column menu should remain scrollable when constrained, actual=${JSON.stringify(initialMenuMetrics)}`
  );
  await page.keyboard.press('Escape');

  await openHeaderFilter('name');
  const initialPanelMetrics = await page.evaluate(() => window.__example64?.getFilterPanelMetrics?.());
  assert.ok(initialPanelMetrics, 'example64 should expose filter panel metrics when the panel is open');
  assert.ok(
    initialPanelMetrics.panelTop >= initialPanelMetrics.rootTop - 1 &&
      initialPanelMetrics.panelBottom <= initialPanelMetrics.rootBottom + 1 &&
      initialPanelMetrics.panelRight <= initialPanelMetrics.rootRight + 1,
    `example64 filter panel should stay within grid height, actual=${JSON.stringify(initialPanelMetrics)}`
  );
  assert.ok(
    initialPanelMetrics.bodyScrollHeight >= initialPanelMetrics.bodyHeight,
    `example64 filter panel body should remain scrollable when constrained, actual=${JSON.stringify(initialPanelMetrics)}`
  );

  await page.locator('.hgrid__filter-panel [data-filter-role="value"][data-filter-clause-index="0"]').fill('ta');
  await page.selectOption('.hgrid__filter-panel [data-filter-role="operator"][data-filter-clause-index="1"]', 'startsWith');
  await page.locator('.hgrid__filter-panel [data-filter-role="value"][data-filter-clause-index="1"]').fill('Be');
  await page.locator('.hgrid__filter-panel [data-filter-action="apply"]').click();
  await page.waitForFunction(() => {
    const snapshot = window.__example64?.getSnapshot?.();
    return (
      snapshot &&
      Array.isArray(snapshot.filterModel?.name) &&
      snapshot.filterModel.name.length === 2 &&
      snapshot.filterModel.name[0]?.value === 'ta' &&
      snapshot.filterModel.name[1]?.value === 'Be' &&
      snapshot.headers?.name === true &&
      Array.isArray(snapshot.visibleIds) &&
      snapshot.visibleIds.join(',') === '2'
    );
  }, null, { timeout: 20_000 });

  await page.click('#clearFilters');
  await page.waitForFunction(() => window.__example64?.getSnapshot?.().filteredColumnCount === 0, null, {
    timeout: 20_000
  });

  await openHeaderFilter('score');
  await page.selectOption('.hgrid__filter-panel [data-filter-role="operator"][data-filter-clause-index="0"]', 'between');
  await page.locator('.hgrid__filter-panel [data-filter-role="min"][data-filter-clause-index="0"]').fill('40');
  await page.locator('.hgrid__filter-panel [data-filter-role="max"][data-filter-clause-index="0"]').fill('80');
  await page.locator('.hgrid__filter-panel [data-filter-action="apply"]').click();
  await page.waitForFunction(() => {
    const snapshot = window.__example64?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.score?.kind === 'number' &&
      snapshot.filterModel?.score?.operator === 'between' &&
      snapshot.visibleIds?.join(',') === '3,4,5'
    );
  }, null, { timeout: 20_000 });

  await page.click('#clearFilters');
  await page.waitForFunction(() => window.__example64?.getSnapshot?.().filteredColumnCount === 0, null, {
    timeout: 20_000
  });

  await openHeaderFilter('createdAt');
  await page.selectOption('.hgrid__filter-panel [data-filter-role="operator"][data-filter-clause-index="0"]', 'between');
  await page.locator('.hgrid__filter-panel [data-filter-role="min"][data-filter-clause-index="0"]').fill('2026-03-02');
  await page.locator('.hgrid__filter-panel [data-filter-role="max"][data-filter-clause-index="0"]').fill('2026-03-05');
  await page.locator('.hgrid__filter-panel [data-filter-action="apply"]').click();
  await page.waitForFunction(() => {
    const snapshot = window.__example64?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.createdAt?.kind === 'date' &&
      snapshot.filterModel?.createdAt?.operator === 'between' &&
      snapshot.visibleIds?.join(',') === '2,3,4,5'
    );
  }, null, { timeout: 20_000 });

  await page.click('#clearFilters');
  await page.waitForFunction(() => window.__example64?.getSnapshot?.().filteredColumnCount === 0, null, {
    timeout: 20_000
  });

  await openHeaderFilter('region');
  await page.locator('.hgrid__filter-panel [data-filter-mode-trigger="set"]').click();
  await page.locator('.hgrid__filter-panel [data-filter-set-search="true"]').fill('APAC');
  await page.locator('.hgrid__filter-panel-set-option', { hasText: 'APAC' }).locator('input[type="checkbox"]').click();
  await page.locator('.hgrid__filter-panel [data-filter-action="apply"]').click();
  await page.waitForFunction(() => {
    const snapshot = window.__example64?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.region?.kind === 'set' &&
      Array.isArray(snapshot.filterModel?.region?.values) &&
      snapshot.filterModel.region.values.length === 1 &&
      snapshot.filterModel.region.values[0] === 'APAC' &&
      snapshot.headers?.region === true &&
      snapshot.visibleIds?.join(',') === '1,3,5'
    );
  }, null, { timeout: 20_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample65Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example65.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example65?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__tool-panel--open', { timeout: 15_000, state: 'visible' });

  const initialSnapshot = await page.evaluate(() => window.__example65.getSnapshot());
  assert.equal(initialSnapshot.panelOpen, true, 'example65 columns panel should start open');
  assert.deepEqual(
    initialSnapshot.visibleColumns,
    ['id', 'name', 'region', 'status', 'score'],
    'example65 initial visible columns should match source order'
  );

  await page.locator('[data-tool-panel-visibility-column-id="status"]').setChecked(false);
  await page.waitForFunction(
    () => {
      const snapshot = window.__example65?.getSnapshot?.();
      return snapshot && snapshot.hiddenColumns.includes('status') && !snapshot.visibleColumns.includes('status');
    },
    null,
    { timeout: 10_000 }
  );

  await page.locator('[data-tool-panel-visibility-column-id="status"]').setChecked(true);
  await page.waitForFunction(
    () => {
      const snapshot = window.__example65?.getSnapshot?.();
      return snapshot && !snapshot.hiddenColumns.includes('status') && snapshot.visibleColumns.includes('status');
    },
    null,
    { timeout: 10_000 }
  );

  await page.selectOption('[data-tool-panel-pin-column-id="name"]', 'left');
  await page.waitForFunction(
    () => {
      const snapshot = window.__example65?.getSnapshot?.();
      return snapshot && snapshot.pinnedLeft.includes('name') && snapshot.visibleColumns[0] === 'name';
    },
    null,
    { timeout: 10_000 }
  );

  await page.click('#closePanel');
  await page.waitForFunction(() => window.__example65?.getSnapshot?.().panelOpen === false, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample75Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example75.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example75?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__tool-panel--open', { timeout: 15_000, state: 'visible' });

  const initialSnapshot = await page.evaluate(() => window.__example75.getSnapshot());
  assert.equal(initialSnapshot.panelOpen, true, 'example75 columns panel should start open');
  assert.deepEqual(
    initialSnapshot.columnOrder,
    ['id', 'name', 'region', 'status', 'score', 'updatedAt'],
    'example75 initial column order should match source order'
  );

  await page.locator('[data-tool-panel-columns-search="true"]').fill('st');
  await page.waitForFunction(
    () => {
      const snapshot = window.__example75?.getSnapshot?.();
      return snapshot && snapshot.search === 'st' && snapshot.panelRows.join(',') === 'Status';
    },
    null,
    { timeout: 10_000 }
  );

  await page.locator('[data-tool-panel-columns-search="true"]').fill('');
  await page.waitForFunction(
    () => {
      const snapshot = window.__example75?.getSnapshot?.();
      return snapshot && snapshot.search === '' && snapshot.panelRows.length === 6;
    },
    null,
    { timeout: 10_000 }
  );

  await page.click('[data-tool-panel-order-kind="columns"][data-tool-panel-order-column-id="region"][data-tool-panel-order-direction="down"]');
  await page.waitForFunction(
    () => {
      const snapshot = window.__example75?.getSnapshot?.();
      return snapshot && snapshot.columnOrder.join(',') === 'id,name,status,region,score,updatedAt';
    },
    null,
    { timeout: 10_000 }
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample76Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example76.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example76?.getSnapshot), null, { timeout: 15_000 });
  await page.click('#seedNested');
  await page.waitForFunction(() => {
    const snapshot = window.__example76?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.groupCount === 2 &&
      snapshot.visibleIds?.join(',') === '1,3,6' &&
      snapshot.advancedFilterModel?.rules?.[0]?.kind === 'group' &&
      snapshot.advancedFilterModel?.rules?.[0]?.rules?.[1]?.kind === 'group'
    );
  }, null, { timeout: 10_000 });

  await page.click('#seedReview');
  await page.waitForFunction(() => {
    const snapshot = window.__example76?.getSnapshot?.();
    return snapshot && snapshot.groupCount === 1 && snapshot.visibleIds?.join(',') === '1,2,3,5';
  }, null, { timeout: 10_000 });

  await page.click('#clearAll');
  await page.waitForFunction(() => {
    const snapshot = window.__example76?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.groupCount === 0 &&
      snapshot.advancedFilterModel === null &&
      snapshot.visibleIds?.join(',') === '1,2,3,4,5,6'
    );
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample77Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example77.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example77?.getSnapshot), null, { timeout: 15_000 });

  await page.locator('.hgrid__filter-row-input[data-filter-row-column-id="name"]').fill('ta');
  await page.locator('.hgrid__filter-row-input[data-filter-row-column-id="name"]').press('Enter');
  await page.waitForFunction(() => {
    const snapshot = window.__example77?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.name?.kind === 'text' &&
      snapshot.filterModel?.name?.operator === 'contains' &&
      snapshot.visibleIds?.join(',') === '2,4,5'
    );
  }, null, { timeout: 10_000 });

  await page.locator('.hgrid__filter-row-input[data-filter-row-column-id="score"]').fill('>=60');
  await page.locator('.hgrid__filter-row-input[data-filter-row-column-id="score"]').press('Tab');
  await page.waitForFunction(() => {
    const snapshot = window.__example77?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.score?.kind === 'number' &&
      snapshot.filterModel?.score?.operator === 'gte' &&
      snapshot.visibleIds?.join(',') === '2'
    );
  }, null, { timeout: 10_000 });

  await page.click('#seedDateFilter');
  await page.waitForFunction(() => {
    const snapshot = window.__example77?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.updatedAt?.operator === 'onOrAfter' &&
      snapshot.filterRowValues?.updatedAt === '>=2026-03-12' &&
      snapshot.visibleIds?.join(',') === '3,4,5'
    );
  }, null, { timeout: 10_000 });

  await page
    .locator('.hgrid__filter-row-date-input[data-filter-row-column-id="updatedAt"][data-filter-row-control="date-value"]')
    .press('Escape');
  await page.waitForFunction(() => {
    const snapshot = window.__example77?.getSnapshot?.();
    return snapshot && Object.keys(snapshot.filterModel ?? {}).length === 0 && snapshot.visibleIds?.join(',') === '1,2,3,4,5';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample78Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example78.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example78?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__tool-panel--open', { timeout: 15_000, state: 'visible' });

  await page.click('[data-tool-panel-filter-surface="builder"]');
  await page.selectOption('[data-advanced-filter-role="condition-kind"][data-advanced-filter-path="0"]', 'set');
  await page.locator('[data-advanced-filter-role="set-option"][data-advanced-filter-path="0"][data-advanced-filter-set-key="s:APAC"]').check();
  await page.locator('[data-advanced-filter-role="set-option"][data-advanced-filter-path="0"][data-advanced-filter-set-key="s:EMEA"]').check();
  await page.click('[data-advanced-filter-action="apply"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example78?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.advancedFilterModel?.rules?.[0]?.condition?.kind === 'set' &&
      snapshot.visibleIds?.join(',') === '1,2,3,5'
    );
  }, null, { timeout: 10_000 });

  await page.locator('[data-advanced-filter-preset-label="true"]').fill('apac-emea');
  await page.click('[data-advanced-filter-preset-action="save"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example78?.getSnapshot?.();
    return snapshot && Array.isArray(snapshot.advancedFilterPresets) && snapshot.advancedFilterPresets.some((preset) => preset.id === 'apac-emea');
  }, null, { timeout: 10_000 });

  await page.click('[data-advanced-filter-action="clear"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example78?.getSnapshot?.();
    return snapshot && snapshot.advancedFilterModel === null && snapshot.visibleIds?.join(',') === '1,2,3,4,5,6';
  }, null, { timeout: 10_000 });

  await page.selectOption('[data-advanced-filter-preset-select="true"]', 'apac-emea');
  await page.click('[data-advanced-filter-preset-action="apply"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example78?.getSnapshot?.();
    return snapshot && snapshot.advancedFilterModel?.rules?.[0]?.condition?.kind === 'set' && snapshot.visibleIds?.join(',') === '1,2,3,5';
  }, null, { timeout: 10_000 });

  await page.selectOption('.hgrid__filter-row-select[data-filter-row-column-id="active"]', 'true');
  await page.waitForFunction(() => {
    const snapshot = window.__example78?.getSnapshot?.();
    return snapshot && snapshot.filterModel?.active?.kind === 'set' && snapshot.visibleIds?.join(',') === '1,5';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample79Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example79.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example79?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__tool-panel--open', { timeout: 15_000, state: 'visible' });

  await page.selectOption('[data-tool-panel-columns-preset-select="true"]', 'analyst');
  await page.click('[data-tool-panel-columns-preset-action="apply"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example79?.getSnapshot?.();
    return snapshot && snapshot.columnLayout?.hiddenColumnIds?.includes('status') && snapshot.statusBar?.columns === 'Cols 6/7';
  }, null, { timeout: 10_000 });

  await page.click('#filterEmea');
  await page.waitForFunction(() => {
    const snapshot = window.__example79?.getSnapshot?.();
    return snapshot && snapshot.statusBar?.filters === 'Filters 1' && snapshot.visibleIds?.join(',') === '2,5';
  }, null, { timeout: 10_000 });

  await page.click('#clearFilter');
  await page.waitForFunction(() => {
    const snapshot = window.__example79?.getSnapshot?.();
    return snapshot && snapshot.statusBar?.filters === 'Filters 0' && snapshot.visibleIds?.join(',') === '1,2,3,4,5';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample80Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example80.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example80?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__filter-row-set-select[data-filter-row-column-id="status"]', {
    timeout: 15_000,
    state: 'visible'
  });

  await page.waitForFunction(() => {
    const snapshot = window.__example80?.getSnapshot?.();
    return snapshot && Array.isArray(snapshot.statusOptions) && snapshot.statusOptions.includes('Tail-only');
  }, null, { timeout: 10_000 });

  await page.click('#selectTailOnly');
  await page.waitForFunction(() => {
    const snapshot = window.__example80?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel?.status?.kind === 'set' &&
      snapshot.filterModel?.status?.values?.[0] === 'Tail-only' &&
      snapshot.visibleCount === 205
    );
  }, null, { timeout: 10_000 });

  await page.click('#clearFilter');
  await page.waitForFunction(() => {
    const snapshot = window.__example80?.getSnapshot?.();
    return snapshot && Object.keys(snapshot.filterModel ?? {}).length === 0 && snapshot.visibleCount === 5205;
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample81Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example81.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example81?.getSnapshot), null, { timeout: 15_000 });

  await page.click('#dragAutoScroll');
  await page.waitForFunction(() => {
    const snapshot = window.__example81?.getSnapshot?.();
    if (!snapshot || !Array.isArray(snapshot.trackedRows)) {
      return false;
    }

    const row17 = snapshot.trackedRows.find((row) => row.rowIndex === 17);
    const row18 = snapshot.trackedRows.find((row) => row.rowIndex === 18);
    return (
      snapshot.scrollTop > 0 &&
      snapshot.selection?.r2 >= 18 &&
      row17?.score === 90 &&
      row18?.score === 95 &&
      snapshot.lastEdit?.source === 'fillHandle'
    );
  }, null, { timeout: 15_000 });

  await page.click('#resetRows');
  await page.click('#dragMatrixTrend');
  await page.waitForFunction(() => {
    const snapshot = window.__example81?.getSnapshot?.();
    if (!snapshot || !Array.isArray(snapshot.trackedRows)) {
      return false;
    }

    const row0 = snapshot.trackedRows.find((row) => row.rowIndex === 0);
    const row1 = snapshot.trackedRows.find((row) => row.rowIndex === 1);
    const row2 = snapshot.trackedRows.find((row) => row.rowIndex === 2);
    const row3 = snapshot.trackedRows.find((row) => row.rowIndex === 3);
    return (
      snapshot.selection?.r1 === 0 &&
      snapshot.selection?.c1 === 2 &&
      snapshot.selection?.r2 === 3 &&
      snapshot.selection?.c2 === 5 &&
      row0?.q4 === 4 &&
      row1?.q4 === 14 &&
      row2?.q1 === 21 &&
      row3?.q4 === 34 &&
      snapshot.lastEdit?.source === 'fillHandle'
    );
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample82Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example82.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example82?.getSnapshot), null, { timeout: 15_000 });

  await page.click('#selectSmallRange');
  await page.waitForFunction(() => {
    const snapshot = window.__example82?.getSnapshot?.();
    return snapshot && snapshot.aggregatesText === 'Sum 9 · Avg 2.25 · Min 1 · Max 4';
  }, null, { timeout: 10_000 });

  await page.click('#selectLargeRange');
  await page.waitForFunction(() => {
    const snapshot = window.__example82?.getSnapshot?.();
    return snapshot && snapshot.aggregatesText.includes('Calculating');
  }, null, { timeout: 10_000 });
  await page.waitForFunction(() => {
    const snapshot = window.__example82?.getSnapshot?.();
    return snapshot && snapshot.aggregatesText === 'Sum 1,260 · Avg 21 · Min 1 · Max 60';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample83Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example83.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example83?.getSnapshot), null, { timeout: 15_000 });

  await page.click('#editFirstNote');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.canUndo === true &&
      snapshot.canRedo === false &&
      snapshot.rows?.[0]?.note === 'approved' &&
      snapshot.lastEdit?.source === 'editor'
    );
  }, null, { timeout: 10_000 });

  await page.click('#undoAction');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.canUndo === false &&
      snapshot.canRedo === true &&
      snapshot.rows?.[0]?.note === 'queued' &&
      snapshot.lastEdit?.source === 'undo'
    );
  }, null, { timeout: 10_000 });

  await page.click('#redoAction');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return snapshot && snapshot.rows?.[0]?.note === 'approved' && snapshot.lastEdit?.source === 'redo';
  }, null, { timeout: 10_000 });

  await page.click('#pasteStatusBlock');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.rows?.[0]?.status === 'active' &&
      snapshot.rows?.[0]?.note === 'copied' &&
      snapshot.rows?.[1]?.status === 'hold' &&
      snapshot.rows?.[1]?.note === 'manual' &&
      snapshot.lastEdit?.source === 'clipboard'
    );
  }, null, { timeout: 10_000 });

  await page.click('#undoAction');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.rows?.[0]?.status === 'draft' &&
      snapshot.rows?.[0]?.note === 'approved' &&
      snapshot.rows?.[1]?.status === 'review' &&
      snapshot.rows?.[1]?.note === 'awaiting' &&
      snapshot.lastEdit?.source === 'undo'
    );
  }, null, { timeout: 10_000 });

  await page.click('#fillQtySeries');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.rows?.[2]?.qty === 30 &&
      snapshot.rows?.[3]?.qty === 40 &&
      snapshot.lastEdit?.source === 'fillHandle'
    );
  }, null, { timeout: 10_000 });

  await page.click('#undoAction');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return snapshot && snapshot.rows?.[2]?.qty === 0 && snapshot.rows?.[3]?.qty === 0 && snapshot.lastEdit?.source === 'undo';
  }, null, { timeout: 10_000 });

  await page.click('#redoAction');
  await page.waitForFunction(() => {
    const snapshot = window.__example83?.getSnapshot?.();
    return snapshot && snapshot.rows?.[2]?.qty === 30 && snapshot.rows?.[3]?.qty === 40 && snapshot.lastEdit?.source === 'redo';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample84Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example84.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example84?.grid), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="account"]', {
    timeout: 15_000,
    state: 'attached'
  });

  await page.locator('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="account"]').dblclick();
  await page.waitForSelector(TEXT_EDITOR_SELECTOR, { timeout: 10_000, state: 'attached' });
  await page.locator(TEXT_EDITOR_SELECTOR).fill('Account-1-Edited');
  await page.locator(TEXT_EDITOR_SELECTOR).press('Enter');
  await page.waitForFunction(() => {
    const flag = document.getElementById('dirty-flag')?.textContent;
    const rows = document.getElementById('dirty-rows')?.textContent;
    const cells = document.getElementById('dirty-cells')?.textContent;
    return flag === 'true' && rows === '1' && cells === '1';
  }, null, { timeout: 10_000 });

  await page.click('#accept-dirty');
  await page.waitForFunction(() => {
    const flag = document.getElementById('dirty-flag')?.textContent;
    const rows = document.getElementById('dirty-rows')?.textContent;
    const cells = document.getElementById('dirty-cells')?.textContent;
    return flag === 'false' && rows === '0' && cells === '0';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample85Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example85.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example85?.getSnapshot), null, { timeout: 15_000 });

  await page.click('#editFirstName');
  await page.waitForFunction(() => {
    const snapshot = window.__example85?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.rows?.[0]?.name === 'Customer-1-Edited' &&
      snapshot.lastEdit?.source === 'editor' &&
      snapshot.lastEdit?.transactionKind === 'singleCell' &&
      snapshot.lastEdit?.transactionStep === 'apply' &&
      snapshot.lastEdit?.transactionId === snapshot.lastEdit?.rootTransactionId
    );
  }, null, { timeout: 10_000 });
  const editorSnapshot = await page.evaluate(() => window.__example85.getSnapshot());

  await page.click('#undoAction');
  await page.waitForFunction(
    ({ rootTransactionId }) => {
      const snapshot = window.__example85?.getSnapshot?.();
      return (
        snapshot &&
        snapshot.rows?.[0]?.name === 'Customer-1' &&
        snapshot.lastEdit?.source === 'undo' &&
        snapshot.lastEdit?.transactionKind === 'historyReplay' &&
        snapshot.lastEdit?.transactionStep === 'undo' &&
        snapshot.lastEdit?.rootTransactionId === rootTransactionId
      );
    },
    { rootTransactionId: editorSnapshot.lastEdit.rootTransactionId },
    { timeout: 10_000 }
  );

  await page.click('#redoAction');
  await page.waitForFunction(
    ({ rootTransactionId }) => {
      const snapshot = window.__example85?.getSnapshot?.();
      return (
        snapshot &&
        snapshot.rows?.[0]?.name === 'Customer-1-Edited' &&
        snapshot.lastEdit?.source === 'redo' &&
        snapshot.lastEdit?.transactionKind === 'historyReplay' &&
        snapshot.lastEdit?.transactionStep === 'redo' &&
        snapshot.lastEdit?.rootTransactionId === rootTransactionId
      );
    },
    { rootTransactionId: editorSnapshot.lastEdit.rootTransactionId },
    { timeout: 10_000 }
  );

  await page.click('#pasteStatusBlock');
  await page.waitForFunction(() => {
    const snapshot = window.__example85?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.rows?.[0]?.status === 'active' &&
      snapshot.rows?.[0]?.note === 'copied' &&
      snapshot.rows?.[1]?.status === 'hold' &&
      snapshot.rows?.[1]?.note === 'manual' &&
      snapshot.lastEdit?.source === 'clipboard' &&
      snapshot.lastEdit?.transactionKind === 'clipboardRange' &&
      snapshot.lastEdit?.transactionStep === 'apply'
    );
  }, null, { timeout: 10_000 });
  const clipboardSnapshot = await page.evaluate(() => window.__example85.getSnapshot());

  await page.click('#undoAction');
  await page.waitForFunction(
    ({ rootTransactionId }) => {
      const snapshot = window.__example85?.getSnapshot?.();
      return (
        snapshot &&
        snapshot.rows?.[0]?.status === 'draft' &&
        snapshot.rows?.[0]?.note === 'queued' &&
        snapshot.rows?.[1]?.status === 'review' &&
        snapshot.rows?.[1]?.note === 'awaiting' &&
        snapshot.lastEdit?.source === 'undo' &&
        snapshot.lastEdit?.rootTransactionId === rootTransactionId
      );
    },
    { rootTransactionId: clipboardSnapshot.lastEdit.rootTransactionId },
    { timeout: 10_000 }
  );

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample86Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example86.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example86?.getSnapshot), null, { timeout: 15_000 });

  const csvSummary = await page.evaluate(async () => window.__example86.runCsvSelectionExport());
  assert.equal(csvSummary.format, 'csv', 'example86 csv export should use csv format');
  assert.equal(csvSummary.scope, 'selection', 'example86 csv export should use selection scope');
  assert.equal(csvSummary.rowCount, 2, 'example86 csv selection export should include two rows');
  assert.equal(csvSummary.firstLine, 'Name,Status,Score', 'example86 csv selection export should include selected headers');

  const tsvSummary = await page.evaluate(async () => window.__example86.runTsvVisibleExport());
  assert.equal(tsvSummary.format, 'tsv', 'example86 tsv export should use tsv format');
  assert.equal(tsvSummary.scope, 'visible', 'example86 tsv export should use visible scope');
  assert.ok(tsvSummary.rowCount >= 6, 'example86 tsv visible export should include visible rows');

  const delegatedSummary = await page.evaluate(async () => window.__example86.runDelegatedXlsxExport());
  assert.equal(delegatedSummary.delegated, true, 'example86 xlsx export should delegate on large row count');
  assert.ok(
    typeof delegatedSummary.downloadUrl === 'string' && delegatedSummary.downloadUrl.includes('/downloads/policy-export.xlsx'),
    'example86 delegated xlsx export should expose download url'
  );
  assert.ok(
    Array.isArray(delegatedSummary.progress) &&
      delegatedSummary.progress.some((entry) => entry.status === 'delegated'),
    'example86 delegated xlsx export should report delegated progress'
  );

  const skipSummary = await page.evaluate(async () => window.__example86.runConflictImport('skipConflicts'));
  assert.equal(skipSummary.result.updatedRows, 0, 'example86 skipConflicts should not update rows');
  assert.equal(skipSummary.result.conflictRows, 2, 'example86 skipConflicts should count conflicts');
  assert.equal(skipSummary.result.issues.length, 2, 'example86 skipConflicts should report conflict issues');
  assert.equal(skipSummary.snapshot.row0.name, 'Ahn', 'example86 skipConflicts should keep row0 name');
  assert.equal(skipSummary.snapshot.row1.status, 'idle', 'example86 skipConflicts should keep row1 status');

  const overwriteSummary = await page.evaluate(async () => window.__example86.runConflictImport('overwrite'));
  assert.equal(overwriteSummary.result.updatedRows, 2, 'example86 overwrite should update conflicting rows');
  assert.equal(overwriteSummary.result.conflictRows, 2, 'example86 overwrite should still report conflict count');
  assert.equal(overwriteSummary.result.issues.length, 0, 'example86 overwrite should not create conflict issues');
  assert.equal(overwriteSummary.snapshot.row0.name, 'Ahn Imported', 'example86 overwrite should apply imported row0');
  assert.equal(overwriteSummary.snapshot.row1.status, 'hold', 'example86 overwrite should apply imported row1');

  const reportOnlySummary = await page.evaluate(async () => window.__example86.runConflictImport('reportOnly'));
  assert.equal(reportOnlySummary.result.updatedRows, 0, 'example86 reportOnly should not update rows');
  assert.equal(reportOnlySummary.result.conflictRows, 2, 'example86 reportOnly should report conflicts');
  assert.equal(reportOnlySummary.snapshot.row0.name, 'Ahn', 'example86 reportOnly should keep row0 unchanged');

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample87Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example87.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example87?.getSnapshot), null, { timeout: 15_000 });

  const initialSnapshot = await page.evaluate(() => window.__example87.getSnapshot());
  assert.equal(initialSnapshot.policy.formulaSupport, 'plugin-only', 'example87 should expose plugin-only formula policy');
  assert.equal(initialSnapshot.row0.subtotal, '240.00', 'example87 should render initial derived subtotal');
  assert.equal(initialSnapshot.row0.grandTotal, '264.00', 'example87 should render initial derived grand total');

  await page.evaluate(async () => window.__example87.applyBaseValue(0, 'quantity', 5));
  await page.waitForFunction(() => {
    const snapshot = window.__example87?.getSnapshot?.();
    return snapshot && snapshot.row0.quantity === '5' && snapshot.row0.subtotal === '600.00' && snapshot.row0.grandTotal === '660.00';
  }, null, { timeout: 10_000 });

  await page.evaluate(async () => window.__example87.applyBaseValue(1, 'unitPrice', 150.5));
  await page.waitForFunction(() => {
    const snapshot = window.__example87?.getSnapshot?.();
    return snapshot && snapshot.row1.unitPrice === '150.5' && snapshot.row1.subtotal === '451.50' && snapshot.row1.grandTotal === '487.62';
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample88Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example88.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example88?.getSnapshot), null, { timeout: 15_000 });

  await page.evaluate(async () => window.__example88.applyCellChange(0, 'budget', 1500));
  await page.waitForFunction(() => {
    const snapshot = window.__example88?.getSnapshot?.();
    return snapshot && snapshot.hasDirtyChanges === true && snapshot.dirtySummary.cellCount === 1;
  }, null, { timeout: 10_000 });
  await page.waitForFunction(() => window.__example88?.getSnapshot?.().actionBar.visible === true, null, { timeout: 10_000 });

  const initialDirtySnapshot = await page.evaluate(() => window.__example88.getSnapshot());
  assert.equal(initialDirtySnapshot.actionBar.visible, true, 'example88 action bar should be visible after edit');
  assert.equal(initialDirtySnapshot.actionBar.saveDisabled, false, 'example88 save should be enabled after edit');
  assert.equal(initialDirtySnapshot.rows[0].budget, 1500, 'example88 first edit should update local row');

  await page.evaluate(() => window.__example88.setFailNextSave(true));
  await page.click('[data-edit-action-bar-action="save"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example88?.getSnapshot?.();
    return snapshot && snapshot.hasDirtyChanges === true && snapshot.actionBar.message.includes('Server rejected changes');
  }, null, { timeout: 10_000 });

  await page.click('[data-edit-action-bar-action="discard"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example88?.getSnapshot?.();
    return snapshot && snapshot.hasDirtyChanges === false && snapshot.rows[0].budget === 1200;
  }, null, { timeout: 10_000 });

  await page.evaluate(async () => window.__example88.applyCellChange(1, 'status', 'active'));
  await page.waitForFunction(() => window.__example88?.getSnapshot?.().hasDirtyChanges === true, null, { timeout: 10_000 });

  await page.click('[data-edit-action-bar-action="save"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example88?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.hasDirtyChanges === false &&
      snapshot.rows[1].status === 'active' &&
      snapshot.lastSavePayload &&
      snapshot.lastSavePayload.summary.rowCount === 1 &&
      snapshot.actionBar.message.includes('Changes saved')
    );
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample66Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example66.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example66?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForSelector('.hgrid__tool-panel--open', { timeout: 15_000, state: 'visible' });

  const initialSnapshot = await page.evaluate(() => window.__example66.getSnapshot());
  assert.equal(initialSnapshot.panelOpen, true, 'example66 filters panel should start open');
  assert.equal(initialSnapshot.filteredColumnCount, 0, 'example66 should start with empty filter model');

  await page.click('[data-tool-panel-filter-column-id="region"]');
  await page.click('[data-tool-panel-filter-mode-trigger="set"]');
  await page.locator('[data-tool-panel-filter-option-key="s:APAC"]').check();
  await page.click('[data-tool-panel-filter-action="apply"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example66?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filteredColumnCount === 1 &&
      snapshot.filterModel.region &&
      snapshot.filterModel.region.kind === 'set' &&
      Array.isArray(snapshot.visibleIds) &&
      snapshot.visibleIds.join(',') === '1,3,5'
    );
  });

  await page.click('[data-tool-panel-filter-action="clear"]');
  await page.waitForFunction(() => window.__example66?.getSnapshot?.().filteredColumnCount === 0, null, {
    timeout: 10_000
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample67Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example67.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example67?.getSnapshot), null, { timeout: 15_000 });

  const initialSnapshot = await page.evaluate(() => window.__example67.getSnapshot());
  assert.equal(initialSnapshot.openPanelId, 'grouping', 'example67 should start with grouping panel open');
  assert.equal(initialSnapshot.dockWidth, '320px', 'example67 should reserve docked side bar width');

  await page.locator('[data-tool-panel-group-column-id="region"]').check();
  await page.selectOption(
    '[data-tool-panel-aggregate-kind="group"][data-tool-panel-aggregate-column-id="sales"]',
    'sum'
  );
  await page.waitForFunction(() => {
    const snapshot = window.__example67?.getSnapshot?.();
    return (
      snapshot &&
      Array.isArray(snapshot.groupModel) &&
      snapshot.groupModel[0]?.columnId === 'region' &&
      Array.isArray(snapshot.groupAggregations) &&
      snapshot.groupAggregations[0]?.columnId === 'sales' &&
      snapshot.groupAggregations[0]?.type === 'sum'
    );
  });

  await page.click('[data-tool-panel-tab-id="pivot"]');
  await page.waitForFunction(() => window.__example67?.getSnapshot?.().openPanelId === 'pivot', null, { timeout: 10_000 });
  await page.locator('[data-tool-panel-pivot-column-id="month"]').check();
  await page.selectOption(
    '[data-tool-panel-aggregate-kind="pivot"][data-tool-panel-aggregate-column-id="sales"]',
    'avg'
  );
  await page.waitForFunction(() => {
    const snapshot = window.__example67?.getSnapshot?.();
    return (
      snapshot &&
      Array.isArray(snapshot.pivotModel) &&
      snapshot.pivotModel[0]?.columnId === 'month' &&
      Array.isArray(snapshot.pivotValues) &&
      snapshot.pivotValues[0]?.columnId === 'sales' &&
      snapshot.pivotValues[0]?.type === 'avg'
    );
  });

  await page.click('.hgrid__tool-panel-close');
  await page.waitForFunction(() => {
    const snapshot = window.__example67?.getSnapshot?.();
    return snapshot && snapshot.openPanelId === null && snapshot.dockWidth === '28px';
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample68Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example68.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example68?.getSnapshot), null, { timeout: 15_000 });

  const initialSnapshot = await page.evaluate(() => window.__example68.getSnapshot());
  assert.equal(initialSnapshot.openPanelId, 'insights', 'example68 should start with custom insights panel open');
  assert.equal(initialSnapshot.dockWidth, '320px', 'example68 should reserve docked side bar width');
  assert.ok(
    initialSnapshot.summaryText.includes('visible=id,name,region,sales'),
    `example68 should render custom summary, actual="${initialSnapshot.summaryText}"`
  );

  await page.click('[data-custom-insights-apply-filter="true"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example68?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.filterModel.region &&
      snapshot.filterModel.region.kind === 'set' &&
      typeof snapshot.summaryText === 'string' &&
      snapshot.summaryText.includes('filters=region')
    );
  });

  await page.click('[data-custom-insights-compact-layout="true"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example68?.getSnapshot?.();
    return snapshot && Array.isArray(snapshot.visibleColumns) && !snapshot.visibleColumns.includes('sales');
  });

  await page.click('[data-custom-insights-clear-filter="true"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example68?.getSnapshot?.();
    return snapshot && Object.keys(snapshot.filterModel ?? {}).length === 0;
  });

  await page.click('[data-custom-insights-close="true"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example68?.getSnapshot?.();
    return snapshot && snapshot.openPanelId === null && snapshot.dockWidth === '28px';
  });

  await page.click('[data-tool-panel-toggle="true"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example68?.getSnapshot?.();
    return snapshot && snapshot.openPanelId === 'insights' && snapshot.summaryText.includes('visible=id,name,region');
  });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample69Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example69.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example69?.getSnapshot), null, { timeout: 15_000 });

  const initialSnapshot = await page.evaluate(() => window.__example69.getSnapshot());
  assert.equal(initialSnapshot.open.panelOpen, true, 'example69 open case should start open');
  assert.equal(initialSnapshot.open.openPanelId, 'filters', 'example69 open case should start on default filters panel');
  assert.equal(initialSnapshot.open.dockWidth, '320px', 'example69 open case should reserve panel width');
  assert.equal(initialSnapshot.closed.panelOpen, false, 'example69 closed case should start closed');
  assert.equal(initialSnapshot.closed.openPanelId, null, 'example69 closed case should not have an active panel');
  assert.equal(initialSnapshot.closed.dockWidth, '28px', 'example69 closed case should reserve only edge handle width');

  await page.click('[data-case="closed"] [data-tool-panel-toggle="true"]');
  await page.waitForFunction(() => {
    const snapshot = window.__example69?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.closed &&
      snapshot.closed.panelOpen === true &&
      snapshot.closed.openPanelId === 'filters' &&
      snapshot.closed.dockWidth === '320px'
    );
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample70Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example70.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example70?.getSnapshot), null, { timeout: 15_000 });

  await page.waitForFunction(() => window.__example70?.getSnapshot?.().remoteText === 'Remote synced', null, {
    timeout: 20_000
  });

  await page.click('#selectMetrics');
  await page.waitForFunction(() => {
    const snapshot = window.__example70?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.selectionText === '4 cells selected' &&
      snapshot.aggregatesText === 'Sum 235 · Avg 58.75 · Min 12 · Max 107'
    );
  }, null, { timeout: 10_000 });

  await page.click('#applyApacFilter');
  await page.waitForFunction(() => {
    const snapshot = window.__example70?.getSnapshot?.();
    return snapshot && snapshot.filterModel?.region?.kind === 'set' && snapshot.rowsText.includes('Rows 40');
  }, null, { timeout: 20_000 });

  await page.click('#stageEdit');
  await page.waitForFunction(() => window.__example70?.getSnapshot?.().remoteText.includes('Pending 1 rows / 1 cells'), null, {
    timeout: 10_000
  });

  await page.click('#invalidateBlock0');
  await page.waitForFunction(() => window.__example70?.getSnapshot?.().remoteText.includes('Loading 1'), null, {
    timeout: 20_000
  });

  await page.click('#acceptPending');
  await page.waitForFunction(() => {
    const snapshot = window.__example70?.getSnapshot?.();
    return snapshot && snapshot.remoteText === 'Remote synced';
  }, null, { timeout: 20_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample71Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example71.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example71?.getSnapshot), null, { timeout: 15_000 });
  await page.waitForFunction(() => window.__example71?.getSnapshot?.().handleVisible === true, null, { timeout: 10_000 });

  const initialSnapshot = await page.evaluate(() => window.__example71.getSnapshot());
  assert.equal(initialSnapshot.mode, 'fill', 'example71 should start in fill mode');
  assert.deepEqual(initialSnapshot.selection, { r1: 0, c1: 2, r2: 1, c2: 2 }, 'example71 should preload score series seed');

  await page.click('#dragScoreSeries');
  await page.waitForFunction(() => {
    const snapshot = window.__example71?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.rows?.[2]?.score === 30 &&
      snapshot.rows?.[5]?.score === 60 &&
      snapshot.lastEdit?.source === 'fillHandle'
    );
  }, null, { timeout: 10_000 });

  await page.click('#setCopyMode');
  await page.click('#selectNameCopy');
  await page.click('#dragNameCopy');
  await page.waitForFunction(() => {
    const snapshot = window.__example71?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.mode === 'copy' &&
      snapshot.rows?.[1]?.name === 'North' &&
      snapshot.rows?.[3]?.name === 'North' &&
      snapshot.selection?.r2 === 3
    );
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function runExample72Checks(page, serverUrl, pageErrors) {
  await page.goto(`${serverUrl}/examples/example72.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__example72?.getSnapshot), null, { timeout: 15_000 });

  const initialSnapshot = await page.evaluate(() => window.__example72.getSnapshot());
  assert.deepEqual(
    initialSnapshot.visibleColumns,
    ['id', 'name', 'region', 'department', 'balance', 'status', 'updatedAt'],
    'example72 should start with default visible columns'
  );
  assert.equal(initialSnapshot.savedLayout, null, 'example72 should start with empty storage');
  assert.equal(initialSnapshot.savedWorkspace, null, 'example72 should start with empty workspace storage');

  await page.click('#presetAnalyst');
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.layout?.pinnedColumns?.region === 'left' &&
      snapshot.layout?.pinnedColumns?.name === 'left' &&
      snapshot.layout?.pinnedColumns?.balance === 'right' &&
      snapshot.visibleColumns?.[0] === 'region'
    );
  }, null, { timeout: 10_000 });

  await page.click('#saveLayout');
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return snapshot && typeof snapshot.savedLayout === 'string' && snapshot.savedLayout.includes('"balance":"right"');
  }, null, { timeout: 10_000 });

  await page.evaluate(() => window.__example72.setScrollTop(224));
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return snapshot && snapshot.state?.scrollTop > 0 && snapshot.visibleRange?.startRow > 0;
  }, null, { timeout: 10_000 });

  await page.click('#saveWorkspace');
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return (
      snapshot &&
      typeof snapshot.savedWorkspace === 'string' &&
      snapshot.savedWorkspace.includes('"scrollTop":224')
    );
  }, null, { timeout: 10_000 });

  await page.click('#restoreDefault');
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.visibleColumns?.[0] === 'id' &&
      Object.keys(snapshot.layout?.pinnedColumns ?? {}).length === 0 &&
      snapshot.layout?.hiddenColumnIds?.length === 0
    );
  }, null, { timeout: 10_000 });

  await page.evaluate(() => window.__example72.setScrollTop(0));
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return snapshot && snapshot.state?.scrollTop === 0;
  }, null, { timeout: 10_000 });

  await page.click('#loadLayout');
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.layout?.pinnedColumns?.region === 'left' &&
      snapshot.layout?.pinnedColumns?.balance === 'right' &&
      snapshot.visibleColumns?.[0] === 'region'
    );
  }, null, { timeout: 10_000 });

  await page.click('#restoreDefault');
  await page.evaluate(() => window.__example72.setScrollTop(0));
  await page.click('#loadWorkspace');
  await page.waitForFunction(() => {
    const snapshot = window.__example72?.getSnapshot?.();
    return (
      snapshot &&
      snapshot.layout?.pinnedColumns?.region === 'left' &&
      snapshot.layout?.pinnedColumns?.balance === 'right' &&
      snapshot.visibleColumns?.[0] === 'region' &&
      snapshot.state?.scrollTop === 224 &&
      snapshot.visibleRange?.startRow > 0
    );
  }, null, { timeout: 10_000 });

  assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
}

async function expectLogContains(logLocator, expectedText) {
  await logLocator.waitFor({ state: 'visible', timeout: 10_000 });
  const logValue = await logLocator.textContent();
  assert.ok(logValue?.includes(expectedText), `Expected log to contain "${expectedText}", actual="${logValue}"`);
}

function expect(locator) {
  return {
    async toHaveText(expectedText) {
      const text = await locator.textContent();
      assert.equal(text, expectedText, `Expected text "${expectedText}", actual "${text}"`);
    }
  };
}

async function main() {
  const rootDir = process.cwd();
  const umdPath = path.resolve(rootDir, 'packages/grid-core/dist/grid.umd.js');
  const workerAssetPaths = ['sort.worker.js', 'filter.worker.js', 'group.worker.js', 'pivot.worker.js', 'tree.worker.js'];

  if (!existsSync(umdPath)) {
    throw new Error('Missing build output: packages/grid-core/dist/grid.umd.js. Run pnpm build first.');
  }
  for (let index = 0; index < workerAssetPaths.length; index += 1) {
    const workerAssetPath = path.resolve(rootDir, 'packages/grid-core/dist', workerAssetPaths[index]);
    if (!existsSync(workerAssetPath)) {
      throw new Error(`Missing build output: ${workerAssetPath}. Run pnpm build first.`);
    }
  }

  const server = await startStaticServer({ rootDir });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  try {
    await runExample1Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample2Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample3Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample4Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample5Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample6Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample7Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample8Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample9Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample10Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample11Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample12Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample13Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample14Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample15Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample16Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample17Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample18Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample19Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample20Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample21Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample22Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample23Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample24Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample25Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample26Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample27Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample28Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample29Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample30Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample31Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample32Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample33Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample34Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample35Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample36Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample37Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample38Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample39Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample40Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample41Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample44Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample45Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample46Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample47Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample48Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample49Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample50Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample51Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample52Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample53Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample54Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample55Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample56Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample57Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample58Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample59Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample60Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample61Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample63Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample73Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample74Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample76Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample77Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample78Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample79Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample80Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample81Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample82Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample83Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample84Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample85Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample86Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample87Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample88Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample89Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample90Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample91Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample64Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample65Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample75Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample66Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample67Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample68Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample69Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample70Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample71Checks(page, server.url, pageErrors);
    pageErrors.length = 0;
    await runExample72Checks(page, server.url, pageErrors);

    console.log('[e2e] OK');
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error('[e2e] FAILED');
  console.error(error);
  process.exit(1);
});
