import { describe, expect, it } from 'vitest';
import { code, COMMENT_LIMIT, renderReport, SUMMARY_LIMIT, text, type ScanFacts, type Source } from '../src/render.ts';
import type { Sections, TestRef } from '../src/sections.ts';

const FACTS: ScanFacts = {
  runners: [
    { framework: 'vitest', version: '5.0.5' },
    { framework: 'playwright', version: null },
  ],
  base: '794d084a1b2c3d4e5f60718293a4b5c6d7e8f901',
  head: '36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00',
  tests: 412,
  seconds: 3.2,
  core: '0.10.4',
};
const SOURCE: Source = { server: 'https://github.com', repository: 'trading-desk/strategy-engine' };
const EMPTY: Sections = {
  wontRun: [],
  turnedOff: [],
  removed: [],
  deletedFiles: [],
  assertsNothing: [],
  rewritten: [],
  renamed: [],
  helpersChanged: [],
  fewerAssertions: [],
  added: [],
};
const t = (name: string, file: string, line: number): TestRef => ({ name, file, line });

describe('the comment and job summary', () => {
  it('shows what needs a look and collapses the rest', async () => {
    const sections: Sections = {
      wontRun: [
        { file: 'tests/strategies/mean-reversion.spec.ts', tests: 3, change: 'new', config: 'vitest.config.ts' },
        { file: 'tests/pnl/fees.test.ts', tests: 4, change: 'stopped', config: 'vitest.config.ts' },
      ],
      turnedOff: [
        {
          state: 'skip',
          condition: "process.env.MARKET === 'closed'",
          reason: 'Alerts only trigger while the market is open',
          was: null,
          tests: [
            {
              ...t('price alerts › notifies when the price crosses above the alert', 'tests/alerts.spec.ts', 11),
              count: 1,
            },
          ],
        },
        {
          state: 'fixme',
          condition: null,
          reason: null,
          was: null,
          tests: [{ ...t('login › asks for a one-time code', 'tests/login.spec.ts', 25), count: 1 }],
        },
        {
          state: 'skip',
          condition: null,
          reason: null,
          was: '!(process.env.BROKER_API_KEY)',
          tests: [{ ...t('broker sandbox', 'tests/broker/sandbox.test.ts', 3), count: 2 }],
        },
      ],
      removed: [t('rsi › is 0 when prices only fall', 'tests/indicators/rsi.test.ts', 16)],
      deletedFiles: [{ file: 'tests/orders/limit-order.test.ts', tests: 1 }],
      assertsNothing: [{ ...t('portfolio › reports unrealised P&L', 'tests/portfolio/pnl.test.ts', 2), from: 1 }],
      rewritten: [{ file: 'tests/strategies/crossover.test.ts', removed: 1, added: 2 }],
      renamed: [
        {
          from: t('latestSignal › holds when there is no data at all', 'tests/strategies/crossover.test.ts', 60),
          to: t(
            'latestSignal › holds when the data client returns no candles',
            'tests/strategies/crossover.test.ts',
            60,
          ),
        },
      ],
      helpersChanged: [
        {
          file: 'src/market-data/client.ts',
          tests: [t('latestSignal › asks for 120 days of candles', 'tests/strategies/crossover.test.ts', 47)],
        },
        {
          file: 'src/pnl/fees.ts',
          tests: Array.from({ length: 7 }, (_, index) =>
            t(`fees › charges tier ${index + 1}`, 'tests/pnl/fees.test.ts', 5 + index * 4),
          ),
        },
      ],
      fewerAssertions: [
        { ...t('fees › adds the SEC fee only to sales', 'tests/pnl/fees.test.ts', 13), from: 2, to: 1 },
      ],
      added: [t('orders › fills a market order at the last trade', 'tests/orders/market-order.test.ts', 4)],
    };
    await expect(renderReport(sections, FACTS, COMMENT_LIMIT, SOURCE)).toMatchFileSnapshot('golden/comment.md');
  });

  it('says nothing needs a look when only collapsed sections have changes', () => {
    const body = renderReport(
      { ...EMPTY, added: [t('orders › fills a market order', 'tests/orders.test.ts', 4)] },
      FACTS,
      SUMMARY_LIMIT,
      SOURCE,
    );
    const [marker, title, , note, line] = body.split('\n');
    expect(marker).toBe('<!-- test-inventory-action -->');
    expect(title).toMatch(/^### <picture>.*mark-small-light\.svg.*<\/picture> Test changes$/);
    expect(note).toBe('> [!NOTE]');
    expect(line).toBe(
      '> No test stops running, is turned off, removed or left without assertions in this pull request.',
    );
    expect(body).not.toContain("| Won't run |");
  });

  it('shows 10 rows of a section, folds the next 50 under them, and cuts a report at its limit', () => {
    const removed = Array.from({ length: 70 }, (_, index) =>
      t(`orders › rejects case ${index}`, 'tests/orders.test.ts', index + 1),
    );
    const body = renderReport(
      { ...EMPTY, removed },
      FACTS,
      { maxLength: 2_000, cutNote: 'The report is cut here.' },
      SOURCE,
    );
    expect(body).toContain('The report is cut here.');
    expect(body.length).toBeLessThan(2_400);
    const full = renderReport({ ...EMPTY, removed }, FACTS, SUMMARY_LIMIT, SOURCE);
    const [shown, folded] = full.split('<details><summary>Show 60 more</summary>');
    expect(shown).toContain('rejects case 9 |');
    expect(shown).not.toContain('rejects case 10 |');
    expect(folded).toContain('rejects case 59 |');
    expect(folded).toContain('| and 10 more |  |');
    expect(folded).not.toContain('rejects case 60 |');
  });
});

describe('a renamed or moved test', () => {
  it('shows the new title when the title changed, and the files when only the file did', () => {
    const body = renderReport(
      {
        ...EMPTY,
        renamed: [
          {
            from: t('fees › charges tier 1', 'tests/pnl/fees.test.ts', 5),
            to: t('fees › charges the first tier', 'tests/pnl/fees.test.ts', 5),
          },
          {
            from: t('crossover › buys on a golden cross', 'tests/crossover.test.ts', 12),
            to: t('crossover › buys on a golden cross', 'tests/strategies/crossover.test.ts', 8),
          },
        ],
      },
      FACTS,
      SUMMARY_LIMIT,
      SOURCE,
    );
    const blob = 'https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00';
    expect(body).toContain(
      `| fees › charges the first tier | [\`tests/pnl/fees.test.ts:5\`](${blob}/tests/pnl/fees.test.ts#L5) | fees › charges tier 1 |\n` +
        `| crossover › buys on a golden cross | [\`tests/strategies/crossover.test.ts:8\`](${blob}/tests/strategies/crossover.test.ts#L8) | \`tests/crossover.test.ts\` |\n`,
    );
  });
});

describe('a table cell', () => {
  it('escapes a pipe in a title or a path, which would end the cell, in a code span too', () => {
    const body = renderReport(
      { ...EMPTY, removed: [t('quotes › splits "BRK.A | BRK.B" into two symbols', 'tests/quotes|legacy.test.ts', 9)] },
      FACTS,
      SUMMARY_LIMIT,
      SOURCE,
    );
    expect(body).toContain(
      '| quotes › splits "BRK.A \\| BRK.B" into two symbols | [`tests/quotes\\|legacy.test.ts:9`](https://github.com/trading-desk/strategy-engine/blob/794d084a1b2c3d4e5f60718293a4b5c6d7e8f901/tests/quotes%7Clegacy.test.ts#L9) |',
    );
  });
});

describe('the verdict at the top', () => {
  it('counts each kind of change in one sentence, in the singular where there is one', () => {
    const body = renderReport(
      {
        ...EMPTY,
        wontRun: [{ file: 'tests/strategies/pairs-trading.spec.ts', tests: 1, change: 'new', config: null }],
        turnedOff: [
          {
            state: 'skip',
            condition: null,
            reason: 'The broker sandbox is down',
            was: null,
            tests: [{ ...t('orders › places a stop order', 'tests/orders.test.ts', 30), count: 1 }],
          },
        ],
        removed: [
          t('rsi › is 0 when prices only fall', 'tests/indicators/rsi.test.ts', 16),
          t('rsi › is 100 when prices only rise', 'tests/indicators/rsi.test.ts', 12),
        ],
        deletedFiles: [
          { file: 'tests/orders/limit-order.test.ts', tests: 2 },
          { file: 'tests/orders/stop-order.test.ts', tests: 1 },
        ],
        assertsNothing: [
          { ...t('portfolio › reports unrealised P&L', 'tests/portfolio/pnl.test.ts', 2), from: 1 },
          { ...t('portfolio › reports realised P&L', 'tests/portfolio/pnl.test.ts', 9), from: 2 },
        ],
      },
      { ...FACTS, runners: [{ framework: 'node', version: '22.12.0' }] },
      COMMENT_LIMIT,
      SOURCE,
    );
    expect(body).toContain(
      "> **9 tests need a look before this merges:** 1 won't run, 1 is turned off, 2 were removed, 3 were in 2 deleted files and 2 have no assertions left.",
    );
    expect(body).toContain('· node:test 22.12.0 ·');
  });

  it('names one kind of change alone, and links a path with brackets so the link still ends where it should', () => {
    const body = renderReport(
      {
        ...EMPTY,
        assertsNothing: [{ ...t('checkout › shows the order total', 'app/(shop)/checkout.test.tsx', 4), from: 3 }],
      },
      FACTS,
      COMMENT_LIMIT,
      SOURCE,
    );
    expect(body).toContain('> **1 test needs a look before this merges:** 1 has no assertions left.');
    expect(body).toContain(
      '[`app/(shop)/checkout.test.tsx:4`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/app/%28shop%29/checkout.test.tsx#L4)',
    );
  });
});

describe('text from the scanned project', () => {
  it('keeps a backslash before a pipe in a path from ending the table cell', () => {
    const body = renderReport(
      { ...EMPTY, deletedFiles: [{ file: 'tests/quotes\\|legacy.test.ts', tests: 1 }] },
      FACTS,
      SUMMARY_LIMIT,
      SOURCE,
    );
    expect(body).toContain('| [`tests/quotes\\\\\\|legacy.test.ts`](');
  });

  it('shows links and issue references in a title as text, not as links', () => {
    expect(text('fills order #42 as in https://desk.example/runbook and www.desk.example')).toBe(
      'fills order &#35;42 as in https&#58;//desk.example/runbook and www&#46;desk.example',
    );
  });

  it('shows a title as plain text, with no Markdown, HTML or mention', () => {
    expect(text('fills **all** <script>alert(1)</script> for @desk-team & [docs](x) `code`\n~~now~~')).toBe(
      'fills \\*\\*all\\*\\* &lt;script&gt;alert(1)&lt;/script&gt; for &#64;desk-team &amp; \\[docs\\](x) \\`code\\` \\~\\~now\\~\\~',
    );
  });

  it('puts a path or condition in a code span that its own backticks cannot close', () => {
    expect(code('tests/orders.spec.ts:12')).toBe('`tests/orders.spec.ts:12`');
    expect(code('`${symbol}` is quoted')).toBe('`` `${symbol}` is quoted ``');
    expect(code('a ``double`` tick')).toBe('```a ``double`` tick```');
  });
});
