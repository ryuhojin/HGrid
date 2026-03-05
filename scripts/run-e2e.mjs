import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

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
