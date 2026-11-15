import { describe, expect, it } from 'vitest';
import { parseReport, type Report } from '../src/report.ts';

const HEAD = '36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00';
const test = { name: 'orders > fills a market order', file: 'tests/orders.test.ts', line: 4 };
const REPORT: Report = {
  repository: 'trading-desk/strategy-engine',
  number: 42,
  head: HEAD,
  sections: {
    wontRun: [{ file: 'tests/strategies/mean-reversion.spec.ts', tests: 3, change: 'new' }],
    turnedOff: [
      { state: 'skip', condition: "browserName === 'webkit'", reason: null, was: null, tests: [{ ...test, count: 1 }] },
    ],
    removed: [test],
    deletedFiles: [{ file: 'tests/orders/limit-order.test.ts', tests: 2 }],
    assertsNothing: [{ ...test, from: 1 }],
    rewritten: [{ file: 'tests/strategies/crossover.test.ts', removed: 1, added: 2 }],
    renamed: [{ from: test, to: { ...test, name: 'orders > fills a market order at the last trade' } }],
    helpersChanged: [{ file: 'src/pnl/fees.ts', tests: [test] }],
    fewerAssertions: [{ ...test, from: 2, to: 1 }],
    added: [test],
  },
  facts: {
    runners: [{ framework: 'vitest', version: '5.0.5' }],
    base: '794d084a1b2c3d4e5f60718293a4b5c6d7e8f901',
    head: HEAD,
    tests: 412,
    seconds: 3.2,
    core: '0.10.4',
  },
};

describe("the scan's report, as the comment step reads it", () => {
  it('reads back what the scan writes', () => {
    expect(parseReport(JSON.parse(JSON.stringify(REPORT)))).toEqual(REPORT);
  });

  // A pull request from a fork runs its own copy of the workflow that writes the report.
  it.each([
    ['the report', null],
    ['repository', { ...REPORT, repository: 'trading-desk/strategy-engine/../other' }],
    ['head', { ...REPORT, head: 'main' }],
    ['number', { ...REPORT, number: -1 }],
    ['sections', { ...REPORT, sections: 'none' }],
    ['wontRun', { ...REPORT, sections: { ...REPORT.sections, wontRun: {} } }],
    [
      'wontRun[0].change',
      { ...REPORT, sections: { ...REPORT.sections, wontRun: [{ file: 'a.spec.ts', tests: 1, change: '**now**' }] } },
    ],
    [
      'turnedOff[0].state',
      { ...REPORT, sections: { ...REPORT.sections, turnedOff: [{ ...REPORT.sections.turnedOff[0], state: 'off' }] } },
    ],
    [
      'turnedOff[0].reason',
      { ...REPORT, sections: { ...REPORT.sections, turnedOff: [{ ...REPORT.sections.turnedOff[0], reason: 7 }] } },
    ],
    [
      'turnedOff[0].tests[0].count',
      {
        ...REPORT,
        sections: {
          ...REPORT.sections,
          turnedOff: [{ ...REPORT.sections.turnedOff[0], tests: [{ ...test, count: 'all' }] }],
        },
      },
    ],
    [
      'facts.runners[0].framework',
      { ...REPORT, facts: { ...REPORT.facts, runners: [{ framework: 'karma', version: '6.4.4' }] } },
    ],
    [
      'turnedOff[0].was',
      { ...REPORT, sections: { ...REPORT.sections, turnedOff: [{ ...REPORT.sections.turnedOff[0], was: ['ci'] }] } },
    ],
    ['removed[0].line', { ...REPORT, sections: { ...REPORT.sections, removed: [{ ...test, line: '4' }] } }],
    ['facts.tests', { ...REPORT, facts: { ...REPORT.facts, tests: '<b>412</b>' } }],
    ['facts.seconds', { ...REPORT, facts: { ...REPORT.facts, seconds: -1 } }],
    [
      'facts.runners[0].version',
      { ...REPORT, facts: { ...REPORT.facts, runners: [{ framework: 'vitest', version: 5 }] } },
    ],
  ])('refuses a report whose %s is not what the scan writes', (where, value) => {
    expect(() => parseReport(value)).toThrow(
      `The scan's report.json isn't one this version of the action writes: ${where} is not valid.`,
    );
  });
});
