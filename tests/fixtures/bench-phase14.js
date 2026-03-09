(function initBenchPhase14() {
  var mountElement = document.getElementById('grid');
  if (!mountElement) {
    window.__benchPhase14Error = 'Missing #grid mount element';
    return;
  }

  if (!window.HGrid || typeof window.HGrid.Grid !== 'function') {
    window.__benchPhase14Error = 'HGrid.Grid global is unavailable';
    return;
  }

  var ACTIVE_STATUSES = ['active', 'idle', 'pending', 'blocked'];
  var REGIONS = ['KR', 'US', 'JP', 'DE', 'FR', 'GB'];
  var activeGrid = null;

  function roundNumber(value) {
    return Number(value.toFixed(3));
  }

  function waitFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        resolve(true);
      });
    });
  }

  async function waitFrames(count) {
    var safeCount = Math.max(1, Number.isFinite(count) ? Math.floor(count) : 1);
    for (var index = 0; index < safeCount; index += 1) {
      await waitFrame();
    }
  }

  function createSyntheticDataProvider(rowCount) {
    function resolveValue(dataIndex) {
      return (Math.imul(dataIndex + 1, 48271) >>> 0) % 100000;
    }

    function resolveScore(dataIndex) {
      return ((Math.imul(dataIndex + 17, 1103515245) >>> 0) % 100000) / 100;
    }

    function resolveStatus(dataIndex) {
      return ACTIVE_STATUSES[dataIndex % ACTIVE_STATUSES.length];
    }

    function resolveRegion(dataIndex) {
      return REGIONS[dataIndex % REGIONS.length];
    }

    function resolveUpdatedAt(dataIndex) {
      var dayOffset = dataIndex % 365;
      var utcMs = Date.UTC(2026, 0, 1) - dayOffset * 24 * 60 * 60 * 1000;
      return new Date(utcMs).toISOString();
    }

    return {
      getRowCount: function getRowCount() {
        return rowCount;
      },
      getRowKey: function getRowKey(dataIndex) {
        return dataIndex;
      },
      getValue: function getValue(dataIndex, columnId) {
        if (columnId === 'id') {
          return dataIndex + 1;
        }

        if (columnId === 'name') {
          return 'Bench-' + (dataIndex + 1);
        }

        if (columnId === 'value') {
          return resolveValue(dataIndex);
        }

        if (columnId === 'score') {
          return resolveScore(dataIndex);
        }

        if (columnId === 'status') {
          return resolveStatus(dataIndex);
        }

        if (columnId === 'region') {
          return resolveRegion(dataIndex);
        }

        if (columnId === 'updatedAt') {
          return resolveUpdatedAt(dataIndex);
        }

        return '';
      },
      setValue: function setValue() {},
      applyTransactions: function applyTransactions() {},
      getRow: function getRow(dataIndex) {
        return {
          id: dataIndex + 1,
          name: 'Bench-' + (dataIndex + 1),
          value: resolveValue(dataIndex),
          score: resolveScore(dataIndex),
          status: resolveStatus(dataIndex),
          region: resolveRegion(dataIndex),
          updatedAt: resolveUpdatedAt(dataIndex)
        };
      }
    };
  }

  function createBaseColumns() {
    return [
      { id: 'id', header: 'ID', width: 120, type: 'number' },
      { id: 'name', header: 'Name', width: 240, type: 'text' },
      { id: 'value', header: 'Value', width: 180, type: 'number' },
      { id: 'score', header: 'Score', width: 180, type: 'number' },
      { id: 'status', header: 'Status', width: 160, type: 'text' },
      { id: 'region', header: 'Region', width: 160, type: 'text' },
      { id: 'updatedAt', header: 'Updated At', width: 240, type: 'date' }
    ];
  }

  function createScrollRegressionColumns() {
    var columns = [
      { id: 'id', header: 'ID', width: 120, type: 'number', pinned: 'left' }
    ];

    for (var index = 0; index < 32; index += 1) {
      columns.push({
        id: 'c' + index,
        header: 'C' + index,
        width: 140,
        type: index % 2 === 0 ? 'text' : 'number'
      });
    }

    columns.push({
      id: 'audit',
      header: 'Audit',
      width: 220,
      type: 'text',
      pinned: 'right'
    });

    return columns;
  }

  function createScrollRegressionRowData(count) {
    var rows = new Array(count);
    for (var rowIndex = 0; rowIndex < count; rowIndex += 1) {
      var row = {
        id: rowIndex + 1,
        audit: 'A-' + (rowIndex + 1)
      };
      for (var colIndex = 0; colIndex < 32; colIndex += 1) {
        if (colIndex % 2 === 0) {
          row['c' + colIndex] = 'R' + (rowIndex + 1) + '-C' + colIndex;
        } else {
          row['c' + colIndex] = (rowIndex * (colIndex + 3)) % 100000;
        }
      }
      rows[rowIndex] = row;
    }
    return rows;
  }

  function destroyActiveGrid() {
    if (!activeGrid) {
      return;
    }

    activeGrid.destroy();
    activeGrid = null;
    mountElement.replaceChildren();
  }

  function getVerticalScrollElement() {
    return mountElement.querySelector('.hgrid__v-scroll') || mountElement.querySelector('.hgrid__viewport');
  }

  function getHorizontalScrollElement() {
    return mountElement.querySelector('.hgrid__h-scroll');
  }

  function getFirstVisibleId() {
    var pinnedIdCell = mountElement.querySelector('.hgrid__row--left .hgrid__cell[data-column-id="id"]');
    if (pinnedIdCell) {
      return Number(pinnedIdCell.textContent || '');
    }

    var centerIdCell = mountElement.querySelector('.hgrid__row--center .hgrid__cell[data-column-id="id"]');
    if (centerIdCell) {
      return Number(centerIdCell.textContent || '');
    }

    return -1;
  }

  function parseTranslateX(transformValue) {
    if (!transformValue) {
      return Number.NaN;
    }

    var match = transformValue.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0(?:px)?\)/);
    if (!match) {
      return Number.NaN;
    }

    return Number(match[1]);
  }

  async function measureUiLag(operation, timeoutMs) {
    var maxGapMs = 0;
    var tickCount = 0;
    var lastTick = performance.now();
    var intervalId = window.setInterval(function () {
      var now = performance.now();
      var gap = now - lastTick;
      if (gap > maxGapMs) {
        maxGapMs = gap;
      }
      lastTick = now;
      tickCount += 1;
    }, 16);

    var timeoutHandle = null;
    var timeoutPromise = new Promise(function (_resolve, reject) {
      timeoutHandle = window.setTimeout(function () {
        reject(new Error('operation timeout'));
      }, timeoutMs);
    });

    var startMs = performance.now();

    try {
      await Promise.race([Promise.resolve().then(operation), timeoutPromise]);
      await waitFrames(2);
    } finally {
      window.clearInterval(intervalId);
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    }

    return {
      durationMs: roundNumber(performance.now() - startMs),
      maxGapMs: roundNumber(maxGapMs),
      tickCount: tickCount
    };
  }

  async function runInitialRender(rowCount) {
    destroyActiveGrid();

    var mountStart = performance.now();
    activeGrid = new window.HGrid.Grid(mountElement, {
      columns: createBaseColumns(),
      dataProvider: createSyntheticDataProvider(rowCount),
      height: 420,
      rowHeight: 24,
      overscan: 10,
      overscanCols: 2
    });
    await waitFrames(2);

    var renderMs = performance.now() - mountStart;
    var pooledRows = mountElement.querySelectorAll('.hgrid__row').length;
    var pooledCells = mountElement.querySelectorAll('.hgrid__cell').length;
    var viewRowCount = activeGrid.getViewRowCount();

    destroyActiveGrid();
    await waitFrames(1);

    return {
      rowCount: rowCount,
      initialRenderMs: roundNumber(renderMs),
      pooledRows: pooledRows,
      pooledCells: pooledCells,
      viewRowCount: viewRowCount
    };
  }

  async function runScrollFps1M(durationMs) {
    destroyActiveGrid();

    activeGrid = new window.HGrid.Grid(mountElement, {
      columns: createBaseColumns(),
      dataProvider: createSyntheticDataProvider(1000000),
      height: 420,
      rowHeight: 24,
      overscan: 10,
      overscanCols: 2
    });
    await waitFrames(2);

    var verticalScroll = getVerticalScrollElement();
    if (!verticalScroll) {
      throw new Error('Missing vertical scroll element in runScrollFps1M');
    }

    var maxScrollTop = Math.max(0, verticalScroll.scrollHeight - verticalScroll.clientHeight);
    var frameGaps = [];
    var frameCount = 0;
    var startTime = performance.now();
    var lastTime = startTime;
    var poolRowsMin = mountElement.querySelectorAll('.hgrid__row').length;
    var poolRowsMax = poolRowsMin;
    var poolCellsMin = mountElement.querySelectorAll('.hgrid__cell').length;
    var poolCellsMax = poolCellsMin;
    var poolSampleCount = 1;

    while (true) {
      var now = await new Promise(function (resolve) {
        requestAnimationFrame(resolve);
      });

      var elapsed = now - startTime;
      var gap = now - lastTime;
      frameGaps.push(gap);
      frameCount += 1;
      lastTime = now;

      if (maxScrollTop > 0) {
        var cycle = (elapsed % 1800) / 1800;
        var ratio = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;
        verticalScroll.scrollTop = maxScrollTop * ratio;
        verticalScroll.dispatchEvent(new Event('scroll'));
      }

      if (frameCount % 10 === 0) {
        var sampledRows = mountElement.querySelectorAll('.hgrid__row').length;
        var sampledCells = mountElement.querySelectorAll('.hgrid__cell').length;
        if (sampledRows < poolRowsMin) {
          poolRowsMin = sampledRows;
        }
        if (sampledRows > poolRowsMax) {
          poolRowsMax = sampledRows;
        }
        if (sampledCells < poolCellsMin) {
          poolCellsMin = sampledCells;
        }
        if (sampledCells > poolCellsMax) {
          poolCellsMax = sampledCells;
        }
        poolSampleCount += 1;
      }

      if (elapsed >= durationMs) {
        break;
      }
    }

    var sortedGaps = frameGaps.slice().sort(function (a, b) {
      return a - b;
    });
    var p95Index = Math.max(0, Math.min(sortedGaps.length - 1, Math.floor(sortedGaps.length * 0.95)));
    var elapsedMs = performance.now() - startTime;
    var longTaskCount = frameGaps.filter(function (gapValue) {
      return gapValue > 50;
    }).length;
    var longTaskRate = frameCount > 0 ? longTaskCount / frameCount : 0;
    var domNodeCountFixed = poolRowsMin === poolRowsMax && poolCellsMin === poolCellsMax;

    destroyActiveGrid();
    await waitFrames(1);

    return {
      rowCount: 1000000,
      rowHeight: 24,
      overscan: 10,
      durationMs: roundNumber(elapsedMs),
      frameCount: frameCount,
      avgFps: roundNumber((frameCount * 1000) / elapsedMs),
      frameTimeP95Ms: roundNumber(sortedGaps[p95Index] || 0),
      longTaskCount: longTaskCount,
      longTaskRate: roundNumber(longTaskRate),
      domNodeCountFixed: domNodeCountFixed,
      poolRowsMin: poolRowsMin,
      poolRowsMax: poolRowsMax,
      poolCellsMin: poolCellsMin,
      poolCellsMax: poolCellsMax,
      poolSampleCount: poolSampleCount,
      maxScrollTop: maxScrollTop
    };
  }

  async function run100MMapping() {
    var rowCount = 100000000;
    var rowHeight = 28;
    var virtualHeight = rowCount * rowHeight;

    destroyActiveGrid();
    activeGrid = new window.HGrid.Grid(mountElement, {
      columns: createBaseColumns(),
      dataProvider: createSyntheticDataProvider(rowCount),
      height: 420,
      rowHeight: rowHeight,
      overscan: 8,
      overscanCols: 2
    });
    await waitFrames(2);

    var checkpoints = [0, 0.25, 0.5, 0.75, 1];
    var mappingSamples = [];
    var maxTransitionMs = 0;

    for (var index = 0; index < checkpoints.length; index += 1) {
      var ratio = checkpoints[index];
      var transitionStart = performance.now();
      activeGrid.setState({ scrollTop: Math.floor(virtualHeight * ratio) });
      await waitFrames(2);
      var transitionMs = performance.now() - transitionStart;
      if (transitionMs > maxTransitionMs) {
        maxTransitionMs = transitionMs;
      }

      mappingSamples.push({
        ratio: ratio,
        firstVisibleId: getFirstVisibleId(),
        stateScrollTop: activeGrid.getState().scrollTop
      });
    }

    var topBefore = mappingSamples[0].firstVisibleId;
    var bottom = mappingSamples[mappingSamples.length - 1].firstVisibleId;

    var roundTripStart = performance.now();
    activeGrid.setState({ scrollTop: virtualHeight });
    await waitFrames(2);
    var jumpBottomMs = performance.now() - roundTripStart;
    var jumpBottomId = getFirstVisibleId();

    var backStart = performance.now();
    activeGrid.setState({ scrollTop: 0 });
    await waitFrames(2);
    var jumpTopMs = performance.now() - backStart;
    var topAfter = getFirstVisibleId();

    destroyActiveGrid();
    await waitFrames(1);

    return {
      rowCount: rowCount,
      rowHeight: rowHeight,
      virtualHeight: virtualHeight,
      mappingSamples: mappingSamples,
      maxTransitionMs: roundNumber(maxTransitionMs),
      jumpBottomMs: roundNumber(jumpBottomMs),
      jumpTopMs: roundNumber(jumpTopMs),
      jumpBottomFirstVisibleId: jumpBottomId,
      jumpTopFirstVisibleId: topAfter,
      topBefore: topBefore,
      topAfter: topAfter,
      roundTripDriftRows: Math.abs(topAfter - topBefore),
      bottomFirstVisibleId: bottom
    };
  }

  async function runSort1M() {
    destroyActiveGrid();

    activeGrid = new window.HGrid.Grid(mountElement, {
      columns: createBaseColumns(),
      dataProvider: createSyntheticDataProvider(1000000),
      height: 420,
      rowHeight: 24,
      overscan: 10,
      overscanCols: 2
    });
    await waitFrames(2);

    var lagMetrics = await measureUiLag(async function () {
      await activeGrid.setSortModel([
        { columnId: 'value', direction: 'desc' },
        { columnId: 'id', direction: 'asc' }
      ]);
    }, 180000);

    var firstVisibleId = getFirstVisibleId();
    var viewRowCount = activeGrid.getViewRowCount();

    destroyActiveGrid();
    await waitFrames(1);

    return {
      rowCount: 1000000,
      firstVisibleId: firstVisibleId,
      viewRowCount: viewRowCount,
      durationMs: lagMetrics.durationMs,
      maxGapMs: lagMetrics.maxGapMs,
      tickCount: lagMetrics.tickCount
    };
  }

  async function runFilter1M() {
    destroyActiveGrid();

    activeGrid = new window.HGrid.Grid(mountElement, {
      columns: createBaseColumns(),
      dataProvider: createSyntheticDataProvider(1000000),
      height: 420,
      rowHeight: 24,
      overscan: 10,
      overscanCols: 2
    });
    await waitFrames(2);

    var lagMetrics = await measureUiLag(async function () {
      await activeGrid.setFilterModel({
        status: { kind: 'set', values: ['active'] }
      });
    }, 180000);

    var firstVisibleId = getFirstVisibleId();
    var viewRowCount = activeGrid.getViewRowCount();

    destroyActiveGrid();
    await waitFrames(1);

    return {
      rowCount: 1000000,
      firstVisibleId: firstVisibleId,
      viewRowCount: viewRowCount,
      durationMs: lagMetrics.durationMs,
      maxGapMs: lagMetrics.maxGapMs,
      tickCount: lagMetrics.tickCount
    };
  }

  async function runCreateDestroy200() {
    destroyActiveGrid();

    var originalWindowAdd = window.addEventListener;
    var originalWindowRemove = window.removeEventListener;
    var windowListenerAdds = 0;
    var windowListenerRemoves = 0;
    window.addEventListener = function patchedAdd(type, listener, options) {
      windowListenerAdds += 1;
      return originalWindowAdd.call(this, type, listener, options);
    };
    window.removeEventListener = function patchedRemove(type, listener, options) {
      windowListenerRemoves += 1;
      return originalWindowRemove.call(this, type, listener, options);
    };

    var heapBefore =
      performance &&
      performance.memory &&
      typeof performance.memory.usedJSHeapSize === 'number'
        ? performance.memory.usedJSHeapSize
        : null;
    var rowNodePeak = 0;

    var startedAt = performance.now();

    try {
      for (var index = 0; index < 200; index += 1) {
        activeGrid = new window.HGrid.Grid(mountElement, {
          columns: createBaseColumns(),
          dataProvider: createSyntheticDataProvider(50000),
          height: 360,
          rowHeight: 24,
          overscan: 8,
          overscanCols: 2
        });
        await waitFrames(1);

        var rowNodeCount = mountElement.querySelectorAll('.hgrid__row').length;
        if (rowNodeCount > rowNodePeak) {
          rowNodePeak = rowNodeCount;
        }

        activeGrid.destroy();
        activeGrid = null;
        mountElement.replaceChildren();
        if (index % 20 === 19) {
          await waitFrames(1);
        }
      }
    } finally {
      window.addEventListener = originalWindowAdd;
      window.removeEventListener = originalWindowRemove;
    }

    await waitFrames(2);

    var heapAfter =
      performance &&
      performance.memory &&
      typeof performance.memory.usedJSHeapSize === 'number'
        ? performance.memory.usedJSHeapSize
        : null;

    return {
      iterations: 200,
      durationMs: roundNumber(performance.now() - startedAt),
      remainingGridNodes: mountElement.querySelectorAll('.hgrid').length,
      remainingRowNodes: mountElement.querySelectorAll('.hgrid__row').length,
      rowNodePeak: rowNodePeak,
      windowListenerAdds: windowListenerAdds,
      windowListenerRemoves: windowListenerRemoves,
      windowListenerNet: windowListenerAdds - windowListenerRemoves,
      heapUsedBefore: heapBefore,
      heapUsedAfter: heapAfter,
      heapDelta: heapBefore !== null && heapAfter !== null ? heapAfter - heapBefore : null
    };
  }

  async function runScrollRegression() {
    destroyActiveGrid();

    activeGrid = new window.HGrid.Grid(mountElement, {
      columns: createScrollRegressionColumns(),
      rowData: createScrollRegressionRowData(5000),
      height: 420,
      rowHeight: 28,
      overscan: 8,
      overscanCols: 2
    });
    await waitFrames(2);

    var horizontalScroll = getHorizontalScrollElement();
    var verticalScroll = getVerticalScrollElement();
    var headerViewport = mountElement.querySelector('.hgrid__header-viewport');
    var bodyViewport = mountElement.querySelector('.hgrid__rows-viewport--center');
    var pinnedCell = mountElement.querySelector('.hgrid__row--left .hgrid__cell[data-column-id="id"]');

    if (!horizontalScroll || !verticalScroll || !headerViewport || !bodyViewport || !pinnedCell) {
      throw new Error('Missing scroll regression elements');
    }

    var horizontalMax = Math.max(0, horizontalScroll.scrollWidth - horizontalScroll.clientWidth);
    var mismatchCount = 0;
    var sampleCount = 0;
    var roundTripDurationMs = 10000;
    var startMs = performance.now();

    while (true) {
      var now = await new Promise(function (resolve) {
        requestAnimationFrame(resolve);
      });
      var elapsed = now - startMs;
      var cycle = (elapsed % 2200) / 2200;
      var ratio = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2;

      if (horizontalMax > 0) {
        horizontalScroll.scrollLeft = horizontalMax * ratio;
        horizontalScroll.dispatchEvent(new Event('scroll'));
      }

      var headerX = parseTranslateX(headerViewport.style.transform);
      var bodyX = parseTranslateX(bodyViewport.style.transform);
      if (Number.isFinite(headerX) && Number.isFinite(bodyX)) {
        sampleCount += 1;
        if (Math.abs(headerX - bodyX) > 0.5) {
          mismatchCount += 1;
        }
      }

      if (elapsed >= roundTripDurationMs) {
        break;
      }
    }

    var wheelMismatchCount = 0;
    var wheelInputCount = 5000;
    var verticalMax = Math.max(0, verticalScroll.scrollHeight - verticalScroll.clientHeight);

    horizontalScroll.scrollLeft = 0;
    verticalScroll.scrollTop = 0;
    await waitFrames(1);

    for (var index = 0; index < wheelInputCount; index += 1) {
      var beforeX = horizontalScroll.scrollLeft;
      var beforeY = verticalScroll.scrollTop;

      if (index % 2 === 0) {
        pinnedCell.dispatchEvent(
          new WheelEvent('wheel', {
            deltaX: 120,
            deltaY: 0,
            bubbles: true,
            cancelable: true
          })
        );

        if (Math.abs(horizontalScroll.scrollLeft - beforeX) > 0.5) {
          wheelMismatchCount += 1;
        }
      } else {
        pinnedCell.dispatchEvent(
          new WheelEvent('wheel', {
            deltaX: 0,
            deltaY: 120,
            bubbles: true,
            cancelable: true
          })
        );

        if (beforeY < verticalMax - 0.5 && verticalScroll.scrollTop <= beforeY) {
          wheelMismatchCount += 1;
        }
      }

      if (index % 80 === 79) {
        await waitFrames(1);
      }
    }

    var verticalRect = verticalScroll.getBoundingClientRect();
    var horizontalRect = horizontalScroll.getBoundingClientRect();
    var rootElement = mountElement.querySelector('.hgrid');
    var rootRect = rootElement ? rootElement.getBoundingClientRect() : null;

    var scrollbarRecord = {
      platform: navigator.platform || '',
      userAgent: navigator.userAgent || '',
      verticalDisplay: getComputedStyle(verticalScroll).display,
      verticalOverflowY: getComputedStyle(verticalScroll).overflowY,
      horizontalDisplay: getComputedStyle(horizontalScroll).display,
      horizontalOverflowX: getComputedStyle(horizontalScroll).overflowX,
      verticalRect: {
        width: roundNumber(verticalRect.width),
        height: roundNumber(verticalRect.height),
        left: roundNumber(verticalRect.left),
        right: roundNumber(verticalRect.right)
      },
      horizontalRect: {
        width: roundNumber(horizontalRect.width),
        height: roundNumber(horizontalRect.height),
        left: roundNumber(horizontalRect.left),
        right: roundNumber(horizontalRect.right)
      },
      rootRect: rootRect
        ? {
            width: roundNumber(rootRect.width),
            height: roundNumber(rootRect.height),
            left: roundNumber(rootRect.left),
            right: roundNumber(rootRect.right)
          }
        : null
    };

    destroyActiveGrid();
    await waitFrames(1);

    return {
      horizontalRoundTripDurationMs: roundTripDurationMs,
      horizontalSampleCount: sampleCount,
      headerBodyMismatchCount: mismatchCount,
      pinnedWheelInputCount: wheelInputCount,
      pinnedWheelSourceMismatchCount: wheelMismatchCount,
      scrollbarRecord: scrollbarRecord
    };
  }

  async function runAll() {
    var initialRender100k = await runInitialRender(100000);
    var initialRender1m = await runInitialRender(1000000);
    var scrollFps1m = await runScrollFps1M(5000);
    var mapping100m = await run100MMapping();
    var sort1m = await runSort1M();
    var filter1m = await runFilter1M();
    var createDestroy200 = await runCreateDestroy200();
    var scrollRegression = await runScrollRegression();

    return {
      runtime: {
        platform: navigator.platform || '',
        userAgent: navigator.userAgent || ''
      },
      initialRender100k: initialRender100k,
      initialRender1m: initialRender1m,
      scrollFps1m: scrollFps1m,
      mapping100m: mapping100m,
      sort1m: sort1m,
      filter1m: filter1m,
      createDestroy200: createDestroy200,
      scrollRegression: scrollRegression
    };
  }

  window.__benchPhase14 = {
    runInitialRender: runInitialRender,
    runScrollFps1M: runScrollFps1M,
    run100MMapping: run100MMapping,
    runSort1M: runSort1M,
    runFilter1M: runFilter1M,
    runCreateDestroy200: runCreateDestroy200,
    runScrollRegression: runScrollRegression,
    runAll: runAll
  };
})();
