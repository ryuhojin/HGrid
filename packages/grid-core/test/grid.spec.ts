import { describe, expect, it, vi } from 'vitest';
import { Grid } from '../src';
import { EDIT_COMMIT_AUDIT_SCHEMA_VERSION } from '../src/core/edit-events';
import { LocalDataProvider } from '../src/data/local-data-provider';
import { RemoteDataProvider } from '../src/data/remote-data-provider';
import type { DataProvider, DataTransaction, GridRowData } from '../src/data/data-provider';
import type { RemoteQueryModel } from '../src/data/remote-data-provider';
import { WORKER_TREE_LAZY_ROW_REF_FIELD } from '../src/data/worker-operation-payloads';
import type { ColumnDef, EditCommitAuditPayload, GridEventMap } from '../src';

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

    const columns: ColumnDef[] = [
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
  }, 15000);

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

  it('opens body cell context menu with row and selection payload', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const capturedPayloads: Array<Record<string, unknown>> = [];
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
      contextMenu: {
        enabled: true,
        getItems: (context) => [
          {
            id: 'capture',
            label: 'Capture payload',
            onSelect: (menuContext) => {
              capturedPayloads.push({
                kind: menuContext.kind,
                rowIndex: menuContext.rowIndex,
                dataIndex: menuContext.dataIndex,
                rowKey: menuContext.rowKey,
                value: menuContext.value,
                activeCell: menuContext.selection?.activeCell,
                name: menuContext.row?.name
              });
            }
          }
        ]
      },
      height: 160,
      rowHeight: 28
    });

    const nameCell = container.querySelector('.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]') as HTMLDivElement;
    expect(nameCell).toBeTruthy();

    nameCell.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 120,
        clientY: 72
      })
    );
    await waitForFrame();

    const captureItem = Array.from(container.querySelectorAll('.hgrid__column-menu-item')).find(
      (element) => element.textContent?.trim() === 'Capture payload'
    ) as HTMLButtonElement | undefined;
    expect(captureItem).toBeTruthy();
    captureItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(capturedPayloads).toEqual([
      {
        kind: 'cell',
        rowIndex: 1,
        dataIndex: 1,
        rowKey: 2,
        value: 'Beta',
        activeCell: { rowIndex: 1, colIndex: 1 },
        name: 'Beta'
      }
    ]);
    expect(grid.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 1 });

    grid.destroy();
    container.remove();
  });

  it('executes built-in body context menu actions for copy and filter operations', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const clipboardWrites: string[] = [];
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText(text: string) {
          clipboardWrites.push(text);
          return Promise.resolve();
        }
      }
    });
    let grid: Grid | null = null;
    try {
      grid = new Grid(container, {
        columns: [
          { id: 'id', header: 'ID', width: 100, type: 'number' },
          { id: 'name', header: 'Name', width: 180, type: 'text' },
          { id: 'status', header: 'Status', width: 140, type: 'text' }
        ],
        rowData: [
          { id: 1, name: 'Alpha', status: 'active' },
          { id: 2, name: 'Beta', status: 'idle' }
        ],
        contextMenu: {
          enabled: true,
          builtInActions: ['copyCell', 'copyRow', 'copySelection', 'filterByValue', 'clearColumnFilter']
        },
        height: 160,
        rowHeight: 28
      });

      const openBodyMenuAtNameCell = (): void => {
        const nameCell = Array.from(container.querySelectorAll('.hgrid__cell[data-column-id="name"]')).find(
          (element) => element.textContent?.trim() === 'Beta'
        ) as HTMLDivElement | undefined;
        expect(nameCell).toBeTruthy();
        nameCell?.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: 120,
            clientY: 72
          })
        );
      };

      const clickMenuItem = (label: string): void => {
        const menuItem = Array.from(container.querySelectorAll('.hgrid__column-menu-item')).find(
          (element) => element.textContent?.trim() === label
        ) as HTMLButtonElement | undefined;
        expect(menuItem).toBeTruthy();
        menuItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      };

      openBodyMenuAtNameCell();
      await waitForFrame();
      clickMenuItem('Copy cell');
      expect(clipboardWrites[clipboardWrites.length - 1]).toBe('Beta');

      openBodyMenuAtNameCell();
      await waitForFrame();
      clickMenuItem('Copy row');
      expect(clipboardWrites[clipboardWrites.length - 1]).toBe('2\tBeta\tidle');

      openBodyMenuAtNameCell();
      await waitForFrame();
      clickMenuItem('Copy selection');
      expect(clipboardWrites[clipboardWrites.length - 1]).toBe('Beta');

      openBodyMenuAtNameCell();
      await waitForFrame();
      clickMenuItem('Filter by this value');
      await waitForFrame();
      await waitForFrame();
      expect(grid.getFilterModel()).toEqual({
        name: {
          kind: 'set',
          values: ['Beta'],
          includeNull: false
        }
      });
      expect(grid.getViewRowCount()).toBe(1);

      openBodyMenuAtNameCell();
      await waitForFrame();
      clickMenuItem('Clear column filter');
      await waitForFrame();
      await waitForFrame();
      expect(grid.getFilterModel()).toEqual({});
      expect(grid.getViewRowCount()).toBe(2);
    } finally {
      grid?.destroy();
      container.remove();
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard
      });
    }
  });

  it('opens header filter panel, applies multi-condition text filter, and supports set-mode switching', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', region: 'APAC' },
        { id: 2, name: 'Beta', region: 'EMEA' },
        { id: 3, name: 'Gamma', region: 'APAC' }
      ],
      columnMenu: {
        enabled: true,
        trigger: 'contextmenu'
      },
      height: 180,
      rowHeight: 28
    });

    const openHeaderFilter = async (columnId: string): Promise<void> => {
      const headerCell = container.querySelector(`.hgrid__header-cell[data-column-id="${columnId}"]`) as HTMLDivElement;
      headerCell.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: 120,
          clientY: 24
        })
      );
      await waitForFrame();

      const openFilterItem = Array.from(container.querySelectorAll('.hgrid__column-menu-item')).find(
        (element) => element.textContent?.trim() === 'Open filter'
      ) as HTMLButtonElement | undefined;
      openFilterItem?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await waitForFrame();
    };

    await openHeaderFilter('name');

    const filterPanel = container.querySelector('.hgrid__filter-panel') as HTMLDivElement;
    expect(filterPanel.classList.contains('hgrid__filter-panel--open')).toBe(true);
    expect(filterPanel.style.display).toBe('flex');
    expect(filterPanel.style.maxHeight).not.toBe('');
    expect(filterPanel.style.maxWidth).not.toBe('');
    expect(filterPanel.style.left).not.toBe('');
    expect(filterPanel.style.top).not.toBe('');

    const textOperatorOne = filterPanel.querySelector(
      '[data-filter-role="operator"][data-filter-clause-index="0"]'
    ) as HTMLSelectElement;
    const textValueOne = filterPanel.querySelector(
      '[data-filter-role="value"][data-filter-clause-index="0"]'
    ) as HTMLInputElement;
    const textOperatorTwo = filterPanel.querySelector(
      '[data-filter-role="operator"][data-filter-clause-index="1"]'
    ) as HTMLSelectElement;
    const textValueTwo = filterPanel.querySelector(
      '[data-filter-role="value"][data-filter-clause-index="1"]'
    ) as HTMLInputElement;
    textOperatorOne.value = 'contains';
    textValueOne.value = 'ta';
    textOperatorTwo.value = 'startsWith';
    textValueTwo.value = 'Be';

    const applyButton = filterPanel.querySelector('[data-filter-action="apply"]') as HTMLButtonElement;
    applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      name: [
        {
          kind: 'text',
          operator: 'contains',
          value: 'ta',
          caseSensitive: false
        },
        {
          kind: 'text',
          operator: 'startsWith',
          value: 'Be',
          caseSensitive: false
        }
      ]
    });
    const filteredHeader = container.querySelector('.hgrid__header-cell[data-column-id="name"]') as HTMLDivElement;
    expect(filteredHeader.classList.contains('hgrid__header-cell--filtered')).toBe(true);

    await openHeaderFilter('region');
    const setModeButton = filterPanel.querySelector('[data-filter-mode-trigger="set"]') as HTMLButtonElement;
    setModeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    const apacCheckbox = Array.from(filterPanel.querySelectorAll('[data-filter-option-key]')).find((element) => {
      const label = (element.parentElement?.textContent ?? '').trim();
      return label === 'APAC';
    }) as HTMLInputElement | undefined;
    expect(apacCheckbox).toBeTruthy();
    if (apacCheckbox) {
      apacCheckbox.checked = true;
      apacCheckbox.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const setApplyButton = filterPanel.querySelector('[data-filter-action="apply"]') as HTMLButtonElement;
    setApplyButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      name: [
        {
          kind: 'text',
          operator: 'contains',
          value: 'ta',
          caseSensitive: false
        },
        {
          kind: 'text',
          operator: 'startsWith',
          value: 'Be',
          caseSensitive: false
        }
      ],
      region: {
        kind: 'set',
        values: ['APAC'],
        includeNull: false
      }
    });

    grid.destroy();
    container.remove();
  });

  it('applies nested advanced filter groups from the filters tool panel builder', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 920, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', region: 'APAC', score: 10 },
        { id: 2, name: 'Beta', region: 'EMEA', score: 80 },
        { id: 3, name: 'Gamma', region: 'APAC', score: 55 },
        { id: 4, name: 'Delta', region: 'AMER', score: 35 }
      ],
      sideBar: {
        enabled: true,
        panels: ['filters'],
        defaultPanel: 'filters',
        initialOpen: true
      },
      height: 220,
      rowHeight: 28
    });

    const builderTab = container.querySelector(
      '[data-tool-panel-filter-surface="builder"]'
    ) as HTMLButtonElement | null;
    expect(builderTab).toBeTruthy();
    builderTab?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    const matchSelect = container.querySelector('[data-advanced-filter-role="match"]') as HTMLSelectElement;
    matchSelect.value = 'or';
    matchSelect.dispatchEvent(new Event('change', { bubbles: true }));

    const firstRuleColumn = container.querySelector(
      '[data-advanced-filter-role="column"][data-advanced-filter-path="0"]'
    ) as HTMLSelectElement;
    firstRuleColumn.value = 'name';
    firstRuleColumn.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();

    const firstRuleOperator = container.querySelector(
      '[data-advanced-filter-role="condition-operator"][data-advanced-filter-path="0"]'
    ) as HTMLSelectElement;
    firstRuleOperator.value = 'contains';
    firstRuleOperator.dispatchEvent(new Event('change', { bubbles: true }));
    const firstRuleValue = container.querySelector(
      '[data-advanced-filter-role="value"][data-advanced-filter-path="0"]'
    ) as HTMLInputElement;
    firstRuleValue.value = 'ta';
    firstRuleValue.dispatchEvent(new Event('input', { bubbles: true }));

    const addGroupButton = container.querySelector(
      '.hgrid__tool-panel-filter-builder > .hgrid__filter-panel-actions [data-advanced-filter-action="add-group"]'
    ) as HTMLButtonElement;
    addGroupButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    const groupOperator = container.querySelector(
      '[data-advanced-filter-role="group-operator"][data-advanced-filter-path="1"]'
    ) as HTMLSelectElement;
    groupOperator.value = 'and';
    groupOperator.dispatchEvent(new Event('change', { bubbles: true }));

    const nestedFirstRuleColumn = container.querySelector(
      '[data-advanced-filter-role="column"][data-advanced-filter-path="1.0"]'
    ) as HTMLSelectElement;
    nestedFirstRuleColumn.value = 'region';
    nestedFirstRuleColumn.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();

    const nestedFirstRuleOperator = container.querySelector(
      '[data-advanced-filter-role="condition-operator"][data-advanced-filter-path="1.0"]'
    ) as HTMLSelectElement;
    nestedFirstRuleOperator.value = 'equals';
    nestedFirstRuleOperator.dispatchEvent(new Event('change', { bubbles: true }));
    const nestedFirstRuleValue = container.querySelector(
      '[data-advanced-filter-role="value"][data-advanced-filter-path="1.0"]'
    ) as HTMLInputElement;
    nestedFirstRuleValue.value = 'APAC';
    nestedFirstRuleValue.dispatchEvent(new Event('input', { bubbles: true }));

    const nestedAddRuleButton = container.querySelector(
      '[data-advanced-filter-action="add-rule"][data-advanced-filter-path="1"]'
    ) as HTMLButtonElement;
    nestedAddRuleButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    const nestedSecondRuleColumn = container.querySelector(
      '[data-advanced-filter-role="column"][data-advanced-filter-path="1.1"]'
    ) as HTMLSelectElement;
    nestedSecondRuleColumn.value = 'score';
    nestedSecondRuleColumn.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();

    const nestedSecondRuleOperator = container.querySelector(
      '[data-advanced-filter-role="condition-operator"][data-advanced-filter-path="1.1"]'
    ) as HTMLSelectElement;
    nestedSecondRuleOperator.value = 'gte';
    nestedSecondRuleOperator.dispatchEvent(new Event('change', { bubbles: true }));
    const nestedSecondRuleValue = container.querySelector(
      '[data-advanced-filter-role="value"][data-advanced-filter-path="1.1"]'
    ) as HTMLInputElement;
    nestedSecondRuleValue.value = '50';
    nestedSecondRuleValue.dispatchEvent(new Event('input', { bubbles: true }));

    const applyButton = container.querySelector('[data-advanced-filter-action="apply"]') as HTMLButtonElement;
    applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getAdvancedFilterModel()).toEqual({
      operator: 'or',
      rules: [
        {
          columnId: 'name',
          condition: {
            kind: 'text',
            operator: 'contains',
            value: 'ta'
          }
        },
        {
          kind: 'group',
          operator: 'and',
          rules: [
            {
              columnId: 'region',
              condition: {
                kind: 'text',
                operator: 'equals',
                value: 'APAC'
              }
            },
            {
              columnId: 'score',
              condition: {
                kind: 'number',
                operator: 'gte',
                value: 50
              }
            }
          ]
        }
      ]
    });
    expect(grid.getViewRowCount()).toBe(3);

    const clearButton = container.querySelector('[data-advanced-filter-action="clear"]') as HTMLButtonElement;
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getAdvancedFilterModel()).toBeNull();

    grid.destroy();
    container.remove();
  });

  it('applies header filter row inputs and keeps them synced with filter model changes', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 920, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' },
        { id: 'updatedAt', header: 'Updated At', width: 180, type: 'date' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', score: 24, updatedAt: '2026-03-10' },
        { id: 2, name: 'Beta', score: 82, updatedAt: '2026-03-11' },
        { id: 3, name: 'Gamma', score: 68, updatedAt: '2026-03-12' },
        { id: 4, name: 'Delta', score: 55, updatedAt: '2026-03-13' }
      ],
      filterRow: {
        enabled: true
      },
      height: 220,
      rowHeight: 28
    });

    await waitForFrame();

    const nameInput = container.querySelector(
      '.hgrid__filter-row-input[data-filter-row-column-id="name"]'
    ) as HTMLInputElement | null;
    expect(nameInput).toBeTruthy();
    nameInput!.value = 'ta';
    nameInput!.dispatchEvent(new Event('input', { bubbles: true }));
    nameInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      name: {
        kind: 'text',
        operator: 'contains',
        value: 'ta'
      }
    });
    expect(grid.getViewRowCount()).toBe(2);

    const scoreInput = container.querySelector(
      '.hgrid__filter-row-input[data-filter-row-column-id="score"]'
    ) as HTMLInputElement | null;
    expect(scoreInput).toBeTruthy();
    scoreInput!.value = '>=60';
    scoreInput!.dispatchEvent(new Event('input', { bubbles: true }));
    scoreInput!.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      name: {
        kind: 'text',
        operator: 'contains',
        value: 'ta'
      },
      score: {
        kind: 'number',
        operator: 'gte',
        value: 60
      }
    });
    expect(grid.getViewRowCount()).toBe(1);

    grid.setFilterModel({
      updatedAt: {
        kind: 'date',
        operator: 'onOrAfter',
        value: '2026-03-12'
      }
    });
    await waitForFrame();
    await waitForFrame();

    const syncedDateOperator = container.querySelector(
      '.hgrid__filter-row-date-operator[data-filter-row-column-id="updatedAt"]'
    ) as HTMLSelectElement | null;
    const syncedDateInput = container.querySelector(
      '.hgrid__filter-row-date-input[data-filter-row-column-id="updatedAt"][data-filter-row-control="date-value"]'
    ) as HTMLInputElement | null;
    expect(syncedDateOperator?.value).toBe('onOrAfter');
    expect(syncedDateInput?.value).toBe('2026-03-12');

    syncedDateInput!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({});

    grid.destroy();
    container.remove();
  });

  it('uses dedicated boolean filter row editor and syncs set filters', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 720, configurable: true });
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 92, type: 'number' },
        { id: 'active', header: 'Active', width: 140, type: 'boolean' },
        { id: 'name', header: 'Name', width: 180, type: 'text' }
      ],
      rowData: [
        { id: 1, active: true, name: 'Alpha' },
        { id: 2, active: false, name: 'Beta' },
        { id: 3, active: true, name: 'Gamma' }
      ],
      filterRow: {
        enabled: true
      },
      height: 180,
      rowHeight: 28
    });

    await waitForFrame();

    const activeSelect = container.querySelector(
      '.hgrid__filter-row-select[data-filter-row-column-id="active"]'
    ) as HTMLSelectElement | null;
    expect(activeSelect).toBeTruthy();

    activeSelect!.value = 'true';
    activeSelect!.dispatchEvent(new Event('input', { bubbles: true }));
    activeSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      active: {
        kind: 'set',
        values: [true],
        includeNull: false
      }
    });
    expect(grid.getViewRowCount()).toBe(2);

    await grid.setFilterModel({
      active: {
        kind: 'set',
        values: [false],
        includeNull: false
      }
    });
    await waitForFrame();
    await waitForFrame();

    expect(activeSelect!.value).toBe('false');

    activeSelect!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({});

    grid.destroy();
    container.remove();
  });

  it('uses a generic set filter row editor for enum text columns and can scan full distinct values', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 720, configurable: true });
    document.body.append(container);

    const rowData = Array.from({ length: 5205 }, (_, index) => ({
      id: index + 1,
      status: index >= 5000 ? 'Escalated' : ['Active', 'Review', 'Hold', 'Draft'][index % 4],
      owner: `Owner-${(index % 24) + 1}`
    }));

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 92, type: 'number' },
        { id: 'status', header: 'Status', width: 160, type: 'text', filterMode: 'set' },
        { id: 'owner', header: 'Owner', width: 180, type: 'text' }
      ],
      rowData,
      filterRow: {
        enabled: true
      },
      setFilter: {
        valueSource: 'full',
        maxDistinctValues: 16
      },
      height: 180,
      rowHeight: 28
    });

    await waitForFrame();

    const statusSelect = container.querySelector(
      '.hgrid__filter-row-set-select[data-filter-row-column-id="status"]'
    ) as HTMLSelectElement | null;
    expect(statusSelect).toBeTruthy();

    const optionLabels = Array.from(statusSelect!.options).map((option) => option.text);
    expect(optionLabels).toContain('Escalated');

    const escalatedOption = Array.from(statusSelect!.options).find((option) => option.text === 'Escalated');
    expect(escalatedOption).toBeTruthy();

    statusSelect!.value = escalatedOption!.value;
    statusSelect!.dispatchEvent(new Event('input', { bubbles: true }));
    statusSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      status: {
        kind: 'set',
        values: ['Escalated'],
        includeNull: false
      }
    });
    expect(grid.getViewRowCount()).toBe(205);

    await grid.setFilterModel({
      status: {
        kind: 'set',
        values: ['Review'],
        includeNull: false
      }
    });
    await waitForFrame();
    await waitForFrame();

    const syncedStatusSelect = container.querySelector(
      '.hgrid__filter-row-set-select[data-filter-row-column-id="status"]'
    ) as HTMLSelectElement | null;
    const reviewOption = Array.from(syncedStatusSelect!.options).find((option) => option.text === 'Review');
    expect(syncedStatusSelect?.value).toBe(reviewOption?.value);

    syncedStatusSelect!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({});

    grid.destroy();
    container.remove();
  });

  it('saves, applies, and deletes advanced filter presets', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'active', header: 'Active', width: 120, type: 'boolean' }
      ],
      rowData: [
        { region: 'APAC', active: true },
        { region: 'EMEA', active: false },
        { region: 'APAC', active: false }
      ],
      height: 160,
      rowHeight: 28
    });

    await grid.setAdvancedFilterModel({
      operator: 'and',
      rules: [
        {
          kind: 'rule',
          columnId: 'region',
          condition: {
            kind: 'set',
            values: ['APAC']
          }
        }
      ]
    });

    expect(grid.saveAdvancedFilterPreset('apac-only', 'APAC Only')).toBe(true);
    expect(grid.getAdvancedFilterPresets()).toEqual([
      {
        id: 'apac-only',
        label: 'APAC Only',
        advancedFilterModel: {
          operator: 'and',
          rules: [
            {
              columnId: 'region',
              condition: {
                kind: 'set',
                values: ['APAC']
              }
            }
          ]
        }
      }
    ]);

    await grid.clearAdvancedFilterModel();
    expect(grid.getAdvancedFilterModel()).toBeNull();

    await grid.applyAdvancedFilterPreset('apac-only');
    expect(grid.getAdvancedFilterModel()).toEqual({
      operator: 'and',
      rules: [
        {
          columnId: 'region',
          condition: {
            kind: 'set',
            values: ['APAC']
          }
        }
      ]
    });

    expect(grid.deleteAdvancedFilterPreset('apac-only')).toBe(true);
    expect(grid.getAdvancedFilterPresets()).toEqual([]);

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

  it('saves and restores column layout including width, visibility, order, and pin state', () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'region', header: 'Region', width: 160, type: 'text' },
        { id: 'balance', header: 'Balance', width: 180, type: 'number' }
      ],
      rowData: [
        { id: 1, name: 'alpha', region: 'APAC', balance: 120 },
        { id: 2, name: 'beta', region: 'EMEA', balance: 240 }
      ],
      height: 120,
      rowHeight: 30,
      overscan: 2
    });

    grid.setColumnOrder(['region', 'name', 'balance', 'id']);
    grid.setColumnVisibility('balance', false);
    grid.setColumnPin('region', 'left');
    grid.setColumnWidth('name', 240);

    const savedLayout = grid.getColumnLayout();
    expect(savedLayout).toEqual({
      columnOrder: ['region', 'name', 'balance', 'id'],
      hiddenColumnIds: ['balance'],
      pinnedColumns: { region: 'left' },
      columnWidths: {
        region: 160,
        name: 240,
        balance: 180,
        id: 100
      }
    });

    grid.setColumnOrder(['id', 'name', 'region', 'balance']);
    grid.setColumnVisibility('balance', true);
    grid.setColumnPin('region', undefined);
    grid.setColumnWidth('name', 180);

    grid.setColumnLayout(savedLayout);

    const columns = grid.getColumns();
    expect(columns.map((column) => column.id)).toEqual(['region', 'name', 'balance', 'id']);
    expect(columns.find((column) => column.id === 'balance')?.visible).toBe(false);
    expect(columns.find((column) => column.id === 'region')?.pinned).toBe('left');
    expect(columns.find((column) => column.id === 'name')?.width).toBe(240);
    expect(container.querySelectorAll('.hgrid__header-left .hgrid__header-cell[data-column-id="region"]').length).toBe(1);
    expect(container.querySelectorAll('.hgrid__header-cell[data-column-id="balance"]').length).toBe(0);

    grid.destroy();
  });

  it('applies column layout presets from the columns tool panel', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const compactPreset = {
      id: 'compact',
      label: 'Compact',
      layout: {
        columnOrder: ['id', 'region', 'name', 'balance'],
        hiddenColumnIds: ['balance'],
        pinnedColumns: { id: 'left' as const },
        columnWidths: {
          id: 88,
          region: 140,
          name: 180,
          balance: 160
        }
      }
    };

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 200, type: 'text' },
        { id: 'region', header: 'Region', width: 160, type: 'text' },
        { id: 'balance', header: 'Balance', width: 160, type: 'number' }
      ],
      rowData: [
        { id: 1, name: 'Ahn', region: 'APAC', balance: 120 },
        { id: 2, name: 'Park', region: 'EMEA', balance: 240 }
      ],
      sideBar: {
        enabled: true,
        panels: ['columns'],
        defaultPanel: 'columns',
        initialOpen: true,
        columnLayoutPresets: [compactPreset]
      },
      height: 160,
      rowHeight: 28
    });

    await waitForFrame();

    const presetSelect = container.querySelector('[data-tool-panel-columns-preset-select="true"]') as HTMLSelectElement;
    presetSelect.value = 'compact';
    presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const applyButton = container.querySelector('[data-tool-panel-columns-preset-action="apply"]') as HTMLButtonElement;
    applyButton.click();
    await waitForFrame();

    expect(grid.getColumnLayout()).toEqual(compactPreset.layout);

    grid.destroy();
    container.remove();
  });

  it('does not fetch unloaded remote blocks when full distinct options are requested for set filters', async () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'clientWidth', { value: 720, configurable: true });
    document.body.append(container);

    let fetchCount = 0;
    const provider = new RemoteDataProvider({
      dataSource: {
        async fetchBlock(request) {
          fetchCount += 1;
          return {
            rows: Array.from({ length: request.endIndex - request.startIndex }, (_, offset) => {
              const index = request.startIndex + offset;
              return {
                id: index + 1,
                status: index === 17 ? 'Escalated' : ['Active', 'Review', 'Hold', 'Draft'][index % 4],
                owner: `Owner-${(index % 8) + 1}`
              };
            }),
            totalRowCount: 20
          };
        }
      },
      rowCount: 20,
      cache: {
        blockSize: 5,
        maxBlocks: 2,
        prefetchBlocks: 0
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 92, type: 'number' },
        { id: 'status', header: 'Status', width: 160, type: 'text', filterMode: 'set' },
        { id: 'owner', header: 'Owner', width: 180, type: 'text' }
      ],
      dataProvider: provider,
      filterRow: {
        enabled: true
      },
      setFilter: {
        valueSource: 'full',
        maxDistinctValues: 16
      },
      height: 28,
      rowHeight: 28,
      overscan: 2
    });

    await waitForFrame();
    await waitForFrame();
    await waitForFrame();

    const statusSelect = container.querySelector(
      '.hgrid__filter-row-set-select[data-filter-row-column-id="status"]'
    ) as HTMLSelectElement | null;
    expect(statusSelect).toBeTruthy();

    const optionLabels = Array.from(statusSelect!.options).map((option) => option.text);
    expect(optionLabels).not.toContain('Escalated');
    expect(fetchCount).toBe(1);

    grid.destroy();
    container.remove();
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

  it('applies localeText overrides to root/indicator aria labels', async () => {
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

    expect(root.getAttribute('dir')).toBe('ltr');
    expect(checkAll.getAttribute('aria-label')).toBe('모든 행 선택 (필터 결과)');
    expect(firstRowCheckbox.getAttribute('aria-label')).toBe('1행 선택');

    grid.setOptions({
      locale: 'en-US',
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

  it('ignores html-only clipboard payloads outside edit mode and prevents html injection', async () => {
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

    expect(firstNameCell.textContent).toBe('User-1');
    expect(firstNameCell.querySelector('b')).toBeNull();
    expect(firstStatusCell.textContent).toBe('idle');
    expect(secondNameCell.textContent).toBe('User-2');

    grid.destroy();
    container.remove();
  });

  it('undos and redoes editor commits with keyboard shortcuts', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 220, type: 'text', editable: true }
      ],
      rowData: [{ id: 1, name: 'Alpha' }],
      height: 160,
      rowHeight: 28,
      overscan: 2,
      undoRedo: {
        enabled: true
      }
    });

    const renderer = (
      grid as unknown as {
        renderer: {
          editorInputElement: HTMLInputElement;
          editorHostElement: HTMLDivElement;
        };
      }
    ).renderer;
    const editCommitEvents: GridEventMap['editCommit'][] = [];
    grid.on('editCommit', (event) => {
      editCommitEvents.push(event);
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 0, c2: 1 }],
      rowRanges: []
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(renderer.editorHostElement.classList.contains('hgrid__editor-host--visible')).toBe(true);

    renderer.editorInputElement.value = 'Beta';
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.canUndo()).toBe(true);
    expect(grid.canRedo()).toBe(false);
    expect(
      (container.querySelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]') as HTMLDivElement).textContent
    ).toBe('Beta');

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();
    expect(
      (container.querySelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]') as HTMLDivElement).textContent
    ).toBe('Alpha');
    expect(grid.canUndo()).toBe(false);
    expect(grid.canRedo()).toBe(true);

    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })
    );
    await waitForFrame();
    await waitForFrame();
    expect(
      (container.querySelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]') as HTMLDivElement).textContent
    ).toBe('Beta');
    expect(editCommitEvents.map((event) => event.source)).toEqual(['editor', 'undo', 'redo']);
    expect(editCommitEvents[0].transactionKind).toBe('singleCell');
    expect(editCommitEvents[0].transactionStep).toBe('apply');
    expect(editCommitEvents[0].rootTransactionId).toBe(editCommitEvents[0].transactionId);
    expect(editCommitEvents[1].transactionKind).toBe('historyReplay');
    expect(editCommitEvents[1].transactionStep).toBe('undo');
    expect(editCommitEvents[1].rootTransactionId).toBe(editCommitEvents[0].transactionId);
    expect(editCommitEvents[2].transactionKind).toBe('historyReplay');
    expect(editCommitEvents[2].transactionStep).toBe('redo');
    expect(editCommitEvents[2].rootTransactionId).toBe(editCommitEvents[0].transactionId);

    grid.destroy();
    container.remove();
  });

  it('undos and redoes clipboard paste ranges', async () => {
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
      overscan: 2,
      undoRedo: {
        enabled: true
      }
    });

    const editCommitEvents: GridEventMap['editCommit'][] = [];
    grid.on('editCommit', (event) => {
      editCommitEvents.push(event);
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }],
      rowRanges: []
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    const clipboard = createClipboardEvent('paste', {
      'text/plain': 'Alpha\tactive\nBeta\treview'
    });
    root.dispatchEvent(clipboard.event);
    await waitForFrame();
    await waitForFrame();

    expect(
      (container.querySelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]') as HTMLDivElement).textContent
    ).toBe('Alpha');
    expect(
      (container.querySelector('.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="status"]') as HTMLDivElement).textContent
    ).toBe('review');

    expect(grid.undo()).toBe(true);
    await waitForFrame();
    await waitForFrame();
    expect(
      (container.querySelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]') as HTMLDivElement).textContent
    ).toBe('User-1');
    expect(
      (container.querySelector('.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="status"]') as HTMLDivElement).textContent
    ).toBe('idle');

    expect(grid.redo()).toBe(true);
    await waitForFrame();
    await waitForFrame();
    expect(
      (container.querySelector('.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="name"]') as HTMLDivElement).textContent
    ).toBe('Alpha');
    expect(
      (container.querySelector('.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="status"]') as HTMLDivElement).textContent
    ).toBe('review');
    expect(editCommitEvents.map((event) => event.source)).toEqual(['clipboard', 'undo', 'redo']);
    expect(editCommitEvents[0].cellCount).toBe(4);
    expect(editCommitEvents[0].rowCount).toBe(2);
    expect(editCommitEvents[0].changes).toHaveLength(4);
    expect(editCommitEvents[0].transactionKind).toBe('clipboardRange');
    expect(editCommitEvents[0].transactionStep).toBe('apply');
    expect(editCommitEvents[1].transactionKind).toBe('historyReplay');
    expect(editCommitEvents[1].transactionStep).toBe('undo');
    expect(editCommitEvents[1].rootTransactionId).toBe(editCommitEvents[0].transactionId);
    expect(editCommitEvents[1].cellCount).toBe(4);
    expect(editCommitEvents[2].transactionKind).toBe('historyReplay');
    expect(editCommitEvents[2].transactionStep).toBe('redo');
    expect(editCommitEvents[2].rootTransactionId).toBe(editCommitEvents[0].transactionId);
    expect(editCommitEvents[2].cellCount).toBe(4);

    grid.destroy();
    container.remove();
  });

  it('repeats a single-cell value with the fill handle and keeps clipboard export in sync', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 100, type: 'number' as const },
      { id: 'name', header: 'Name', width: 220, type: 'text' as const, editable: true }
    ];
    const grid = new Grid(container, {
      columns,
      rowData: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: '' },
        { id: 3, name: '' }
      ],
      height: 180,
      rowHeight: 28,
      overscan: 2,
      undoRedo: {
        enabled: true
      }
    });

    const renderer = (grid as unknown as { renderer: { hitTestCellAtPoint: (x: number, y: number) => unknown } }).renderer;
    const originalHitTest = renderer.hitTestCellAtPoint;
    renderer.hitTestCellAtPoint = () => ({
      zone: 'center',
      rowIndex: 2,
      dataIndex: 2,
      columnIndex: 1,
      column: columns[1]
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 0, c2: 1 }],
      rowRanges: []
    });
    await waitForFrame();

    const handleElement = container.querySelector('[data-range-handle="true"]') as HTMLDivElement;
    const pointerId = 701;
    handleElement.dispatchEvent(createPointerLikeEvent('pointerdown', { pointerId, clientX: 8, clientY: 8 }));
    window.dispatchEvent(createPointerLikeEvent('pointermove', { pointerId, clientX: 8, clientY: 120 }));
    window.dispatchEvent(createPointerLikeEvent('pointerup', { pointerId, clientX: 8, clientY: 120 }));
    await waitForFrame();
    await waitForFrame();
    renderer.hitTestCellAtPoint = originalHitTest;

    const secondNameCell = container.querySelector(
      '.hgrid__row[data-row-index="1"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;
    const thirdNameCell = container.querySelector(
      '.hgrid__row[data-row-index="2"] .hgrid__cell[data-column-id="name"]'
    ) as HTMLDivElement;

    expect(secondNameCell.textContent).toBe('Alpha');
    expect(thirdNameCell.textContent).toBe('Alpha');
    expect(grid.getSelection().cellRanges).toEqual([{ r1: 0, c1: 1, r2: 2, c2: 1 }]);

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    const clipboard = createClipboardEvent('copy');
    root.dispatchEvent(clipboard.event);
    expect(clipboard.event.defaultPrevented).toBe(true);
    expect(clipboard.getData('text/plain')).toBe('Alpha\nAlpha\nAlpha');

    grid.destroy();
    container.remove();
  });

  it('extends numeric series with the fill handle and emits fillHandle edit commits', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 100, type: 'number' as const },
      { id: 'qty', header: 'Qty', width: 160, type: 'number' as const, editable: true }
    ];
    const grid = new Grid(container, {
      columns,
      rowData: [
        { id: 1, qty: 10 },
        { id: 2, qty: 20 },
        { id: 3, qty: 0 },
        { id: 4, qty: 0 }
      ],
      height: 190,
      rowHeight: 28,
      overscan: 2,
      undoRedo: {
        enabled: true
      }
    });

    const renderer = (grid as unknown as { renderer: { hitTestCellAtPoint: (x: number, y: number) => unknown } }).renderer;
    const editCommitEvents: GridEventMap['editCommit'][] = [];
    grid.on('editCommit', (event) => {
      editCommitEvents.push(event);
    });

    const originalHitTest = renderer.hitTestCellAtPoint;
    renderer.hitTestCellAtPoint = () => ({
      zone: 'center',
      rowIndex: 3,
      dataIndex: 3,
      columnIndex: 1,
      column: columns[1]
    });

    grid.setSelection({
      activeCell: { rowIndex: 1, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 1, c2: 1 }],
      rowRanges: []
    });
    await waitForFrame();

    const handleElement = container.querySelector('[data-range-handle="true"]') as HTMLDivElement;
    const pointerId = 702;
    handleElement.dispatchEvent(createPointerLikeEvent('pointerdown', { pointerId, clientX: 12, clientY: 12 }));
    window.dispatchEvent(createPointerLikeEvent('pointermove', { pointerId, clientX: 12, clientY: 152 }));
    window.dispatchEvent(createPointerLikeEvent('pointerup', { pointerId, clientX: 12, clientY: 152 }));
    await waitForFrame();
    await waitForFrame();
    renderer.hitTestCellAtPoint = originalHitTest;

    const thirdQtyCell = container.querySelector(
      '.hgrid__row[data-row-index="2"] .hgrid__cell[data-column-id="qty"]'
    ) as HTMLDivElement;
    const fourthQtyCell = container.querySelector(
      '.hgrid__row[data-row-index="3"] .hgrid__cell[data-column-id="qty"]'
    ) as HTMLDivElement;

    expect(thirdQtyCell.textContent).toBe('30');
    expect(fourthQtyCell.textContent).toBe('40');
    expect(grid.getSelection().cellRanges).toEqual([{ r1: 0, c1: 1, r2: 3, c2: 1 }]);
    expect(editCommitEvents.length).toBe(1);
    expect(editCommitEvents[0]).toMatchObject({
      rowIndex: 2,
      columnId: 'qty',
      value: 30,
      source: 'fillHandle',
      transactionKind: 'fillRange',
      transactionStep: 'apply'
    });
    expect(editCommitEvents[0].cellCount).toBe(2);
    expect(editCommitEvents[0].rowCount).toBe(2);
    expect(editCommitEvents[0].changes).toHaveLength(2);

    expect(grid.undo()).toBe(true);
    await waitForFrame();
    await waitForFrame();
    expect(thirdQtyCell.textContent).toBe('0');
    expect(fourthQtyCell.textContent).toBe('0');

    expect(grid.redo()).toBe(true);
    await waitForFrame();
    await waitForFrame();
    expect(thirdQtyCell.textContent).toBe('30');
    expect(fourthQtyCell.textContent).toBe('40');
    expect(editCommitEvents.map((event) => event.source)).toEqual(['fillHandle', 'undo', 'redo']);
    expect(editCommitEvents[1].transactionKind).toBe('historyReplay');
    expect(editCommitEvents[1].transactionStep).toBe('undo');
    expect(editCommitEvents[1].rootTransactionId).toBe(editCommitEvents[0].transactionId);
    expect(editCommitEvents[1].cellCount).toBe(2);
    expect(editCommitEvents[2].transactionKind).toBe('historyReplay');
    expect(editCommitEvents[2].transactionStep).toBe('redo');
    expect(editCommitEvents[2].rootTransactionId).toBe(editCommitEvents[0].transactionId);
    expect(editCommitEvents[2].cellCount).toBe(2);

    grid.destroy();
    container.remove();
  });

  it('extends an affine numeric matrix across rows and columns with the fill handle', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 90, type: 'number' as const },
      { id: 'q1', header: 'Q1', width: 110, type: 'number' as const, editable: true },
      { id: 'q2', header: 'Q2', width: 110, type: 'number' as const, editable: true },
      { id: 'q3', header: 'Q3', width: 110, type: 'number' as const, editable: true },
      { id: 'q4', header: 'Q4', width: 110, type: 'number' as const, editable: true }
    ];
    const grid = new Grid(container, {
      columns,
      rowData: [
        { id: 1, q1: 1, q2: 2, q3: 0, q4: 0 },
        { id: 2, q1: 11, q2: 12, q3: 0, q4: 0 },
        { id: 3, q1: 0, q2: 0, q3: 0, q4: 0 },
        { id: 4, q1: 0, q2: 0, q3: 0, q4: 0 }
      ],
      height: 210,
      rowHeight: 28,
      overscan: 2
    });

    const renderer = (grid as unknown as { renderer: { hitTestCellAtPoint: (x: number, y: number) => unknown } }).renderer;
    const originalHitTest = renderer.hitTestCellAtPoint;
    renderer.hitTestCellAtPoint = () => ({
      zone: 'center',
      rowIndex: 3,
      dataIndex: 3,
      columnIndex: 4,
      column: columns[4]
    });

    grid.setSelection({
      activeCell: { rowIndex: 1, colIndex: 2 },
      cellRanges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }],
      rowRanges: []
    });
    await waitForFrame();

    const handleElement = container.querySelector('[data-range-handle="true"]') as HTMLDivElement;
    const pointerId = 703;
    handleElement.dispatchEvent(createPointerLikeEvent('pointerdown', { pointerId, clientX: 14, clientY: 14 }));
    window.dispatchEvent(createPointerLikeEvent('pointermove', { pointerId, clientX: 220, clientY: 148 }));
    window.dispatchEvent(createPointerLikeEvent('pointerup', { pointerId, clientX: 220, clientY: 148 }));
    await waitForFrame();
    await waitForFrame();
    renderer.hitTestCellAtPoint = originalHitTest;

    const dataProvider = grid.getDataProvider();
    const getRow = dataProvider.getRow!.bind(dataProvider);
    expect(getRow(0)).toMatchObject({ q1: 1, q2: 2, q3: 3, q4: 4 });
    expect(getRow(1)).toMatchObject({ q1: 11, q2: 12, q3: 13, q4: 14 });
    expect(getRow(2)).toMatchObject({ q1: 21, q2: 22, q3: 23, q4: 24 });
    expect(getRow(3)).toMatchObject({ q1: 31, q2: 32, q3: 33, q4: 34 });
    expect(grid.getSelection().cellRanges).toEqual([{ r1: 0, c1: 1, r2: 3, c2: 4 }]);

    grid.destroy();
    container.remove();
  });

  it('suppresses browser text selection during pointer range selection and fill-handle drag', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: 'id', header: 'ID', width: 100, type: 'number' as const },
      { id: 'name', header: 'Name', width: 180, type: 'text' as const, editable: true }
    ];
    const grid = new Grid(container, {
      columns,
      rowData: [
        { id: 1, name: 'Alpha' },
        { id: 2, name: 'Beta' },
        { id: 3, name: 'Gamma' },
        { id: 4, name: 'Delta' }
      ],
      height: 190,
      rowHeight: 28,
      overscan: 2
    });

    const renderer = (grid as unknown as { renderer: { hitTestCellAtPoint: (x: number, y: number) => unknown } }).renderer;
    const originalHitTest = renderer.hitTestCellAtPoint;
    renderer.hitTestCellAtPoint = (_clientX: number, clientY: number) => {
      const rowIndex = clientY >= 120 ? 2 : 0;
      return {
        zone: 'center',
        rowIndex,
        dataIndex: rowIndex,
        columnIndex: 1,
        column: columns[1]
      };
    };

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    const selectionPointerId = 801;
    const selectionDownEvent = createPointerLikeEvent('pointerdown', {
      pointerId: selectionPointerId,
      clientX: 14,
      clientY: 14
    });
    const selectionDispatchResult = root.dispatchEvent(selectionDownEvent);

    expect(selectionDispatchResult).toBe(false);
    expect(selectionDownEvent.defaultPrevented).toBe(true);
    expect(root.classList.contains('hgrid--selection-dragging')).toBe(true);

    window.dispatchEvent(
      createPointerLikeEvent('pointermove', {
        pointerId: selectionPointerId,
        clientX: 14,
        clientY: 120
      })
    );
    window.dispatchEvent(
      createPointerLikeEvent('pointerup', {
        pointerId: selectionPointerId,
        clientX: 14,
        clientY: 120
      })
    );

    expect(root.classList.contains('hgrid--selection-dragging')).toBe(false);

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 0, c2: 1 }],
      rowRanges: []
    });
    await waitForFrame();

    renderer.hitTestCellAtPoint = () => ({
      zone: 'center',
      rowIndex: 2,
      dataIndex: 2,
      columnIndex: 1,
      column: columns[1]
    });

    const handleElement = container.querySelector('[data-range-handle="true"]') as HTMLDivElement;
    const fillPointerId = 802;
    const fillDownEvent = createPointerLikeEvent('pointerdown', {
      pointerId: fillPointerId,
      clientX: 12,
      clientY: 12
    });
    const fillDispatchResult = handleElement.dispatchEvent(fillDownEvent);

    expect(fillDispatchResult).toBe(false);
    expect(fillDownEvent.defaultPrevented).toBe(true);
    expect(root.classList.contains('hgrid--selection-dragging')).toBe(true);

    window.dispatchEvent(
      createPointerLikeEvent('pointermove', {
        pointerId: fillPointerId,
        clientX: 12,
        clientY: 124
      })
    );
    window.dispatchEvent(
      createPointerLikeEvent('pointerup', {
        pointerId: fillPointerId,
        clientX: 12,
        clientY: 124
      })
    );

    await waitForFrame();
    expect(root.classList.contains('hgrid--selection-dragging')).toBe(false);

    renderer.hitTestCellAtPoint = originalHitTest;
    grid.destroy();
    container.remove();
  });

  it('renders unsafeHtml columns as literal text when no sanitizer is provided by default', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const rawHtml = '<strong class="safe-name">Safe</strong><img src=x onerror="window.__xss=true" />';
    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 90, type: 'number' },
        { id: 'unsafeName', header: 'Unsafe Name', width: 220, type: 'text', unsafeHtml: true }
      ],
      rowData: [
        {
          id: 101,
          unsafeName: rawHtml
        }
      ],
      height: 150,
      rowHeight: 28,
      overscan: 2
    });

    await waitForFrame();

    const unsafeCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="unsafeName"]'
    ) as HTMLDivElement;

    expect(unsafeCell.textContent).toBe(rawHtml);
    expect(unsafeCell.querySelector('strong')).toBeNull();
    expect(unsafeCell.querySelector('img')).toBeNull();

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

  it('allows legacy raw HTML rendering only when htmlRendering.unsafeHtmlPolicy is allowRaw', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 90, type: 'number' },
        { id: 'unsafeName', header: 'Unsafe Name', width: 220, type: 'text', unsafeHtml: true }
      ],
      rowData: [
        {
          id: 101,
          unsafeName: '<strong class="safe-name">Safe</strong><img src=x onerror="window.__xss=true" />'
        }
      ],
      htmlRendering: {
        unsafeHtmlPolicy: 'allowRaw'
      },
      height: 150,
      rowHeight: 28,
      overscan: 2
    });

    await waitForFrame();

    const unsafeCell = container.querySelector(
      '.hgrid__row[data-row-index="0"] .hgrid__cell[data-column-id="unsafeName"]'
    ) as HTMLDivElement;

    expect(unsafeCell.querySelector('strong.safe-name')).not.toBeNull();
    expect(unsafeCell.querySelector('img')).not.toBeNull();

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

  it('applies built-in theme preset and clears theme overrides', async () => {
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
      theme: {
        preset: 'enterprise',
        mode: 'dark'
      },
      height: 160,
      rowHeight: 28,
      overscan: 2
    });

    grid.setTheme({
      '--hgrid-header-bg': '#123456'
    });
    await waitForFrame();

    const root = container.querySelector('.hgrid') as HTMLDivElement;
    expect(root.classList.contains('h-theme-enterprise')).toBe(true);
    expect(root.classList.contains('h-theme-dark')).toBe(true);
    expect(grid.getThemeState()).toMatchObject({
      preset: 'enterprise',
      mode: 'dark',
      resolvedMode: 'dark'
    });
    expect(root.style.getPropertyValue('--hgrid-header-bg')).toBe('#123456');

    grid.clearTheme();
    await waitForFrame();
    expect(root.style.getPropertyValue('--hgrid-header-bg')).toBe('');

    grid.setThemePreset('default');
    grid.setThemeMode('light');
    await waitForFrame();
    expect(root.classList.contains('h-theme-enterprise')).toBe(false);
    expect(root.classList.contains('h-theme-light')).toBe(true);

    grid.destroy();
    container.remove();
  });

  it('tracks system color scheme changes through theme mode', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    let isDarkMode = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQueryList = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      addListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeListener: (listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true
    };
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn(() => {
        mediaQueryList.matches = isDarkMode;
        return mediaQueryList;
      })
    });

    try {
      const grid = new Grid(container, {
        columns: [
          { id: 'id', header: 'ID', width: 100, type: 'number' },
          { id: 'name', header: 'Name', width: 220, type: 'text' }
        ],
        rowData: [
          { id: 1, name: 'Alpha' },
          { id: 2, name: 'Beta' }
        ],
        theme: {
          preset: 'enterprise',
          mode: 'system'
        },
        height: 160,
        rowHeight: 28,
        overscan: 2
      });

      await waitForFrame();

      const root = container.querySelector('.hgrid') as HTMLDivElement;
      expect(root.classList.contains('h-theme-light')).toBe(true);
      expect(grid.getThemeState().resolvedMode).toBe('light');

      isDarkMode = true;
      mediaQueryList.matches = true;
      listeners.forEach((listener) => {
        listener({ matches: true, media: mediaQueryList.media } as MediaQueryListEvent);
      });
      await waitForFrame();

      expect(root.classList.contains('h-theme-dark')).toBe(true);
      expect(grid.getThemeState().resolvedMode).toBe('dark');

      grid.destroy();
    } finally {
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia
      });
      container.remove();
    }
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

  it('opens columns tool panel and applies visibility and pin mutations', async () => {
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
      sideBar: {
        enabled: true,
        panels: ['columns'],
        defaultPanel: 'columns',
        width: 280
      },
      height: 180,
      rowHeight: 28
    });

    await waitForFrame();

    const toolPanel = container.querySelector('.hgrid__tool-panel') as HTMLDivElement;
    expect(toolPanel.classList.contains('hgrid__tool-panel--open')).toBe(true);

    const statusVisibility = toolPanel.querySelector(
      '[data-tool-panel-visibility-column-id="status"]'
    ) as HTMLInputElement;
    expect(statusVisibility.checked).toBe(true);
    statusVisibility.checked = false;
    statusVisibility.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();

    expect(grid.getVisibleColumns().map((column) => column.id)).toEqual(['id', 'name']);

    const hiddenStatusVisibility = toolPanel.querySelector(
      '[data-tool-panel-visibility-column-id="status"]'
    ) as HTMLInputElement;
    expect(hiddenStatusVisibility.checked).toBe(false);
    hiddenStatusVisibility.checked = true;
    hiddenStatusVisibility.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();

    expect(grid.getVisibleColumns().map((column) => column.id)).toEqual(['id', 'name', 'status']);

    const namePinSelect = toolPanel.querySelector('[data-tool-panel-pin-column-id="name"]') as HTMLSelectElement;
    namePinSelect.value = 'left';
    namePinSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();

    const pinnedNameColumn = grid.getColumns().find((column) => column.id === 'name');
    expect(pinnedNameColumn?.pinned).toBe('left');
    expect(grid.getVisibleColumns()[0]?.id).toBe('name');

    grid.destroy();
    container.remove();
  });

  it('filters columns tool panel rows by search and reorders columns from the panel', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', region: 'APAC', status: 'active', score: 10 },
        { id: 2, name: 'Beta', region: 'EMEA', status: 'idle', score: 20 }
      ],
      sideBar: {
        enabled: true,
        panels: ['columns'],
        defaultPanel: 'columns',
        width: 300
      },
      height: 180,
      rowHeight: 28
    });

    await waitForFrame();

    const toolPanel = container.querySelector('.hgrid__tool-panel') as HTMLDivElement;
    const searchInput = toolPanel.querySelector('[data-tool-panel-columns-search="true"]') as HTMLInputElement;
    searchInput.value = 'st';
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitForFrame();

    const visibleRows = Array.from(toolPanel.querySelectorAll('.hgrid__tool-panel-column-row')) as HTMLDivElement[];
    expect(visibleRows).toHaveLength(1);
    expect(visibleRows[0]?.textContent).toContain('Status');

    const refreshedSearchInput = toolPanel.querySelector('[data-tool-panel-columns-search="true"]') as HTMLInputElement;
    refreshedSearchInput.value = '';
    refreshedSearchInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitForFrame();

    const regionDownButton = toolPanel.querySelector(
      '[data-tool-panel-order-kind="columns"][data-tool-panel-order-column-id="region"][data-tool-panel-order-direction="down"]'
    ) as HTMLButtonElement;
    regionDownButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(grid.getColumns().map((column) => column.id)).toEqual(['id', 'name', 'status', 'region', 'score']);

    grid.destroy();
    container.remove();
  });

  it('opens filters tool panel and applies set filters from the side bar', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', region: 'APAC' },
        { id: 2, name: 'Beta', region: 'EMEA' },
        { id: 3, name: 'Gamma', region: 'APAC' }
      ],
      sideBar: {
        enabled: true,
        panels: ['filters'],
        defaultPanel: 'filters',
        width: 320
      },
      height: 180,
      rowHeight: 28
    });

    await waitForFrame();

    const toolPanel = container.querySelector('.hgrid__tool-panel') as HTMLDivElement;
    expect(toolPanel.classList.contains('hgrid__tool-panel--open')).toBe(true);

    const regionButton = toolPanel.querySelector('[data-tool-panel-filter-column-id="region"]') as HTMLButtonElement;
    regionButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    const setModeButton = toolPanel.querySelector('[data-tool-panel-filter-mode-trigger="set"]') as HTMLButtonElement;
    setModeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    const emeaCheckbox = toolPanel.querySelector('[data-tool-panel-filter-option-key="s:EMEA"]') as HTMLInputElement;
    const apacCheckbox = toolPanel.querySelector('[data-tool-panel-filter-option-key="s:APAC"]') as HTMLInputElement;
    expect(emeaCheckbox).toBeTruthy();
    expect(apacCheckbox).toBeTruthy();
    apacCheckbox.checked = true;
    emeaCheckbox.checked = false;

    const applyButton = toolPanel.querySelector('[data-tool-panel-filter-action="apply"]') as HTMLButtonElement;
    applyButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      region: {
        kind: 'set',
        values: ['APAC'],
        includeNull: false
      }
    });

    expect(grid.getViewRowCount()).toBe(2);
    const dataProvider = grid.getDataProvider();
    const visibleNames = [0, 1]
      .map((rowIndex) => dataProvider.getRow?.(grid.getDataIndex(rowIndex)) as { name?: string } | undefined)
      .map((row) => row?.name ?? null);
    expect(visibleNames).toEqual(['Alpha', 'Gamma']);

    const clearButton = toolPanel.querySelector('[data-tool-panel-filter-action="clear"]') as HTMLButtonElement;
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({});

    grid.destroy();
    container.remove();
  });

  it('docks the side bar shell and renders custom tool panel registry entries', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'status', header: 'Status', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', status: 'Open' },
        { id: 2, name: 'Beta', status: 'Closed' }
      ],
      sideBar: {
        enabled: true,
        panels: ['insights'],
        defaultPanel: 'insights',
        width: 320,
        customPanels: [
          {
            id: 'insights',
            title: 'Insights',
            render: ({ container: panelContainer, state, actions }) => {
              const summaryElement = document.createElement('div');
              summaryElement.dataset.customPanelSummary = 'true';
              summaryElement.textContent = state.visibleColumns.map((column) => column.id).join(',');

              const applyFilterButton = document.createElement('button');
              applyFilterButton.type = 'button';
              applyFilterButton.dataset.customPanelApplyFilter = 'true';
              applyFilterButton.textContent = 'Filter Open';
              applyFilterButton.addEventListener('click', () => {
                void Promise.resolve(
                  actions.setFilterModel({
                    status: {
                      kind: 'set',
                      values: ['Open'],
                      includeNull: false
                    }
                  })
                );
              });

              const clearFilterButton = document.createElement('button');
              clearFilterButton.type = 'button';
              clearFilterButton.dataset.customPanelClearFilter = 'true';
              clearFilterButton.textContent = 'Clear';
              clearFilterButton.addEventListener('click', () => {
                void Promise.resolve(actions.clearFilterModel());
              });

              const compactLayoutButton = document.createElement('button');
              compactLayoutButton.type = 'button';
              compactLayoutButton.dataset.customPanelCompactLayout = 'true';
              compactLayoutButton.textContent = 'Hide Status';
              compactLayoutButton.addEventListener('click', () => {
                const pinnedColumns: Record<string, 'left' | 'right'> = {};
                const columnWidths: Record<string, number> = {};
                state.columns.forEach((column) => {
                  if (column.pinned) {
                    pinnedColumns[column.id] = column.pinned;
                  }
                  columnWidths[column.id] = column.width;
                });
                actions.setColumnLayout({
                  columnOrder: state.columns.map((column) => column.id),
                  hiddenColumnIds: ['status'],
                  pinnedColumns,
                  columnWidths
                });
              });

              const closeButton = document.createElement('button');
              closeButton.type = 'button';
              closeButton.dataset.customPanelClose = 'true';
              closeButton.textContent = 'Close';
              closeButton.addEventListener('click', () => actions.closePanel());

              panelContainer.replaceChildren(
                summaryElement,
                applyFilterButton,
                clearFilterButton,
                compactLayoutButton,
                closeButton
              );
            }
          }
        ]
      },
      height: 180,
      rowHeight: 28
    });

    await waitForFrame();

    const rootElement = container.querySelector('.hgrid') as HTMLDivElement;
    expect(rootElement.style.getPropertyValue('--hgrid-side-bar-space-right')).toBe('320px');

    const summaryElement = container.querySelector('[data-custom-panel-summary="true"]') as HTMLDivElement;
    expect(summaryElement.textContent).toBe('id,name,status');

    const applyFilterButton = container.querySelector('[data-custom-panel-apply-filter="true"]') as HTMLButtonElement;
    applyFilterButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({
      status: {
        kind: 'set',
        values: ['Open'],
        includeNull: false
      }
    });
    expect(grid.getViewRowCount()).toBe(1);

    const compactLayoutButton = container.querySelector('[data-custom-panel-compact-layout="true"]') as HTMLButtonElement;
    compactLayoutButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(grid.getVisibleColumns().map((column) => column.id)).toEqual(['id', 'name']);

    const clearFilterButton = container.querySelector('[data-custom-panel-clear-filter="true"]') as HTMLButtonElement;
    clearFilterButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getFilterModel()).toEqual({});

    const closeButton = container.querySelector('[data-custom-panel-close="true"]') as HTMLButtonElement;
    closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(rootElement.style.getPropertyValue('--hgrid-side-bar-space-right')).toBe('28px');
    expect(container.querySelector('.hgrid__tool-panel--open')).toBeNull();

    grid.destroy();
    container.remove();
  });

  it('keeps the side bar closed on first render when initialOpen is false and opens the default panel from the edge handle', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'region', header: 'Region', width: 140, type: 'text' }
      ],
      rowData: [
        { id: 1, name: 'Alpha', region: 'APAC' },
        { id: 2, name: 'Beta', region: 'EMEA' }
      ],
      sideBar: {
        enabled: true,
        panels: ['filters', 'columns'],
        defaultPanel: 'filters',
        initialOpen: false,
        width: 320
      },
      height: 180,
      rowHeight: 28
    });

    await waitForFrame();

    const rootElement = container.querySelector('.hgrid') as HTMLDivElement;
    expect(rootElement.style.getPropertyValue('--hgrid-side-bar-space-right')).toBe('28px');
    expect(container.querySelector('.hgrid__tool-panel--open')).toBeNull();

    const toggleButton = container.querySelector('[data-tool-panel-toggle="true"]') as HTMLButtonElement;
    toggleButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(rootElement.style.getPropertyValue('--hgrid-side-bar-space-right')).toBe('320px');
    expect(container.querySelector('.hgrid__tool-panel--open')).not.toBeNull();
    const activeTab = container.querySelector(
      '[data-tool-panel-tab-id="filters"][aria-selected="true"]'
    ) as HTMLButtonElement | null;
    expect(activeTab).not.toBeNull();

    grid.destroy();
    container.remove();
  });

  it('renders status bar selection, aggregates, rows, and remote sync summaries', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const remoteProvider = new RemoteDataProvider({
      rowCount: 4,
      dataSource: {
        fetchBlock: async () => ({
          rows: [
            { id: 1, sales: 100, margin: 10, region: 'APAC' },
            { id: 2, sales: 200, margin: 20, region: 'EMEA' },
            { id: 3, sales: 300, margin: 30, region: 'APAC' },
            { id: 4, sales: 400, margin: 40, region: 'AMER' }
          ],
          rowKeys: [1, 2, 3, 4],
          totalRowCount: 4
        })
      },
      cache: {
        blockSize: 4,
        maxBlocks: 2
      }
    });

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'sales', header: 'Sales', width: 140, type: 'number' },
        { id: 'margin', header: 'Margin', width: 140, type: 'number' },
        { id: 'region', header: 'Region', width: 120, type: 'text' }
      ],
      dataProvider: remoteProvider,
      statusBar: {
        enabled: true
      },
      height: 96,
      rowHeight: 28
    });

    await waitForFrame();
    await waitForFrame();

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 1, c2: 2 }]
    });
    await waitForFrame();

    remoteProvider.setValue(0, 'sales', 999);
    await waitForFrame();

    const selectionItem = container.querySelector('[data-status-bar-item="selection"]') as HTMLDivElement;
    const aggregatesItem = container.querySelector('[data-status-bar-item="aggregates"]') as HTMLDivElement;
    const rowsItem = container.querySelector('[data-status-bar-item="rows"]') as HTMLDivElement;
    const remoteItem = container.querySelector('[data-status-bar-item="remote"]') as HTMLDivElement;

    expect(selectionItem.textContent).toBe('4 cells selected');
    expect(aggregatesItem.textContent).toBe('Sum 1,229 · Avg 307.25 · Min 10 · Max 999');
    const visibleRange = grid.getVisibleRowRange();
    const visibleCount = visibleRange ? visibleRange.endRow - visibleRange.startRow + 1 : 0;
    expect(rowsItem.textContent).toBe(`Visible ${visibleCount} · Rows 4`);
    expect(remoteItem.textContent).toBe('Pending 1 rows / 1 cells');

    grid.destroy();
    container.remove();
  });

  it('renders and updates custom status bar items', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'sales', header: 'Sales', width: 140, type: 'number' }
      ],
      rowData: [
        { id: 1, region: 'APAC', sales: 100 },
        { id: 2, region: 'EMEA', sales: 200 },
        { id: 3, region: 'APAC', sales: 300 }
      ],
      statusBar: {
        enabled: true,
        customItems: [
          {
            id: 'filters',
            align: 'main',
            render: ({ state }) => ({
              text: `Filters ${Object.keys(state.filterModel).length}`,
              tone: Object.keys(state.filterModel).length > 0 ? 'active' : 'default'
            })
          },
          {
            id: 'columns',
            align: 'meta',
            render: ({ state }) => `Cols ${state.visibleColumnCount}/${state.totalColumnCount}`
          }
        ],
        items: ['filters', 'selection', 'columns', 'rows']
      },
      height: 120,
      rowHeight: 28
    });

    await waitForFrame();

    let filtersItem = container.querySelector('[data-status-bar-item="filters"]') as HTMLDivElement;
    let columnsItem = container.querySelector('[data-status-bar-item="columns"]') as HTMLDivElement;

    expect(filtersItem.textContent).toBe('Filters 0');
    expect(columnsItem.textContent).toBe('Cols 3/3');

    await grid.setFilterModel({
      region: {
        kind: 'set',
        values: ['APAC']
      }
    });
    await waitForFrame();
    filtersItem = container.querySelector('[data-status-bar-item="filters"]') as HTMLDivElement;

    expect(filtersItem.textContent).toBe('Filters 1');
    expect(filtersItem.classList.contains('hgrid__status-bar-item--active')).toBe(true);

    grid.setColumnVisibility('sales', false);
    await waitForFrame();
    columnsItem = container.querySelector('[data-status-bar-item="columns"]') as HTMLDivElement;

    expect(columnsItem.textContent).toBe('Cols 2/3');

    grid.destroy();
    container.remove();
  });

  it('starts large selection aggregate computation asynchronously in the status bar', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const rowData = Array.from({ length: 40 }, (_, index) => ({
      id: index + 1,
      sales: index + 1,
      margin: (index + 1) * 2
    }));

    const grid = new Grid(container, {
      columns: [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'sales', header: 'Sales', width: 140, type: 'number' },
        { id: 'margin', header: 'Margin', width: 140, type: 'number' }
      ],
      rowData,
      statusBar: {
        enabled: true,
        aggregateAsyncThreshold: 8,
        aggregateChunkSize: 6
      },
      height: 180,
      rowHeight: 28
    });

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      cellRanges: [{ r1: 0, c1: 1, r2: 11, c2: 2 }]
    });

    await waitForFrame();
    const aggregatesItem = container.querySelector('[data-status-bar-item="aggregates"]') as HTMLDivElement;
    expect(aggregatesItem.textContent).toContain('Calculating');

    grid.destroy();
    container.remove();
  });

  it('applies grouping tool panel changes and keeps docked width in sync', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'name', header: 'Name', width: 180, type: 'text' },
        { id: 'sales', header: 'Sales', width: 120, type: 'number' }
      ],
      rowData: [
        { region: 'APAC', name: 'Alpha', sales: 10 },
        { region: 'EMEA', name: 'Beta', sales: 22 },
        { region: 'APAC', name: 'Gamma', sales: 31 }
      ],
      sideBar: {
        enabled: true,
        panels: ['grouping'],
        defaultPanel: 'grouping',
        width: 320
      },
      height: 200,
      rowHeight: 28
    });

    await waitForFrame();

    const rootElement = container.querySelector('.hgrid') as HTMLDivElement;
    expect(rootElement.style.getPropertyValue('--hgrid-side-bar-space-right')).toBe('320px');

    const regionCheckbox = container.querySelector('[data-tool-panel-group-column-id="region"]') as HTMLInputElement;
    regionCheckbox.checked = true;
    regionCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getGroupModel()).toEqual([{ columnId: 'region' }]);

    const salesAggregation = container.querySelector(
      '[data-tool-panel-aggregate-kind="group"][data-tool-panel-aggregate-column-id="sales"]'
    ) as HTMLSelectElement;
    salesAggregation.value = 'sum';
    salesAggregation.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getGroupAggregations()).toEqual([{ columnId: 'sales', type: 'sum' }]);

    const clearButton = container.querySelector(
      '[data-tool-panel-action-kind="grouping"][data-tool-panel-action="clear"]'
    ) as HTMLButtonElement;
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getGroupModel()).toEqual([]);
    expect(grid.getGroupAggregations()).toEqual([]);

    grid.destroy();
    container.remove();
  });

  it('applies pivot tool panel changes through docked side bar controls', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: 'region', header: 'Region', width: 140, type: 'text' },
        { id: 'month', header: 'Month', width: 140, type: 'text' },
        { id: 'sales', header: 'Sales', width: 120, type: 'number' }
      ],
      rowData: [
        { region: 'APAC', month: 'Jan', sales: 10 },
        { region: 'APAC', month: 'Feb', sales: 12 },
        { region: 'EMEA', month: 'Jan', sales: 8 }
      ],
      sideBar: {
        enabled: true,
        panels: ['pivot'],
        defaultPanel: 'pivot',
        width: 320
      },
      height: 200,
      rowHeight: 28
    });

    await waitForFrame();

    const monthCheckbox = container.querySelector('[data-tool-panel-pivot-column-id="month"]') as HTMLInputElement;
    monthCheckbox.checked = true;
    monthCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getPivotModel()).toEqual([{ columnId: 'month' }]);

    const salesAggregation = container.querySelector(
      '[data-tool-panel-aggregate-kind="pivot"][data-tool-panel-aggregate-column-id="sales"]'
    ) as HTMLSelectElement;
    salesAggregation.value = 'avg';
    salesAggregation.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getPivotValues()).toEqual([{ columnId: 'sales', type: 'avg' }]);

    const clearButton = container.querySelector(
      '[data-tool-panel-action-kind="pivot"][data-tool-panel-action="clear"]'
    ) as HTMLButtonElement;
    clearButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await waitForFrame();
    await waitForFrame();

    expect(grid.getPivotModel()).toEqual([]);
    expect(grid.getPivotValues()).toEqual([]);

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
      source: 'editor',
      transactionKind: 'singleCell',
      transactionStep: 'apply'
    });
    expect(typeof editCommitEvents[0].commitId).toBe('string');
    expect(typeof editCommitEvents[0].transactionId).toBe('string');
    expect(editCommitEvents[0].rootTransactionId).toBe(editCommitEvents[0].transactionId);
    expect(typeof editCommitEvents[0].timestamp).toBe('string');
    expect(typeof editCommitEvents[0].timestampMs).toBe('number');
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0]).toMatchObject({
      schemaVersion: EDIT_COMMIT_AUDIT_SCHEMA_VERSION,
      eventName: 'editCommit',
      rowIndex: 0,
      rowKey: 1,
      columnId: 'name',
      source: 'editor',
      value: 'User-1-Edited',
      transactionKind: 'singleCell',
      transactionStep: 'apply',
      rootTransactionId: editCommitEvents[0].transactionId
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

  it('supports select, masked, and date editors with dirty tracking state', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const columns = [
      { id: '__state', header: 'State', width: 108, type: 'text' as const, editable: false },
      {
        id: 'status',
        header: 'Status',
        width: 160,
        type: 'text' as const,
        editable: true,
        editor: {
          type: 'select' as const,
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'active', label: 'Active' }
          ]
        }
      },
      {
        id: 'dueDate',
        header: 'Due Date',
        width: 180,
        type: 'date' as const,
        editable: true,
        editor: {
          type: 'date' as const
        }
      }
    ];
    const rowData = [{ id: 1, status: 'draft', dueDate: '2026-03-05' }];

    const grid = new Grid(container, {
      columns,
      rowData,
      height: 160,
      rowHeight: 28,
      overscan: 2,
      editPolicy: {
        dirtyTracking: {
          enabled: true
        }
      }
    });

    const renderer = (
      grid as unknown as {
        renderer: {
          startEditingAtCell: (rowIndex: number, colIndex: number) => boolean;
          editorInputElement: HTMLInputElement;
          editorSelectElement: HTMLSelectElement;
        };
      }
    ).renderer;
    const queryVisibleCell = (selector: string): HTMLDivElement => {
      const matches = Array.from(container.querySelectorAll(selector)) as HTMLDivElement[];
      const visibleCell = matches.find((cell) => {
        const rowElement = cell.closest('.hgrid__row') as HTMLDivElement | null;
        return rowElement?.style.display !== 'none';
      });
      if (!visibleCell) {
        throw new Error(`Missing visible cell for selector: ${selector}`);
      }
      return visibleCell;
    };

    expect(grid.hasDirtyChanges()).toBe(false);

    expect(renderer.startEditingAtCell(0, 1)).toBe(true);
    expect(renderer.editorSelectElement.style.display).toBe('');
    renderer.editorSelectElement.value = '1';
    renderer.editorSelectElement.dispatchEvent(new Event('change', { bubbles: true }));
    renderer.editorSelectElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(grid.hasDirtyChanges()).toBe(true);
    expect(grid.getDirtyChangeSummary()).toEqual({
      rowCount: 1,
      cellCount: 1,
      rowKeys: [1]
    });
    expect(grid.getDirtyChanges()).toEqual([
      {
        rowKey: 1,
        dataIndexHint: 0,
        changes: [
          {
            columnId: 'status',
            originalValue: 'draft',
            value: 'active'
          }
        ]
      }
    ]);

    const dirtyStateCell = queryVisibleCell('.hgrid__row--left[data-row-index="0"] .hgrid__cell[data-column-id="__state"]');
    expect(dirtyStateCell.textContent?.trim()).toBe('dirty');

    expect(renderer.startEditingAtCell(0, 2)).toBe(true);
    expect(renderer.editorInputElement.type).toBe('date');
    expect(renderer.editorInputElement.value).toBe('2026-03-05');
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await waitForFrame();
    expect(grid.getDirtyChangeSummary()).toEqual({
      rowCount: 1,
      cellCount: 1,
      rowKeys: [1]
    });

    grid.acceptDirtyChanges();
    await waitForFrame();

    expect(grid.hasDirtyChanges()).toBe(false);
    expect(grid.getDirtyChanges()).toEqual([]);
    const committedStateCell = queryVisibleCell('.hgrid__row--left[data-row-index="0"] .hgrid__cell[data-column-id="__state"]');
    expect(committedStateCell.textContent?.trim()).toBe('commit');

    grid.destroy();
    container.remove();
  });

  it('reverts local dirty changes through discardDirtyChanges', async () => {
    const container = document.createElement('div');
    document.body.append(container);

    const grid = new Grid(container, {
      columns: [
        { id: '__state', header: 'State', width: 108, type: 'text' as const, editable: false },
        { id: 'name', header: 'Name', width: 200, type: 'text' as const, editable: true },
        { id: 'status', header: 'Status', width: 160, type: 'text' as const, editable: true }
      ],
      rowData: [{ id: 1, name: 'Ahn', status: 'draft' }],
      height: 160,
      rowHeight: 28,
      overscan: 2,
      editPolicy: {
        dirtyTracking: {
          enabled: true
        }
      }
    });

    const renderer = (
      grid as unknown as {
        renderer: {
          startEditingAtCell: (rowIndex: number, colIndex: number) => boolean;
          editorInputElement: HTMLInputElement;
        };
      }
    ).renderer;

    expect(renderer.startEditingAtCell(0, 1)).toBe(true);
    renderer.editorInputElement.value = 'Ahn Edited';
    renderer.editorInputElement.dispatchEvent(new Event('input', { bubbles: true }));
    renderer.editorInputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await waitForFrame();

    expect(grid.hasDirtyChanges()).toBe(true);
    expect(grid.getDirtyChangeSummary()).toEqual({
      rowCount: 1,
      cellCount: 1,
      rowKeys: [1]
    });
    expect(grid.getDataProvider().getValue(0, 'name')).toBe('Ahn Edited');

    grid.discardDirtyChanges();
    await waitForFrame();

    expect(grid.hasDirtyChanges()).toBe(false);
    expect(grid.getDirtyChanges()).toEqual([]);
    expect(grid.getDataProvider().getValue(0, 'name')).toBe('Ahn');

    const stateCell = Array.from(
      container.querySelectorAll('.hgrid__row--left[data-row-index="0"] .hgrid__cell[data-column-id="__state"]')
    ).find((cell) => (cell.closest('.hgrid__row') as HTMLDivElement | null)?.style.display !== 'none') as HTMLDivElement | undefined;
    expect(stateCell?.textContent?.trim() ?? '').toBe('');

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
