import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROWS = 20_000;
const DEFAULT_SEED = 20_260_309;
const STATUS_VALUES = ['active', 'idle', 'pending', 'blocked'];
const REGION_VALUES = ['KR', 'US', 'JP', 'DE', 'FR', 'GB'];
const DAY_MS = 24 * 60 * 60 * 1000;

function parseArgs(argv) {
  const options = {
    rows: DEFAULT_ROWS,
    seed: DEFAULT_SEED,
    out: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--rows') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value < 1) {
        throw new Error(`Invalid --rows value: ${argv[index + 1] ?? ''}`);
      }
      options.rows = Math.floor(value);
      index += 1;
      continue;
    }

    if (arg === '--seed') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid --seed value: ${argv[index + 1] ?? ''}`);
      }
      options.seed = Math.floor(value);
      index += 1;
      continue;
    }

    if (arg === '--out') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing --out path value');
      }
      options.out = value;
      index += 1;
      continue;
    }
  }

  return options;
}

function createLcg(seed) {
  let state = seed >>> 0;
  if (state === 0) {
    state = 1;
  }

  return function nextRandom() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createRow(index, random, baseTimeMs) {
  const status = STATUS_VALUES[Math.floor(random() * STATUS_VALUES.length)];
  const region = REGION_VALUES[Math.floor(random() * REGION_VALUES.length)];
  const value = Math.floor(random() * 100000);
  const score = Number((random() * 1000).toFixed(2));
  const updatedAt = new Date(baseTimeMs - Math.floor(random() * 365) * DAY_MS).toISOString();

  return {
    id: index + 1,
    name: `Bench-${index + 1}`,
    status,
    region,
    value,
    score,
    updatedAt
  };
}

function generateBenchRows(rows, seed) {
  const random = createLcg(seed);
  const baseTimeMs = Date.UTC(2026, 0, 1, 0, 0, 0);
  const data = new Array(rows);
  for (let index = 0; index < rows; index += 1) {
    data[index] = createRow(index, random, baseTimeMs);
  }
  return data;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const rows = generateBenchRows(options.rows, options.seed);

  if (!options.out) {
    console.log(
      JSON.stringify(
        {
          rows: options.rows,
          seed: options.seed,
          sample: rows.slice(0, Math.min(5, rows.length))
        },
        null,
        2
      )
    );
    return;
  }

  const absoluteOut = path.resolve(process.cwd(), options.out);
  mkdirSync(path.dirname(absoluteOut), { recursive: true });
  writeFileSync(
    absoluteOut,
    `${JSON.stringify({ rows: options.rows, seed: options.seed, generatedAt: new Date().toISOString(), data: rows })}\n`,
    'utf8'
  );

  console.log(`[bench-data] wrote ${rows.length} rows -> ${absoluteOut}`);
}

main();
