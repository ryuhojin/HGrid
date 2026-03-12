import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '../src/core/grid-options';
import { LocalDataProvider } from '../src/data/local-data-provider';
import {
  WORKER_TREE_LAZY_ROW_REF_FIELD,
  createWorkerTreeLazyRowRef,
  createFilterExecutionRequest,
  createGroupExecutionRequest,
  createPivotExecutionRequest,
  createSortExecutionRequest,
  createTreeExecutionRequest,
  serializeFilterExecutionRequestAsync,
  serializeFilterExecutionRequest,
  serializeGroupExecutionRequest,
  serializePivotExecutionRequest,
  serializeSortExecutionRequestAsync,
  serializeTreeExecutionRequest,
  serializeSortExecutionRequest
} from '../src/data/worker-operation-payloads';
import { WorkerProjectionCache } from '../src/data/worker-projection-cache';

interface DictionaryEncodedValues {
  kind: 'dictionary';
  dictionary: unknown[];
  codes: Uint32Array;
}

function isDictionaryEncodedValues(values: unknown): values is DictionaryEncodedValues {
  if (!values || typeof values !== 'object' || !('kind' in values) || values.kind !== 'dictionary') {
    return false;
  }

  const candidate = values as Partial<DictionaryEncodedValues>;
  return Array.isArray(candidate.dictionary) && candidate.codes instanceof Uint32Array;
}

function decodeWorkerColumnValues(values: unknown): unknown[] | null {
  if (Array.isArray(values)) {
    return values;
  }

  if (values instanceof Float64Array || values instanceof Int32Array) {
    return Array.from(values);
  }

  if (isDictionaryEncodedValues(values)) {
    return Array.from(values.codes, (code) => values.dictionary[code]);
  }

  return null;
}

