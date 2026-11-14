import { isQuiet, type Sections, type TestRef } from './sections.ts';

/** The marker that finds the action's comment again on the next push. */
export const MARKER = '<!-- test-inventory-action -->';

/** What the comment's footer says about the scans. */
export interface ScanFacts {
  runners: { framework: string; version: string | null }[];
  base: string;
  head: string;
  tests: number;
  seconds: number;
  core: string;
}

const LIST_LIMIT = 50;
const HELPER_NAMES = 3;
const DOCS = 'https://huldoser.github.io/test-inventory';
// The logo files of the release the action pins, so a comment keeps its logo whatever later changes on main.
const ASSETS = 'https://raw.githubusercontent.com/Huldoser/test-inventory/v0.10.4/docs/public';
const MARK = `<picture><source media="(prefers-color-scheme: dark)" srcset="${ASSETS}/mark-small-dark.svg"><img src="${ASSETS}/mark-small-light.svg" alt="" width="20" height="20" align="top"></picture>`;

/** Text from the scanned project, such as a title or a reason, shown as plain text: no Markdown, HTML or mention. */
export function text(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/@/g, '&#64;')
    .replace(/[\\`*_{}[\]~]/g, '\\$&');
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
const location = (item: TestRef) => code(`${item.file}:${item.line}`);

/**
 * A table, cut at the limit with a row that counts what it leaves out. A `|` in a cell would end it, in a code span too,
 * so each one is escaped.
 */
function table(header: string[], rows: string[][], align: string[] = header.map(() => '---')): string[] {
  const line = (cells: string[]) => `| ${cells.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`;
  const shown = rows.slice(0, LIST_LIMIT).map(line);
  if (rows.length > LIST_LIMIT)
    shown.push(line([`and ${rows.length - LIST_LIMIT} more`, ...header.slice(1).map(() => '')]));
  return [line(header), `| ${align.join(' | ')} |`, ...shown];
}

/** A section's heading, linked to the page of the test-inventory docs that explains it. */
const heading = (title: string, docs: string, label: string) => `#### ${title} · [${label}](${DOCS}/${docs})`;

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

/** The comment or job summary for a pull request's test changes. */
export function renderReport(sections: Sections, facts: ScanFacts, limit: Limit): string {
  const lines = [MARKER, `### ${MARK} Test changes`, ''];
  if (isQuiet(sections)) {
    lines.push('No test stops running, is turned off, removed or left without assertions in this pull request.', '');
  } else {
    const counts = [
      sections.wontRun.reduce((sum, file) => sum + file.tests, 0),
      sections.turnedOff.reduce((sum, group) => sum + group.tests.length, 0),
      sections.removed.length,
      sections.deletedFiles.length,
      sections.assertsNothing.length,
    ];
    lines.push(
      ...table(
        ["Won't run", 'Turned off', 'Removed', 'Test files deleted', 'No assertions left'],
        [counts.map((count) => (count > 0 ? `**${count}**` : '0'))],
        counts.map(() => ':-:'),
      ),
      '',
    );
  }
  if (sections.wontRun.length > 0) {
    lines.push(heading("Won't run", 'reference/diagnostics', '`file-not-run`'), '');
    const why = (change: 'new' | 'stopped') =>
      change === 'new' ? 'a new file no runner config collects' : 'no runner config collects it any more';
    lines.push(
      ...table(
        ['File', 'Tests', 'Why'],
        sections.wontRun.map((file) => [code(file.file), String(file.tests), why(file.change)]),
        ['---', '--:', '---'],
      ),
      '',
    );
  }
  if (sections.turnedOff.length > 0) {
    lines.push(heading('Turned off', 'reference/output#how-the-state-is-chosen', 'how the state is chosen'), '');
    const rows = sections.turnedOff.flatMap((group) => {
      const why =
        [group.condition !== null && `when ${code(group.condition)}`, group.reason !== null && text(group.reason)]
          .filter(Boolean)
          .join('; ') || 'no reason given';
      return group.tests.map((item) => [text(item.name), location(item), code(group.state), why]);
    });
    lines.push(...table(['Test', 'Location', 'State', 'When or why'], rows), '');
  }
  if (sections.removed.length > 0) {
    lines.push(heading('Removed', 'guide/diff#matches-and-changes', 'how tests are matched'), '');
    lines.push(
      ...table(
        ['Test', 'Location'],
        sections.removed.map((item) => [text(item.name), location(item)]),
      ),
      '',
    );
  }
  if (sections.deletedFiles.length > 0) {
    lines.push('#### Test files deleted', '');
    lines.push(
      ...table(
        ['File', 'Tests'],
        sections.deletedFiles.map((file) => [code(file.file), String(file.tests)]),
        ['---', '--:'],
      ),
      '',
    );
  }
  if (sections.assertsNothing.length > 0) {
    lines.push(heading('No assertions left', 'reference/output#what-the-body-does', '`expectCount`'), '');
    lines.push(
      ...table(
        ['Test', 'Location', 'Had'],
        sections.assertsNothing.map((item) => [text(item.name), location(item), plural(item.from, '`expect` call')]),
      ),
      '',
    );
  }
  const details = (title: string, header: string[], rows: string[][]) => {
    if (rows.length > 0)
      lines.push(`<details><summary>${title}</summary>`, '', ...table(header, rows), '', '</details>', '');
  };
  details(
    `Rewritten or replaced in the same file (${plural(sections.rewritten.length, 'file')})`,
    ['File', 'Removed', 'Added'],
    sections.rewritten.map((file) => [code(file.file), String(file.removed), String(file.added)]),
  );
  details(
    `Renamed or moved (${sections.renamed.length})`,
    ['Test', 'Location', 'Was'],
    sections.renamed.map(({ from, to }) => [
      text(to.name),
      location(to),
      [from.name !== to.name && text(from.name), from.file !== to.file && code(from.file)]
        .filter(Boolean)
        .join(', in '),
    ]),
  );
  const helperTests = sections.helpersChanged.reduce((sum, group) => sum + group.tests.length, 0);
  details(
    `Tests whose helpers or source changed (${helperTests})`,
    ['Changed file', 'Tests'],
    // A shared helper can reach thousands of tests: those are counted, and only a few are named.
    [...sections.helpersChanged]
      .sort((a, b) => b.tests.length - a.tests.length)
      .map((group) => [
        code(group.file),
        group.tests.length > HELPER_NAMES
          ? String(group.tests.length)
          : group.tests.map((item) => `${text(item.name)} ${location(item)}`).join(', '),
      ]),
  );
  details(
    `Fewer assertions (${sections.fewerAssertions.length})`,
    ['Test', 'Location', '`expect` calls'],
    sections.fewerAssertions.map((item) => [text(item.name), location(item), `${item.from} → ${item.to}`]),
  );
  details(
    `Added (${sections.added.length})`,
    ['Test', 'Location'],
    sections.added.map((item) => [text(item.name), location(item)]),
  );
  const runners = facts.runners.map((runner) =>
    text(runner.version ? `${runner.framework} ${runner.version}` : runner.framework),
  );
  const footer = `<sub>[test-inventory](${DOCS}/) ${text(facts.core)} · ${runners.join(', ')} · ${plural(facts.tests, 'test')} read in ${facts.seconds} s, none run · base ${facts.base.slice(0, 7)} → head ${facts.head.slice(0, 7)}</sub>`;
  let body = lines.join('\n');
  if (body.length > limit.maxLength) {
    body = `${body.slice(0, body.lastIndexOf('\n', limit.maxLength))}\n\n${limit.cutNote}\n`;
  }
  return `${body}\n${footer}\n`;
}
