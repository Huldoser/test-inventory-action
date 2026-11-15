import { describe, expect, it } from 'vitest';
import { discover } from '../src/discover.ts';
import { scanRevision } from '../src/scan.ts';
import { folder, write } from './project.ts';

describe("a revision's scan", () => {
  it("lists each file's tests once, under the runner whose config places it", async () => {
    const root = folder();
    const watchlist = "describe('watchlist', () => {\n  it('adds a symbol', () => {});\n});\n";
    write(root, {
      'package.json': JSON.stringify({ devDependencies: { jest: '30.2.0', cypress: '15.6.0', mocha: '11.7.0' } }),
      'jest.config.js': "module.exports = { testMatch: ['**/unit/**/*.test.js'] };\n",
      'cypress.config.js': "module.exports = { e2e: { specPattern: 'cypress/e2e/**/*.cy.js' } };\n",
      'cypress/e2e/watchlist.cy.js': watchlist,
      'unit/fees.test.js': "describe('fees', () => {\n  it('charges the minimum commission', () => {});\n});\n",
      'tests/notes.test.js': '// describe the fee tiers here once the broker confirms them\n',
    });
    const scan = await scanRevision(root, discover(root), AbortSignal.timeout(60_000));
    const owned = Object.fromEntries(
      Object.entries(scan.inventories).map(([framework, inventory]) => [
        framework,
        inventory.tests.map((test) => test.relativeFilePath),
      ]),
    );
    expect(owned).toEqual({ cypress: ['cypress/e2e/watchlist.cy.js'], jest: ['unit/fees.test.js'], mocha: [] });
  });
});

describe('a revision with a file two runners read', () => {
  it("gives the file to the runner that refuses it over one that reads it as another framework's", async () => {
    const root = folder();
    write(root, {
      'package.json': JSON.stringify({ devDependencies: { vitest: '5.0.5', '@playwright/test': '1.63.0' } }),
      'vitest.config.ts': "export default { test: { include: ['**/*.spec.ts'] } };\n",
      'playwright.config.ts': "export default { testDir: 'tests' };\n",
      // A Playwright test extended with fixtures reads as a Vitest `test.extend` too, so Vitest counts its tests.
      'e2e/checkout.spec.ts': [
        "import { test as base } from '@playwright/test';",
        'const test = base.extend<{ plan: string }>({ plan: async ({}, use) => use("premium") });',
        "test('pays for a watchlist upgrade', async ({ plan }) => {});",
        '',
      ].join('\n'),
    });
    const scan = await scanRevision(root, discover(root), AbortSignal.timeout(60_000));
    expect(scan.inventories.playwright?.tests.map((test) => test.fullName)).toEqual(['pays for a watchlist upgrade']);
    expect(scan.inventories.vitest?.tests).toEqual([]);
  });

  it('scans nothing in a revision without possible test files', async () => {
    const root = folder();
    write(root, {
      'package.json': JSON.stringify({ devDependencies: { vitest: '5.0.5' } }),
      'src/fees.ts': 'export const fee = 1;\n',
    });
    const scan = await scanRevision(root, discover(root), AbortSignal.timeout(60_000));
    expect(scan).toEqual({ root, inventories: {}, statuses: new Map() });
  });
});
