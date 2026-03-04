import { cpSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const sourcePath = resolve(packageRoot, 'src/grid.css');
const distPath = resolve(packageRoot, 'dist/grid.css');

mkdirSync(dirname(distPath), { recursive: true });
cpSync(sourcePath, distPath);
