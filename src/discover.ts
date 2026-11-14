import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Framework } from 'test-inventory';

/** The packages that tell which runner a project uses, in a package.json or an import. */
const RUNNER_PACKAGES = new Map<string, Framework>([
  ['@playwright/test', 'playwright'],
  ['playwright', 'playwright'],
  ['playwright/test', 'playwright'],
  ['vitest', 'vitest'],
  ['@effect/vitest', 'vitest'],
  ['jest', 'jest'],
  ['@jest/globals', 'jest'],
  ['@fast-check/jest', 'jest'],
  ['mocha', 'mocha'],
  ['jasmine', 'jasmine'],
  ['jasmine-core', 'jasmine'],
  ['cypress', 'cypress'],
  ['webdriverio', 'webdriverio'],
  ['@wdio/cli', 'webdriverio'],
  ['node:test', 'node'],
  ['bun:test', 'bun'],
]);
const CONFIG_RUNNERS: Record<string, Framework> = {
  jest: 'jest',
  vitest: 'vitest',
  playwright: 'playwright',
  cypress: 'cypress',
  wdio: 'webdriverio',
  '.mocharc': 'mocha',
  jasmine: 'jasmine',
};
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', 'coverage']);
const CONFIG =
  /^(jest|vitest|playwright|cypress|wdio|\.mocharc|jasmine)\.?(?:config)?[.\w-]*\.(?:[cm]?[jt]s|json|ya?ml)$/;
const TEST_PATH =
  /(?:^|\/)(?:__tests__|tests?|specs?|e2e|cypress)\/|[._-](?:test|spec|e2e|cy)\.[cm]?[jt]sx?$|Spec\.js$/;
const SOURCE = /\.[cm]?[jt]sx?$/;
const DECLARES = /\b(?:test|it|describe|suite|specify|context)\b/;
const IMPORTS = /(?:from\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;

/** The runners a repository uses, and the files, from its root with `/`, that may declare tests. */
export interface Discovery {
  runners: Framework[];
  files: string[];
}

/**
 * Finds the runners a repository uses, from its package.json dependencies, its runner configs and the runners its
 * files import, and the files that may declare tests: under a test folder or named like a test, or importing a runner,
 * and calling a test function. Each runner's scan then decides which of them it runs.
 */
export function discover(root: string): Discovery {
  const runners = new Set<Framework>();
  const files: string[] = [];
  const walk = (folder: string) => {
    for (const item of readdirSync(folder, { withFileTypes: true })) {
      if (SKIPPED_FOLDERS.has(item.name)) continue;
      const file = path.join(folder, item.name);
      if (item.isDirectory()) {
        walk(file);
        continue;
      }
      if (!item.isFile()) continue;
      const config = CONFIG.exec(item.name);
      if (config) runners.add(CONFIG_RUNNERS[config[1]]);
      if (item.name === 'package.json') {
        for (const name of dependenciesOf(file)) {
          const runner = RUNNER_PACKAGES.get(name);
          if (runner) runners.add(runner);
        }
      } else if (SOURCE.test(item.name)) {
        const relative = path.relative(root, file).replaceAll('\\', '/');
        const code = readFileSync(file, 'utf8');
        const imported = [...code.matchAll(IMPORTS)].flatMap((match) => RUNNER_PACKAGES.get(match[1]) ?? []);
        for (const runner of imported) runners.add(runner);
        if ((TEST_PATH.test(relative) || imported.length > 0) && DECLARES.test(code)) files.push(relative);
      }
    }
  };
  walk(root);
  return { runners: [...runners].sort(), files: files.sort() };
}

/** The names a package.json depends on, in any of its dependency lists; none when it can't be read. */
function dependenciesOf(manifest: string): string[] {
  try {
    const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>;
    return ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((key) => {
      const list = pkg[key];
      return list && typeof list === 'object' ? Object.keys(list) : [];
    });
  } catch {
    return [];
  }
}
