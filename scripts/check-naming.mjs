import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const TARGET_DIRS = ['packages', 'examples', 'scripts', 'docs', 'tests'];
const IGNORED_DIR_NAMES = new Set(['node_modules', 'dist', '.git']);

const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TS_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/;
const WORKER_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.worker\.ts$/;
const SPEC_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.spec\.ts$/;
const CSS_FILE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.css$/;
const EXAMPLE_FILE_PATTERN = /^example([1-9]\d{0,2})\.html$/;

const errors = [];

function walkDirectory(directoryPath) {
  const entries = readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }

    const absolutePath = path.join(directoryPath, entry.name);
    const relativePath = path.relative(ROOT_DIR, absolutePath);

    if (entry.isDirectory()) {
      if (IGNORED_DIR_NAMES.has(entry.name)) {
        continue;
      }

      if (!KEBAB_CASE_PATTERN.test(entry.name)) {
        errors.push(`Directory name is not lower-kebab-case: ${relativePath}`);
      }

      walkDirectory(absolutePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    validateFileName(relativePath, entry.name);
  }
}

function validateFileName(relativePath, fileName) {
  if (relativePath.startsWith('examples/')) {
    if (fileName === 'registry.json') {
      return;
    }

    if (fileName.endsWith('.html') && !EXAMPLE_FILE_PATTERN.test(fileName)) {
      errors.push(`Example file must match example{N}.html: ${relativePath}`);
    }

    return;
  }

  if (fileName.endsWith('.worker.ts')) {
    if (!WORKER_FILE_PATTERN.test(fileName)) {
      errors.push(`Worker file must be lower-kebab-case.worker.ts: ${relativePath}`);
    }
    return;
  }

  if (fileName.endsWith('.spec.ts')) {
    if (!SPEC_FILE_PATTERN.test(fileName)) {
      errors.push(`Test file must be lower-kebab-case.spec.ts: ${relativePath}`);
    }
    return;
  }

  if (fileName.endsWith('.ts')) {
    if (!TS_FILE_PATTERN.test(fileName)) {
      errors.push(`TypeScript file must be lower-kebab-case.ts: ${relativePath}`);
    }
    return;
  }

  if (fileName.endsWith('.css')) {
    if (!CSS_FILE_PATTERN.test(fileName)) {
      errors.push(`CSS file must be lower-kebab-case.css: ${relativePath}`);
    }
  }
}

function main() {
  for (const targetDirectory of TARGET_DIRS) {
    const absoluteTargetPath = path.resolve(ROOT_DIR, targetDirectory);

    try {
      const stats = statSync(absoluteTargetPath);
      if (!stats.isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }

    walkDirectory(absoluteTargetPath);
  }

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(`[check-naming] ${message}`);
    }
    process.exit(1);
  }

  console.log('[check-naming] OK');
}

main();
