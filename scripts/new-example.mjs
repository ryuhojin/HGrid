import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const EXAMPLES_DIR = path.resolve(ROOT_DIR, 'examples');
const REGISTRY_PATH = path.resolve(EXAMPLES_DIR, 'registry.json');
const FILE_PATTERN = /^example([1-9]\d{0,2})\.html$/;

function readRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return { examples: [] };
  }

  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed || !Array.isArray(parsed.examples)) {
    return { examples: [] };
  }

  return parsed;
}

function getNextExampleNumber() {
  if (!existsSync(EXAMPLES_DIR)) {
    return 1;
  }

  const files = readdirSync(EXAMPLES_DIR);
  const numbers = files
    .map((fileName) => {
      const match = fileName.match(FILE_PATTERN);
      return match ? Number(match[1]) : null;
    })
    .filter((numberValue) => numberValue !== null);

  if (numbers.length === 0) {
    return 1;
  }

  return Math.max(...numbers) + 1;
}

function buildExampleTemplate(exampleNumber, title) {
  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="../packages/grid-core/dist/grid.css" />
    <style>
      body {
        margin: 24px;
        font-family: "Segoe UI", "Noto Sans KR", sans-serif;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 20px;
      }

      #grid {
        width: 760px;
      }
    </style>
  </head>
  <body>
    <h1>${title}</h1>
    <div id="grid"></div>

    <script src="../packages/grid-core/dist/grid.umd.js"></script>
    <script>
      const columns = [
        { id: 'id', header: 'ID', width: 100, type: 'number' },
        { id: 'name', header: 'Name', width: 240, type: 'text' },
        { id: 'status', header: 'Status', width: 180, type: 'text' },
        { id: 'updatedAt', header: 'Updated At', width: 220, type: 'date' }
      ];

      const rowData = Array.from({ length: 1000 }, (_, index) => ({
        id: index + 1,
        name: 'Customer-' + (index + 1),
        status: index % 2 === 0 ? 'active' : 'idle',
        updatedAt: new Date(Date.now() - index * 60000).toISOString()
      }));

      const grid = new HGrid.Grid(document.getElementById('grid'), {
        columns,
        rowData,
        height: 420,
        rowHeight: 28,
        overscan: 8
      });

      grid.on('cellClick', (event) => {
        console.log('cellClick', event);
      });
    </script>
  </body>
</html>
`;
}

function main() {
  mkdirSync(EXAMPLES_DIR, { recursive: true });

  const nextNumber = getNextExampleNumber();
  if (nextNumber > 999) {
    throw new Error('Example number overflow: maximum is example999.html');
  }

  const titleFromArgs = process.argv.slice(2).join(' ').trim();
  const title = titleFromArgs.length > 0 ? titleFromArgs : `Example ${nextNumber} - Basic UMD Grid`;

  const fileName = `example${nextNumber}.html`;
  const filePath = path.resolve(EXAMPLES_DIR, fileName);

  if (existsSync(filePath)) {
    throw new Error(`Example file already exists: ${fileName}`);
  }

  writeFileSync(filePath, buildExampleTemplate(nextNumber, title), 'utf8');

  const registry = readRegistry();
  registry.examples = registry.examples.filter((entry) => entry.file !== fileName && entry.number !== nextNumber);
  registry.examples.push({
    number: nextNumber,
    file: fileName,
    title,
    tags: ['phase0', 'umd'],
    plugins: []
  });
  registry.examples.sort((a, b) => a.number - b.number);

  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');

  console.log(`Created ${fileName} and updated examples/registry.json`);
}

main();
