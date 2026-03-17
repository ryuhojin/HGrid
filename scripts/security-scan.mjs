import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const TARGET_DIRS = ['packages/grid-core/src', 'packages/grid-react/src', 'packages/grid-vue/src', 'packages/grid-plugins', 'scripts', 'tests'];
const ALLOWED_EXTENSIONS = new Set(['.ts', '.js', '.mjs']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git']);
const IGNORED_FILES = new Set(['scripts/security-scan.mjs', 'scripts/dependency-scan.mjs', 'scripts/security-fuzz.mjs']);
const HTML_SINK_SOURCE_PREFIXES = ['packages/grid-core/src', 'packages/grid-react/src', 'packages/grid-vue/src', 'packages/grid-plugins'];

const SECURITY_RULES = [
  {
    name: 'eval',
    regex: /\beval\s*\(/g
  },
  {
    name: 'new Function',
    regex: /\bnew\s+Function\s*\(/g
  },
  {
    name: 'setTimeout(string)',
    regex: /\bsetTimeout\s*\(\s*(['"`])/g
  },
  {
    name: 'setInterval(string)',
    regex: /\bsetInterval\s*\(\s*(['"`])/g
  },
  {
    name: 'dangerouslySetInnerHTML',
    regex: /\bdangerouslySetInnerHTML\b/g
  },
  {
    name: 'innerHTML sink',
    regex: /\.innerHTML\s*=/g,
    sourceOnly: true,
    allowedPaths: new Set(['packages/grid-core/src/render/dom-renderer-cell-binding.ts'])
  },
  {
    name: 'outerHTML sink',
    regex: /\.outerHTML\s*=/g,
    sourceOnly: true
  },
  {
    name: 'insertAdjacentHTML sink',
    regex: /\.insertAdjacentHTML\s*\(/g,
    sourceOnly: true
  },
  {
    name: 'createContextualFragment sink',
    regex: /\bcreateContextualFragment\s*\(/g,
    sourceOnly: true
  }
];

const violations = [];

function walkDirectory(absoluteDirPath) {
  const entries = readdirSync(absoluteDirPath, { withFileTypes: true });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.name.startsWith('.')) {
      continue;
    }

    const absolutePath = path.join(absoluteDirPath, entry.name);
    const relativePath = path.relative(ROOT_DIR, absolutePath);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      walkDirectory(absolutePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (IGNORED_FILES.has(relativePath)) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      continue;
    }

    scanFile(absolutePath, relativePath);
  }
}

function scanFile(absolutePath, relativePath) {
  const content = readFileSync(absolutePath, 'utf8');
  const isSourceFile = HTML_SINK_SOURCE_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
  for (let patternIndex = 0; patternIndex < SECURITY_RULES.length; patternIndex += 1) {
    const pattern = SECURITY_RULES[patternIndex];
    if (pattern.sourceOnly === true && !isSourceFile) {
      continue;
    }

    if (pattern.allowedPaths?.has(relativePath)) {
      continue;
    }

    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match = regex.exec(content);
    while (match) {
      const matchIndex = match.index;
      const lineNumber = content.slice(0, matchIndex).split('\n').length;
      violations.push({
        pattern: pattern.name,
        path: relativePath,
        line: lineNumber
      });
      match = regex.exec(content);
    }
  }
}

function main() {
  for (let index = 0; index < TARGET_DIRS.length; index += 1) {
    const relativeDir = TARGET_DIRS[index];
    const absoluteDir = path.resolve(ROOT_DIR, relativeDir);
    try {
      walkDirectory(absoluteDir);
    } catch {
      continue;
    }
  }

  if (violations.length > 0) {
    for (let index = 0; index < violations.length; index += 1) {
      const violation = violations[index];
      console.error(`[security-scan] ${violation.pattern} is not allowed: ${violation.path}:${violation.line}`);
    }
    process.exit(1);
  }

  console.log('[security-scan] OK');
}

main();
