(function runCspSmoke() {
  var statusElement = document.getElementById('status');

  try {
    if (!window.HGrid || typeof window.HGrid.Grid !== 'function') {
      throw new Error('HGrid.Grid global is unavailable');
    }

    var columns = [
      { id: 'id', header: 'ID', width: 100, type: 'number' },
      { id: 'name', header: 'Name', width: 240, type: 'text' },
      { id: 'active', header: 'Active', width: 120, type: 'boolean' }
    ];

    var rowData = Array.from({ length: 500 }, function (_, index) {
      return {
        id: index + 1,
        name: 'Row-' + (index + 1),
        active: index % 2 === 0
      };
    });

    window.__cspSmokeGrid = new window.HGrid.Grid(document.getElementById('grid'), {
      columns: columns,
      rowData: rowData,
      styleNonce: 'csp-smoke-nonce',
      height: 320,
      rowHeight: 28,
      overscan: 8
    });

    statusElement.setAttribute('data-status', 'ok');
    statusElement.textContent = 'ok';
  } catch (error) {
    statusElement.setAttribute('data-status', 'error');
    statusElement.textContent = String(error);
    console.error(error);
  }
})();
