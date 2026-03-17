import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { startStaticServer } from './static-server.mjs';

async function runClipboardFuzz(rootDir) {
  const server = await startStaticServer({ rootDir });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];

  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
  });

  try {
    await page.goto(`${server.url}/examples/example34.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__example34?.getSnapshot), null, { timeout: 15_000 });

    const payloads = [
      '<img src=x onerror=alert(1)>\tactive\nLiteral\tidle',
      'A\u0000\tB\r\n<script>alert(1)</script>\tidle\r\n',
      'javascript:alert(1)\tactive\n<svg onload=alert(1)>\tidle',
      '<b>unsafe</b>\tactive\n\t',
      'safe\tactive\nsafe-2\tidle'
    ];

    for (let index = 0; index < payloads.length; index += 1) {
      const payload = payloads[index];
      await page.evaluate(async (tsvText) => {
        await window.__example34.simulatePaste(tsvText);
      }, payload);
      const snapshot = await page.evaluate(() => window.__example34.getSnapshot());
      assert.equal(snapshot.hasInjectedHtmlNode, false, `clipboard fuzz payload ${index} should not inject HTML nodes`);
    }

    await page.evaluate(async () => {
      await window.__example34.simulateHtmlOnlyPaste();
    });
    const htmlOnlySnapshot = await page.evaluate(() => window.__example34.getSnapshot());
    assert.equal(htmlOnlySnapshot.hasInjectedHtmlNode, false, 'html-only fuzz payload should not inject HTML nodes');
    assert.equal(pageErrors.length, 0, `Unexpected page errors: ${pageErrors.join(' | ')}`);
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }
}

function createFakeGrid() {
  const columns = [
    { id: 'name', header: 'Name', width: 200, type: 'text' },
    { id: 'status', header: 'Status', width: 160, type: 'text' },
    { id: 'notes', header: 'Notes', width: 260, type: 'text' }
  ];
  const rows = [
    { name: 'Alpha', status: 'idle', notes: 'none' },
    { name: 'Beta', status: 'active', notes: 'clean' }
  ];

  const dataProvider = {
    getRowCount() {
      return rows.length;
    },
    getRowKey(dataIndex) {
      return dataIndex;
    },
    getValue(dataIndex, columnId) {
      return rows[dataIndex]?.[columnId];
    },
    setValue(dataIndex, columnId, value) {
      rows[dataIndex][columnId] = value;
    },
    applyTransactions(transactions) {
      for (let index = 0; index < transactions.length; index += 1) {
        const transaction = transactions[index];
        if (transaction.type === 'update') {
          rows[transaction.index] = { ...rows[transaction.index], ...transaction.row };
        } else if (transaction.type === 'add') {
          const insertIndex = typeof transaction.index === 'number' ? transaction.index : rows.length;
          rows.splice(insertIndex, 0, ...transaction.rows.map((row) => ({ ...row })));
        } else if (transaction.type === 'remove') {
          rows.splice(transaction.index, transaction.count ?? 1);
        } else if (transaction.type === 'updateCell') {
          rows[transaction.index][transaction.columnId] = transaction.value;
        }
      }
    },
    getRow(dataIndex) {
      return rows[dataIndex];
    }
  };

  return {
    grid: {
      getColumns() {
        return columns;
      },
      getDataProvider() {
        return dataProvider;
      },
      getViewRowCount() {
        return rows.length;
      },
      getDataIndex(viewRowIndex) {
        return viewRowIndex;
      },
      refresh() {
        return undefined;
      }
    },
    rows
  };
}

async function runExcelImportFuzz(rootDir) {
  const excelDistPath = path.resolve(rootDir, 'packages/grid-plugins/excel/dist/hgrid-excel.esm.js');
  const xlsxModulePath = path.resolve(rootDir, 'packages/grid-plugins/excel/node_modules/xlsx/xlsx.mjs');
  if (!existsSync(excelDistPath)) {
    throw new Error('Missing build output for excel plugin. Run pnpm build first.');
  }
  if (!existsSync(xlsxModulePath)) {
    throw new Error('Missing xlsx runtime for excel plugin fuzz check.');
  }

  const excelModule = await import(excelDistPath);
  const XLSX = await import(pathToFileURL(xlsxModulePath).href);
  const { importExcelToGrid } = excelModule;
  const { grid, rows } = createFakeGrid();
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['name', 'status', 'notes', '__proto__'],
    ['<img src=x onerror=alert(1)>', 'active', '<script>alert(1)</script>', 'polluted'],
    ['Gamma', 'idle', 'javascript:alert(1)', 'ignored']
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Security');

  const result = await importExcelToGrid(grid, workbook, {
    headerMappingPolicy: 'auto',
    skipUnknownColumns: true
  });

  assert.equal(result.issues.length, 0, 'excel import fuzz should not create mapping issues for ignored unknown columns');
  assert.equal(rows[0].name, '<img src=x onerror=alert(1)>', 'excel import should keep literal string values');
  assert.equal(rows[0].notes, '<script>alert(1)</script>', 'excel import should not execute or transform script markup');
  assert.equal(rows[1].notes, 'javascript:alert(1)', 'excel import should keep literal javascript URI text');
  assert.equal({}.polluted, undefined, 'excel import should not pollute Object prototype');
}

async function main() {
  const rootDir = process.cwd();
  const gridDistPath = path.resolve(rootDir, 'packages/grid-core/dist/grid.umd.js');
  if (!existsSync(gridDistPath)) {
    throw new Error('Missing build output: packages/grid-core/dist/grid.umd.js. Run pnpm build first.');
  }

  await runClipboardFuzz(rootDir);
  await runExcelImportFuzz(rootDir);
  console.log('[security-fuzz] OK');
}

main().catch((error) => {
  console.error('[security-fuzz] FAILED');
  console.error(error);
  process.exit(1);
});
