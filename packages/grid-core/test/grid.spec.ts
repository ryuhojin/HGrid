import { describe, expect, it } from 'vitest';
import { Grid } from '../src';
import { LocalDataProvider } from '../src/data/local-data-provider';
import type { DataProvider, DataTransaction, GridRowData } from '../src/data/data-provider';

function getVerticalScrollElement(container: HTMLElement): HTMLDivElement {
  const verticalScrollElement = container.querySelector('.hgrid__v-scroll') as HTMLDivElement | null;
  if (verticalScrollElement) {
    return verticalScrollElement;
  }

  const viewportElement = container.querySelector('.hgrid__viewport') as HTMLDivElement | null;
  if (!viewportElement) {
    throw new Error('Missing vertical scroll source');
  }

  return viewportElement;
}

class SyntheticLargeDataProvider implements DataProvider {
  private readonly rowCount: number;

  public constructor(rowCount: number) {
    this.rowCount = rowCount;
  }

  public getRowCount(): number {
    return this.rowCount;
  }

  public getRowKey(dataIndex: number): number {
    return dataIndex;
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    if (columnId === 'id') {
      return dataIndex + 1;
    }

    if (columnId === 'name') {
      return `row-${dataIndex + 1}`;
    }

    return '';
  }

  public setValue(_dataIndex: number, _columnId: string, _value: unknown): void {}

  public applyTransactions(_transactions: DataTransaction[]): void {}

