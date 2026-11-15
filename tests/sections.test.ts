import { describe, expect, it } from 'vitest';
import { discover } from '../src/discover.ts';
import { scanRevision } from '../src/scan.ts';
import { isQuiet, sectionsOf } from '../src/sections.ts';
import { folder, VITEST_PACKAGE, write } from './project.ts';

const CONFIG = "export default { test: { include: ['tests/**/*.test.ts'] } };\n";
const FEES =
  'export function commission(quantity: number, minimum = 1): number {\n  return Math.max(quantity * 0.005, minimum);\n}\n';
const FEES_TEST = (secAssertions: string) =>
  [
    "import { describe, expect, it } from 'vitest';",
    "import { commission } from '../../src/pnl/fees.ts';",
    '',
    "describe('fees', () => {",
    "  it('charges the minimum commission on a small order', () => {",
    '    expect(commission(10)).toBe(1);',
    '  });',
    '',
    "  it('adds the SEC fee only to sales', () => {",
    secAssertions,
    '  });',
    '});',
    '',
  ].join('\n');
const STOP_LOSS_TEST = (longStop: string, shortStop: string) =>
  [
    "import { describe, expect, it } from 'vitest';",
    '',
    "describe('stop-loss', () => {",
    `  ${longStop}('never lowers a long stop', () => {`,
    '    expect(Math.max(190, 185)).toBe(190);',
    '  });',
    '',
    `  ${shortStop}('places a short stop above the entry', () => {`,
    '    expect(200 * 1.05).toBe(210);',
    '  });',
    '});',
    '',
  ].join('\n');

/** Scans two revisions as the action does and sorts their changes. */
async function compare(base: Record<string, string>, head: Record<string, string | null>, changed: string[]) {
  const baseRoot = folder();
  const headRoot = folder();
  write(baseRoot, base);
  write(headRoot, { ...base });
  write(headRoot, head);
  const signal = AbortSignal.timeout(60_000);
  return sectionsOf(
    await scanRevision(baseRoot, discover(baseRoot), signal),
    await scanRevision(headRoot, discover(headRoot), signal),
    changed,
  );
}

