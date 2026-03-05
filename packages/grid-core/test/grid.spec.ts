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

function parseTranslateY(transformValue: string): number {
  const match = transformValue.match(/translate3d\(([-\d.]+)(?:px)?,\s*([-\d.]+)(?:px)?,\s*0(?:px)?\)/);
  if (!match) {
    return Number.NaN;
  }

  return Number(match[2]);
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

  it('computes scroll scaling metrics with capped physical height for 100M rows', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const height = 280;
    const rowHeight = 28;
    const rowCount = 100_000_000;
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' }
      ],
      dataProvider: new SyntheticLargeDataProvider(rowCount),
      height,
      rowHeight,
      overscan: 4
    });

    const renderer = (
      grid as unknown as {
        renderer: {
          virtualScrollHeight: number;
          physicalScrollHeight: number;
          virtualMaxScrollTop: number;
          physicalMaxScrollTop: number;
          scrollScale: number;
        };
      }
    ).renderer;

    expect(renderer.virtualScrollHeight).toBe(rowCount * rowHeight);
    expect(renderer.physicalScrollHeight).toBe(16_000_000);
    expect(renderer.virtualMaxScrollTop).toBe(rowCount * rowHeight - height);
    expect(renderer.physicalMaxScrollTop).toBe(16_000_000 - height);
    expect(renderer.scrollScale).toBeCloseTo(renderer.virtualMaxScrollTop / renderer.physicalMaxScrollTop, 10);
    expect(renderer.scrollScale).toBeGreaterThan(100);

    grid.destroy();
    container.remove();
  });

  it('applies wheel delta on virtual axis even when physical scroll delta is sub-pixel at 100M scale', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' }
      ],
      dataProvider: new SyntheticLargeDataProvider(100_000_000),
      height: 280,
      rowHeight: 28,
      overscan: 4
    });

    const bodyCenter = container.querySelector('.hgrid__body-center') as HTMLDivElement;
    const verticalScroll = getVerticalScrollElement(container);
    expect(grid.getState().scrollTop).toBe(0);
    expect(verticalScroll.scrollTop).toBe(0);

    for (let index = 0; index < 10; index += 1) {
      bodyCenter.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: 30,
          bubbles: true,
          cancelable: true
        })
      );
    }

    await waitForFrame();

    const virtualScrollTop = grid.getState().scrollTop;
    expect(virtualScrollTop).toBeGreaterThan(200);
    expect(verticalScroll.scrollTop).toBeGreaterThanOrEqual(1);

    grid.destroy();
    container.remove();
  });

  it('moves virtual scroll by viewport height on PageDown/PageUp', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const height = 280;
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' }
      ],
      dataProvider: new SyntheticLargeDataProvider(100_000_000),
      height,
      rowHeight: 28,
      overscan: 4
    });

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    expect(grid.getState().scrollTop).toBe(0);

    root.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'PageDown',
        bubbles: true,
        cancelable: true
      })
    );
    await waitForFrame();

    const afterPageDown = grid.getState().scrollTop;
    expect(afterPageDown).toBe(height);

    root.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'PageUp',
        bubbles: true,
        cancelable: true
      })
    );
    await waitForFrame();

    expect(grid.getState().scrollTop).toBe(0);

    grid.destroy();
    container.remove();
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

  it('applies sparse row overrides without materializing full base mapping', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const rowCount = 100_000_000;
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' }
      ],
      dataProvider: new SyntheticLargeDataProvider(rowCount),
      height: 120,
      rowHeight: 30,
      overscan: 2
    });

    const lastIndex = rowCount - 1;
    grid.setSparseRowOverrides([
      { viewIndex: 0, dataIndex: lastIndex },
      { viewIndex: lastIndex, dataIndex: 0 }
    ]);

    const firstIdCell = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    expect(firstIdCell.textContent).toBe(String(rowCount));

    const rowModelState = grid.getRowModelState();
    expect(rowModelState.baseMappingMode).toBe('sparse');
    expect(rowModelState.sparseOverrideCount).toBe(2);
    expect(rowModelState.materializedBaseBytes).toBe(0);

    grid.clearSparseRowOverrides();
    const resetIdCell = container.querySelector('.hgrid__row .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    expect(resetIdCell.textContent).toBe('1');

    grid.destroy();
  });

  it('keeps pinned rows aligned when variable row heights are provided by estimated mode', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 960, configurable: true });
    document.body.append(container);

    const rowData = Array.from({ length: 500 }, (_value, index) => ({
      id: index + 1,
      name: `row-${index + 1}`,
      region: ['KR', 'US', 'JP', 'DE'][index % 4]
    }));

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 320, type: 'text' },
        { id: 'region', header: 'Region', width: 160, type: 'text', pinned: 'right' }
      ],
      rowData,
      height: 260,
      rowHeightMode: 'estimated',
      estimatedRowHeight: 28,
      getRowHeight: (_rowIndex, dataIndex) => 28 + (dataIndex % 5) * 8,
      overscan: 4
    });

    grid.setState({ scrollTop: 4200 });
    await waitForFrame();

    const leftRows = Array.from(container.querySelectorAll('.hgrid__row--left')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];
    const centerRows = Array.from(container.querySelectorAll('.hgrid__row--center')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];
    const rightRows = Array.from(container.querySelectorAll('.hgrid__row--right')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];

    const sampleSize = Math.min(leftRows.length, centerRows.length, rightRows.length);
    expect(sampleSize).toBeGreaterThan(0);

    for (let index = 0; index < sampleSize; index += 1) {
      expect(leftRows[index].dataset.rowIndex).toBe(centerRows[index].dataset.rowIndex);
      expect(centerRows[index].dataset.rowIndex).toBe(rightRows[index].dataset.rowIndex);
      expect(leftRows[index].style.transform).toBe(centerRows[index].style.transform);
      expect(centerRows[index].style.transform).toBe(rightRows[index].style.transform);
      expect(leftRows[index].style.height).toBe(centerRows[index].style.height);
      expect(centerRows[index].style.height).toBe(rightRows[index].style.height);
    }

    const savedState = grid.getState();
    grid.setState({ scrollTop: 0 });
    await waitForFrame();
    grid.setState(savedState);
    await waitForFrame();

    const restoredIdCell = container.querySelector(
      '.hgrid__row--left .hgrid__cell[data-column-id=\"id\"]'
    ) as HTMLDivElement;
    expect(Number(restoredIdCell.textContent)).toBeGreaterThan(1);

    grid.destroy();
    container.remove();
  });

  it('re-applies estimated row heights after resetRowHeights()', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    let dynamicHeight = 40;
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 280, type: 'text' }
      ],
      rowData: Array.from({ length: 200 }, (_value, index) => ({
        id: index + 1,
        name: `row-${index + 1}`
      })),
      height: 220,
      rowHeightMode: 'estimated',
      estimatedRowHeight: 28,
      getRowHeight: () => dynamicHeight,
      overscan: 4
    });

    await waitForFrame();
    const firstRow = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    expect(firstRow.style.height).toBe('40px');

    dynamicHeight = 60;
    grid.setState({ scrollTop: 0 });
    await waitForFrame();
    expect(firstRow.style.height).toBe('40px');

    grid.resetRowHeights();
    await waitForFrame();
    await waitForFrame();
    expect(firstRow.style.height).toBe('60px');

    grid.destroy();
    container.remove();
  });

  it('keeps variable-height rows monotonic without overlap under burst wheel input', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1040, configurable: true });
    document.body.append(container);

    const rowData = Array.from({ length: 3_000 }, (_value, index) => ({
      id: index + 1,
      description: `row-${index + 1} ` + 'lorem ipsum '.repeat((index % 6) * 6 + 4),
      region: ['KR', 'US', 'JP', 'DE'][index % 4]
    }));

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number', pinned: 'left' },
        { id: 'description', header: 'Description', width: 520, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text', pinned: 'right' }
      ],
      rowData,
      height: 280,
      rowHeight: 28,
      rowHeightMode: 'estimated',
      estimatedRowHeight: 28,
      getRowHeight: (_rowIndex, dataIndex) => 28 + ((dataIndex % 6) + 1) * 6,
      overscan: 6
    });

    const bodyCenter = container.querySelector('.hgrid__body-center') as HTMLDivElement;

    for (let burst = 0; burst < 6; burst += 1) {
      for (let index = 0; index < 20; index += 1) {
        bodyCenter.dispatchEvent(
          new WheelEvent('wheel', {
            deltaY: 120,
            bubbles: true,
            cancelable: true
          })
        );
      }
      await waitForFrame();
      await waitForFrame();
    }

    const visibleCenterRows = Array.from(container.querySelectorAll('.hgrid__row--center')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];
    const visibleLeftRows = Array.from(container.querySelectorAll('.hgrid__row--left')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];
    const visibleRightRows = Array.from(container.querySelectorAll('.hgrid__row--right')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];

    const sampleSize = Math.min(visibleCenterRows.length, visibleLeftRows.length, visibleRightRows.length);
    expect(sampleSize).toBeGreaterThan(3);

    let validatedPairCount = 0;
    for (let index = 0; index < sampleSize - 1; index += 1) {
      const currentCenter = visibleCenterRows[index];
      const nextCenter = visibleCenterRows[index + 1];
      const currentY = parseTranslateY(currentCenter.style.transform);
      const nextY = parseTranslateY(nextCenter.style.transform);
      const currentHeight = Number.parseFloat(currentCenter.style.height);

      if (!Number.isFinite(currentY) || !Number.isFinite(nextY) || !Number.isFinite(currentHeight)) {
        continue;
      }

      validatedPairCount += 1;
      expect(nextY).toBeGreaterThanOrEqual(currentY + currentHeight - 0.5);

      const leftRow = visibleLeftRows[index];
      const rightRow = visibleRightRows[index];
      expect(leftRow.dataset.rowIndex).toBe(currentCenter.dataset.rowIndex);
      expect(rightRow.dataset.rowIndex).toBe(currentCenter.dataset.rowIndex);
      expect(leftRow.style.transform).toBe(currentCenter.style.transform);
      expect(rightRow.style.transform).toBe(currentCenter.style.transform);
      expect(leftRow.style.height).toBe(currentCenter.style.height);
      expect(rightRow.style.height).toBe(currentCenter.style.height);
    }
    expect(validatedPairCount).toBeGreaterThan(2);

    grid.destroy();
    container.remove();
  });

  it('keeps variable-height row pooling stable and drift bounded on 100M roundtrip', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 980, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 320, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text', pinned: 'right' }
      ],
      dataProvider: new SyntheticLargeDataProvider(100_000_000),
      height: 260,
      rowHeight: 28,
      rowHeightMode: 'estimated',
      estimatedRowHeight: 28,
      getRowHeight: (_rowIndex, dataIndex) => 28 + (dataIndex % 4) * 2,
      overscan: 6
    });

    const centerLayer = container.querySelector('.hgrid__rows-layer--center') as HTMLDivElement;
    const mutationRecords: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index];
        if (record.type === 'childList') {
          mutationRecords.push(record);
        }
      }
    });
    observer.observe(centerLayer, { childList: true, subtree: false });

    const rowCountBefore = container.querySelectorAll('.hgrid__row').length;
    grid.setState({ scrollTop: (grid as unknown as { renderer: { virtualMaxScrollTop: number } }).renderer.virtualMaxScrollTop });
    await waitForFrame();
    await waitForFrame();

    const bottomIdCell = container.querySelector('.hgrid__row--left .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    const bottomId = Number(bottomIdCell.textContent);
    expect(bottomId).toBeGreaterThan(99_000_000);

    grid.setState({ scrollTop: 0 });
    await waitForFrame();
    await waitForFrame();

    const topIdCell = container.querySelector('.hgrid__row--left .hgrid__cell[data-column-id=\"id\"]') as HTMLDivElement;
    const topId = Number(topIdCell.textContent);
    expect(Math.abs(topId - 1)).toBeLessThanOrEqual(1);

    observer.disconnect();
    const rowCountAfter = container.querySelectorAll('.hgrid__row').length;
    expect(rowCountAfter).toBe(rowCountBefore);
    const hasPoolMutation = mutationRecords.some(
      (record) => record.addedNodes.length > 0 || record.removedNodes.length > 0
    );
    expect(hasPoolMutation).toBe(false);

    grid.destroy();
    container.remove();
  });

  it('invalidates measured height cache only on visible dirty range after width changes', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1000, configurable: true });
    document.body.append(container);

    const rowData = Array.from({ length: 2_000 }, (_value, index) => ({
      id: index + 1,
      description: 'row-' + (index + 1) + ' ' + 'wrapped text '.repeat(20 + (index % 5) * 8),
      region: ['KR', 'US', 'JP', 'DE'][index % 4]
    }));

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number', pinned: 'left' },
        { id: 'description', header: 'Description', width: 520, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text', pinned: 'right' }
      ],
      rowData: rowData.map((row) => ({ ...row, description: `row-${row.id}` })),
      height: 280,
      rowHeight: 28,
      rowHeightMode: 'measured',
      estimatedRowHeight: 28,
      overscan: 6
    });

    await waitForFrame();
    await waitForFrame();

    const renderer = (
      grid as unknown as {
        renderer: {
          rowHeightMap: {
            hasRowHeight: (rowIndex: number) => boolean;
            setRowHeight: (rowIndex: number, height: number) => boolean;
          };
        };
      }
    ).renderer;

    const topVisibleRows = Array.from(container.querySelectorAll('.hgrid__row--center')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];
    expect(topVisibleRows.length).toBeGreaterThan(0);
    const topMeasuredRow = topVisibleRows[0];
    const topRowIndex = Number(topMeasuredRow.dataset.rowIndex);
    renderer.rowHeightMap.setRowHeight(topRowIndex, 64);
    expect(renderer.rowHeightMap.hasRowHeight(topRowIndex)).toBe(true);

    grid.setState({ scrollTop: 8_000 });
    await waitForFrame();
    await waitForFrame();

    const midVisibleRows = Array.from(container.querySelectorAll('.hgrid__row--center')).filter(
      (element) => (element as HTMLDivElement).style.display !== 'none'
    ) as HTMLDivElement[];
    expect(midVisibleRows.length).toBeGreaterThan(0);
    const midMeasuredRow = midVisibleRows[0];
    const midRowIndex = Number(midMeasuredRow.dataset.rowIndex);
    renderer.rowHeightMap.setRowHeight(midRowIndex, 72);
    expect(renderer.rowHeightMap.hasRowHeight(midRowIndex)).toBe(true);

    grid.setColumnWidth('description', 280);
    await waitForFrame();
    await waitForFrame();
    await waitForFrame();

    expect(renderer.rowHeightMap.hasRowHeight(topRowIndex)).toBe(true);
    expect(renderer.rowHeightMap.hasRowHeight(midRowIndex)).toBe(false);

    grid.destroy();
    container.remove();
  });

  it('applies range-based selection and emits selectionChange payload', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 980, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 160, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text', pinned: 'right' }
      ],
      rowData: Array.from({ length: 200 }, (_value, index) => ({
        id: index + 1,
        name: `Customer-${index + 1}`,
        status: index % 2 === 0 ? 'active' : 'idle',
        region: ['KR', 'US', 'JP', 'DE'][index % 4]
      })),
      height: 260,
      rowHeight: 28,
      overscan: 4
    });

    const selectionEvents: Array<{
      source: string;
      cellRanges: Array<{ r1: number; c1: number; r2: number; c2: number }>;
      rowRanges: Array<{ r1: number; r2: number; rowKeyStart: string | number; rowKeyEnd: string | number }>;
    }> = [];
    grid.on('selectionChange', (payload) => {
      selectionEvents.push(payload);
    });

    grid.setSelection({
      cellRanges: [{ r1: 2, c1: 0, r2: 6, c2: 2 }]
    });
    await waitForFrame();

    const firstEvent = selectionEvents[0];
    expect(firstEvent.source).toBe('api');
    expect(firstEvent.cellRanges).toEqual([{ r1: 2, c1: 0, r2: 6, c2: 2 }]);
    expect(firstEvent.rowRanges).toEqual([{ r1: 2, r2: 6, rowKeyStart: 3, rowKeyEnd: 7 }]);
    expect(grid.getSelection()).toEqual({
      activeCell: null,
      cellRanges: [{ r1: 2, c1: 0, r2: 6, c2: 2 }],
      rowRanges: [{ r1: 2, r2: 6, rowKeyStart: 3, rowKeyEnd: 7 }]
    });

    const selectedCells = container.querySelectorAll('.hgrid__cell--selected');
    expect(selectedCells.length).toBeGreaterThan(0);
    const selectedRows = container.querySelectorAll('.hgrid__row--selected');
    expect(selectedRows.length).toBeGreaterThan(0);

    grid.setSelection({
      rowRanges: [{ r1: 20, r2: 24 }]
    });
    await waitForFrame();

    const secondEvent = selectionEvents[1];
    expect(secondEvent.source).toBe('api');
    expect(secondEvent.cellRanges).toEqual([{ r1: 2, c1: 0, r2: 6, c2: 2 }]);
    expect(secondEvent.rowRanges).toEqual([
      { r1: 2, r2: 6, rowKeyStart: 3, rowKeyEnd: 7 },
      { r1: 20, r2: 24, rowKeyStart: 21, rowKeyEnd: 25 }
    ]);

    grid.clearSelection();
    await waitForFrame();

    const thirdEvent = selectionEvents[2];
    expect(thirdEvent.source).toBe('clear');
    expect(thirdEvent.cellRanges).toEqual([]);
    expect(thirdEvent.rowRanges).toEqual([]);
    expect(grid.getSelection()).toEqual({
      activeCell: null,
      cellRanges: [],
      rowRanges: []
    });

    grid.destroy();
    container.remove();
  });

  it('supports keyboard navigation with shift range extension and ctrl/cmd edge movement', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 900, configurable: true });
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 110, type: 'number' as const, pinned: 'left' as const },
      ...Array.from({ length: 12 }, (_value, index) => ({
        id: `c${index}`,
        header: `C${index}`,
        width: 120,
        type: 'text' as const
      })),
      { id: 'status', header: 'Status', width: 140, type: 'text' as const, pinned: 'right' as const }
    ];

    const rowData = Array.from({ length: 2_000 }, (_value, index) => {
      const row: Record<string, unknown> = {
        id: index + 1,
        status: index % 2 === 0 ? 'active' : 'idle'
      };
      for (let colIndex = 0; colIndex < 12; colIndex += 1) {
        row[`c${colIndex}`] = `r${index + 1}-c${colIndex}`;
      }
      return row;
    });

    const grid = new Grid(container, {
      columns,
      rowData,
      height: 280,
      rowHeight: 28,
      overscan: 6,
      overscanCols: 2
    });

    const root = container.querySelector('.hgrid') as HTMLDivElement;

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await waitForFrame();
    expect(grid.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 0 });

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await waitForFrame();
    expect(grid.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 1 });

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
    await waitForFrame();
    expect(grid.getSelection().cellRanges).toEqual([{ r1: 1, c1: 1, r2: 2, c2: 1 }]);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    await waitForFrame();
    expect(grid.getSelection().cellRanges).toEqual([{ r1: 1, c1: 1, r2: 2, c2: 2 }]);

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }));
    await waitForFrame();
    expect(grid.getSelection().activeCell?.rowIndex).toBeGreaterThan(2);

    root.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'End',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    await waitForFrame();
    const edgeSelection = grid.getSelection();
    expect(edgeSelection.activeCell?.rowIndex).toBe(1_999);
    expect(edgeSelection.activeCell?.colIndex).toBe(columns.length - 1);
    expect(grid.getState().scrollTop).toBeGreaterThan(0);

    root.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Home',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    await waitForFrame();
    const homeSelection = grid.getSelection();
    expect(homeSelection.activeCell).toEqual({ rowIndex: 0, colIndex: 0 });

    grid.destroy();
    container.remove();
  });

  it('applies sort model and replaces view mapping order', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'score', header: 'Score', width: 140, type: 'number' }
      ],
      rowData: [
        { id: 1, name: 'A', score: 30 },
        { id: 2, name: 'B', score: 10 },
        { id: 3, name: 'C', score: 20 },
        { id: 4, name: 'D', score: 10 }
      ],
      height: 180,
      rowHeight: 28,
      overscan: 2
    });

    await grid.setSortModel([{ columnId: 'score', direction: 'asc' }]);
    await waitForFrame();

    const firstIdAfterAsc = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    const secondIdAfterAsc = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(firstIdAfterAsc.textContent).toBe('2');
    expect(secondIdAfterAsc.textContent).toBe('4');
    expect(grid.getSortModel()).toEqual([{ columnId: 'score', direction: 'asc' }]);

    await grid.setSortModel([
      { columnId: 'score', direction: 'desc' },
      { columnId: 'name', direction: 'asc' }
    ]);
    await waitForFrame();

    const firstIdAfterMulti = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    const secondIdAfterMulti = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(firstIdAfterMulti.textContent).toBe('1');
    expect(secondIdAfterMulti.textContent).toBe('3');

    await grid.clearSortModel();
    await waitForFrame();
    const firstIdAfterClear = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(firstIdAfterClear.textContent).toBe('1');
    expect(grid.getSortModel()).toEqual([]);

    grid.destroy();
    container.remove();
  });

  it('applies filter model and composes with sorted source order', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'score', header: 'Score', width: 140, type: 'number' },
        { id: 'dueDate', header: 'Due Date', width: 160, type: 'date' },
        { id: 'region', header: 'Region', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', score: 30, dueDate: '2026-03-03', region: 'KR' },
        { id: 2, name: 'Beta', score: 10, dueDate: '2026-03-01', region: 'US' },
        { id: 3, name: 'Alpha-X', score: 20, dueDate: '2026-03-02', region: 'JP' },
        { id: 4, name: 'Delta', score: 10, dueDate: '2026-03-04', region: 'DE' }
      ],
      height: 180,
      rowHeight: 28,
      overscan: 2
    });

    await grid.setSortModel([
      { columnId: 'score', direction: 'asc' },
      { columnId: 'name', direction: 'asc' }
    ]);
    await waitForFrame();

    await grid.setFilterModel({
      name: { kind: 'text', operator: 'contains', value: 'a' },
      score: { kind: 'number', operator: 'lte', value: 20 },
      dueDate: { kind: 'date', operator: 'between', min: '2026-03-01', max: '2026-03-03' },
      region: { kind: 'set', values: ['US', 'JP'] }
    });
    await waitForFrame();

    const firstFilteredId = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    const secondFilteredId = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(firstFilteredId.textContent).toBe('2');
    expect(secondFilteredId.textContent).toBe('3');
    expect(grid.getFilterModel()).toMatchObject({
      name: { kind: 'text', operator: 'contains', value: 'a' }
    });

    await grid.clearFilterModel();
    await waitForFrame();
    expect(grid.getFilterModel()).toEqual({});

    const firstAfterClearFilter = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(firstAfterClearFilter.textContent).toBe('2');

    await grid.clearSortModel();
    await waitForFrame();
    const firstAfterClearSort = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(firstAfterClearSort.textContent).toBe('1');

    grid.destroy();
    container.remove();
  });

  it('supports single-overlay editor lifecycle with enter/dblclick start and escape cancel', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 100, type: 'number' as const },
      { id: 'name', header: 'Name', width: 200, type: 'text' as const, editable: true },
      { id: 'status', header: 'Status', width: 140, type: 'text' as const }
    ];
    const rowData = [
      { id: 1, name: 'User-1', status: 'active' },
      { id: 2, name: 'User-2', status: 'idle' }
    ];

    const grid = new Grid(container, {
      columns,
      rowData,
      height: 160,
      rowHeight: 28,
      overscan: 2
    });

    const renderer = (
      grid as unknown as {
        renderer: {
          startEditingAtCell: (rowIndex: number, colIndex: number) => boolean;
          editorHostElement: HTMLDivElement;
          editorInputElement: HTMLInputElement;
          hitTestCellAtPoint: (x: number, y: number) => unknown;
        };
      }
    ).renderer;

    const editStartEvents: Array<{ rowIndex: number; columnId: string }> = [];
    const editCommitEvents: Array<{ rowIndex: number; columnId: string; value: unknown }> = [];
    const editCancelEvents: Array<{ rowIndex: number; columnId: string; reason: string }> = [];
    grid.on('editStart', (event) => {
      editStartEvents.push(event);
    });
    grid.on('editCommit', (event) => {
      editCommitEvents.push(event);
    });
    grid.on('editCancel', (event) => {
      editCancelEvents.push(event);
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 0, c2: 1 }]
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(true);
    expect(renderer.editorInputElement.value).toBe('User-1');

    renderer.editorInputElement.value = 'User-1-Edited';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(editStartEvents.length).toBe(1);
    expect(editCommitEvents.length).toBe(1);
    expect(editCommitEvents[0]).toMatchObject({
      rowIndex: 0,
      columnId: 'name',
      value: 'User-1-Edited'
    });
    const editedNameCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(editedNameCell.textContent).toBe('User-1-Edited');
    expect(editCancelEvents.length).toBe(0);

    const originalHitTest = renderer.hitTestCellAtPoint;
    renderer.hitTestCellAtPoint = () => ({
      zone: 'center',
      rowIndex: 1,
      dataIndex: 1,
      columnIndex: 1,
      column: columns[1]
    });
    root.dispatchEvent(new MouseEvent('dblclick', { button: 0, bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
    renderer.hitTestCellAtPoint = originalHitTest;

    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(true);
    renderer.editorInputElement.value = 'User-2-Canceled';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitForFrame();

    const canceledNameCell = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(canceledNameCell.textContent).toBe('User-2');
    expect(editStartEvents.length).toBe(2);
    expect(editCancelEvents.length).toBe(1);
    expect(editCancelEvents[0]).toMatchObject({
      rowIndex: 1,
      columnId: 'name',
      reason: 'escape'
    });

    grid.destroy();
    container.remove();
  });

  it('supports sync and async edit validation with pending UI and recovery', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 100, type: 'number' as const },
      { id: 'name', header: 'Name', width: 220, type: 'text' as const, editable: true },
      { id: 'score', header: 'Score', width: 120, type: 'number' as const, editable: true },
      { id: 'dueDate', header: 'Due Date', width: 160, type: 'date' as const, editable: true }
    ];
    const rowData = [
      { id: 1, name: 'Alpha', score: 10, dueDate: '2026-03-05' },
      { id: 2, name: 'Beta', score: 20, dueDate: '2026-03-06' }
    ];

    const asyncResolvers: Array<(message: string | null) => void> = [];
    const grid = new Grid(container, {
      columns,
      rowData,
      height: 160,
      rowHeight: 28,
      overscan: 2,
      validateEdit(context) {
        if (context.column.id === 'score') {
          return typeof context.value === 'number' && context.value >= 0 && context.value <= 1000
            ? null
            : 'Score must be between 0 and 1000';
        }

        if (context.column.id === 'name') {
          return new Promise((resolve) => {
            asyncResolvers.push(resolve);
          });
        }

        if (context.column.id === 'dueDate') {
          return Promise.reject(new Error('Validator unreachable'));
        }

        return null;
      }
    });

    const renderer = (
      grid as unknown as {
        renderer: {
          startEditingAtCell: (rowIndex: number, colIndex: number) => boolean;
          editorHostElement: HTMLDivElement;
          editorInputElement: HTMLInputElement;
          editorMessageElement: HTMLDivElement;
        };
      }
    ).renderer;

    expect(renderer.startEditingAtCell(0, 2)).toBe(true);
    renderer.editorInputElement.value = '-5';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();

    const initialScoreCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="score"]'
    ) as HTMLDivElement;
    expect(initialScoreCell.textContent).toBe('10');
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--invalid')).toBe(true);
    expect(renderer.editorMessageElement.textContent).toBe('Score must be between 0 and 1000');

    renderer.editorInputElement.value = '99';
    renderer.editorInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();

    const committedScoreCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="score"]'
    ) as HTMLDivElement;
    expect(committedScoreCell.textContent).toBe('99');
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(false);

    expect(renderer.startEditingAtCell(1, 1)).toBe(true);
    renderer.editorInputElement.value = 'blocked-name';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--pending')).toBe(true);
    expect(renderer.editorInputElement.disabled).toBe(true);
    const firstAsyncResolve = asyncResolvers.shift();
    expect(typeof firstAsyncResolve).toBe('function');
    firstAsyncResolve?.('Name already exists');
    await waitForFrame();
    await waitForFrame();

    const rejectedNameCell = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(rejectedNameCell.textContent).toBe('Beta');
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--invalid')).toBe(true);
    expect(renderer.editorMessageElement.textContent).toBe('Name already exists');

    renderer.editorInputElement.value = 'Approved-Name';
    renderer.editorInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const secondAsyncResolve = asyncResolvers.shift();
    expect(typeof secondAsyncResolve).toBe('function');
    secondAsyncResolve?.(null);
    await waitForFrame();
    await waitForFrame();
    const committedNameCell = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(committedNameCell.textContent).toBe('Approved-Name');

    expect(renderer.startEditingAtCell(0, 3)).toBe(true);
    renderer.editorInputElement.value = '2026-04-01';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    const dueDateCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="dueDate"]'
    ) as HTMLDivElement;
    expect(dueDateCell.textContent).toBe('2026-03-05');
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--invalid')).toBe(true);
    expect(renderer.editorMessageElement.textContent).toBe('Validator unreachable');

    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitForFrame();

    grid.destroy();
    container.remove();
  });
});
