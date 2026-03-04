(function runBench() {
  try {
    var columns = [
      { id: 'id', header: 'ID', width: 100, type: 'number' },
      { id: 'name', header: 'Name', width: 220, type: 'text' },
      { id: 'value', header: 'Value', width: 180, type: 'number' }
    ];

    var rowData = Array.from({ length: 20000 }, function (_, index) {
      return {
        id: index + 1,
        name: 'Bench-' + (index + 1),
        value: (index * 13) % 997
      };
    });

    var start = performance.now();

    var grid = new window.HGrid.Grid(document.getElementById('grid'), {
      columns: columns,
      rowData: rowData,
      height: 420,
      rowHeight: 28,
      overscan: 8
    });

    var initialRenderMs = performance.now() - start;
    var viewport = document.querySelector('.hgrid__v-scroll') || document.querySelector('.hgrid__viewport');

    if (!viewport) {
      throw new Error('Missing vertical scroll source in benchmark page');
    }

    var scrollStart = performance.now();
    viewport.scrollTop = 16000;
    viewport.dispatchEvent(new Event('scroll'));

    requestAnimationFrame(function () {
      window.__benchGrid = grid;
      window.__benchResult = {
        initialRenderMs: Number(initialRenderMs.toFixed(3)),
        scrollUpdateMs: Number((performance.now() - scrollStart).toFixed(3))
      };
    });
  } catch (error) {
    window.__benchError = String(error);
    console.error(error);
  }
})();
