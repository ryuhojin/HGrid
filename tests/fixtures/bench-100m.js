(function runBench100M() {
  function SyntheticLargeDataProvider(rowCount) {
    this.rowCount = rowCount;
  }

  SyntheticLargeDataProvider.prototype.getRowCount = function getRowCount() {
    return this.rowCount;
  };

  SyntheticLargeDataProvider.prototype.getRowKey = function getRowKey(dataIndex) {
    return dataIndex;
  };

  SyntheticLargeDataProvider.prototype.getValue = function getValue(dataIndex, columnId) {
    if (columnId === 'id') {
      return dataIndex + 1;
    }

    if (columnId === 'name') {
      return 'Bench-' + (dataIndex + 1);
    }

    if (columnId === 'status') {
      return dataIndex % 2 === 0 ? 'active' : 'idle';
    }

    return '';
  };

  SyntheticLargeDataProvider.prototype.setValue = function setValue() {};
  SyntheticLargeDataProvider.prototype.applyTransactions = function applyTransactions() {};

  SyntheticLargeDataProvider.prototype.getRow = function getRow(dataIndex) {
    return {
      id: dataIndex + 1,
      name: 'Bench-' + (dataIndex + 1),
      status: dataIndex % 2 === 0 ? 'active' : 'idle'
    };
  };

  function getFirstVisibleId() {
    var pinnedCell = document.querySelector('.hgrid__row--left .hgrid__cell[data-column-id="id"]');
    if (pinnedCell) {
      return Number(pinnedCell.textContent);
    }

    var centerCell = document.querySelector('.hgrid__row--center .hgrid__cell[data-column-id="id"]');
    if (centerCell) {
      return Number(centerCell.textContent);
    }

    return -1;
  }

  try {
    var columns = [
      { id: 'id', header: 'ID', width: 120, type: 'number', pinned: 'left' },
      { id: 'name', header: 'Name', width: 240, type: 'text' },
      { id: 'status', header: 'Status', width: 180, type: 'text' }
    ];

    var mountStart = performance.now();
    var grid = new window.HGrid.Grid(document.getElementById('grid'), {
      columns: columns,
      dataProvider: new SyntheticLargeDataProvider(100000000),
      height: 420,
      rowHeight: 28,
      overscan: 8,
      overscanCols: 1
    });
    var initialRenderMs = performance.now() - mountStart;

    requestAnimationFrame(function () {
      var jumpBottomStart = performance.now();
      var renderer = grid.renderer;
      grid.setState({ scrollTop: renderer.virtualMaxScrollTop });

      requestAnimationFrame(function () {
        var jumpBottomMs = performance.now() - jumpBottomStart;
        var bottomFirstVisibleId = getFirstVisibleId();

        var restoreStart = performance.now();
        grid.setState({ scrollTop: 0 });

        requestAnimationFrame(function () {
          var restoreStateMs = performance.now() - restoreStart;
          var topFirstVisibleId = getFirstVisibleId();

          window.__bench100mResult = {
            initialRenderMs: Number(initialRenderMs.toFixed(3)),
            jumpBottomMs: Number(jumpBottomMs.toFixed(3)),
            restoreStateMs: Number(restoreStateMs.toFixed(3)),
            bottomFirstVisibleId: bottomFirstVisibleId,
            topFirstVisibleId: topFirstVisibleId,
            rowModelState: grid.getRowModelState()
          };
        });
      });
    });
  } catch (error) {
    window.__bench100mError = String(error);
    console.error(error);
  }
})();
