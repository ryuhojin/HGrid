import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = process.cwd();
const ALLOWLIST_PATH = path.resolve(ROOT_DIR, 'tests/fixtures/security/dependency-allowlist.json');
const MIN_SEVERITIES = new Set(['high', 'critical']);

function readAllowlist() {
  try {
    const raw = readFileSync(ALLOWLIST_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const advisories = Array.isArray(parsed?.advisories) ? parsed.advisories : [];
    return new Map(
      advisories
        .filter((entry) => entry && typeof entry.id === 'string')
        .map((entry) => [
          entry.id,
          {
            module: typeof entry.module === 'string' ? entry.module : '',
            reason: typeof entry.reason === 'string' ? entry.reason : ''
          }
        ])
    );
  } catch {
    return new Map();
  }
}

function runAudit() {
  const result = spawnSync(
    'pnpm',
    ['audit', '--json', '--prod', '--audit-level', 'high', '--ignore-registry-errors'],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8'
    }
  );

  const rawOutput = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (rawOutput.length === 0) {
    return {
      status: result.status ?? 0,
      report: null
    };
  }

  return {
    status: result.status ?? 0,
    report: JSON.parse(rawOutput)
  };
}

function main() {
  const allowlist = readAllowlist();
  const { status, report } = runAudit();
  if (!report || typeof report !== 'object') {
    if (status === 0) {
      console.log('[dependency-scan] OK');
      return;
    }

    throw new Error('dependency audit did not produce a JSON report');
  }

  const advisories = Object.values(report.advisories ?? {}).filter(
    (entry) => entry && MIN_SEVERITIES.has(String(entry.severity))
  );

  const blocked = [];
  const allowed = [];

  for (let index = 0; index < advisories.length; index += 1) {
    const advisory = advisories[index];
    const advisoryId = String(advisory.id);
    const allowedEntry = allowlist.get(advisoryId);
    if (allowedEntry && (allowedEntry.module.length === 0 || allowedEntry.module === advisory.module_name)) {
      allowed.push({
        id: advisoryId,
        module: advisory.module_name,
        severity: advisory.severity,
        reason: allowedEntry.reason
      });
      continue;
    }

    blocked.push({
      id: advisoryId,
      module: advisory.module_name,
      severity: advisory.severity,
      title: advisory.title,
      url: advisory.url
    });
  }

  if (allowed.length > 0) {
    for (let index = 0; index < allowed.length; index += 1) {
      const entry = allowed[index];
      console.log(
        `[dependency-scan] allowlisted ${entry.severity} advisory ${entry.id} (${entry.module}) - ${entry.reason}`
      );
    }
  }

  if (blocked.length > 0) {
    for (let index = 0; index < blocked.length; index += 1) {
      const entry = blocked[index];
      console.error(
        `[dependency-scan] ${entry.severity} advisory ${entry.id} (${entry.module}) ${entry.title} ${entry.url}`
      );
    }
    process.exit(1);
  }

  console.log('[dependency-scan] OK');
}

main();
