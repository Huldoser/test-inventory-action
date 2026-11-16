import type { Framework, TestState } from 'test-inventory';
import { isQuiet, turnedOffCount, type Sections, type TestRef } from './sections.ts';

/** The marker that finds the action's comment again on the next push. */
export const MARKER = '<!-- test-inventory-action -->';

/** What the comment's footer says about the scans. */
export interface ScanFacts {
  runners: { framework: Framework; version: string | null }[];
  base: string;
  head: string;
  tests: number;
  seconds: number;
  core: string;
}

const LIST_LIMIT = 50;
const DOCS = 'https://huldoser.github.io/test-inventory';
const README = 'https://github.com/Huldoser/test-inventory-action#readme';
// The logo files of the release the action pins, so a comment keeps its logo whatever later changes on main.
const ASSETS = 'https://raw.githubusercontent.com/Huldoser/test-inventory/v0.11.0/docs/public';
const MARK = `<picture><source media="(prefers-color-scheme: dark)" srcset="${ASSETS}/mark-small-dark.svg"><img src="${ASSETS}/mark-small-light.svg" alt="" width="20" height="20" align="top"></picture>`;

/** Text from the scanned project, such as a title or a reason, shown as plain text: no Markdown, HTML or mention. */
export function text(value: string): string {
  return (
    value
      .replace(/\s+/g, ' ')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Issue references, web addresses and mentions would become links from the bot.
      .replace(/#/g, '&#35;')
      .replace(/@/g, '&#64;')
      .replace(/:\/\//g, '&#58;//')
      .replace(/(www)\./gi, '$1&#46;')
      .replace(/[\\`*_{}[\]~]/g, '\\$&')
  );
}

/** A path or a condition as code, in a fence longer than any run of backticks inside it. */
export function code(value: string): string {
  const flat = value.replace(/\s+/g, ' ');
  const longest = Math.max(0, ...[...flat.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longest + 1);
  const pad = flat.startsWith('`') || flat.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${flat}${pad}${fence}`;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
const agree = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** Joins clauses as a sentence does: "a, b and c". */
const series = (parts: string[]) =>
  parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
/** How the footer names each runner. */
export const RUNNER_NAMES: Record<Framework, string> = {
  playwright: 'Playwright',
  vitest: 'Vitest',
  jest: 'Jest',
  mocha: 'Mocha',
  jasmine: 'Jasmine',
  cypress: 'Cypress',
  webdriverio: 'WebdriverIO',
  node: 'node:test',
  bun: 'Bun',
};

/** Where the report's links point: the GitHub server and the repository of the pull request, from the step's own run. */
export interface Source {
  server: string;
  repository: string;
}

/** A path for a URL: each part encoded, and the parentheses that would end a Markdown link too. */
const urlPath = (file: string) =>
  file
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/[()]/g, (bracket) => (bracket === '(' ? '%28' : '%29')))
    .join('/');

/** How the comment says what turns a group of tests off. */
const STATE_WORDS: Record<TestState, string> = {
  active: 'Active',
  skip: 'Skipped',
  fixme: 'Marked fixme',
  todo: 'Marked todo',
  expectedToFail: 'Expected to fail',
  notLoaded: 'Not loaded',
};
/** How many rows a visible section shows before the rest fold away. */
const SHOWN = 10;

/**
 * A table, cut at the limit with a row that counts what it leaves out. A `|` in a cell would end it, in a code span too,
 * so each one is escaped.
 */
function table(header: string[], rows: string[][], align: string[] = header.map(() => '---')): string[] {
  // A backslash before the escaped pipe would escape the escape, so each one before a pipe is doubled too.
  const line = (cells: string[]) =>
    `| ${cells.map((cell) => cell.replace(/\\*\|/g, (pipe) => `${'\\'.repeat((pipe.length - 1) * 2)}\\|`)).join(' | ')} |`;
  const shown = rows.slice(0, LIST_LIMIT).map(line);
  if (rows.length > LIST_LIMIT)
    shown.push(line([`and ${rows.length - LIST_LIMIT} more`, ...header.slice(1).map(() => '')]));
  return [line(header), `| ${align.join(' | ')} |`, ...shown];
}

/** How long a report may be, and what it says where it is cut. */
export interface Limit {
  maxLength: number;
  cutNote: string;
}

/** A comment stops short of GitHub's 65,536 characters, with room for the footer; the summary has it in full. */
export const COMMENT_LIMIT: Limit = {
  maxLength: 60_000,
  cutNote: 'The report is cut here; the job summary has it in full.',
};
/** A step's job summary may hold 1 MiB. */
export const SUMMARY_LIMIT: Limit = {
  maxLength: 1_000_000,
  cutNote: 'The report is cut here; report.json has it in full.',
};

/** The comment or job summary for a pull request's test changes, with each file and test linked to its lines. */
export function renderReport(sections: Sections, facts: ScanFacts, limit: Limit, source: Source): string {
  const repository = `${source.server}/${source.repository}`;
  const link = (sha: string, file: string, line?: number) =>
    `[${code(line === undefined ? file : `${file}:${line}`)}](${repository}/blob/${sha}/${urlPath(file)}${line === undefined ? '' : `#L${line}`})`;
  // Removed tests and deleted files are only at the base; everything else is at the head.
  const atHead = (item: TestRef) => link(facts.head, item.file, item.line);
  const atBase = (item: TestRef) => link(facts.base, item.file, item.line);
  const lines = [MARKER, `### ${MARK} Test changes`, ''];
  const wontRun = sections.wontRun.reduce((sum, file) => sum + file.tests, 0);
  const turnedOff = turnedOffCount(sections);
  const deleted = sections.deletedFiles.reduce((sum, file) => sum + file.tests, 0);
  if (isQuiet(sections)) {
    lines.push(
      '> [!NOTE]',
      '> No test stops running, is turned off, removed or left without assertions in this pull request.',
      '',
    );
  } else {
    const parts = [
      wontRun > 0 && `${wontRun} won't run`,
      turnedOff > 0 && agree(turnedOff, 'is turned off', 'are turned off'),
      sections.removed.length > 0 && agree(sections.removed.length, 'was removed', 'were removed'),
      deleted > 0 &&
        `${agree(deleted, 'was', 'were')} in ${sections.deletedFiles.length === 1 ? 'a deleted file' : `${sections.deletedFiles.length} deleted files`}`,
      sections.assertsNothing.length > 0 &&
        agree(sections.assertsNothing.length, 'has no assertions left', 'have no assertions left'),
    ].filter((part) => part !== false);
    const total = wontRun + turnedOff + sections.removed.length + deleted + sections.assertsNothing.length;
    lines.push(
      '> [!WARNING]',
      `> **${agree(total, 'test needs', 'tests need')} a look before this merges:** ${series(parts)}.`,
      '>',
      '> This is a heads-up, not a failing check; it updates on every push.',
      '',
    );
  }
  /**
   * A visible section: its heading with the count, a line on what it means and what to do about it, and the docs page
   * that explains it.
   */
  const section = (title: string, count: string, about: string, docs: string) =>
    lines.push(`#### ${title} · ${count}`, '', `<sub>${about} [Docs](${DOCS}/${docs})</sub>`, '');
  /** A visible section's table: the first rows, and the rest folded under them. */
  const rowsOf = (header: string[], rows: string[][], align?: string[]) => {
    lines.push(...table(header, rows.slice(0, SHOWN), align), '');
    if (rows.length > SHOWN)
      lines.push(
        `<details><summary>Show ${rows.length - SHOWN} more</summary>`,
        '',
        ...table(header, rows.slice(SHOWN), align),
        '',
        '</details>',
        '',
      );
  };
  if (sections.wontRun.length > 0) {
    section(
      "Won't run",
      plural(wontRun, 'test'),
      'No runner config collects these files, so CI never runs their tests. Rename each to match its config, or add it to the config.',
      'reference/diagnostics',
    );
    rowsOf(
      ['File', 'Tests', 'Why'],
      sections.wontRun.map((file) => [
        link(facts.head, file.file),
        String(file.tests),
        `${file.change === 'new' ? 'New file' : 'Ran before'}: ${file.config === null ? 'no config collects it' : `${link(facts.head, file.config)} doesn't collect it`}`,
      ]),
      ['---', '--:', '---'],
    );
  }
  if (sections.turnedOff.length > 0) {
    section(
      'Turned off',
      plural(turnedOff, 'test'),
      "Tests that ran before and now don't, grouped by what turns them off. Check each should stay off; a reason in the skip call shows here.",
      'reference/output#how-the-state-is-chosen',
    );
    // Each group's tests share their state and why, so it heads their table rather than repeat in every row.
    for (const group of sections.turnedOff) {
      const word = STATE_WORDS[group.state];
      const how =
        group.was !== null
          ? `**${word} every time**; before, only when ${code(group.was)}`
          : group.condition !== null
            ? `**${word}** when ${code(group.condition)}`
            : `**${word}**`;
      lines.push(
        group.reason !== null
          ? `${how}: ${text(group.reason)}`
          : group.condition === null && group.was === null
            ? `${how}, with no reason given`
            : how,
        '',
      );
      rowsOf(
        ['Test', 'Location'],
        group.tests.map((item) => [
          item.count > 1 ? `${text(item.name)} (${plural(item.count, 'test')})` : text(item.name),
          atHead(item),
        ]),
      );
    }
  }
  if (sections.removed.length > 0) {
    section(
      'Removed',
      plural(sections.removed.length, 'test'),
      'Tests taken out of files that gained no others. Check that what they tested is gone too, or tested elsewhere.',
      'guide/diff#matches-and-changes',
    );
    rowsOf(
      ['Test', 'Was at'],
      sections.removed.map((item) => [text(item.name), atBase(item)]),
    );
  }
  if (sections.deletedFiles.length > 0) {
    section(
      'Test files deleted',
      plural(sections.deletedFiles.length, 'file'),
      'Files this pull request deletes, with the tests they held. Check that what they tested is gone too, or tested elsewhere.',
      'guide/diff#matches-and-changes',
    );
    rowsOf(
      ['File', 'Tests'],
      sections.deletedFiles.map((file) => [link(facts.base, file.file), String(file.tests)]),
      ['---', '--:'],
    );
  }
  if (sections.assertsNothing.length > 0) {
    section(
      'No assertions left',
      plural(sections.assertsNothing.length, 'test'),
      'Tests that had `expect` calls and now have none, so they pass unless the code throws. Add an `expect` back, or remove the test.',
      'reference/output#what-the-body-does',
    );
    rowsOf(
      ['Test', 'Location', 'Had'],
      sections.assertsNothing.map((item) => [text(item.name), atHead(item), plural(item.from, '`expect` call')]),
    );
  }
  const details = (title: string, count: string, header: string[], rows: string[][], align?: string[]) => {
    if (rows.length > 0)
      lines.push(
        `<details><summary><b>${title}</b> · ${count}</summary>`,
        '',
        ...table(header, rows, align),
        '',
        '</details>',
        '',
      );
  };
  details(
    'Rewritten or replaced in the same file',
    plural(sections.rewritten.length, 'file'),
    ['File', 'Removed', 'Added'],
    sections.rewritten.map((file) => [link(facts.head, file.file), String(file.removed), String(file.added)]),
    ['---', '--:', '--:'],
  );
  details(
    'Renamed or moved',
    plural(sections.renamed.length, 'test'),
    ['Test', 'Location', 'Was'],
    sections.renamed.map(({ from, to }) => [
      text(to.name),
      atHead(to),
      [from.name !== to.name && text(from.name), from.file !== to.file && code(from.file)]
        .filter(Boolean)
        .join(', in '),
    ]),
  );
  const helperTests = sections.helpersChanged.reduce((sum, group) => sum + group.tests.length, 0);
  details(
    'Tests whose helpers or source changed',
    plural(helperTests, 'test'),
    ['Changed file', 'Tests'],
    // A shared helper can reach thousands of tests, so each changed file gets a count; report.json names them.
    [...sections.helpersChanged]
      .sort((a, b) => b.tests.length - a.tests.length)
      .map((group) => [link(facts.head, group.file), String(group.tests.length)]),
    ['---', '--:'],
  );
  details(
    'Fewer assertions',
    plural(sections.fewerAssertions.length, 'test'),
    ['Test', 'Location', '`expect` calls'],
    sections.fewerAssertions.map((item) => [text(item.name), atHead(item), `${item.from} → ${item.to}`]),
  );
  details(
    'Added',
    plural(sections.added.length, 'test'),
    ['Test', 'Location'],
    sections.added.map((item) => [text(item.name), atHead(item)]),
  );
  const runners = facts.runners.map((runner) => {
    const name = RUNNER_NAMES[runner.framework];
    return text(runner.version ? `${name} ${runner.version}` : name);
  });
  const commit = (sha: string) => `[\`${sha.slice(0, 7)}\`](${repository}/commit/${sha})`;
  const footer = `<sub>Read from source by [test-inventory](${DOCS}/) ${text(facts.core)}, with no tests run · ${runners.join(', ')} · ${plural(facts.tests, 'test')} in ${facts.seconds} s · base ${commit(facts.base)} → head ${commit(facts.head)} · [About this comment](${README})</sub>`;
  let body = lines.join('\n');
  if (body.length > limit.maxLength) {
    body = `${body.slice(0, body.lastIndexOf('\n', limit.maxLength))}\n\n${limit.cutNote}\n`;
  }
  return `${body}\n${footer}\n`;
}