describe("a pull request's test changes, by section", () => {
  it('sorts what a strategy change does to the tests into the sections the comment shows', async () => {
    const sections = await compare(
      {
        'package.json': VITEST_PACKAGE,
        'vitest.config.ts': CONFIG,
        'src/pnl/fees.ts': FEES,
        'tests/pnl/fees.test.ts': FEES_TEST('    expect(1).toBe(1);\n    expect(1.52).toBe(1.52);'),
        'tests/risk/stop-loss.test.ts': STOP_LOSS_TEST('it', 'it'),
        'tests/indicators/rsi.test.ts': [
          "import { expect, it } from 'vitest';",
          "it('is 0 when prices only fall', () => {\n  expect([5, 4, 3].length).toBe(3);\n});",
          "it('is 100 when prices only rise', () => {\n  expect([3, 4, 5].length).toBe(3);\n});",
          '',
        ].join('\n'),
        'tests/orders/limit-order.test.ts':
          "import { expect, it } from 'vitest';\nit('rejects a zero quantity', () => {\n  expect(0 > 0).toBe(false);\n});\n",
        'tests/strategies/crossover.test.ts': [
          "import { expect, it } from 'vitest';",
          "it('holds when there is no data at all', () => {\n  expect([].length).toBe(0);\n});",
          "it('buys on a golden cross', () => {\n  expect('buy').toBe('buy');\n});",
          '',
        ].join('\n'),
        'tests/portfolio/pnl.test.ts':
          "import { expect, it } from 'vitest';\nit('reports unrealised P&L', () => {\n  expect(1250 - 1000).toBe(250);\n});\n",
      },
      {
        'src/pnl/fees.ts': FEES.replace('minimum = 1', 'minimum = 1.5'),
        'tests/pnl/fees.test.ts': FEES_TEST('    expect(1).toBe(1);'),
        'tests/risk/stop-loss.test.ts': STOP_LOSS_TEST("it.skipIf(process.env.MARKET === 'closed')", 'it.skip'),
        'tests/indicators/rsi.test.ts':
          "import { expect, it } from 'vitest';\nit('is 100 when prices only rise', () => {\n  expect([3, 4, 5].length).toBe(3);\n});\n",
        'tests/orders/limit-order.test.ts': null,
        'tests/strategies/crossover.test.ts': [
          "import { expect, it } from 'vitest';",
          "it('holds when the data client returns no candles', () => {\n  expect([].length).toBe(0);\n});",
          "it('buys when the fast average crosses above the slow one', () => {\n  expect(['buy'].at(0)).toBe('buy');\n});",
          '',
        ].join('\n'),
        'tests/portfolio/pnl.test.ts':
          "import { it } from 'vitest';\nit('reports unrealised P&L', () => {\n  void (1250 - 1000);\n});\n",
        'tests/strategies/mean-reversion.spec.ts':
          "import { expect, it } from 'vitest';\nit('buys below the lower band', () => {\n  expect(94 < 95).toBe(true);\n});\n",
        'tests/orders/market-order.test.ts':
          "import { expect, it } from 'vitest';\nit('fills at the last trade', () => {\n  expect(187.5).toBe(187.5);\n});\n",
      },
      ['src/pnl/fees.ts'],
    );
    expect(sections).toMatchInlineSnapshot(`
      {
        "added": [
          {
            "file": "tests/orders/market-order.test.ts",
            "line": 2,
            "name": "fills at the last trade",
          },
        ],
        "assertsNothing": [
          {
            "file": "tests/portfolio/pnl.test.ts",
            "from": 1,
            "line": 2,
            "name": "reports unrealised P&L",
          },
        ],
        "deletedFiles": [
          {
            "file": "tests/orders/limit-order.test.ts",
            "tests": 1,
          },
        ],
        "fewerAssertions": [
          {
            "file": "tests/pnl/fees.test.ts",
            "from": 2,
            "line": 9,
            "name": "fees › adds the SEC fee only to sales",
            "to": 1,
          },
        ],
        "helpersChanged": [
          {
            "file": "src/pnl/fees.ts",
            "tests": [
              {
                "file": "tests/pnl/fees.test.ts",
                "line": 5,
                "name": "fees › charges the minimum commission on a small order",
              },
            ],
          },
        ],
        "removed": [
          {
            "file": "tests/indicators/rsi.test.ts",
            "line": 2,
            "name": "is 0 when prices only fall",
          },
        ],
        "renamed": [
          {
            "from": {
              "file": "tests/strategies/crossover.test.ts",
              "line": 2,
              "name": "holds when there is no data at all",
            },
            "to": {
              "file": "tests/strategies/crossover.test.ts",
              "line": 2,
              "name": "holds when the data client returns no candles",
            },
          },
        ],
        "rewritten": [
          {
            "added": 1,
            "file": "tests/strategies/crossover.test.ts",
            "removed": 1,
          },
        ],
        "turnedOff": [
          {
            "condition": "process.env.MARKET === 'closed'",
            "reason": null,
            "state": "skip",
            "tests": [
              {
                "count": 1,
                "file": "tests/risk/stop-loss.test.ts",
                "line": 4,
                "name": "stop-loss › never lowers a long stop",
              },
            ],
            "was": null,
          },
          {
            "condition": null,
            "reason": null,
            "state": "skip",
            "tests": [
              {
                "count": 1,
                "file": "tests/risk/stop-loss.test.ts",
                "line": 8,
                "name": "stop-loss › places a short stop above the entry",
              },
            ],
            "was": null,
          },
        ],
        "wontRun": [
          {
            "change": "new",
            "config": "vitest.config.ts",
            "file": "tests/strategies/mean-reversion.spec.ts",
            "tests": 1,
          },
        ],
      }
    `);
    expect(isQuiet(sections)).toBe(false);
  });

  it('reports tests a config change stops collecting, but not a file that never ran, a fixture, or a runner on one side', async () => {
    const unit = (title: string) =>
      `import { expect, it } from 'vitest';\nit('${title}', () => {\n  expect(1).toBe(1);\n});\n`;
    const sections = await compare(
      {
        'package.json': JSON.stringify({ devDependencies: { vitest: '5.0.5', mocha: '11.7.0' } }),
        'vitest.config.ts': CONFIG,
        '.mocharc.yml': 'spec: test/**/*.spec.js\n',
        'tests/indicators/sma.test.ts': unit('averages the last five closes'),
        'tests/pnl/fees.test.ts': unit('charges the minimum commission'),
        'tests/fixtures/broker-fill.test.ts': unit('is a recorded broker fill'),
        'scripts/replay-feed.test.ts': unit('replays a recorded feed'),
        'test/feed.spec.js': "describe('feed', () => {\n  it('reconnects after a drop', () => {});\n});\n",
      },
      {
        'package.json': JSON.stringify({ devDependencies: { vitest: '5.0.5', '@playwright/test': '1.63.0' } }),
        'vitest.config.ts': "export default { test: { include: ['tests/indicators/**/*.test.ts'] } };\n",
        '.mocharc.yml': null,
        'test/feed.spec.js': null,
        'playwright.config.ts': "export default { testDir: 'e2e' };\n",
        'e2e/place-order.spec.ts':
          "import { test } from '@playwright/test';\ntest('places a limit order', async () => {});\n",
      },
      ['vitest.config.ts'],
    );
    expect(sections.wontRun).toEqual([
      { file: 'tests/pnl/fees.test.ts', tests: 1, change: 'stopped', config: 'vitest.config.ts' },
    ]);
    expect(sections.deletedFiles).toEqual([{ file: 'test/feed.spec.js', tests: 1 }]);
    expect(sections.added).toEqual([{ name: 'places a limit order', file: 'e2e/place-order.spec.ts', line: 2 }]);
  });

  it('reports tests that skipped only without a broker key and now always skip, one row for each suite', async () => {
    const broker = (declare: string) =>
      [
        "import { describe, expect, it } from 'vitest';",
        '',
        `${declare}('broker sandbox', () => {`,
        "  describe('paper orders', () => {",
        "    it('places a paper order', () => {\n      expect('accepted').toBe('accepted');\n    });",
        '  });',
        "  it('cancels a paper order', () => {\n    expect('cancelled').toBe('cancelled');\n  });",
        '});',
        '',
        `${declare}('market data', () => {`,
        "  it('streams quotes for a watchlist', () => {\n    expect(['AAPL'].length).toBe(1);\n  });",
        "  it('reconnects after a dropped feed', () => {\n    expect('connected').toBe('connected');\n  });",
        '});',
        '',
        `${declare}('order book', () => {`,
        "  it('shows the best bid and ask', () => {\n    expect(187.49 < 187.51).toBe(true);\n  });",
        '});',
        '',
      ].join('\n');
    const sections = await compare(
      {
        'package.json': VITEST_PACKAGE,
        'vitest.config.ts': CONFIG,
        'tests/broker/sandbox.test.ts': broker('describe.runIf(process.env.BROKER_API_KEY)'),
      },
      { 'tests/broker/sandbox.test.ts': broker('describe.runIf(process.env.BROKER_API_KEY).skip') },
      ['tests/broker/sandbox.test.ts'],
    );
    expect(sections.turnedOff).toEqual([
      {
        state: 'skip',
        condition: null,
        reason: null,
        was: '!(process.env.BROKER_API_KEY)',
        tests: [
          { name: 'broker sandbox', file: 'tests/broker/sandbox.test.ts', line: 3, count: 2 },
          { name: 'market data', file: 'tests/broker/sandbox.test.ts', line: 14, count: 2 },
          { name: 'order book › shows the best bid and ask', file: 'tests/broker/sandbox.test.ts', line: 24, count: 1 },
        ],
      },
    ]);
  });

  it('is quiet when no test changed', async () => {
    const files = {
      'package.json': VITEST_PACKAGE,
      'vitest.config.ts': CONFIG,
      'tests/pnl/fees.test.ts': FEES_TEST('    expect(1).toBe(1);'),
    };
    expect(isQuiet(await compare(files, {}, []))).toBe(true);
  });
});
