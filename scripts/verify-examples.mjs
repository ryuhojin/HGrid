import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const EXAMPLES_DIR = path.resolve(ROOT_DIR, 'examples');
const REGISTRY_PATH = path.resolve(EXAMPLES_DIR, 'registry.json');
const FILE_PATTERN = /^example([1-9]\d{0,2})\.html$/;

function fail(message) {
  console.error(`[verify-examples] ${message}`);
}

function getExampleFiles() {
  if (!existsSync(EXAMPLES_DIR)) {
    return [];
  }

  return readdirSync(EXAMPLES_DIR).filter((fileName) => fileName.endsWith('.html'));
}

function readRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    return null;
  }

  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  return JSON.parse(raw);
}

function main() {
  const errors = [];
  const files = getExampleFiles();

  const validFileEntries = [];
  const fileNumberSet = new Set();

  for (const fileName of files) {
    const match = fileName.match(FILE_PATTERN);
    if (!match) {
      errors.push(`Invalid example filename: ${fileName}`);
      continue;
    }

    const number = Number(match[1]);
    if (number < 1 || number > 999) {
      errors.push(`Example number out of range (1..999): ${fileName}`);
      continue;
    }

    if (fileNumberSet.has(number)) {
      errors.push(`Duplicate example number in files: ${number}`);
      continue;
    }

    fileNumberSet.add(number);
    validFileEntries.push({ number, file: fileName });
  }

  validFileEntries.sort((a, b) => a.number - b.number);

  for (let index = 0; index < validFileEntries.length; index += 1) {
    const expected = index + 1;
    const current = validFileEntries[index].number;
    if (current !== expected) {
      errors.push(`Missing example number: example${expected}.html`);
      break;
    }
  }

  let registry;
  try {
    registry = readRegistry();
  } catch (error) {
    errors.push(`Failed to parse examples/registry.json: ${error.message}`);
  }

  if (!registry) {
    errors.push('Missing examples/registry.json');
  } else if (!Array.isArray(registry.examples)) {
    errors.push('examples/registry.json must contain an examples array');
  } else {
    const registryFileSet = new Set();
    const registryNumberSet = new Set();

    for (const entry of registry.examples) {
      if (typeof entry.file !== 'string' || typeof entry.number !== 'number') {
        errors.push('Each registry entry must include { file: string, number: number }');
        continue;
      }

      if (registryFileSet.has(entry.file)) {
        errors.push(`Duplicate registry file entry: ${entry.file}`);
      }
      registryFileSet.add(entry.file);

      if (registryNumberSet.has(entry.number)) {
        errors.push(`Duplicate registry number entry: ${entry.number}`);
      }
      registryNumberSet.add(entry.number);

      const match = entry.file.match(FILE_PATTERN);
      if (!match) {
        errors.push(`Registry file name format violation: ${entry.file}`);
      } else {
        const fileNumber = Number(match[1]);
        if (fileNumber !== entry.number) {
          errors.push(`Registry number mismatch: ${entry.file} has number ${fileNumber} but registry has ${entry.number}`);
        }
      }

      if (!existsSync(path.resolve(EXAMPLES_DIR, entry.file))) {
        errors.push(`Registry references missing file: ${entry.file}`);
      }
    }

    for (const fileEntry of validFileEntries) {
      const hasRegistryEntry = registry.examples.some(
        (entry) => entry.file === fileEntry.file && entry.number === fileEntry.number
      );

      if (!hasRegistryEntry) {
        errors.push(`Registry missing entry for ${fileEntry.file}`);
      }
    }
  }

  if (errors.length > 0) {
    for (const message of errors) {
      fail(message);
    }
    process.exit(1);
  }

  console.log('[verify-examples] OK');
}

main();