describe('worker operation payloads', () => {
  it('projects custom comparator sort columns into numeric worker ranks', () => {
    const provider = new LocalDataProvider([
      { id: 1, label: 'bbb' },
      { id: 2, label: 'a' },
      { id: 3, label: 'cccc' },
      { id: 4, label: 'dd' }
    ]);

    const payload = serializeSortExecutionRequest({
      opId: 'sort-1',
      rowCount: 4,
      sortModel: [{ columnId: 'label', direction: 'asc' }],
      columns: [
        {
          id: 'label',
          header: 'Label',
          width: 160,
          type: 'text',
          comparator: (left, right) => String(left).length - String(right).length
        }
      ],
      dataProvider: provider
    });

    expect(payload && 'kind' in payload ? payload.kind : 'rows').toBe('columnar');
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.columns : null).toEqual([
      { id: 'label', type: 'number' }
    ]);
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.columnValuesById.label : null).toEqual([
      2,
      0,
      3,
      1
    ]);

    const request = createSortExecutionRequest('sort-1', payload!);
    expect(request.dataProvider.getValue(0, 'label')).toBe(2);
  });

  it('materializes valueGetter results into columnar worker payloads', () => {
    const columns: ColumnDef[] = [
      { id: 'firstName', header: 'First', width: 120, type: 'text' },
      { id: 'lastName', header: 'Last', width: 120, type: 'text' },
      {
        id: 'fullName',
        header: 'Full Name',
        width: 180,
        type: 'text',
        valueGetter: (row) => `${String(row.firstName)} ${String(row.lastName)}`
      }
    ];
    const provider = new LocalDataProvider([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' }
    ]);

    const payload = serializeFilterExecutionRequest({
      opId: 'filter-1',
      rowCount: 2,
      filterModel: {
        fullName: {
          kind: 'text',
          operator: 'contains',
          value: 'Grace'
        }
      },
      columns,
      dataProvider: provider
    });

    expect(payload).not.toBeNull();
    if (!payload || !('kind' in payload) || payload.kind !== 'columnar') {
      throw new Error('Expected columnar payload');
    }
    expect(payload.columnValuesById.fullName).toEqual(['Ada Lovelace', 'Grace Hopper']);
    const request = createFilterExecutionRequest('filter-1', payload);
    expect(request.dataProvider.getValue(1, 'fullName')).toBe('Grace Hopper');
  });

  it('reuses cached valueGetter projections when the projected columns stay the same', () => {
    let valueGetterCallCount = 0;
    const columns: ColumnDef[] = [
      { id: 'firstName', header: 'First', width: 120, type: 'text' },
      { id: 'lastName', header: 'Last', width: 120, type: 'text' },
      {
        id: 'fullName',
        header: 'Full Name',
        width: 180,
        type: 'text',
        valueGetter: (row) => {
          valueGetterCallCount += 1;
          return `${String(row.firstName)} ${String(row.lastName)}`;
        }
      }
    ];
    const provider = new LocalDataProvider([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' }
    ]);
    const projectionCache = new WorkerProjectionCache();

    const firstPayload = serializeFilterExecutionRequest(
      {
        opId: 'filter-cache-1',
        rowCount: 2,
        filterModel: {
          fullName: {
            kind: 'text',
            operator: 'contains',
            value: 'Ada'
          }
        },
        columns,
        dataProvider: provider
      },
      {
        projectionCache
      }
    );
    expect(valueGetterCallCount).toBe(2);

    const secondPayload = serializeFilterExecutionRequest(
      {
        opId: 'filter-cache-2',
        rowCount: 2,
        filterModel: {
          fullName: {
            kind: 'text',
            operator: 'contains',
            value: 'Grace'
          }
        },
        columns,
        dataProvider: provider
      },
      {
        projectionCache
      }
    );

    expect(valueGetterCallCount).toBe(2);
    expect(firstPayload && 'kind' in firstPayload && firstPayload.kind === 'columnar' ? firstPayload.columnValuesById.fullName : null).toEqual([
      'Ada Lovelace',
      'Grace Hopper'
    ]);
    expect(
      secondPayload && 'kind' in secondPayload && secondPayload.kind === 'columnar'
        ? secondPayload.columnValuesById.fullName
        : null
    ).toEqual(['Ada Lovelace', 'Grace Hopper']);
  });

  it('evaluates only the required valueGetter prefix for projected worker columns', () => {
    let prefixGetterCallCount = 0;
    let targetGetterCallCount = 0;
    let trailingGetterCallCount = 0;
    const columns: ColumnDef[] = [
      { id: 'firstName', header: 'First', width: 120, type: 'text' },
      { id: 'lastName', header: 'Last', width: 120, type: 'text' },
      {
        id: 'prefixName',
        header: 'Prefix',
        width: 160,
        type: 'text',
        valueGetter: (row) => {
          prefixGetterCallCount += 1;
          return `${String(row.firstName)}-${String(row.lastName)}`;
        }
      },
      {
        id: 'fullName',
        header: 'Full Name',
        width: 180,
        type: 'text',
        valueGetter: (row) => {
          targetGetterCallCount += 1;
          return `${String(row.prefixName)}!`;
        }
      },
      {
        id: 'tailBadge',
        header: 'Tail',
        width: 180,
        type: 'text',
        valueGetter: (row) => {
          trailingGetterCallCount += 1;
          return `${String(row.fullName)}#tail`;
        }
      }
    ];
    const provider = new LocalDataProvider([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' }
    ]);

    const payload = serializeFilterExecutionRequest({
      opId: 'filter-prefix-only',
      rowCount: 2,
      filterModel: {
        fullName: {
          kind: 'text',
          operator: 'contains',
          value: 'Grace'
        }
      },
      columns,
      dataProvider: provider
    });

    expect(payload && 'kind' in payload ? payload.kind : 'rows').toBe('columnar');
    expect(
      payload && 'kind' in payload && payload.kind === 'columnar' ? payload.columnValuesById.fullName : null
    ).toEqual(['Ada-Lovelace!', 'Grace-Hopper!']);
    expect(prefixGetterCallCount).toBe(2);
    expect(targetGetterCallCount).toBe(2);
    expect(trailingGetterCallCount).toBe(0);
  });

  it('yields while building async projected worker payloads', async () => {
    let yieldCount = 0;
    const columns: ColumnDef[] = [
      { id: 'firstName', header: 'First', width: 120, type: 'text' },
      { id: 'lastName', header: 'Last', width: 120, type: 'text' },
      {
        id: 'fullName',
        header: 'Full Name',
        width: 180,
        type: 'text',
        valueGetter: (row) => `${String(row.firstName)} ${String(row.lastName)}`
      }
    ];
    const provider = new LocalDataProvider([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' },
      { firstName: 'Katherine', lastName: 'Johnson' }
    ]);

    const payload = await serializeFilterExecutionRequestAsync(
      {
        opId: 'filter-async-yield',
        rowCount: 3,
        filterModel: {
          fullName: {
            kind: 'text',
            operator: 'contains',
            value: 'Grace'
          }
        },
        columns,
        dataProvider: provider
      },
      {
        yieldInterval: 1,
        yieldControl: async () => {
          yieldCount += 1;
        }
      }
    );

    expect(payload && 'kind' in payload ? payload.kind : 'rows').toBe('columnar');
    expect(yieldCount).toBeGreaterThan(0);
    const fullNameValues =
      payload && 'kind' in payload && payload.kind === 'columnar'
        ? decodeWorkerColumnValues(payload.columnValuesById.fullName)
        : null;
    expect(fullNameValues).toEqual(['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson']);
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.columnValuesById.fullName : null).toMatchObject({
      kind: 'dictionary'
    });
  });

  it('returns fresh encoded payload buffers when async projected values are served from cache', async () => {
    const columns: ColumnDef[] = [
      { id: 'firstName', header: 'First', width: 120, type: 'text' },
      { id: 'lastName', header: 'Last', width: 120, type: 'text' },
      {
        id: 'fullName',
        header: 'Full Name',
        width: 180,
        type: 'text',
        valueGetter: (row) => `${String(row.firstName)} ${String(row.lastName)}`
      }
    ];
    const provider = new LocalDataProvider([
      { firstName: 'Ada', lastName: 'Lovelace' },
      { firstName: 'Grace', lastName: 'Hopper' },
      { firstName: 'Katherine', lastName: 'Johnson' }
    ]);
    const projectionCache = new WorkerProjectionCache();

    const firstPayload = await serializeFilterExecutionRequestAsync(
      {
        opId: 'filter-cache-async-1',
        rowCount: 3,
        filterModel: {
          fullName: {
            kind: 'text',
            operator: 'contains',
            value: 'Grace'
          }
        },
        columns,
        dataProvider: provider
      },
      {
        projectionCache
      }
    );
    const secondPayload = await serializeFilterExecutionRequestAsync(
      {
        opId: 'filter-cache-async-2',
        rowCount: 3,
        filterModel: {
          fullName: {
            kind: 'text',
            operator: 'contains',
            value: 'Ada'
          }
        },
        columns,
        dataProvider: provider
      },
      {
        projectionCache
      }
    );

    if (!firstPayload || !('kind' in firstPayload) || firstPayload.kind !== 'columnar') {
      throw new Error('Expected first async payload to be columnar');
    }
    if (!secondPayload || !('kind' in secondPayload) || secondPayload.kind !== 'columnar') {
      throw new Error('Expected second async payload to be columnar');
    }

    expect(decodeWorkerColumnValues(firstPayload.columnValuesById.fullName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Katherine Johnson'
    ]);
    expect(decodeWorkerColumnValues(secondPayload.columnValuesById.fullName)).toEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'Katherine Johnson'
    ]);
    expect(secondPayload.columnValuesById.fullName).not.toBe(firstPayload.columnValuesById.fullName);
  });

  it('cancels async comparator rank serialization before the worker payload is finalized', async () => {
    let isCanceled = false;
    let yieldCount = 0;
    const provider = new LocalDataProvider([
      { id: 1, label: 'bbb' },
      { id: 2, label: 'a' },
      { id: 3, label: 'cccc' },
      { id: 4, label: 'dd' }
    ]);

    const payload = await serializeSortExecutionRequestAsync(
      {
        opId: 'sort-async-cancel',
        rowCount: 4,
        sortModel: [{ columnId: 'label', direction: 'asc' }],
        columns: [
          {
            id: 'label',
            header: 'Label',
            width: 160,
            type: 'text',
            comparator: (left, right) => String(left).length - String(right).length
          }
        ],
        dataProvider: provider
      },
      {
        isCanceled: () => isCanceled,
        yieldInterval: 1,
        yieldControl: async () => {
          yieldCount += 1;
          if (yieldCount === 1) {
            isCanceled = true;
          }
        }
      }
    );

    expect(yieldCount).toBeGreaterThan(0);
    expect(payload).toBeNull();
  });

  it('reuses cached comparator rank projections when the sorted columns stay the same', () => {
    let comparatorCallCount = 0;
    const provider = new LocalDataProvider([
      { id: 1, label: 'bbb' },
      { id: 2, label: 'a' },
      { id: 3, label: 'cccc' },
      { id: 4, label: 'dd' }
    ]);
    const projectionCache = new WorkerProjectionCache();
    const columns: ColumnDef[] = [
      {
        id: 'label',
        header: 'Label',
        width: 160,
        type: 'text',
        comparator: (left, right) => {
          comparatorCallCount += 1;
          return String(left).length - String(right).length;
        }
      }
    ];

    const firstPayload = serializeSortExecutionRequest(
      {
        opId: 'sort-cache-1',
        rowCount: 4,
        sortModel: [{ columnId: 'label', direction: 'asc' }],
        columns,
        dataProvider: provider
      },
      {
        projectionCache
      }
    );
    const firstComparatorCallCount = comparatorCallCount;

    const secondPayload = serializeSortExecutionRequest(
      {
        opId: 'sort-cache-2',
        rowCount: 4,
        sortModel: [{ columnId: 'label', direction: 'desc' }],
        columns,
        dataProvider: provider
      },
      {
        projectionCache
      }
    );

    expect(firstComparatorCallCount).toBeGreaterThan(0);
    expect(comparatorCallCount).toBe(firstComparatorCallCount);
    expect(firstPayload && 'kind' in firstPayload && firstPayload.kind === 'columnar' ? firstPayload.columnValuesById.label : null).toEqual([
      2,
      0,
      3,
      1
    ]);
    expect(
      secondPayload && 'kind' in secondPayload && secondPayload.kind === 'columnar'
        ? secondPayload.columnValuesById.label
        : null
    ).toEqual([2, 0, 3, 1]);
  });

  it('uses columnar payloads for simple sort/filter requests', () => {
    const provider = new LocalDataProvider([
      { id: 1, score: 20, status: 'active' },
      { id: 2, score: 10, status: 'hold' }
    ]);

    const sortPayload = serializeSortExecutionRequest({
      opId: 'sort-columnar',
      rowCount: 2,
      sortModel: [{ columnId: 'score', direction: 'asc' }],
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'score', header: 'Score', width: 120, type: 'number' },
        { id: 'status', header: 'Status', width: 120, type: 'text' }
      ],
      dataProvider: provider
    });
    const filterPayload = serializeFilterExecutionRequest({
      opId: 'filter-columnar',
      rowCount: 2,
      filterModel: {
        status: {
          kind: 'text',
          operator: 'equals',
          value: 'active'
        }
      },
      columns: [
        { id: 'id', header: 'ID', width: 120, type: 'number' },
        { id: 'score', header: 'Score', width: 120, type: 'number' },
        { id: 'status', header: 'Status', width: 120, type: 'text' }
      ],
      dataProvider: provider
    });

    expect(sortPayload).not.toBeNull();
    expect(sortPayload && 'kind' in sortPayload ? sortPayload.kind : 'rows').toBe('columnar');
    expect(sortPayload && 'kind' in sortPayload && sortPayload.kind === 'columnar' ? sortPayload.columnValuesById.score : null).toEqual([
      20,
      10
    ]);

    expect(filterPayload).not.toBeNull();
    expect(filterPayload && 'kind' in filterPayload ? filterPayload.kind : 'rows').toBe('columnar');
    expect(
      filterPayload && 'kind' in filterPayload && filterPayload.kind === 'columnar'
        ? filterPayload.columnValuesById.status
        : null
    ).toEqual(['active', 'hold']);

    const sortRequest = createSortExecutionRequest('sort-columnar', sortPayload!);
    const filterRequest = createFilterExecutionRequest('filter-columnar', filterPayload!);
    expect(sortRequest.dataProvider.getValue(1, 'score')).toBe(10);
    expect(filterRequest.dataProvider.getValue(0, 'status')).toBe('active');
  });

  it('builds direct encoded async payloads for raw number/text columns', async () => {
    const provider = new LocalDataProvider([
      { id: 1, score: 20, status: 'active' },
      { id: 2, score: 10, status: 'hold' },
      { id: 3, score: 30, status: 'active' }
    ]);
    const columns: ColumnDef[] = [
      { id: 'id', header: 'ID', width: 120, type: 'number' },
      { id: 'score', header: 'Score', width: 120, type: 'number' },
      { id: 'status', header: 'Status', width: 120, type: 'text' }
    ];

    const sortPayload = await serializeSortExecutionRequestAsync({
      opId: 'sort-async-encoded',
      rowCount: 3,
      sortModel: [{ columnId: 'score', direction: 'asc' }],
      columns,
      dataProvider: provider
    });
    const filterPayload = await serializeFilterExecutionRequestAsync({
      opId: 'filter-async-encoded',
      rowCount: 3,
      filterModel: {
        status: {
          kind: 'text',
          operator: 'equals',
          value: 'active'
        }
      },
      columns,
      dataProvider: provider
    });

    if (!sortPayload || !('kind' in sortPayload) || sortPayload.kind !== 'columnar') {
      throw new Error('Expected async sort payload to be columnar');
    }
    if (!filterPayload || !('kind' in filterPayload) || filterPayload.kind !== 'columnar') {
      throw new Error('Expected async filter payload to be columnar');
    }

    expect(sortPayload.columnValuesById.score).toBeInstanceOf(Int32Array);
    expect(Array.from(sortPayload.columnValuesById.score as Int32Array)).toEqual([20, 10, 30]);
    expect(filterPayload.columnValuesById.status).toMatchObject({
      kind: 'dictionary'
    });
    expect(decodeWorkerColumnValues(filterPayload.columnValuesById.status)).toEqual(['active', 'hold', 'active']);
  });

  it('keeps non-integer async numeric payloads in Float64Array form', async () => {
    const provider = new LocalDataProvider([
      { amount: 1.5 },
      { amount: 2.25 }
    ]);

    const payload = await serializeSortExecutionRequestAsync({
      opId: 'sort-async-float',
      rowCount: 2,
      sortModel: [{ columnId: 'amount', direction: 'asc' }],
      columns: [{ id: 'amount', header: 'Amount', width: 120, type: 'number' }],
      dataProvider: provider
    });

    if (!payload || !('kind' in payload) || payload.kind !== 'columnar') {
      throw new Error('Expected async float sort payload to be columnar');
    }

    expect(payload.columnValuesById.amount).toBeInstanceOf(Float64Array);
    expect(Array.from(payload.columnValuesById.amount as Float64Array)).toEqual([1.5, 2.25]);
  });

  it('keeps group requests worker-serializable when custom reducers are present', () => {
    const provider = new LocalDataProvider([
      { region: 'KR', score: 10 },
      { region: 'US', score: 20 }
    ]);

    const payload = serializeGroupExecutionRequest({
      opId: 'group-1',
      rowCount: 2,
      groupModel: [{ columnId: 'region' }],
      aggregations: [
        {
          columnId: 'score',
          reducer: (values) => values.length
        }
      ],
      columns: [
        { id: 'region', header: 'Region', width: 120, type: 'text' },
        { id: 'score', header: 'Score', width: 120, type: 'number' }
      ],
      dataProvider: provider
    });

    expect(payload).not.toBeNull();
    expect(payload && 'kind' in payload ? payload.kind : 'rows').toBe('columnar');
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.includeLeafDataIndexes : null).toBe(true);
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.aggregations : null).toEqual([]);

    const request = createGroupExecutionRequest('group-1', payload!);
    expect(request.includeLeafDataIndexes).toBe(true);
  });

  it('uses columnar payloads for simple group/pivot requests', () => {
    const provider = new LocalDataProvider([
      { region: 'KR', status: 'active', score: 10 },
      { region: 'US', status: 'hold', score: 20 }
    ]);
    const columns: ColumnDef[] = [
      { id: 'region', header: 'Region', width: 120, type: 'text' },
      { id: 'status', header: 'Status', width: 120, type: 'text' },
      { id: 'score', header: 'Score', width: 120, type: 'number' }
    ];

    const groupPayload = serializeGroupExecutionRequest({
      opId: 'group-columnar',
      rowCount: 2,
      groupModel: [{ columnId: 'region' }],
      aggregations: [{ columnId: 'score', type: 'sum' }],
      columns,
      dataProvider: provider
    });
    const pivotPayload = serializePivotExecutionRequest({
      opId: 'pivot-columnar',
      rowCount: 2,
      columns,
      dataProvider: provider,
      rowGroupModel: [{ columnId: 'region' }],
      pivotModel: [{ columnId: 'status' }],
      pivotValues: [{ columnId: 'score', type: 'sum' }]
    });

    expect(groupPayload).not.toBeNull();
    expect(groupPayload && 'kind' in groupPayload ? groupPayload.kind : 'rows').toBe('columnar');
    expect(
      groupPayload && 'kind' in groupPayload && groupPayload.kind === 'columnar'
        ? groupPayload.columnValuesById.score
        : null
    ).toEqual([10, 20]);

    expect(pivotPayload).not.toBeNull();
    expect(pivotPayload && 'kind' in pivotPayload ? pivotPayload.kind : 'rows').toBe('columnar');
    expect(
      pivotPayload && 'kind' in pivotPayload && pivotPayload.kind === 'columnar'
        ? pivotPayload.columnValuesById.status
        : null
    ).toEqual(['active', 'hold']);

    const groupRequest = createGroupExecutionRequest('group-columnar', groupPayload!);
    const pivotRequest = createPivotExecutionRequest('pivot-columnar', pivotPayload!);
    expect(groupRequest.dataProvider.getValue(0, 'score')).toBe(10);
    expect(pivotRequest.dataProvider.getValue(1, 'status')).toBe('hold');
  });

  it('keeps group and pivot requests columnar when selected columns use valueGetter', () => {
    const provider = new LocalDataProvider([
      { country: 'KR', city: 'Seoul', month: 'Jan', sales: 10 },
      { country: 'KR', city: 'Busan', month: 'Jan', sales: 20 },
      { country: 'US', city: 'Austin', month: 'Feb', sales: 30 }
    ]);
    const columns: ColumnDef[] = [
      {
        id: 'region',
        header: 'Region',
        width: 160,
        type: 'text',
        valueGetter: (row) => `${String(row.country)}-${String(row.city)}`
      },
      { id: 'country', header: 'Country', width: 120, type: 'text' },
      { id: 'city', header: 'City', width: 120, type: 'text' },
      { id: 'month', header: 'Month', width: 120, type: 'text' },
      { id: 'sales', header: 'Sales', width: 120, type: 'number' }
    ];

    const groupPayload = serializeGroupExecutionRequest({
      opId: 'group-value-getter',
      rowCount: 3,
      groupModel: [{ columnId: 'region' }],
      aggregations: [{ columnId: 'sales', type: 'sum' }],
      columns,
      dataProvider: provider
    });
    const pivotPayload = serializePivotExecutionRequest({
      opId: 'pivot-value-getter',
      rowCount: 3,
      columns,
      dataProvider: provider,
      rowGroupModel: [{ columnId: 'region' }],
      pivotModel: [{ columnId: 'month' }],
      pivotValues: [{ columnId: 'sales', type: 'sum' }]
    });

    expect(groupPayload && 'kind' in groupPayload ? groupPayload.kind : 'rows').toBe('columnar');
    expect(
      groupPayload && 'kind' in groupPayload && groupPayload.kind === 'columnar'
        ? groupPayload.columnValuesById.region
        : null
    ).toEqual(['KR-Seoul', 'KR-Busan', 'US-Austin']);

    expect(pivotPayload && 'kind' in pivotPayload ? pivotPayload.kind : 'rows').toBe('columnar');
    expect(
      pivotPayload && 'kind' in pivotPayload && pivotPayload.kind === 'columnar'
        ? pivotPayload.columnValuesById.region
        : null
    ).toEqual(['KR-Seoul', 'KR-Busan', 'US-Austin']);
  });

  it('keeps pivot requests worker-serializable when custom reducers are present', () => {
    const provider = new LocalDataProvider([
      { region: 'KR', month: 'Jan', sales: 10 },
      { region: 'US', month: 'Feb', sales: 20 }
    ]);

    const payload = serializePivotExecutionRequest({
      opId: 'pivot-custom',
      rowCount: 2,
      columns: [
        { id: 'region', header: 'Region', width: 120, type: 'text' },
        { id: 'month', header: 'Month', width: 120, type: 'text' },
        { id: 'sales', header: 'Sales', width: 120, type: 'number' }
      ],
      dataProvider: provider,
      rowGroupModel: [{ columnId: 'region' }],
      pivotModel: [{ columnId: 'month' }],
      pivotValues: [
        {
          columnId: 'sales',
          reducer: (values) => values.reduce<number>((sum, value) => sum + Number(value ?? 0), 0) * 2
        }
      ]
    });

    expect(payload).not.toBeNull();
    expect(payload && 'kind' in payload ? payload.kind : 'rows').toBe('columnar');
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.customValueColumnIds : null).toEqual(['sales']);
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.pivotValues : null).toEqual([
      { columnId: 'sales', type: undefined }
    ]);
    expect(payload && 'kind' in payload && payload.kind === 'columnar' ? payload.columnValuesById.sales : null).toEqual([10, 20]);

    const request = createPivotExecutionRequest('pivot-custom', payload!);
    expect(request.customValueColumnIds).toEqual(['sales']);
  });

  it('uses compact payloads for tree requests', () => {
    const provider = new LocalDataProvider([
      { id: 1, parentId: null, hasChildren: true, name: 'Root' },
      { id: 2, parentId: 1, hasChildren: false, name: 'Child' }
    ]);

    const payload = serializeTreeExecutionRequest({
      opId: 'tree-compact',
      rowCount: 2,
      dataProvider: provider,
      treeData: {
        enabled: true,
        idField: 'id',
        parentIdField: 'parentId',
        hasChildrenField: 'hasChildren',
        defaultExpanded: true
      },
      lazyChildrenBatches: [
        {
          parentNodeKey: 1,
          rows: [{ id: 3, parentId: 1, hasChildren: false, name: 'Lazy child' }]
        }
      ]
    });

    expect(payload).not.toBeNull();
    expect(payload && 'kind' in payload ? payload.kind : 'rows').toBe('compact');
    expect(payload && 'kind' in payload && payload.kind === 'compact' ? payload.columnValuesById.id : null).toEqual([1, 2]);
    expect(
      payload && 'kind' in payload && payload.kind === 'compact' ? payload.lazyChildrenBatches?.[0]?.rows?.[0] : null
    ).toEqual({
      id: 3,
      parentId: 1,
      hasChildren: false,
      [WORKER_TREE_LAZY_ROW_REF_FIELD]: createWorkerTreeLazyRowRef(1, 0)
    });

    const request = createTreeExecutionRequest('tree-compact', payload!);
    expect(request.dataProvider.getValue(0, 'id')).toBe(1);
    expect(request.dataProvider.getValue(1, 'parentId')).toBe(1);
    expect(request.lazyChildrenBatches?.[0]?.rows?.[0]).toEqual({
      id: 3,
      parentId: 1,
      hasChildren: false,
      [WORKER_TREE_LAZY_ROW_REF_FIELD]: createWorkerTreeLazyRowRef(1, 0)
    });
  });
});
