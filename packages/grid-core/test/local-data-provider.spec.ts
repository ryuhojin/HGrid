import { describe, expect, it } from 'vitest';
import { LocalDataProvider } from '../src/data/local-data-provider';

describe('LocalDataProvider', () => {
  it('supports required read methods', () => {
    const provider = new LocalDataProvider([
      { id: 1, name: 'A', score: 10 },
      { id: 2, name: 'B', score: 20 }
    ]);

    expect(provider.getRowCount()).toBe(2);
    expect(provider.getRowKey(1)).toBe(2);
    expect(provider.getValue(0, 'name')).toBe('A');
  });

  it('supports value writes and transactions', () => {
    const provider = new LocalDataProvider([{ id: 1, name: 'A' }]);

    provider.setValue(0, 'name', 'AA');
    expect(provider.getValue(0, 'name')).toBe('AA');

    provider.applyTransactions([
      { type: 'add', rows: [{ id: 2, name: 'B' }] },
      { type: 'updateCell', index: 0, columnId: 'name', value: 'AAA' },
      { type: 'update', index: 1, row: { id: 2, name: 'BB' } },
      { type: 'remove', index: 0, count: 1 }
    ]);

    expect(provider.getRowCount()).toBe(1);
    expect(provider.getValue(0, 'name')).toBe('BB');
    expect(provider.getRowKey(0)).toBe(2);
  });
});
