import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '../src/core/grid-options';
import {
  buildReorderedColumnOrder,
  clampColumnWidth,
  clampHeaderDropIndicatorOffset,
  createColumnReorderSession,
  createColumnResizeSession,
  createHeaderDropTarget,
  findVisibleColumnById,
  getVisibleColumnIndexById,
  isHeaderResizeHandleHit,
  normalizeDropIndexForSource,
  resolveColumnWidthBounds,
  resolveNextColumnResizeWidth
} from '../src/render/dom-renderer-header-interactions';

function createColumn(id: string, width: number, minWidth?: number, maxWidth?: number): ColumnDef {
  return {
    id,
    header: id.toUpperCase(),
    width,
    minWidth,
    maxWidth,
    type: 'text'
  };
}

describe('dom-renderer-header-interactions', () => {
  it('finds visible columns by id and index', () => {
    const columns = [createColumn('id', 100), createColumn('name', 180), createColumn('score', 140)];

    expect(findVisibleColumnById(columns, 'name')?.id).toBe('name');
    expect(findVisibleColumnById(columns, 'missing')).toBeNull();
    expect(getVisibleColumnIndexById(columns, 'score')).toBe(2);
    expect(getVisibleColumnIndexById(columns, 'missing')).toBe(-1);
  });

  it('detects resize handle hit near the trailing edge', () => {
    const rect = {
      left: 100,
      right: 280,
      top: 8,
      bottom: 40,
      width: 180
    };

    expect(isHeaderResizeHandleHit(279, 20, rect, 6)).toBe(true);
    expect(isHeaderResizeHandleHit(270, 20, rect, 6)).toBe(false);
    expect(isHeaderResizeHandleHit(279, 50, rect, 6)).toBe(false);
  });

  it('creates resize session and clamps width by column bounds', () => {
    const column = createColumn('name', 180, 120, 260);
    const resizeHit = {
      columnId: 'name',
      column,
      headerCell: document.createElement('div')
    };

    const bounds = resolveColumnWidthBounds(column);
    expect(bounds).toEqual({ minWidth: 120, maxWidth: 260 });
    expect(clampColumnWidth(40, bounds.minWidth, bounds.maxWidth)).toBe(120);
    expect(clampColumnWidth(400, bounds.minWidth, bounds.maxWidth)).toBe(260);

    const session = createColumnResizeSession(77, 280, resizeHit);
    expect(session.startWidth).toBe(180);

    session.pendingClientX = 210;
    expect(resolveNextColumnResizeWidth(session)).toBe(120);

    session.pendingClientX = 420;
    expect(resolveNextColumnResizeWidth(session)).toBe(260);
  });

  it('creates drop target and clamps indicator offset inside header bounds', () => {
    const cellRect = {
      left: 200,
      right: 380,
      top: 8,
      bottom: 40,
      width: 180
    };
    const headerRect = {
      left: 100,
      right: 660,
      top: 8,
      bottom: 40,
      width: 560
    };

    expect(createHeaderDropTarget('name', 1, 220, cellRect)).toEqual({
      dropIndex: 1,
      targetColumnId: 'name',
      indicatorClientX: 200
    });
    expect(createHeaderDropTarget('name', 1, 360, cellRect)).toEqual({
      dropIndex: 2,
      targetColumnId: 'name',
      indicatorClientX: 380
    });
    expect(clampHeaderDropIndicatorOffset(headerRect, 50)).toBe(0);
    expect(clampHeaderDropIndicatorOffset(headerRect, 380)).toBe(280);
    expect(clampHeaderDropIndicatorOffset(headerRect, 800)).toBe(560);
  });

  it('creates reorder session and derives reordered column order', () => {
    const session = createColumnReorderSession(91, 220, 24, 'name', 1);
    expect(session).toMatchObject({
      pointerId: 91,
      sourceColumnId: 'name',
      sourceIndex: 1,
      currentDropIndex: 2,
      currentTargetColumnId: 'name'
    });

    expect(normalizeDropIndexForSource(3, 1)).toBe(2);
    expect(normalizeDropIndexForSource(1, 1)).toBe(1);
    expect(buildReorderedColumnOrder(['id', 'name', 'score', 'status'], 1, 2)).toEqual([
      'id',
      'score',
      'name',
      'status'
    ]);
  });
});
