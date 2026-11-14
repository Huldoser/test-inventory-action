import { describe, expect, it } from 'vitest';
import { scan, type Framework, type Inventory } from 'test-inventory';
import { fileStatuses } from '../src/statuses.ts';
import { folder, write } from './project.ts';

const UNIT =
  "import { expect, test } from 'vitest';\ntest('charges the minimum fee', () => {\n  expect(1).toBe(1);\n});\n";

async function statuses(files: Record<string, string>, frameworks: Framework[]) {
  const root = folder();
  write(root, files);
  const patterns = Object.keys(files).filter((file) => /\.(ts|js)$/.test(file) && !file.includes('config'));
  const inventories: Partial<Record<Framework, Inventory>> = {};
  for (const framework of frameworks) inventories[framework] = await scan({ root, framework, patterns });
  return Object.fromEntries(fileStatuses(inventories));
}

describe("what the action says about a file a runner's config refuses", () => {
  it('names why it leaves a refused file out, and reports the rest as not run', async () => {
    expect(
      await statuses(
        {
          'package.json': JSON.stringify({ devDependencies: { vitest: '5.0.5' } }),
          'vitest.config.ts': "export default { test: { include: ['tests/**/*.test.ts'] } };\n",
          'tests/orders.test.ts': "import './shared/order-cases.ts';\n" + UNIT,
          'tests/shared/order-cases.ts': UNIT,
          'tests/fixtures/broker/fill.ts': UNIT,
          'tests/types/order.test-d.ts':
            "import { expectTypeOf, test } from 'vitest';\ntest('an order has a side', () => {\n  expectTypeOf<'buy'>().toEqualTypeOf<'buy'>();\n});\n",
          'scripts/replay-feed.ts': UNIT,
        },
        ['vitest'],
      ),
    ).toEqual({
      'scripts/replay-feed.ts': 'wont-run',
      'tests/fixtures/broker/fill.ts': 'fixture',
      'tests/shared/order-cases.ts': 'helper',
      'tests/types/order.test-d.ts': 'type-test',
    });
  });

  it("counts a file another runner's config runs, but not one a runner without a config or of another framework claims", async () => {
    const global = "describe('watchlist', () => {\n  it('adds a symbol', () => {});\n});\n";
    expect(
      await statuses(
        {
          'package.json': JSON.stringify({ devDependencies: { jest: '30.2.0', mocha: '11.7.0' } }),
          'jest.config.js': "module.exports = { testMatch: ['**/unit/**/*.test.js'] };\n",
          'cypress.config.js': "module.exports = { e2e: { specPattern: 'cypress/e2e/**/*.cy.js' } };\n",
          'cypress/e2e/watchlist.cy.js': global,
          'scripts/feed.test.js': global,
        },
        ['jest', 'cypress', 'mocha'],
      ),
    ).toEqual({
      'cypress/e2e/watchlist.cy.js': 'collected-by-another-runner',
      'scripts/feed.test.js': 'runner-without-config',
    });
  });

  it("doesn't count a file as collected by a runner that reports it as another framework's", async () => {
    expect(
      await statuses(
        {
          'package.json': JSON.stringify({ devDependencies: { vitest: '5.0.5', '@playwright/test': '1.63.0' } }),
          'vitest.config.ts': "export default { test: { include: ['**/*.spec.ts'] } };\n",
          'playwright.config.ts': "export default { testDir: 'tests' };\n",
          'e2e/checkout.spec.ts':
            "import { test } from '@playwright/test';\ntest('pays for a watchlist upgrade', async () => {});\n",
        },
        ['playwright', 'vitest'],
      ),
    ).toEqual({ 'e2e/checkout.spec.ts': 'wont-run' });
  });
});
