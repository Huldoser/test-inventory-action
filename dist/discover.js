import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
/** The packages that tell which runner a project uses, in a package.json or an import. */
const RUNNER_PACKAGES = new Map([
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
/**
 * A runner's config file name, with variants such as `vitest.config.e2e.ts`, `playwright-ct.config.ts` or
 * `wdio.local.conf.ts`; a test or source file named after a runner, such as `jest_results.spec.js` or `jasmine.js`,
 * isn't one.
 */
const configOf = (runner) => new RegExp(`^${runner}(?:[.-][\\w-]+)*[.-](?:config|conf|workspace)(?:\\.[\\w-]+)?\\.(?:[cm]?[jt]s|json)$`);
const CONFIGS = [
    [configOf('jest'), 'jest'],
    [configOf('vitest'), 'vitest'],
    [configOf('playwright'), 'playwright'],
    [configOf('cypress'), 'cypress'],
    [/^cypress\.json$/, 'cypress'],
    [configOf('wdio'), 'webdriverio'],
    [/^\.mocharc\.(?:[cm]?js|jsonc?|ya?ml)$/, 'mocha'],
    [/^jasmine\.json$/, 'jasmine'],
];
const SKIPPED_FOLDERS = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', 'coverage']);
const TEST_PATH = /(?:^|\/)(?:__tests__|tests?|specs?|e2e|cypress)\/|[._-](?:test|spec|e2e|cy)\.[cm]?[jt]sx?$|Spec\.js$/;
const SOURCE = /\.[cm]?[jt]sx?$/;
const DECLARES = /\b(?:test|it|describe|suite|specify|context)\b/;
const IMPORTS = /(?:from\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"]+)['"]/g;
/**
 * Finds the runners a repository uses, from its package.json dependencies and its runner configs, and the files that
 * may declare tests: under a test folder or named like a test, or importing a runner, and calling a test function.
 * Node's and Bun's runners come with the runtime, so a file importing one is enough; an example importing another
 * runner the repository doesn't install doesn't make it one it uses. Each runner's scan then decides which files it
 * runs.
 */
export function discover(root) {
    const runners = new Set();
    const files = [];
    const walk = (folder) => {
        for (const item of readdirSync(folder, { withFileTypes: true })) {
            if (SKIPPED_FOLDERS.has(item.name))
                continue;
            const file = path.join(folder, item.name);
            if (item.isDirectory()) {
                walk(file);
                continue;
            }
            if (!item.isFile())
                continue;
            for (const [config, runner] of CONFIGS)
                if (config.test(item.name))
                    runners.add(runner);
            if (item.name === 'package.json') {
                for (const name of dependenciesOf(file)) {
                    const runner = RUNNER_PACKAGES.get(name);
                    if (runner)
                        runners.add(runner);
                }
            }
            else if (SOURCE.test(item.name)) {
                const relative = path.relative(root, file).replaceAll('\\', '/');
                const code = readFileSync(file, 'utf8');
                const imported = [...code.matchAll(IMPORTS)].flatMap((match) => RUNNER_PACKAGES.get(match[1]) ?? []);
                for (const runner of imported)
                    if (runner === 'node' || runner === 'bun')
                        runners.add(runner);
                if ((TEST_PATH.test(relative) || imported.length > 0) && DECLARES.test(code))
                    files.push(relative);
            }
        }
    };
    walk(root);
    return { runners: [...runners].sort(), files: files.sort() };
}
/** The names a package.json depends on, in any of its dependency lists; none when it can't be read. */
function dependenciesOf(manifest) {
    try {
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
        return ['dependencies', 'devDependencies', 'peerDependencies'].flatMap((key) => {
            const list = pkg[key];
            return list && typeof list === 'object' ? Object.keys(list) : [];
        });
    }
    catch {
        return [];
    }
}
