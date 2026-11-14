import { describe, expect, it } from 'vitest';
import { code, COMMENT_LIMIT, renderReport, SUMMARY_LIMIT, text, type ScanFacts } from '../src/render.ts';
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
        { file: 'tests/strategies/mean-reversion.spec.ts', tests: 3, change: 'new' },
        { file: 'tests/pnl/fees.test.ts', tests: 4, change: 'stopped' },
      ],
      turnedOff: [
        {
          state: 'skip',
          condition: "process.env.MARKET === 'closed'",
          reason: 'Alerts only trigger while the market is open',
          tests: [t('price alerts > notifies when the price crosses above the alert', 'tests/alerts.spec.ts', 11)],
        },
        {
          state: 'fixme',
          condition: null,
          reason: null,
          tests: [t('login > asks for a one-time code', 'tests/login.spec.ts', 25)],
        },
      ],
      removed: [t('rsi > is 0 when prices only fall', 'tests/indicators/rsi.test.ts', 16)],
      deletedFiles: [{ file: 'tests/orders/limit-order.test.ts', tests: 1 }],
      assertsNothing: [{ ...t('portfolio > reports unrealised P&L', 'tests/portfolio/pnl.test.ts', 2), from: 1 }],
      rewritten: [{ file: 'tests/strategies/crossover.test.ts', removed: 1, added: 2 }],
      renamed: [
        {
          from: t('latestSignal > holds when there is no data at all', 'tests/strategies/crossover.test.ts', 60),
          to: t(
            'latestSignal > holds when the data client returns no candles',
            'tests/strategies/crossover.test.ts',
            60,
          ),
        },
      ],
      helpersChanged: [
        {
          file: 'src/market-data/client.ts',
          tests: [t('latestSignal > asks for 120 days of candles', 'tests/strategies/crossover.test.ts', 47)],
        },
        {
          file: 'src/pnl/fees.ts',
          tests: Array.from({ length: 7 }, (_, index) =>
            t(`fees > charges tier ${index + 1}`, 'tests/pnl/fees.test.ts', 5 + index * 4),
          ),
        },
      ],
      fewerAssertions: [
        { ...t('fees > adds the SEC fee only to sales', 'tests/pnl/fees.test.ts', 13), from: 2, to: 1 },
      ],
      added: [t('orders > fills a market order at the last trade', 'tests/orders/market-order.test.ts', 4)],
    };
    await expect(renderReport(sections, FACTS, COMMENT_LIMIT)).toMatchFileSnapshot('golden/comment.md');
  });

  it('says nothing needs a look when only collapsed sections have changes', () => {
    const body = renderReport(
      { ...EMPTY, added: [t('orders > fills a market order', 'tests/orders.test.ts', 4)] },
      FACTS,
      SUMMARY_LIMIT,
    );
    const [marker, title, , line] = body.split('\n');
    expect(marker).toBe('<!-- test-inventory-action -->');
    expect(title).toMatch(/^### <picture>.*mark-small-light\.svg.*<\/picture> Test changes$/);
    expect(line).toBe('No test stops running, is turned off, removed or left without assertions in this pull request.');
    expect(body).not.toContain("| Won't run |");
  });

  it('lists at most 50 tests in a section and cuts a report at its limit', () => {
    const removed = Array.from({ length: 60 }, (_, index) =>
      t(`orders > rejects case ${index}`, 'tests/orders.test.ts', index + 1),
    );
    const body = renderReport({ ...EMPTY, removed }, FACTS, { maxLength: 2_000, cutNote: 'The report is cut here.' });
    expect(body).toContain('The report is cut here.');
    expect(body.length).toBeLessThan(2_400);
    const full = renderReport({ ...EMPTY, removed }, FACTS, SUMMARY_LIMIT);
    expect(full).toContain('| and 10 more |  |');
    expect(full).not.toContain('rejects case 50');
  });
});

describe('a renamed or moved test', () => {
  it('shows the new title when the title changed, and the files when only the file did', () => {
    const body = renderReport(
      {
        ...EMPTY,
        renamed: [
          {
            from: t('fees > charges tier 1', 'tests/pnl/fees.test.ts', 5),
            to: t('fees > charges the first tier', 'tests/pnl/fees.test.ts', 5),
          },
          {
            from: t('crossover > buys on a golden cross', 'tests/crossover.test.ts', 12),
            to: t('crossover > buys on a golden cross', 'tests/strategies/crossover.test.ts', 8),
          },
        ],
      },
      FACTS,
      SUMMARY_LIMIT,
    );
    expect(body).toContain(
      '| fees &gt; charges the first tier | `tests/pnl/fees.test.ts:5` | fees &gt; charges tier 1 |\n' +
        '| crossover &gt; buys on a golden cross | `tests/strategies/crossover.test.ts:8` | `tests/crossover.test.ts` |\n',
    );
  });
});

describe('a table cell', () => {
  it('escapes a pipe in a title or a path, which would end the cell, in a code span too', () => {
    const body = renderReport(
      { ...EMPTY, removed: [t('quotes > splits "BRK.A | BRK.B" into two symbols', 'tests/quotes|legacy.test.ts', 9)] },
      FACTS,
      SUMMARY_LIMIT,
    );
    expect(body).toContain(
      '| quotes &gt; splits "BRK.A \\| BRK.B" into two symbols | `tests/quotes\\|legacy.test.ts:9` |',
    );
  });
});

describe('text from the scanned project', () => {
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
