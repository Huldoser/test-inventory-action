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
const test = (item: TestRef) => `${text(item.name)} ${code(`${item.file}:${item.line}`)}`;

/** A list, cut at the limit with a count of what it leaves out. */
function list(items: string[]): string[] {
  const shown = items.slice(0, LIST_LIMIT).map((item) => `- ${item}`);
  if (items.length > LIST_LIMIT) shown.push(`- and ${items.length - LIST_LIMIT} more`);
  return shown;
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

/** The comment or job summary for a pull request's test changes. */
export function renderReport(sections: Sections, facts: ScanFacts, limit: Limit): string {
  const lines = [MARKER, '### Test changes', ''];
  if (isQuiet(sections)) {
    lines.push('No test stops running, is turned off, removed or left without assertions in this pull request.', '');
  } else {
    const turnedOff = sections.turnedOff.reduce((sum, group) => sum + group.tests.length, 0);
    const deleted = sections.deletedFiles.reduce((sum, file) => sum + file.tests, 0);
    const wontRun = sections.wontRun.reduce((sum, file) => sum + file.tests, 0);
    const headline = [
      wontRun > 0 && `**${plural(wontRun, 'test')} won't run**`,
      turnedOff > 0 && `${plural(turnedOff, 'test')} turned off`,
      sections.removed.length > 0 && `${plural(sections.removed.length, 'test')} removed`,
      deleted > 0 && `${plural(sections.deletedFiles.length, 'test file')} deleted`,
      sections.assertsNothing.length > 0 && `${plural(sections.assertsNothing.length, 'test')} with no assertions left`,
    ].filter(Boolean);
    lines.push(`${headline.join(' · ')}.`, '');
  }
  if (sections.wontRun.length > 0) {
    lines.push("#### Won't run", '');
    lines.push(
      ...list(
        sections.wontRun.map(
          (file) =>
            `${code(file.file)}, ${plural(file.tests, 'test')}: ${
              file.change === 'new' ? 'a new file no runner config collects' : 'no runner config collects it any more'
            }`,
        ),
      ),
      '',
    );
  }
  if (sections.turnedOff.length > 0) {
    lines.push('#### Turned off', '');
    for (const group of sections.turnedOff) {
      const why = [
        group.condition !== null && `when ${code(group.condition)}`,
        group.reason !== null && `reason: ${text(group.reason)}`,
      ].filter(Boolean);
      lines.push(`**${group.state}**${why.length > 0 ? `, ${why.join(', ')}` : ', no reason given'}`, '');
      lines.push(...list(group.tests.map(test)), '');
    }
  }
  if (sections.removed.length > 0) lines.push('#### Removed', '', ...list(sections.removed.map(test)), '');
  if (sections.deletedFiles.length > 0) {
    lines.push('#### Test files deleted', '');
    lines.push(...list(sections.deletedFiles.map((file) => `${code(file.file)}, ${plural(file.tests, 'test')}`)), '');
  }
  if (sections.assertsNothing.length > 0) {
    lines.push('#### No assertions left', '');
    lines.push(
      ...list(sections.assertsNothing.map((item) => `${test(item)}: had ${plural(item.from, '`expect` call')}`)),
      '',
    );
  }
  const details = (title: string, items: string[]) => {
    if (items.length > 0) lines.push(`<details><summary>${title}</summary>`, '', ...list(items), '', '</details>', '');
  };
  details(
    `Rewritten or replaced in the same file (${plural(sections.rewritten.length, 'file')})`,
    sections.rewritten.map((file) => `${code(file.file)}: ${file.removed} removed, ${file.added} added`),
  );
  details(
    `Renamed or moved (${sections.renamed.length})`,
    sections.renamed.map(({ from, to }) =>
      from.name === to.name
        ? `${text(to.name)}: ${code(from.file)} → ${code(`${to.file}:${to.line}`)}`
        : `${text(from.name)} → ${test(to)}`,
    ),
  );
  const helperTests = sections.helpersChanged.reduce((sum, group) => sum + group.tests.length, 0);
  details(
    `Tests whose helpers or source changed (${helperTests})`,
    // A shared helper can reach thousands of tests: those are counted, and only a few are named.
    [...sections.helpersChanged]
      .sort((a, b) => b.tests.length - a.tests.length)
      .map((group) =>
        group.tests.length > HELPER_NAMES
          ? `${code(group.file)}, ${plural(group.tests.length, 'test')}`
          : `${code(group.file)}: ${group.tests.map(test).join(', ')}`,
      ),
  );
  details(
    `Fewer assertions (${sections.fewerAssertions.length})`,
    sections.fewerAssertions.map((item) => `${test(item)}: ${item.from} → ${item.to} \`expect\` calls`),
  );
  details(`Added (${sections.added.length})`, sections.added.map(test));
  const runners = facts.runners.map((runner) =>
    text(runner.version ? `${runner.framework} ${runner.version}` : runner.framework),
  );
  const footer = `<sub>${runners.join(', ')} · base ${facts.base.slice(0, 7)} → head ${facts.head.slice(0, 7)} · ${plural(facts.tests, 'test')} scanned in ${facts.seconds} s without running them · test-inventory ${text(facts.core)}</sub>`;
  let body = lines.join('\n');
  if (body.length > limit.maxLength) {
    body = `${body.slice(0, body.lastIndexOf('\n', limit.maxLength))}\n\n${limit.cutNote}\n`;
  }
  return `${body}\n${footer}\n`;
}
