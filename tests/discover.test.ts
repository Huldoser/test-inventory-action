import { symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { discover } from '../src/discover.ts';
import { folder, write } from './project.ts';

describe('the runners and possible test files of a repository', () => {
  it('finds runners by package.json, config and import, and test files by path or runner import', () => {
    const root = folder();
    write(root, {
      'package.json': JSON.stringify({
        dependencies: { zod: '4.1.12' },
        devDependencies: { vitest: '5.0.5' },
        peerDependencies: { '@wdio/cli': '9.20.0' },
      }),
      'apps/admin/package.json': '{ "devDependencies": ',
      'apps/web/.mocharc.yml': 'spec: test/**/*.spec.js\n',
      'apps/web/playwright.config.ts': 'export default {};\n',
      'src/fees.ts': 'export const commission = (quantity: number) => Math.max(quantity * 0.005, 1);\n',
      'src/fees.unit.ts': "import { test } from 'node:test';\ntest('charges the minimum commission', () => {});\n",
      'scripts/replay.ts': "import { describe } from 'bun:test';\ndescribe('replay', () => {});\n",
      'tests/fees.test.ts': "it('charges per share above the minimum', () => {});\n",
      'tests/helpers/market-hours.ts': 'export const isMarketClosed = () => false;\n',
      'node_modules/vitest/index.test.js': "it('is not the project', () => {});\n",
      'dist/fees.test.js': "it('is built output', () => {});\n",
    });
    symlinkSync(path.join(root, 'tests/fees.test.ts'), path.join(root, 'tests/fees-link.test.ts'));
    expect(discover(root)).toEqual({
      runners: ['bun', 'mocha', 'node', 'playwright', 'vitest', 'webdriverio'],
      files: ['scripts/replay.ts', 'src/fees.unit.ts', 'tests/fees.test.ts'],
    });
  });
});
