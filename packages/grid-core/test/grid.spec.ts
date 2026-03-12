import { describe, expect, it } from 'vitest';
import { Grid } from '../src';
import { LocalDataProvider } from '../src/data/local-data-provider';
import type { DataProvider, DataTransaction, GridRowData } from '../src/data/data-provider';
import type { RemoteQueryModel } from '../src/data/remote-data-provider';
import { WORKER_TREE_LAZY_ROW_REF_FIELD } from '../src/data/worker-operation-payloads';
import type { EditCommitAuditPayload, GridEventMap } from '../src';

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

class MockRemoteGroupingProvider implements DataProvider {
  private rows: GridRowData[];
  private queryModel: RemoteQueryModel = {
    sortModel: [],
    filterModel: {},
    groupModel: undefined,
    pivotModel: undefined,
    pivotValues: undefined
  };

  public constructor(rows: GridRowData[]) {
    this.rows = rows.map((row) => ({ ...row }));
  }

  public getRowCount(): number {
    return this.rows.length;
  }

  public getRowKey(dataIndex: number): number {
    return dataIndex;
  }

  public getValue(dataIndex: number, columnId: string): unknown {
    const row = this.rows[dataIndex];
    return row ? row[columnId] : undefined;
  }

  public setValue(dataIndex: number, columnId: string, value: unknown): void {
    const row = this.rows[dataIndex];
    if (!row) {
      return;
    }

    row[columnId] = value;
  }

  public applyTransactions(_transactions: DataTransaction[]): void {}

  public getRow(dataIndex: number): GridRowData | undefined {
    return this.rows[dataIndex];
  }

  public setQueryModel(queryModel: Partial<RemoteQueryModel>): void {
    this.queryModel = {
      sortModel: Array.isArray(queryModel.sortModel) ? queryModel.sortModel.map((item) => ({ ...item })) : [],
      filterModel: queryModel.filterModel && typeof queryModel.filterModel === 'object' ? { ...queryModel.filterModel } : {},
      groupModel: Array.isArray(queryModel.groupModel)
        ? queryModel.groupModel.map((item) => ({ ...item }))
        : undefined,
      pivotModel: Array.isArray(queryModel.pivotModel)
        ? queryModel.pivotModel.map((item) => ({ ...item }))
        : undefined,
      pivotValues: Array.isArray(queryModel.pivotValues)
        ? queryModel.pivotValues.map((item) => ({ ...item, reducer: undefined }))
        : undefined
    };
  }

  public getQueryModel(): RemoteQueryModel {
    return {
      sortModel: this.queryModel.sortModel.map((item) => ({ ...item })),
      filterModel: { ...this.queryModel.filterModel },
      groupModel: Array.isArray(this.queryModel.groupModel)
        ? this.queryModel.groupModel.map((item) => ({ ...item }))
        : undefined,
      pivotModel: Array.isArray(this.queryModel.pivotModel)
        ? this.queryModel.pivotModel.map((item) => ({ ...item }))
        : undefined,
      pivotValues: Array.isArray(this.queryModel.pivotValues)
        ? this.queryModel.pivotValues.map((item) => ({ ...item, reducer: undefined }))
        : undefined
    };
  }
}

function waitForFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function createClipboardEvent(
  type: 'copy' | 'paste',
  initialData: Record<string, string> = {}
): { event: ClipboardEvent; getData: (mimeType: string) => string } {
  const store = new Map<string, string>();
  for (const mimeType in initialData) {
    if (Object.prototype.hasOwnProperty.call(initialData, mimeType)) {
      store.set(mimeType, initialData[mimeType]);
    }
  }

  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  }) as ClipboardEvent;

  Object.defineProperty(event, 'clipboardData', {
    configurable: true,
    value: {
      getData(mimeType: string) {
        return store.get(mimeType) ?? '';
      },
      setData(mimeType: string, value: string) {
        store.set(mimeType, value);
      },
      clearData(mimeType?: string) {
        if (typeof mimeType === 'string') {
          store.delete(mimeType);
          return;
        }

        store.clear();
      }
    }
  });

  return {
    event,
    getData(mimeType: string) {
      return store.get(mimeType) ?? '';
    }
  };
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

  it('resizes columns by header-edge drag with min/max clamp and rAF-coalesced updates', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 110, type: 'number' },
        { id: 'name', header: 'Name', width: 180, minWidth: 120, maxWidth: 260, type: 'text' },
        { id: 'score', header: 'Score', width: 140, type: 'number' }
      ],
      rowData: Array.from({ length: 200 }, (_, index) => ({
        id: index + 1,
        name: `User-${index + 1}`,
        score: (index * 13) % 1000
      })),
      height: 180,
      rowHeight: 28,
      overscan: 4
    });

    const resizeEvents: Array<{ phase: string; width: number }> = [];
    grid.on('columnResize', (event) => {
      resizeEvents.push({
        phase: event.phase,
        width: event.width
      });
    });

    function createPointerLikeEvent(
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      init: { pointerId: number; clientX: number; clientY: number; button?: number }
    ): MouseEvent {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: init.button ?? 0,
        clientX: init.clientX,
        clientY: init.clientY
      });

      Object.defineProperty(event, 'pointerId', {
        configurable: true,
        value: init.pointerId
      });
      return event;
    }

    const dispatchResizeSequence = async (moveXValues: number[]): Promise<void> => {
      const headerCell = container.querySelector('.hgrid__header-cell[data-column-id="name"]') as HTMLDivElement;
      expect(headerCell).toBeTruthy();

      const rect = {
        left: 100,
        top: 8,
        right: 280,
        bottom: 40,
        width: 180,
        height: 32,
        x: 100,
        y: 8,
        toJSON: () => ''
      };

      Object.defineProperty(headerCell, 'getBoundingClientRect', {
        configurable: true,
        value: () => rect
      });

      const pointerId = 77;
      const startX = rect.right - 1;
      const startY = rect.top + rect.height * 0.5;

      headerCell.dispatchEvent(
        createPointerLikeEvent('pointerdown', {
          pointerId,
          clientX: startX,
          clientY: startY,
          button: 0
        })
      );

      for (let moveIndex = 0; moveIndex < moveXValues.length; moveIndex += 1) {
        window.dispatchEvent(
          createPointerLikeEvent('pointermove', {
            pointerId,
            clientX: moveXValues[moveIndex],
            clientY: startY
          })
        );
      }

      await waitForFrame();
      const endX = moveXValues[moveXValues.length - 1] ?? startX;
      window.dispatchEvent(
        createPointerLikeEvent('pointerup', {
          pointerId,
          clientX: endX,
          clientY: startY
        })
      );
      await waitForFrame();
    };

    await dispatchResizeSequence([240, 230, 210]);

    const nameHeaderAfterMin = container.querySelector('.hgrid__header-cell[data-column-id="name"]') as HTMLDivElement;
    expect(nameHeaderAfterMin.style.width).toBe('120px');

    const firstMoveEvent = resizeEvents.find((event) => event.phase === 'move');
    expect(firstMoveEvent?.width).toBe(120);
    expect(resizeEvents.filter((event) => event.phase === 'move').length).toBe(1);
    expect(resizeEvents[0]).toMatchObject({ phase: 'start', width: 180 });
    expect(resizeEvents[2]).toMatchObject({ phase: 'end', width: 120 });

    resizeEvents.length = 0;
    await dispatchResizeSequence([420, 520]);

    const nameHeaderAfterMax = container.querySelector('.hgrid__header-cell[data-column-id="name"]') as HTMLDivElement;
    expect(nameHeaderAfterMax.style.width).toBe('260px');
    expect(resizeEvents[0]).toMatchObject({ phase: 'start', width: 120 });
    expect(resizeEvents[1]).toMatchObject({ phase: 'move', width: 260 });
    expect(resizeEvents[2]).toMatchObject({ phase: 'end', width: 260 });

    grid.destroy();
  });

  it('reorders columns by header drag and shows drop indicator while dragging', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'score', header: 'Score', width: 140, type: 'number' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: Array.from({ length: 100 }, (_, index) => ({
        id: index + 1,
        name: `User-${index + 1}`,
        score: (index * 11) % 1000,
        status: index % 2 === 0 ? 'active' : 'idle'
      })),
      height: 180,
      rowHeight: 28,
      overscan: 4
    });

    function createPointerLikeEvent(
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      init: { pointerId: number; clientX: number; clientY: number; button?: number }
    ): MouseEvent {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: init.button ?? 0,
        clientX: init.clientX,
        clientY: init.clientY
      });
      Object.defineProperty(event, 'pointerId', {
        configurable: true,
        value: init.pointerId
      });
      return event;
    }

    const headerElement = container.querySelector('.hgrid__header') as HTMLDivElement;
    const idHeaderCell = container.querySelector('.hgrid__header-cell[data-column-id="id"]') as HTMLDivElement;
    const nameHeaderCell = container.querySelector('.hgrid__header-cell[data-column-id="name"]') as HTMLDivElement;
    const scoreHeaderCell = container.querySelector('.hgrid__header-cell[data-column-id="score"]') as HTMLDivElement;
    const statusHeaderCell = container.querySelector('.hgrid__header-cell[data-column-id="status"]') as HTMLDivElement;
    const dropIndicator = container.querySelector('.hgrid__header-drop-indicator') as HTMLDivElement;

    const top = 8;
    const bottom = 40;
    const headerRect = {
      left: 100,
      top,
      right: 660,
      bottom,
      width: 560,
      height: 32,
      x: 100,
      y: top,
      toJSON: () => ''
    };
    Object.defineProperty(headerElement, 'getBoundingClientRect', {
      configurable: true,
      value: () => headerRect
    });
    Object.defineProperty(idHeaderCell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...headerRect, left: 100, right: 200, width: 100, x: 100, toJSON: () => '' })
    });
    Object.defineProperty(nameHeaderCell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...headerRect, left: 200, right: 380, width: 180, x: 200, toJSON: () => '' })
    });
    Object.defineProperty(scoreHeaderCell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...headerRect, left: 380, right: 520, width: 140, x: 380, toJSON: () => '' })
    });
    Object.defineProperty(statusHeaderCell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ ...headerRect, left: 520, right: 660, width: 140, x: 520, toJSON: () => '' })
    });

    const reorderEvents: Array<{ fromIndex: number; toIndex: number; columnOrder: string[] }> = [];
    grid.on('columnReorder', (event) => {
      reorderEvents.push({
        fromIndex: event.fromIndex,
        toIndex: event.toIndex,
        columnOrder: [...event.columnOrder]
      });
    });

    const pointerId = 91;
    const centerY = top + 16;
    nameHeaderCell.dispatchEvent(
      createPointerLikeEvent('pointerdown', {
        pointerId,
        clientX: 220,
        clientY: centerY,
        button: 0
      })
    );
    scoreHeaderCell.dispatchEvent(
      createPointerLikeEvent('pointermove', {
        pointerId,
        clientX: 514,
        clientY: centerY
      })
    );

    await waitForFrame();
    expect(dropIndicator.style.display).toBe('block');

    scoreHeaderCell.dispatchEvent(
      createPointerLikeEvent('pointerup', {
        pointerId,
        clientX: 514,
        clientY: centerY
      })
    );
    await waitForFrame();

    expect(dropIndicator.style.display).toBe('none');
    expect(reorderEvents.length).toBe(1);
    expect(reorderEvents[0]).toMatchObject({
      fromIndex: 1,
      toIndex: 2,
      columnOrder: ['id', 'score', 'name', 'status']
    });

    const firstRow = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    const cells = firstRow.querySelectorAll('.hgrid__cell');
    expect((cells[0] as HTMLDivElement).dataset.columnId).toBe('id');
    expect((cells[1] as HTMLDivElement).dataset.columnId).toBe('score');
    expect((cells[2] as HTMLDivElement).dataset.columnId).toBe('name');

    grid.destroy();
  });

  it('opens a header context menu and applies built-in column actions', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', status: 'active' },
        { id: 2, name: 'Beta', status: 'idle' }
      ],
      columnMenu: {
        enabled: true,
        trigger: 'both'
      },
      height: 160,
      rowHeight: 28
    });

    const statusHeaderCell = container.querySelector('.hgrid__header-cell[data-column-id="status"]') as HTMLDivElement;
    expect(statusHeaderCell).toBeTruthy();

    statusHeaderCell.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 160,
        clientY: 20
      })
    );
    await waitForFrame();

    const menuElement = container.querySelector('.hgrid__column-menu') as HTMLDivElement;
    expect(menuElement.classList.contains('hgrid__column-menu--open')).toBe(true);

    const hideColumnItem = Array.from(container.querySelectorAll('.hgrid__column-menu-item')).find(
      (element) => element.textContent?.trim() === 'Hide column'
    ) as HTMLButtonElement | undefined;
    expect(hideColumnItem).toBeTruthy();
    hideColumnItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(grid.getVisibleColumns().map((column) => column.id)).toEqual(['id', 'name']);

    grid.destroy();
    container.remove();
  });

  it('appends custom context menu items for header actions', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const selectedColumnIds: string[] = [];
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'score', header: 'Score', width: 140, type: 'number' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', score: 10 },
        { id: 2, name: 'Beta', score: 20 }
      ],
      columnMenu: {
        enabled: true,
        trigger: 'contextmenu'
      },
      contextMenu: {
        enabled: true,
        getItems: (context) => [
          { separator: true, id: 'sep', label: 'sep' },
          {
            id: 'inspect-column',
            label: `Inspect ${context.column.id}`,
            onSelect: (menuContext) => {
              selectedColumnIds.push(menuContext.column.id);
            }
          }
        ]
      },
      height: 160,
      rowHeight: 28
    });

    const nameHeaderCell = container.querySelector('.hgrid__header-cell[data-column-id="name"]') as HTMLDivElement;
    expect(nameHeaderCell).toBeTruthy();

    nameHeaderCell.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 120,
        clientY: 20
      })
    );
    await waitForFrame();

    const customItem = Array.from(container.querySelectorAll('.hgrid__column-menu-item')).find(
      (element) => element.textContent?.trim() === 'Inspect name'
    ) as HTMLButtonElement | undefined;
    expect(customItem).toBeTruthy();
    customItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(selectedColumnIds).toEqual(['name']);

    grid.destroy();
    container.remove();
  });

  it('restores column order through getState/setState', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'alpha', status: 'active' },
        { id: 2, name: 'beta', status: 'idle' }
      ],
      height: 120,
      rowHeight: 30,
      overscan: 2
    });

    grid.setColumnOrder(['status', 'id', 'name']);
    const savedState = grid.getState();
    expect(savedState.columnOrder).toEqual(['status', 'id', 'name']);

    grid.setColumnOrder(['id', 'name', 'status']);
    const beforeRestore = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    expect(((beforeRestore.querySelectorAll('.hgrid__cell')[0] as HTMLDivElement).dataset.columnId)).toBe('id');

    grid.setState(savedState);

    const afterRestore = container.querySelector('.hgrid__row--center') as HTMLDivElement;
    const restoredCells = afterRestore.querySelectorAll('.hgrid__cell');
    expect((restoredCells[0] as HTMLDivElement).dataset.columnId).toBe('status');
    expect((restoredCells[1] as HTMLDivElement).dataset.columnId).toBe('id');
    expect((restoredCells[2] as HTMLDivElement).dataset.columnId).toBe('name');

    grid.destroy();
  });

  it('updates pin/visibility at runtime and restores them from state', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 200, type: 'text' },
        { id: 'score', header: 'Score', width: 140, type: 'number' },
        { id: 'status', header: 'Status', width: 140, type: 'text', pinned: 'right' }
      ],
      rowData: [
        { id: 1, name: 'alpha', score: 10, status: 'active' },
        { id: 2, name: 'beta', score: 20, status: 'idle' }
      ],
      height: 120,
      rowHeight: 30,
      overscan: 2
    });

    grid.setColumnPin('name', 'left');
    grid.setColumnPin('score', 'right');
    grid.setColumnVisibility('score', false);

    expect(container.querySelectorAll('.hgrid__header-left .hgrid__header-cell[data-column-id="name"]').length).toBe(1);
    expect(container.querySelectorAll('.hgrid__header-right .hgrid__header-cell[data-column-id="score"]').length).toBe(0);

    const savedState = grid.getState();
    expect(savedState.hiddenColumnIds).toEqual(['score']);
    expect(savedState.pinnedColumns).toMatchObject({
      id: 'left',
      name: 'left',
      status: 'right',
      score: 'right'
    });

    grid.setColumnPin('name', undefined);
    grid.setColumnPin('score', undefined);
    grid.setColumnVisibility('score', true);
    expect(container.querySelectorAll('.hgrid__header-left .hgrid__header-cell[data-column-id="name"]').length).toBe(0);
    expect(container.querySelectorAll('.hgrid__header-center .hgrid__header-cell[data-column-id="score"]').length).toBe(1);

    grid.setState(savedState);
    expect(container.querySelectorAll('.hgrid__header-left .hgrid__header-cell[data-column-id="name"]').length).toBe(1);
    expect(container.querySelectorAll('.hgrid__header-right .hgrid__header-cell[data-column-id="status"]').length).toBe(1);
    expect(container.querySelectorAll('.hgrid__header-cell[data-column-id="score"]').length).toBe(0);

    grid.destroy();
  });

  it('renders multi-level column group headers and keeps them aligned across pin/hide/reorder', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 1180, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 96, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'language', header: 'Language', width: 140, type: 'text' },
        { id: 'country', header: 'Country', width: 140, type: 'text' },
        { id: 'game', header: 'Game', width: 170, type: 'text' },
        { id: 'balance', header: 'Balance', width: 150, type: 'number' },
        { id: 'rating', header: 'Rating', width: 120, type: 'number' },
        { id: 'score', header: 'Score', width: 120, type: 'number' },
        { id: 'updatedAt', header: 'Updated At', width: 210, type: 'date', pinned: 'right' }
      ],
      columnGroups: [
        {
          groupId: 'participant',
          header: 'Participant',
          children: [
            'name',
            {
              groupId: 'locale',
              header: 'Locale',
              children: ['language', 'country']
            }
          ]
        },
        {
          groupId: 'performance',
          header: 'Performance',
          children: ['game', 'balance']
        },
        {
          groupId: 'metrics',
          header: 'Metrics',
          children: ['rating', 'score']
        },
        {
          groupId: 'audit',
          header: 'Audit',
          children: ['updatedAt']
        }
      ],
      rowData: Array.from({ length: 300 }, (_value, index) => ({
        id: index + 1,
        name: `customer-${index + 1}`,
        language: ['English', 'Spanish', 'French', 'German'][index % 4],
        country: ['KR', 'US', 'JP', 'DE'][index % 4],
        game: ['Chess', 'Go', 'Shogi', 'Checkers'][index % 4],
        balance: (index * 97) % 9000,
        rating: (index % 5) + 1,
        score: (index * 13) % 1000,
        updatedAt: new Date(Date.now() - index * 60000).toISOString()
      })),
      height: 220,
      rowHeight: 28,
      overscan: 4
    });

    await waitForFrame();

    const groupRows = container.querySelectorAll('.hgrid__header-row--group');
    expect(groupRows.length).toBeGreaterThan(0);

    const groupCells = container.querySelectorAll('.hgrid__header-cell--group');
    expect(groupCells.length).toBeGreaterThan(0);

    const centerGroupCells = Array.from(
      container.querySelectorAll('.hgrid__header-center .hgrid__header-cell--group')
    ) as HTMLDivElement[];
    expect(centerGroupCells.some((cell) => cell.textContent === 'Participant')).toBe(true);
    expect(centerGroupCells.some((cell) => cell.dataset.groupId === 'locale')).toBe(true);
    expect(centerGroupCells.every((cell) => cell.getAttribute('aria-colspan') !== null)).toBe(true);
    expect(centerGroupCells.every((cell) => !cell.dataset.columnId)).toBe(true);

    const rootStyle = getComputedStyle(container.querySelector('.hgrid') as HTMLElement);
    expect(rootStyle.getPropertyValue('--hgrid-header-height').trim()).toBe('96px');
    expect(rootStyle.getPropertyValue('--hgrid-header-row-height').trim()).toBe('32px');

    grid.setColumnPin('country', 'right');
    await waitForFrame();
    const rightLeafColumnsAfterPin = Array.from(
      container.querySelectorAll('.hgrid__header-right .hgrid__header-row--leaf .hgrid__header-cell--leaf')
    ).map((cell) => (cell as HTMLDivElement).dataset.columnId);
    expect(rightLeafColumnsAfterPin.indexOf('country')).toBeGreaterThanOrEqual(0);
    expect(
      Array.from(container.querySelectorAll('.hgrid__header-right .hgrid__header-cell--group')).some(
        (cell) => (cell as HTMLDivElement).dataset.groupId === 'locale'
      )
    ).toBe(true);

    grid.setColumnVisibility('balance', false);
    await waitForFrame();
    const centerLeafColumnsAfterHide = Array.from(
      container.querySelectorAll('.hgrid__header-center .hgrid__header-row--leaf .hgrid__header-cell--leaf')
    ).map((cell) => (cell as HTMLDivElement).dataset.columnId);
    expect(centerLeafColumnsAfterHide.indexOf('balance')).toBe(-1);

    grid.setColumnOrder(['id', 'name', 'country', 'game', 'balance', 'rating', 'score', 'language', 'updatedAt']);
    await waitForFrame();
    const centerLeafColumnsAfterReorder = Array.from(
      container.querySelectorAll('.hgrid__header-center .hgrid__header-row--leaf .hgrid__header-cell--leaf')
    ).map((cell) => (cell as HTMLDivElement).dataset.columnId);
    expect(centerLeafColumnsAfterReorder[centerLeafColumnsAfterReorder.length - 1]).toBe('language');

    grid.destroy();
    container.remove();
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

  it('selects entire grid cell range by Ctrl/Cmd+A keyboard shortcut', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: Array.from({ length: 240 }, (_value, index) => ({
        id: index + 1,
        name: `User-${index + 1}`,
        status: index % 2 === 0 ? 'active' : 'idle'
      })),
      height: 220,
      rowHeight: 28,
      overscan: 4
    });

    grid.setSelection({
      activeCell: { rowIndex: 4, colIndex: 1 },
      cellRanges: [{ r1: 4, c1: 1, r2: 4, c2: 1 }],
      rowRanges: []
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true }));
    await waitForFrame();

    const selection = grid.getSelection();
    expect(selection.activeCell).toEqual({ rowIndex: 4, colIndex: 1 });
    expect(selection.cellRanges).toEqual([{ r1: 0, c1: 0, r2: 239, c2: 2 }]);

    grid.destroy();
    container.remove();
  });

  it('supports keyboard-only editing flow with F2 and Tab/Shift+Tab', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' as const },
        { id: 'name', header: 'Name', width: 200, type: 'text' as const, editable: true },
        { id: 'score', header: 'Score', width: 140, type: 'number' as const, editable: true },
        { id: 'status', header: 'Status', width: 160, type: 'text' as const }
      ],
      rowData: [
        { id: 1, name: 'User-1', score: 10, status: 'active' },
        { id: 2, name: 'User-2', score: 20, status: 'idle' }
      ],
      height: 160,
      rowHeight: 28,
      overscan: 2
    });

    const renderer = (
      grid as unknown as {
        renderer: {
          editorHostElement: HTMLDivElement;
          editorInputElement: HTMLInputElement;
        };
      }
    ).renderer;

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 0, c2: 1 }],
      rowRanges: []
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(true);
    expect(renderer.editorInputElement.value).toBe('User-1');

    renderer.editorInputElement.value = 'User-1-Edited';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(true);
    expect(renderer.editorInputElement.value).toBe('10');
    expect(grid.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 2 });
    const nameCellAfterTab = container.querySelector(
      '.hgrid__row--center[data-row-index="0"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(nameCellAfterTab.textContent).toBe('User-1-Edited');

    renderer.editorInputElement.value = '777';
    renderer.editorInputElement.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    );
    await waitForFrame();
    await waitForFrame();

    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(true);
    expect(renderer.editorInputElement.value).toBe('User-1-Edited');
    expect(grid.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 1 });
    const scoreCellAfterShiftTab = container.querySelector(
      '.hgrid__row--center[data-row-index="0"] .hgrid__cell[data-column-id="score"]'
    ) as HTMLDivElement;
    expect(scoreCellAfterShiftTab.textContent).toBe('777');

    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(false);

    grid.destroy();
    container.remove();
  });

  it('formats number/date cells by locale and updates formatted output after setOptions', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const rowData = [
      {
        id: 1,
        score: 1234567.89,
        updatedAt: '2026-03-06T00:00:00.000Z'
      }
    ];
    const dateFormatOptions = {
      timeZone: 'UTC',
      year: 'numeric' as const,
      month: '2-digit' as const,
      day: '2-digit' as const
    };
    const numberFormatOptions = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    };

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'score', header: 'Score', width: 180, type: 'number' },
        { id: 'updatedAt', header: 'Updated At', width: 220, type: 'date' }
      ],
      rowData,
      locale: 'en-US',
      numberFormatOptions,
      dateTimeFormatOptions: dateFormatOptions,
      height: 140,
      rowHeight: 28,
      overscan: 2
    });

    await waitForFrame();

    const scoreCell = container.querySelector(
      '.hgrid__row--center[data-row-index="0"] .hgrid__cell[data-column-id="score"]'
    ) as HTMLDivElement;
    const dateCell = container.querySelector(
      '.hgrid__row--center[data-row-index="0"] .hgrid__cell[data-column-id="updatedAt"]'
    ) as HTMLDivElement;
    expect(scoreCell.textContent).toBe(new Intl.NumberFormat('en-US', numberFormatOptions).format(1234567.89));
    expect(dateCell.textContent).toBe(new Intl.DateTimeFormat('en-US', dateFormatOptions).format(new Date(rowData[0].updatedAt)));

    grid.setOptions({
      locale: 'de-DE'
    });
    await waitForFrame();
    await waitForFrame();

    const scoreCellAfterLocaleChange = container.querySelector(
      '.hgrid__row--center[data-row-index="0"] .hgrid__cell[data-column-id="score"]'
    ) as HTMLDivElement;
    const dateCellAfterLocaleChange = container.querySelector(
      '.hgrid__row--center[data-row-index="0"] .hgrid__cell[data-column-id="updatedAt"]'
    ) as HTMLDivElement;

    expect(scoreCellAfterLocaleChange.textContent).toBe(new Intl.NumberFormat('de-DE', numberFormatOptions).format(1234567.89));
    expect(dateCellAfterLocaleChange.textContent).toBe(
      new Intl.DateTimeFormat('de-DE', dateFormatOptions).format(new Date(rowData[0].updatedAt))
    );

    grid.destroy();
    container.remove();
  });

  it('applies localeText overrides and rtl direction to root/indicator aria labels', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: '__indicatorCheckbox', header: '', width: 56, type: 'boolean' },
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' }
      ],
      locale: 'ko-KR',
      rtl: true,
      height: 140,
      rowHeight: 28,
      overscan: 2
    });

    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    const checkAll = container.querySelector('.hgrid__indicator-checkall') as HTMLInputElement;
    const firstRowCheckbox = container.querySelector(
      '.hgrid__row--left[data-row-index="0"] .hgrid__indicator-checkbox'
    ) as HTMLInputElement;

    expect(root.getAttribute('dir')).toBe('rtl');
    expect(root.classList.contains('hgrid--rtl')).toBe(true);
    expect(checkAll.getAttribute('aria-label')).toBe('모든 행 선택 (필터 결과)');
    expect(firstRowCheckbox.getAttribute('aria-label')).toBe('1행 선택');

    grid.setOptions({
      locale: 'en-US',
      rtl: false,
      localeText: {
        selectAllRows: 'Pick all rows ({scope})',
        scopeFiltered: 'filtered-set',
        selectRow: 'Pick row {row}'
      }
    });
    await waitForFrame();

    await waitForFrame();
    const checkAllAfterSetOptions = container.querySelector('.hgrid__indicator-checkall') as HTMLInputElement;
    const firstRowCheckboxAfterSetOptions = container.querySelector(
      '.hgrid__row--left[data-row-index="0"] .hgrid__indicator-checkbox'
    ) as HTMLInputElement;

    expect(root.getAttribute('dir')).toBe('ltr');
    expect(root.classList.contains('hgrid--rtl')).toBe(false);
    expect(checkAllAfterSetOptions.getAttribute('aria-label')).toBe('Pick all rows (filtered-set)');
    expect(firstRowCheckboxAfterSetOptions.getAttribute('aria-label')).toBe('Pick row 1');

    grid.destroy();
    container.remove();
  });

  it('copies selected cell range as TSV through clipboard event', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'name', header: 'Name', width: 200, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', status: 'active' },
        { id: 2, name: 'Beta', status: 'idle' }
      ],
      height: 160,
      rowHeight: 28,
      overscan: 2
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      cellRanges: [{ r1: 0, c1: 0, r2: 1, c2: 1 }],
      rowRanges: []
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    const clipboard = createClipboardEvent('copy');
    const dispatchResult = root.dispatchEvent(clipboard.event);

    expect(dispatchResult).toBe(false);
    expect(clipboard.event.defaultPrevented).toBe(true);
    expect(clipboard.getData('text/plain')).toBe('1\tAlpha\n2\tBeta');

    grid.destroy();
    container.remove();
  });

  it('pastes plain TSV into editable cells and does not render HTML from clipboard', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text', editable: true },
        { id: 'status', header: 'Status', width: 140, type: 'text', editable: true }
      ],
      rowData: [
        { id: 1, name: 'User-1', status: 'idle' },
        { id: 2, name: 'User-2', status: 'idle' }
      ],
      height: 180,
      rowHeight: 28,
      overscan: 2
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }],
      rowRanges: []
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    const clipboard = createClipboardEvent('paste', {
      'text/plain': '<b>Safe</b>\tactive\nLiteral\tidle',
      'text/html': '<table><tr><td><b>Unsafe</b></td><td>active</td></tr></table>'
    });
    const dispatchResult = root.dispatchEvent(clipboard.event);
    await waitForFrame();

    expect(dispatchResult).toBe(false);
    expect(clipboard.event.defaultPrevented).toBe(true);

    const firstNameCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    const firstStatusCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="status"]'
    ) as HTMLDivElement;
    const secondNameCell = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    const secondStatusCell = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="status"]'
    ) as HTMLDivElement;

    expect(firstNameCell.textContent).toBe('<b>Safe</b>');
    expect(firstNameCell.querySelector('b')).toBeNull();
    expect(firstStatusCell.textContent).toBe('active');
    expect(secondNameCell.textContent).toBe('Literal');
    expect(secondStatusCell.textContent).toBe('idle');

    const firstIdCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="id"]'
    ) as HTMLDivElement;
    expect(firstIdCell.textContent).toBe('1');

    grid.destroy();
    container.remove();
  });

  it('renders unsafe HTML only when opt-in is enabled and sanitize hook is provided', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const sanitizeCalls: Array<{ columnId: string; rowIndex: number; rowKey: string | number }> = [];

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 90, type: 'number' },
        { id: 'unsafeName', header: 'Unsafe Name', width: 220, type: 'text', unsafeHtml: true },
        { id: 'plainName', header: 'Plain Name', width: 220, type: 'text' }
      ],
      rowData: [
        {
          id: 101,
          unsafeName: '<strong class="safe-name">Safe</strong><img src=x onerror="window.__xss=true" />',
          plainName: '<strong>Literal</strong>'
        }
      ],
      sanitizeHtml(unsafeHtml, context) {
        sanitizeCalls.push({
          columnId: context.column.id,
          rowIndex: context.rowIndex,
          rowKey: context.rowKey
        });
        return unsafeHtml.replace(/<img[\s\S]*?>/gi, '').replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
      },
      height: 150,
      rowHeight: 28,
      overscan: 2
    });

    await waitForFrame();

    const unsafeCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="unsafeName"]'
    ) as HTMLDivElement;
    const plainCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="plainName"]'
    ) as HTMLDivElement;

    expect(unsafeCell.querySelector('strong.safe-name')).not.toBeNull();
    expect(unsafeCell.querySelector('img')).toBeNull();
    expect(plainCell.textContent).toBe('<strong>Literal</strong>');
    expect(plainCell.querySelector('strong')).toBeNull();
    expect(sanitizeCalls.some((call) => call.columnId === 'unsafeName' && call.rowKey === 101)).toBe(true);

    grid.destroy();
    container.remove();
  });

  it('exports visible rows as CSV with headers', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: Array.from({ length: 120 }, (_value, index) => ({
        id: index + 1,
        name: `User-${index + 1}`,
        status: index % 2 === 0 ? 'active' : 'idle'
      })),
      height: 168,
      rowHeight: 28,
      overscan: 2
    });

    const verticalScrollElement = getVerticalScrollElement(container);
    verticalScrollElement.scrollTop = 28 * 20;
    verticalScrollElement.dispatchEvent(new Event('scroll'));
    await waitForFrame();

    const result = await grid.exportCsv({ scope: 'visible' });
    const lines = result.content.split('\n');

    expect(result.format).toBe('csv');
    expect(result.scope).toBe('visible');
    expect(result.canceled).toBe(false);
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.rowCount).toBeLessThan(120);
    expect(lines[0]).toBe('ID,Name,Status');
    const firstVisibleId = Number(lines[1].split(',')[0]);
    expect(firstVisibleId).toBeGreaterThan(1);

    grid.destroy();
    container.remove();
  });

  it('exposes plugin extension APIs for data/viewport access and refresh', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'score', header: 'Score', width: 140, type: 'number' }
      ],
      rowData: Array.from({ length: 80 }, (_value, index) => ({
        id: index + 1,
        name: `User-${index + 1}`,
        score: index
      })),
      height: 168,
      rowHeight: 28,
      overscan: 2
    });

    const visibleColumns = grid.getVisibleColumns();
    expect(visibleColumns.map((column) => column.id)).toEqual(['id', 'name', 'score']);
    expect(grid.getColumns().length).toBe(3);
    expect(grid.getViewRowCount()).toBe(80);
    expect(grid.getDataIndex(0)).toBe(0);

    const visibleRange = grid.getVisibleRowRange();
    expect(visibleRange).not.toBeNull();
    expect(visibleRange?.startRow).toBeGreaterThanOrEqual(0);
    expect((visibleRange?.endRow ?? 0) - (visibleRange?.startRow ?? 0)).toBeGreaterThanOrEqual(0);

    const dataProvider = grid.getDataProvider();
    dataProvider.applyTransactions([
      {
        type: 'updateCell',
        index: 0,
        columnId: 'name',
        value: 'Plugin-Updated'
      }
    ]);
    grid.refresh();
    await waitForFrame();

    const firstNameCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(firstNameCell.textContent).toBe('Plugin-Updated');

    grid.destroy();
    container.remove();
  });

  it('exports selection range as TSV', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', status: 'active' },
        { id: 2, name: 'Beta', status: 'idle' },
        { id: 3, name: 'Gamma', status: 'active' }
      ],
      height: 160,
      rowHeight: 28,
      overscan: 2
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }],
      rowRanges: []
    });
    await waitForFrame();

    const result = await grid.exportTsv({
      scope: 'selection',
      includeHeaders: false
    });

    expect(result.format).toBe('tsv');
    expect(result.scope).toBe('selection');
    expect(result.rowCount).toBe(2);
    expect(result.content).toBe('Alpha\tactive\nBeta\tidle');

    grid.destroy();
    container.remove();
  });

  it('supports all-row CSV export progress and cancellation via AbortSignal', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' }
      ],
      rowData: Array.from({ length: 5000 }, (_value, index) => ({
        id: index + 1,
        name: `User-${index + 1}`
      })),
      height: 200,
      rowHeight: 28,
      overscan: 2
    });

    const controller = new AbortController();
    const progressEvents: Array<{ status: string; processedRows: number; totalRows: number }> = [];
    const result = await grid.exportCsv({
      scope: 'all',
      chunkSize: 200,
      signal: controller.signal,
      onProgress(event) {
        progressEvents.push({
          status: event.status,
          processedRows: event.processedRows,
          totalRows: event.totalRows
        });

        if (event.status === 'running' && event.processedRows >= 1000 && !controller.signal.aborted) {
          controller.abort();
        }
      }
    });

    expect(result.scope).toBe('all');
    expect(result.canceled).toBe(true);
    expect(result.rowCount).toBeGreaterThanOrEqual(1000);
    expect(result.rowCount).toBeLessThan(5000);
    expect(progressEvents.length).toBeGreaterThan(1);
    expect(progressEvents[progressEvents.length - 1].status).toBe('canceled');
    expect(progressEvents[progressEvents.length - 1].totalRows).toBe(5000);

    const exportedLines = result.content.split('\n');
    expect(exportedLines[0]).toBe('ID,Name');
    expect(exportedLines.length).toBe(result.rowCount + 1);

    grid.destroy();
    container.remove();
  });

  it('applies css variable tokens through setTheme', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' }
      ],
      height: 160,
      rowHeight: 28,
      overscan: 2
    });

    grid.setTheme({
      '--hgrid-header-bg': '#111827',
      '--hgrid-border-color': '#334155',
      '--hgrid-font-family': '"Pretendard", "Noto Sans KR", sans-serif'
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    expect(root.style.getPropertyValue('--hgrid-header-bg')).toBe('#111827');
    expect(root.style.getPropertyValue('--hgrid-border-color')).toBe('#334155');
    expect(root.style.getPropertyValue('--hgrid-font-family')).toBe('"Pretendard", "Noto Sans KR", sans-serif');

    grid.destroy();
    container.remove();
  });

  it('supports indicator checkbox/checkAll interactions and Space toggle', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 980, configurable: true });
    document.body.append(container);

    const rowData = Array.from({ length: 160 }, (_value, index) => ({
      id: index + 100,
      name: `Customer-${index + 1}`,
      status: index % 2 === 0 ? 'active' : 'idle',
      __rowStatus: index % 3 === 0 ? 'updated' : index % 5 === 0 ? 'error' : 'clean'
    }));

    const grid = new Grid(container, {
      columns: [
        { id: '__indicatorRowNumber', header: '#', width: 64, type: 'number' },
        { id: '__indicatorCheckbox', header: '', width: 56, type: 'boolean' },
        { id: '__indicatorStatus', header: 'State', width: 104, type: 'text' },
        { id: 'id', header: 'ID', width: 110, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData,
      height: 260,
      rowHeight: 28,
      overscan: 4,
      rowIndicator: {
        width: 56,
        checkAllScope: 'filtered',
        getRowStatus(context) {
          return context.row.__rowStatus as 'clean' | 'updated' | 'error';
        }
      }
    });

    await waitForFrame();

    const checkAll = container.querySelector('.hgrid__indicator-checkall') as HTMLInputElement | null;
    const firstRowCheckbox = container.querySelector('.hgrid__row--left .hgrid__indicator-checkbox') as HTMLInputElement | null;
    const firstRowNumberCell = container.querySelector(
      '.hgrid__row--left .hgrid__cell[data-column-id="__indicatorRowNumber"]'
    ) as HTMLDivElement | null;
    const firstStatusCell = container.querySelector(
      '.hgrid__row--left .hgrid__cell[data-column-id="__indicatorStatus"]'
    ) as HTMLDivElement | null;
    expect(checkAll).not.toBeNull();
    expect(firstRowCheckbox).not.toBeNull();
    expect(firstRowNumberCell?.textContent).toBe('1');
    expect(['updated', 'clean', 'error']).toContain(firstStatusCell?.textContent ?? '');

    firstRowCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    const selectionAfterSingleToggle = grid.getSelection();
    expect(selectionAfterSingleToggle.rowRanges.length).toBe(1);
    expect(selectionAfterSingleToggle.rowRanges[0].r1).toBe(selectionAfterSingleToggle.rowRanges[0].r2);
    expect(checkAll?.indeterminate).toBe(true);

    const secondRowCheckbox = container.querySelector(
      '.hgrid__row--left[data-row-index="1"] .hgrid__indicator-checkbox'
    ) as HTMLInputElement | null;
    expect(secondRowCheckbox).not.toBeNull();
    secondRowCheckbox?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    const selectionAfterMultiToggle = grid.getSelection();
    expect(selectionAfterMultiToggle.rowRanges).toEqual([{ r1: 0, r2: 1, rowKeyStart: 100, rowKeyEnd: 101 }]);

    checkAll?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    const selectionAfterCheckAll = grid.getSelection();
    expect(selectionAfterCheckAll.rowRanges).toEqual([{ r1: 0, r2: 159, rowKeyStart: 100, rowKeyEnd: 259 }]);
    expect(checkAll?.checked).toBe(true);

    grid.setSelection({
      activeCell: { rowIndex: 3, colIndex: 1 },
      cellRanges: [],
      rowRanges: []
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    await waitForFrame();

    const selectionAfterSpace = grid.getSelection();
    expect(selectionAfterSpace.rowRanges).toEqual([{ r1: 3, r2: 3, rowKeyStart: 103, rowKeyEnd: 103 }]);

    const externalStateColumnCount = container.querySelectorAll('.hgrid__cell[data-column-id="__state"]').length;
    expect(externalStateColumnCount).toBe(0);

    grid.destroy();
    container.remove();
  });

  it('keeps checkAll/clearAll range-based at 1M rows', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 980, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: '__indicatorCheckbox', header: '', width: 56, type: 'boolean' },
        { id: 'id', header: 'ID', width: 110, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 220, type: 'text' }
      ],
      dataProvider: new SyntheticLargeDataProvider(1_000_000),
      height: 260,
      rowHeight: 28,
      overscan: 4,
      rowIndicator: {
        checkAllScope: 'filtered'
      }
    });

    await waitForFrame();

    const checkAll = container.querySelector('.hgrid__indicator-checkall') as HTMLInputElement | null;
    expect(checkAll).not.toBeNull();

    checkAll?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(grid.getSelection().rowRanges).toEqual([{ r1: 0, r2: 999_999, rowKeyStart: 0, rowKeyEnd: 999_999 }]);

    checkAll?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    expect(grid.getSelection().rowRanges).toEqual([]);

    grid.destroy();
    container.remove();
  });

  it('keeps indicator checkbox DOM pooled while scrolling', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 980, configurable: true });
    document.body.append(container);

    const rowData = Array.from({ length: 5000 }, (_value, index) => ({
      id: index + 1,
      name: `Customer-${index + 1}`,
      status: index % 2 === 0 ? 'active' : 'idle'
    }));

    const grid = new Grid(container, {
      columns: [
        { id: '__indicatorCheckbox', header: '', width: 56, type: 'boolean' },
        { id: 'id', header: 'ID', width: 110, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData,
      height: 260,
      rowHeight: 28,
      overscan: 4
    });

    await waitForFrame();

    const leftLayer = container.querySelector('.hgrid__rows-layer--left') as HTMLDivElement;
    const indicatorCheckboxesBefore = Array.from(
      container.querySelectorAll('.hgrid__row--left .hgrid__indicator-checkbox')
    ) as HTMLInputElement[];

    const childListRecords: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      for (let recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
        const record = records[recordIndex];
        if (record.type === 'childList') {
          childListRecords.push(record);
        }
      }
    });
    observer.observe(leftLayer, { childList: true, subtree: false });

    const verticalScrollElement = getVerticalScrollElement(container);
    for (let index = 0; index < 60; index += 1) {
      verticalScrollElement.scrollTop = index * 140;
      verticalScrollElement.dispatchEvent(new Event('scroll'));
      await waitForFrame();
    }

    observer.disconnect();

    const indicatorCheckboxesAfter = Array.from(
      container.querySelectorAll('.hgrid__row--left .hgrid__indicator-checkbox')
    ) as HTMLInputElement[];
    expect(indicatorCheckboxesAfter.length).toBe(indicatorCheckboxesBefore.length);
    for (let index = 0; index < indicatorCheckboxesBefore.length; index += 1) {
      expect(indicatorCheckboxesAfter[index]).toBe(indicatorCheckboxesBefore[index]);
    }

    const hasChildListMutation = childListRecords.some((record) => record.addedNodes.length > 0 || record.removedNodes.length > 0);
    expect(hasChildListMutation).toBe(false);

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

    const auditLogs: EditCommitAuditPayload[] = [];
    const grid = new Grid(container, {
      columns,
      rowData,
      height: 160,
      rowHeight: 28,
      overscan: 2,
      onAuditLog(payload) {
        auditLogs.push(payload);
      }
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
    const editCommitEvents: GridEventMap['editCommit'][] = [];
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
      rowKey: 1,
      columnId: 'name',
      value: 'User-1-Edited',
      source: 'editor'
    });
    expect(typeof editCommitEvents[0].commitId).toBe('string');
    expect(typeof editCommitEvents[0].timestamp).toBe('string');
    expect(typeof editCommitEvents[0].timestampMs).toBe('number');
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0]).toMatchObject({
      eventName: 'editCommit',
      rowIndex: 0,
      rowKey: 1,
      columnId: 'name',
      source: 'editor',
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

  it('applies local grouping with expand and collapse state', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      rowData: [
        { id: 1, region: 'KR', name: 'A', score: 10 },
        { id: 2, region: 'KR', name: 'B', score: 20 },
        { id: 3, region: 'US', name: 'C', score: 30 },
        { id: 4, region: 'US', name: 'D', score: 40 }
      ],
      height: 180,
      rowHeight: 28
    });

    await grid.setGroupModel([{ columnId: 'region' }]);
    await grid.setGroupAggregations([{ columnId: 'score', type: 'sum' }]);
    await waitForFrame();

    const groupedRows = grid.getGroupedRowsSnapshot();
    const firstGroupRow = groupedRows.find((row) => row.kind === 'group');
    expect(firstGroupRow).toBeTruthy();
    if (!firstGroupRow || firstGroupRow.kind !== 'group') {
      return;
    }

    const initialGroupDomCount = container.querySelectorAll('.hgrid__row--group').length;
    expect(initialGroupDomCount).toBeGreaterThan(0);

    await grid.setGroupExpanded(firstGroupRow.groupKey, false);
    await waitForFrame();
    const collapsedSnapshot = grid.getGroupedRowsSnapshot();
    expect(collapsedSnapshot.length).toBeLessThan(groupedRows.length);

    await grid.setGroupExpanded(firstGroupRow.groupKey, true);
    await waitForFrame();
    const expandedSnapshot = grid.getGroupedRowsSnapshot();
    expect(expandedSnapshot.length).toBe(groupedRows.length);

    const renderer = (
      grid as unknown as {
        renderer: {
          startEditingAtCell: (rowIndex: number, colIndex: number) => boolean;
        };
      }
    ).renderer;
    expect(renderer.startEditingAtCell(0, 1)).toBe(false);

    grid.destroy();
    container.remove();
  });

  it('passes group model to remote query when grouping mode is server', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const provider = new MockRemoteGroupingProvider([
      { id: 1, region: 'KR', score: 10 },
      { id: 2, region: 'US', score: 20 }
    ]);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'region', header: 'Region', width: 160, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      dataProvider: provider,
      grouping: {
        mode: 'server'
      },
      height: 160,
      rowHeight: 28
    });

    await grid.setGroupModel([{ columnId: 'region' }]);
    await waitForFrame();

    const queryAfterGrouping = provider.getQueryModel();
    expect(queryAfterGrouping.groupModel).toEqual([{ columnId: 'region' }]);

    await grid.setSortModel([{ columnId: 'score', direction: 'desc' }]);
    await waitForFrame();
    const queryAfterSort = provider.getQueryModel();
    expect(queryAfterSort.sortModel).toEqual([{ columnId: 'score', direction: 'desc' }]);
    expect(queryAfterSort.groupModel).toEqual([{ columnId: 'region' }]);

    grid.destroy();
    container.remove();
  });

  it('passes pivot model to remote query when pivoting mode is server', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const provider = new MockRemoteGroupingProvider([
      { id: 1, region: 'KR', month: 'Jan', score: 10 },
      { id: 2, region: 'US', month: 'Feb', score: 20 }
    ]);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'month', header: 'Month', width: 140, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      dataProvider: provider,
      pivoting: {
        mode: 'server'
      },
      height: 160,
      rowHeight: 28
    });

    await grid.setPivotModel([{ columnId: 'month' }]);
    await grid.setPivotValues([{ columnId: 'score', type: 'sum' }]);
    await waitForFrame();

    const queryAfterPivot = provider.getQueryModel();
    expect(queryAfterPivot.pivotModel).toEqual([{ columnId: 'month' }]);
    expect(queryAfterPivot.pivotValues).toEqual([{ columnId: 'score', type: 'sum' }]);

    await grid.setSortModel([{ columnId: 'score', direction: 'desc' }]);
    await waitForFrame();
    const queryAfterSort = provider.getQueryModel();
    expect(queryAfterSort.sortModel).toEqual([{ columnId: 'score', direction: 'desc' }]);
    expect(queryAfterSort.pivotModel).toEqual([{ columnId: 'month' }]);
    expect(queryAfterSort.pivotValues).toEqual([{ columnId: 'score', type: 'sum' }]);

    grid.destroy();
    container.remove();
  });

  it('renders local pivot with horizontal aggregated columns', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'month', header: 'Month', width: 120, type: 'text' },
        { id: 'sales', header: 'Sales', width: 120, type: 'number' }
      ],
      rowData: [
        { id: 1, region: 'KR', month: 'Jan', sales: 100 },
        { id: 2, region: 'KR', month: 'Feb', sales: 60 },
        { id: 3, region: 'KR', month: 'Jan', sales: 40 },
        { id: 4, region: 'US', month: 'Jan', sales: 25 },
        { id: 5, region: 'US', month: 'Feb', sales: 75 }
      ],
      height: 180,
      rowHeight: 28
    });

    await grid.setGroupModel([{ columnId: 'region' }]);
    await grid.setPivotingMode('client');
    await grid.setPivotModel([{ columnId: 'month' }]);
    await grid.setPivotValues([{ columnId: 'sales', type: 'sum' }]);
    await waitForFrame();

    const headers = Array.from(container.querySelectorAll('.hgrid__header-cell'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter((text) => text.length > 0);

    expect(headers.some((text) => text.includes('Jan'))).toBe(true);
    expect(headers.some((text) => text.includes('Feb'))).toBe(true);
    expect(headers.some((text) => text === 'Region')).toBe(true);

    const bodyTexts = Array.from(container.querySelectorAll('.hgrid__row--center .hgrid__cell'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter((text) => text.length > 0);

    expect(bodyTexts.indexOf('KR')).toBeGreaterThan(-1);
    expect(bodyTexts.indexOf('US')).toBeGreaterThan(-1);
    expect(bodyTexts.indexOf('140')).toBeGreaterThan(-1);
    expect(bodyTexts.indexOf('60')).toBeGreaterThan(-1);
    expect(bodyTexts.indexOf('25')).toBeGreaterThan(-1);
    expect(bodyTexts.indexOf('75')).toBeGreaterThan(-1);

    await grid.clearPivotModel();
    await grid.setPivotValues([]);
    await waitForFrame();
    const restoredHeaders = Array.from(container.querySelectorAll('.hgrid__header-cell'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter((text) => text.length > 0);
    expect(restoredHeaders.indexOf('Month')).toBeGreaterThan(-1);
    expect(restoredHeaders.indexOf('Sales')).toBeGreaterThan(-1);

    grid.destroy();
    container.remove();
  });

  it('applies tree data model from parentId and keeps expansion state', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'parentId', header: 'Parent', width: 120, type: 'number' }
      ],
      rowData: [
        { id: 1, parentId: null, name: 'Root-1', hasChildren: true },
        { id: 2, parentId: 1, name: 'Child-1-1', hasChildren: false },
        { id: 3, parentId: 1, name: 'Child-1-2', hasChildren: false },
        { id: 4, parentId: null, name: 'Root-2', hasChildren: false }
      ],
      height: 180,
      rowHeight: 28
    });

    await grid.setTreeDataOptions({
      enabled: true,
      mode: 'client',
      idField: 'id',
      parentIdField: 'parentId',
      hasChildrenField: 'hasChildren',
      treeColumnId: 'name',
      defaultExpanded: true
    });
    await waitForFrame();

    const expandedRows = grid.getTreeRowsSnapshot();
    expect(expandedRows.length).toBe(4);
    expect(expandedRows[0].nodeKey).toBe(1);
    expect(expandedRows[1].depth).toBe(1);
    expect(container.querySelectorAll('.hgrid__cell--tree').length).toBeGreaterThan(0);

    await grid.setTreeExpanded(1, false);
    await waitForFrame();
    const collapsedRows = grid.getTreeRowsSnapshot();
    expect(collapsedRows.length).toBe(2);
    expect(collapsedRows[0].isExpanded).toBe(false);

    await grid.setTreeExpanded(1, true);
    await waitForFrame();
    const restoredRows = grid.getTreeRowsSnapshot();
    expect(restoredRows.length).toBe(4);

    grid.destroy();
    container.remove();
  });

  it('loads lazy children on expand in tree server mode', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'parentId', header: 'Parent', width: 120, type: 'number' }
      ],
      rowData: [{ id: 100, parentId: null, name: 'Root-100', hasChildren: true }],
      height: 180,
      rowHeight: 28
    });

    let loadCount = 0;
    await grid.setTreeDataOptions({
      enabled: true,
      mode: 'server',
      idField: 'id',
      parentIdField: 'parentId',
      hasChildrenField: 'hasChildren',
      treeColumnId: 'name',
      defaultExpanded: false,
      loadChildren: async ({ parentNodeKey }) => {
        loadCount += 1;
        return {
          rows: [
            { id: 101, parentId: parentNodeKey, name: 'Child-100-1', hasChildren: false },
            { id: 102, parentId: parentNodeKey, name: 'Child-100-2', hasChildren: false }
          ]
        };
      }
    });
    await waitForFrame();

    const initialRows = grid.getTreeRowsSnapshot();
    expect(initialRows.length).toBe(1);

    await grid.setTreeExpanded(100, true);
    await waitForFrame();
    await waitForFrame();

    const expandedRows = grid.getTreeRowsSnapshot();
    expect(loadCount).toBe(1);
    expect(expandedRows.length).toBe(3);
    expect(expandedRows[1].parentNodeKey).toBe(100);
    expect(expandedRows[1].localRow).toMatchObject({
      id: 101,
      parentId: 100,
      name: 'Child-100-1',
      hasChildren: false
    });
    expect(expandedRows[1].localRow).not.toHaveProperty(WORKER_TREE_LAZY_ROW_REF_FIELD);

    const firstChildNameCell = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(firstChildNameCell.textContent).toContain('Child-100-1');

    await grid.setTreeExpanded(100, false);
    await waitForFrame();
    await grid.setTreeExpanded(100, true);
    await waitForFrame();
    expect(loadCount).toBe(1);

    grid.destroy();
    container.remove();
  });

  it('exposes ARIA grid semantics with grouped headers and pinned zones', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 980, configurable: true });
    document.body.append(container);

    const rowData = Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      name: `Customer-${index + 1}`,
      country: index % 2 === 0 ? 'KR' : 'US',
      score: index * 3
    }));

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number', pinned: 'left' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'country', header: 'Country', width: 140, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number', pinned: 'right' }
      ],
      columnGroups: [
        {
          groupId: 'participant',
          header: 'Participant',
          children: ['name', 'country']
        }
      ],
      rowData,
      height: 220,
      rowHeight: 28,
      overscan: 4
    });

    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    expect(root.getAttribute('role')).toBe('grid');
    expect(root.getAttribute('aria-colcount')).toBe('4');
    expect(root.getAttribute('aria-rowcount')).toBe(String(rowData.length + 2));

    const centerGroupRow = container.querySelector('.hgrid__header-center .hgrid__header-row--group') as HTMLDivElement;
    expect(centerGroupRow.getAttribute('role')).toBe('row');
    expect(centerGroupRow.getAttribute('aria-rowindex')).toBe('1');

    const centerLeafRow = container.querySelector('.hgrid__header-center .hgrid__header-row--leaf') as HTMLDivElement;
    expect(centerLeafRow.getAttribute('role')).toBe('row');
    expect(centerLeafRow.getAttribute('aria-rowindex')).toBe('2');

    const centerDataRow = container.querySelector('.hgrid__row--center[data-row-index="0"]') as HTMLDivElement;
    expect(centerDataRow.getAttribute('role')).toBe('row');
    expect(centerDataRow.getAttribute('aria-rowindex')).toBe('3');

    const leftDataRow = container.querySelector('.hgrid__row--left[data-row-index="0"]') as HTMLDivElement;
    expect(leftDataRow.getAttribute('role')).toBe('presentation');
    expect(leftDataRow.hasAttribute('aria-rowindex')).toBe(false);

    const idCell = container.querySelector('.hgrid__row--left[data-row-index="0"] .hgrid__cell[data-column-id="id"]') as HTMLDivElement;
    expect(idCell.getAttribute('aria-rowindex')).toBe('3');
    expect(idCell.getAttribute('aria-colindex')).toBe('1');

    const nameHeaderCell = container.querySelector(
      '.hgrid__header-center .hgrid__header-row--leaf .hgrid__header-cell[data-column-id="name"]'
    ) as HTMLDivElement;
    expect(nameHeaderCell.getAttribute('aria-colindex')).toBe('2');

    const scoreCell = container.querySelector(
      '.hgrid__row--right[data-row-index="0"] .hgrid__cell[data-column-id="score"]'
    ) as HTMLDivElement;
    expect(scoreCell.getAttribute('aria-rowindex')).toBe('3');
    expect(scoreCell.getAttribute('aria-colindex')).toBe('4');

    grid.destroy();
    container.remove();
  });

  it('syncs aria-activedescendant with active cell lifecycle', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 760, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text' },
        { id: 'status', header: 'Status', width: 160, type: 'text' }
      ],
      rowData: Array.from({ length: 600 }, (_, index) => ({
        id: index + 1,
        name: `Name-${index + 1}`,
        status: index % 2 === 0 ? 'active' : 'idle'
      })),
      height: 220,
      rowHeight: 28,
      overscan: 6
    });

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [],
      rowRanges: []
    });
    await waitForFrame();

    const activeCellId = root.getAttribute('aria-activedescendant');
    expect(activeCellId).toBeTruthy();

    const activeCell = activeCellId ? (container.querySelector(`#${activeCellId}`) as HTMLDivElement | null) : null;
    expect(activeCell).toBeTruthy();
    expect(activeCell?.dataset.columnId).toBe('name');
    expect(activeCell?.getAttribute('aria-rowindex')).toBe('2');
    expect(activeCell?.getAttribute('aria-colindex')).toBe('2');

    const verticalScrollElement = getVerticalScrollElement(container);
    verticalScrollElement.scrollTop = 4000;
    verticalScrollElement.dispatchEvent(new Event('scroll'));
    await waitForFrame();

    expect(root.hasAttribute('aria-activedescendant')).toBe(false);

    const visibleCenterRow = container.querySelector('.hgrid__row--center[data-row-index]') as HTMLDivElement;
    const visibleRowIndex = Number(visibleCenterRow.dataset.rowIndex ?? -1);
    expect(visibleRowIndex).toBeGreaterThan(0);

    grid.setSelection({
      activeCell: { rowIndex: visibleRowIndex, colIndex: 1 },
      cellRanges: [],
      rowRanges: []
    });
    await waitForFrame();
    expect(root.hasAttribute('aria-activedescendant')).toBe(true);

    grid.clearSelection();
    await waitForFrame();
    expect(root.hasAttribute('aria-activedescendant')).toBe(false);

    grid.destroy();
    container.remove();
  });
});