  public getRow(dataIndex: number): GridRowData {
    return {
      id: dataIndex + 1,
      name: `row-${dataIndex + 1}`
    };
  }
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('Grid DOM pooling', () => {
  it('keeps the same row pool size while scrolling', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 120, type: 'number' as const },
      { id: 'name', header: 'Name', width: 180, type: 'text' as const }
    ];

    const rowData = Array.from({ length: 500 }, (_, index) => ({
      id: index + 1,
      name: `row-${index + 1}`
    }));

    const grid = new Grid(container, {
      columns,
      rowData,
      height: 280,
      rowHeight: 28,
      overscan: 4
    });

    const beforeRows = container.querySelectorAll('.hgrid__row').length;

    const verticalScrollElement = getVerticalScrollElement(container);
    verticalScrollElement.scrollTop = 5000;
    verticalScrollElement.dispatchEvent(new Event('scroll'));

    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    const afterRows = container.querySelectorAll('.hgrid__row').length;

    expect(afterRows).toBe(beforeRows);

    grid.destroy();
  });

  it('reuses pooled row and cell DOM nodes without childList churn while scrolling', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 760, configurable: true });
    document.body.append(container);

    const columns = Array.from({ length: 80 }, (_, index) => ({
      id: `c${index}`,
      header: `C${index}`,
      width: 90,
      type: 'text' as const
    }));

    const rowData = Array.from({ length: 8_000 }, (_, rowIndex) => {
      const row: Record<string, unknown> = {};
      for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
        row[`c${colIndex}`] = `r${rowIndex + 1}-c${colIndex + 1}`;
      }
      return row;
    });

    const grid = new Grid(container, {
      columns,
      rowData,
      height: 280,
      rowHeight: 28,
      overscan: 4
    });

    const centerRowsBefore = Array.from(container.querySelectorAll('.hgrid__row--center')) as HTMLDivElement[];
    const centerCellsBefore = Array.from(centerRowsBefore[0].querySelectorAll('.hgrid__cell--center')) as HTMLDivElement[];
    const centerLayer = container.querySelector('.hgrid__rows-layer--center') as HTMLDivElement;

    const childListRecords: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
        const record = records[recordIndex];
        if (record.type === 'childList') {
          childListRecords.push(record);
        }
      }
    });
    observer.observe(centerLayer, { childList: true, subtree: false });

    const verticalScrollElement = getVerticalScrollElement(container);
    const horizontalScroll = container.querySelector('.hgrid__h-scroll') as HTMLDivElement;
    const horizontalMax = Math.max(0, horizontalScroll.scrollWidth - horizontalScroll.clientWidth);

    for (let index = 0; index < 120; index += 1) {
      verticalScrollElement.scrollTop = index * 84;
      verticalScrollElement.dispatchEvent(new Event('scroll'));

      if (horizontalMax > 0) {
        horizontalScroll.scrollLeft = (index * 120) % horizontalMax;
        horizontalScroll.dispatchEvent(new Event('scroll'));
      }

      await waitForFrame();
    }

    observer.disconnect();

    const centerRowsAfter = Array.from(container.querySelectorAll('.hgrid__row--center')) as HTMLDivElement[];
    const centerCellsAfter = Array.from(centerRowsAfter[0].querySelectorAll('.hgrid__cell--center')) as HTMLDivElement[];

    expect(centerRowsAfter.length).toBe(centerRowsBefore.length);
    expect(centerCellsAfter.length).toBe(centerCellsBefore.length);
    for (let rowIndex = 0; rowIndex < centerRowsBefore.length; rowIndex += 1) {
      expect(centerRowsAfter[rowIndex]).toBe(centerRowsBefore[rowIndex]);
    }
    for (let cellIndex = 0; cellIndex < centerCellsBefore.length; cellIndex += 1) {
      expect(centerCellsAfter[cellIndex]).toBe(centerCellsBefore[cellIndex]);
    }

    const hasPoolNodeMutation = childListRecords.some(
      (record) => record.addedNodes.length > 0 || record.removedNodes.length > 0
    );
    expect(hasPoolNodeMutation).toBe(false);

    const firstVisibleRow = centerRowsAfter.find((rowElement) => rowElement.style.display !== 'none') as HTMLDivElement;
    expect(firstVisibleRow.style.transform.startsWith('translate3d(0, ')).toBe(true);

    grid.destroy();
  });

  it('coalesces repeated scroll events into a single rAF render pass', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' }
      ],
      rowData: Array.from({ length: 10_000 }, (_, index) => ({
        id: index + 1,
        name: `row-${index + 1}`
      })),
      height: 240,
      rowHeight: 28,
      overscan: 4
    });

    const renderer = (grid as unknown as { renderer: { renderRows: (...args: unknown[]) => void } }).renderer;
    const originalRenderRows = renderer.renderRows.bind(renderer);
    let renderRowsCallCount = 0;
    renderer.renderRows = (...args: unknown[]) => {
      renderRowsCallCount += 1;
      return originalRenderRows(...args);
    };

    const verticalScrollElement = getVerticalScrollElement(container);

    for (let index = 0; index < 30; index += 1) {
      verticalScrollElement.scrollTop = index * 150;
      verticalScrollElement.dispatchEvent(new Event('scroll'));
    }

    expect(renderRowsCallCount).toBe(0);
    await waitForFrame();
    expect(renderRowsCallCount).toBe(1);

    for (let index = 0; index < 20; index += 1) {
      verticalScrollElement.scrollTop = 5000 + index * 120;
      verticalScrollElement.dispatchEvent(new Event('scroll'));
    }

    expect(renderRowsCallCount).toBe(1);
    await waitForFrame();
    expect(renderRowsCallCount).toBe(2);

    grid.destroy();
  });

  it('keeps center row DOM fixed at poolSize for 1M and 10M rows', async () => {
    const rowCounts = [1_000_000, 10_000_000];

    for (let index = 0; index < rowCounts.length; index += 1) {
      const rowCount = rowCounts[index];
      const container = document.createElement('div');
      document.body.append(container);

      const height = 280;
      const rowHeight = 28;
      const overscan = 4;
      const expectedPoolSize = Math.ceil(height / rowHeight) + overscan * 2;

      const grid = new Grid(container, {
        columns: [
          { id: 'id', header: 'ID', width: 120, type: 'number' },
          { id: 'name', header: 'Name', width: 180, type: 'text' }
        ],
        dataProvider: new SyntheticLargeDataProvider(rowCount),
        height,
        rowHeight,
        overscan
      });

      const centerRowsBefore = container.querySelectorAll('.hgrid__row--center').length;
      const allRowsBefore = container.querySelectorAll('.hgrid__row').length;
      expect(centerRowsBefore).toBe(expectedPoolSize);
      expect(allRowsBefore).toBe(expectedPoolSize * 3);

      const verticalSpacerElement = container.querySelector('.hgrid__v-spacer') as HTMLDivElement;
      const physicalSpacerHeight = Number.parseFloat(verticalSpacerElement.style.height || '0');
      if (rowCount === 10_000_000) {
        expect(physicalSpacerHeight).toBeLessThan(rowCount * rowHeight);
      }

      const verticalScrollElement = getVerticalScrollElement(container);
      verticalScrollElement.scrollTop = rowCount * rowHeight;
      verticalScrollElement.dispatchEvent(new Event('scroll'));
      await waitForFrame();

      const centerRowsAfter = container.querySelectorAll('.hgrid__row--center').length;
      const allRowsAfter = container.querySelectorAll('.hgrid__row').length;
      const firstCenterIdCell = container.querySelector('.hgrid__row--center .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
      const firstVisibleId = Number(firstCenterIdCell.textContent);

      expect(centerRowsAfter).toBe(expectedPoolSize);
      expect(allRowsAfter).toBe(allRowsBefore);
      expect(firstVisibleId).toBeGreaterThan(1);
      expect(firstVisibleId).toBeLessThanOrEqual(rowCount);
      if (rowCount === 10_000_000) {
        expect(firstVisibleId).toBeGreaterThan(9_000_000);
      }

      grid.destroy();
      container.remove();
    }
  });

  it('virtualizes center columns with fixed cell pool while scrolling horizontally', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 760, configurable: true });
    document.body.append(container);

    const centerColumns = Array.from({ length: 200 }, (_, index) => ({
      id: `c${index}`,
      header: `C${index}`,
      width: 80,
      type: 'text' as const
    }));

    const grid = new Grid(container, {
      columns: [
        { id: 'leftPinned', header: 'Left', width: 120, type: 'text', pinned: 'left' },
        ...centerColumns,
        { id: 'rightPinned', header: 'Right', width: 120, type: 'text', pinned: 'right' }
      ],
      rowData: Array.from({ length: 300 }, (_, rowIndex) => {
        const row: Record<string, unknown> = {
          leftPinned: `L-${rowIndex + 1}`,
          rightPinned: `R-${rowIndex + 1}`
        };
        for (let colIndex = 0; colIndex < centerColumns.length; colIndex += 1) {
          row[`c${colIndex}`] = `v-${rowIndex + 1}-${colIndex}`;
        }
        return row;
      }),
      height: 280,
      rowHeight: 28,
      overscan: 4
    });

    const firstCenterRow = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    const centerPoolCells = firstCenterRow.querySelectorAll('.hgrid__cell--center');
    const headerPoolCells = container.querySelectorAll('.hgrid__header-cell--center');
    expect(centerPoolCells.length).toBeLessThan(centerColumns.length);
    expect(centerPoolCells.length).toBe(headerPoolCells.length);

    const horizontalScroll = container.querySelector('.hgrid__h-scroll') as HTMLDivElement;
    horizontalScroll.scrollLeft = 3200;
    horizontalScroll.dispatchEvent(new Event('scroll'));
    await waitForFrame();

    const centerPoolCellsAfter = firstCenterRow.querySelectorAll('.hgrid__cell--center');
    expect(centerPoolCellsAfter.length).toBe(centerPoolCells.length);

    const firstVisibleCenterCell = Array.from(centerPoolCellsAfter).find(
      (cell) => (cell as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement;
    expect(firstVisibleCenterCell.dataset.columnId).not.toBe('c0');

    grid.destroy();
  });

  it('applies overscanCols to horizontal window capacity', () => {
    const columns = Array.from({ length: 120 }, (_, index) => ({
      id: `c${index}`,
      header: `C${index}`,
      width: 90,
      type: 'text' as const
    }));

    const sampleRow: Record<string, unknown> = {};
    for (let index = 0; index < columns.length; index += 1) {
      const columnId = columns[index].id;
      sampleRow[columnId] = columnId;
    }
    const rowData = [sampleRow];

    const containerLowOverscan = document.createElement('div');
    Object.defineProperty(containerLowOverscan, 'clientWidth', { value: 760, configurable: true });
    document.body.append(containerLowOverscan);

    const lowOverscanGrid = new Grid(containerLowOverscan, {
      columns,
      rowData,
      height: 200,
      rowHeight: 28,
      overscan: 2,
      overscanCols: 0
    });

    const lowCapacity = containerLowOverscan.querySelectorAll('.hgrid__row--center .hgrid__cell--center').length;
    lowOverscanGrid.destroy();

    const containerHighOverscan = document.createElement('div');
    Object.defineProperty(containerHighOverscan, 'clientWidth', { value: 760, configurable: true });
    document.body.append(containerHighOverscan);

    const highOverscanGrid = new Grid(containerHighOverscan, {
      columns,
      rowData,
      height: 200,
      rowHeight: 28,
      overscan: 2,
      overscanCols: 6
    });

    const highCapacity = containerHighOverscan.querySelectorAll('.hgrid__row--center .hgrid__cell--center').length;
    expect(highCapacity).toBeGreaterThan(lowCapacity);
    highOverscanGrid.destroy();
  });

  it('builds phase2.1 layout containers and uses viewport transform separation', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 180, type: 'text' }
      ],
      rowData: Array.from({ length: 300 }, (_, index) => ({
        id: index + 1,
        name: `row-${index + 1}`,
        status: index % 2 === 0 ? 'active' : 'idle'
      })),
      height: 280,
      rowHeight: 28,
      overscan: 4
    });

    expect(container.querySelector('.hgrid__header')).toBeTruthy();
    expect(container.querySelector('.hgrid__body')).toBeTruthy();
    expect(container.querySelector('.hgrid__overlay')).toBeTruthy();

    const headerCells = container.querySelectorAll('.hgrid__header-cell');
    expect(headerCells.length).toBe(3);
    expect((headerCells[0] as HTMLDivElement).textContent).toBe('ID');

    const verticalScrollElement = getVerticalScrollElement(container);
    const horizontalScroll = container.querySelector('.hgrid__h-scroll') as HTMLDivElement;
    verticalScrollElement.scrollTop = 560;
    horizontalScroll.scrollLeft = 100;
    horizontalScroll.dispatchEvent(new Event('scroll'));
    verticalScrollElement.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    const headerViewport = container.querySelector('.hgrid__header-viewport') as HTMLDivElement;
    const rowsViewport = container.querySelector('.hgrid__rows-viewport--center') as HTMLDivElement;
    const firstRow = container.querySelector('.hgrid__row--center') as HTMLDivElement;

    expect(headerViewport.style.transform).toBe('translate3d(-100px, 0, 0)');
    expect(rowsViewport.style.transform).toBe('translate3d(-100px, 448px, 0)');
    expect(firstRow.style.transform).toBe('translate3d(0, 0px, 0)');

    grid.destroy();
  });

  it('keeps pinned columns in left/right zones while center follows horizontal scroll', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 240, type: 'text' },
        { id: 'status', header: 'Status', width: 180, type: 'text' },
        { id: 'updatedAt', header: 'Updated At', width: 220, type: 'date', pinned: 'right' }
      ],
      rowData: Array.from({ length: 200 }, (_, index) => ({
        id: index + 1,
        name: `row-${index + 1}`,
        status: index % 2 === 0 ? 'active' : 'idle',
        updatedAt: '2026-03-03T00:00:00.000Z'
      })),
      height: 240,
      rowHeight: 28,
      overscan: 4
    });

    expect(container.querySelectorAll('.hgrid__header-left .hgrid__header-cell').length).toBe(1);
    expect(container.querySelectorAll('.hgrid__header-center .hgrid__header-cell').length).toBe(2);
    expect(container.querySelectorAll('.hgrid__header-right .hgrid__header-cell').length).toBe(1);

    const verticalScrollElement = getVerticalScrollElement(container);
    const horizontalScroll = container.querySelector('.hgrid__h-scroll') as HTMLDivElement;
    horizontalScroll.scrollLeft = 120;
    horizontalScroll.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    const headerCenterViewport = container.querySelector('.hgrid__header-viewport') as HTMLDivElement;
    const rowsLeftViewport = container.querySelector('.hgrid__rows-viewport--left') as HTMLDivElement;
    const rowsRightViewport = container.querySelector('.hgrid__rows-viewport--right') as HTMLDivElement;
    const leftFirstCellBefore = container.querySelector(
      '.hgrid__row--left .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;

    expect(leftFirstCellBefore.textContent).toBe('1');
    expect(headerCenterViewport.style.transform).toBe('translate3d(-120px, 0, 0)');
    expect(rowsLeftViewport.style.transform).toBe('translate3d(0, 0px, 0)');
    expect(rowsRightViewport.style.transform).toBe('translate3d(0, 0px, 0)');

    verticalScrollElement.scrollTop = 560;
    verticalScrollElement.dispatchEvent(new Event('scroll'));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

    const leftFirstCellAfter = container.querySelector(
      '.hgrid__row--left .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(leftFirstCellAfter.textContent).toBe('17');
    expect(rowsLeftViewport.style.transform).toBe('translate3d(0, -112px, 0)');
    expect(rowsRightViewport.style.transform).toBe('translate3d(0, -112px, 0)');

    grid.destroy();
  });

  it('applies scrollbar policy updates through setOptions', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 420, type: 'text' },
        { id: 'status', header: 'Status', width: 320, type: 'text' }
      ],
      rowData: Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        name: `row-${index + 1}`,
        status: 'active'
      })),
      height: 180,
      rowHeight: 30,
      overscan: 2
    });

    const viewport = container.querySelector('.hgrid__viewport') as HTMLDivElement;
    const horizontalScroll = container.querySelector('.hgrid__h-scroll') as HTMLDivElement;
    const verticalScrollElement = container.querySelector('.hgrid__v-scroll') as HTMLDivElement;

    expect(viewport.style.overflowY).toBe('hidden');
    expect(verticalScrollElement.style.overflowY).toBe('auto');
    expect(horizontalScroll.style.overflowX).toBe('auto');

    grid.setOptions({
      scrollbarPolicy: {
        vertical: 'hidden',
        horizontal: 'hidden'
      }
    });

    expect(viewport.style.overflowY).toBe('hidden');
    expect(verticalScrollElement.style.overflowY).toBe('hidden');
    expect(verticalScrollElement.style.display).toBe('none');
    expect(horizontalScroll.style.overflowX).toBe('hidden');
    expect(horizontalScroll.style.display).toBe('none');

    grid.setOptions({
      scrollbarPolicy: {
        vertical: 'auto',
        horizontal: 'auto'
      }
    });

    expect(verticalScrollElement.style.overflowY).toBe('auto');
    expect(horizontalScroll.style.overflowX).toBe('auto');

    grid.destroy();
  });

  it('supports formatter and column state updates', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, minWidth: 80, maxWidth: 120, type: 'number' },
        {
          id: 'fullName',
          header: 'Full Name',
          width: 220,
          type: 'text',
          valueGetter: (row) => `${String(row.firstName)} ${String(row.lastName)}`,
          formatter: (value) => `[${String(value)}]`
        },
        { id: 'status', header: 'Status', width: 140, type: 'text', visible: false }
      ],
      rowData: [
        { id: 1, firstName: 'Seo', lastName: 'Ari', status: 'active' },
        { id: 2, firstName: 'Lee', lastName: 'Min', status: 'idle' }
      ],
      height: 120,
      rowHeight: 30,
      overscan: 2
    });

    const firstRowBefore = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    const firstRowCellsBefore = firstRowBefore.querySelectorAll('.hgrid__cell');
    expect(firstRowCellsBefore.length).toBeGreaterThanOrEqual(2);
    expect(firstRowCellsBefore[1].textContent).toBe('[Seo Ari]');

    grid.setColumnOrder(['fullName', 'id']);
    const firstRowAfterOrder = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    const reorderedCells = firstRowAfterOrder.querySelectorAll('.hgrid__cell');
    expect((reorderedCells[0] as HTMLDivElement).dataset.columnId).toBe('fullName');

    grid.setColumnVisibility('status', true);
    const firstRowAfterVisibility = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    const visibleCells = firstRowAfterVisibility.querySelectorAll('.hgrid__cell');
    expect((visibleCells[2] as HTMLDivElement).dataset.columnId).toBe('status');

    grid.setColumnWidth('id', 10);
    const idCell = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    expect(idCell.style.width).toBe('80px');

    grid.destroy();
  });

  it('swaps data providers without changing Grid API', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const firstProvider = new LocalDataProvider([
      { id: 1, name: 'alpha' },
      { id: 2, name: 'beta' }
    ]);

    const secondProvider = new LocalDataProvider([
      { id: 10, name: 'gamma' },
      { id: 20, name: 'delta' }
    ]);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' }
      ],
      dataProvider: firstProvider,
      height: 120,
      rowHeight: 30,
      overscan: 2
    });

    const firstNameCell = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"name\"]') as HTMLDivElement;
    expect(firstNameCell.textContent).toBe('alpha');

    grid.setOptions({ dataProvider: secondProvider });

    const swappedNameCell = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"name\"]') as HTMLDivElement;
    expect(swappedNameCell.textContent).toBe('gamma');

    grid.destroy();
  });

  it('applies row model order without mutating data provider row order', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const provider = new LocalDataProvider([
      { id: 1, name: 'one' },
      { id: 2, name: 'two' },
      { id: 3, name: 'three' }
    ]);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 80, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' }
      ],
      dataProvider: provider,
      height: 120,
      rowHeight: 30,
      overscan: 2
    });

    const firstIdCellBefore = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    expect(firstIdCellBefore.textContent).toBe('1');
    expect(provider.getValue(0, 'id')).toBe(1);

    grid.setRowOrder([2, 1, 0]);

    const firstIdCellAfter = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    expect(firstIdCellAfter.textContent).toBe('3');
    expect(provider.getValue(0, 'id')).toBe(1);

    grid.setFilteredRowOrder([1]);
    const filteredIdCell = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    expect(filteredIdCell.textContent).toBe('2');

    grid.setRowModelOptions({ enableDataToViewIndex: true });
    expect(grid.getRowModelState().hasDataToViewIndex).toBe(true);

    grid.setRowModelOptions({ enableDataToViewIndex: false });
    expect(grid.getRowModelState().hasDataToViewIndex).toBe(false);

    grid.resetRowOrder();
    const resetIdCell = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    expect(resetIdCell.textContent).toBe('1');

    grid.destroy();
  });
});
