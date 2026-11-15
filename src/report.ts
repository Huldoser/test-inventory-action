import type { Framework, TestState } from 'test-inventory';
import { RUNNER_NAMES, type ScanFacts } from './render.ts';
import type { Sections, TestRef } from './sections.ts';

/** What the scan hands the comment step: the pull request it is about, and its sections and facts. */
export interface Report {
  repository: string;
  number: number;
  head: string;
  sections: Sections;
  facts: ScanFacts;
}

const STATES = new Set<TestState>(['active', 'skip', 'fixme', 'todo', 'expectedToFail', 'notLoaded']);

/** A value that isn't what the report format says, from a scan the comment step can't trust. */
function invalid(where: string): never {
  throw new Error(`The scan's report.json isn't one this version of the action writes: ${where} is not valid.`);
}

/** The longest title, path, condition or reason a report may hold; the core version and runner versions are short. */
const LONG = 2_000;
const SHORT = 100;
/** The most entries a list in a report may hold. */
const MAX_ITEMS = 100_000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const str = (value: unknown, where: string, max = LONG): string =>
  typeof value === 'string' && value.length <= max ? value : invalid(where);
/** A segment of a plain relative path: not empty, `.` or `..`, and without a backslash or control character. */
function plainSegment(segment: string): boolean {
  if (segment === '' || segment === '.' || segment === '..') return false;
  for (let index = 0; index < segment.length; index++) {
    const code = segment.charCodeAt(index);
    if (code < 0x20 || code === 0x7f || code === 0x5c) return false;
  }
  return true;
}
/** A path in the repository, which becomes a link to it and a code span in a table. */
const path = (value: unknown, where: string): string =>
  typeof value === 'string' && value.length <= LONG && value.split('/').every(plainSegment) ? value : invalid(where);
const sha = (value: unknown, where: string): string =>
  typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : invalid(where);
const slug = (value: unknown, where: string): string =>
  typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value) ? value : invalid(where);
const strOrNull = (value: unknown, where: string, max = LONG): string | null =>
  value === null ? null : str(value, where, max);
const count = (value: unknown, where: string): number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid(where);
const array = <T>(value: unknown, where: string, item: (entry: unknown, at: string) => T): T[] =>
  Array.isArray(value) && value.length <= MAX_ITEMS
    ? value.map((entry, index) => item(entry, `${where}[${index}]`))
    : invalid(where);
const object = (value: unknown, where: string): Record<string, unknown> => (isObject(value) ? value : invalid(where));

function testRef(value: unknown, where: string): TestRef {
  const entry = object(value, where);
  return {
    name: str(entry.name, `${where}.name`),
    file: path(entry.file, `${where}.file`),
    line: count(entry.line, `${where}.line`),
  };
}

/**
 * Reads a report the comment step got from the scan's artifact. A pull request from a fork runs its own copy of the
 * workflow, so the file may be anything: every field is checked, as Markdown is made from it.
 */
export function parseReport(value: unknown): Report {
  const report = object(value, 'the report');
  const sections = object(report.sections, 'sections');
  const facts = object(report.facts, 'facts');
  return {
    repository: slug(report.repository, 'repository'),
    number: count(report.number, 'number'),
    head: sha(report.head, 'head'),
    sections: {
      wontRun: array(sections.wontRun, 'wontRun', (entry, at) => {
        const file = object(entry, at);
        const change = file.change === 'new' || file.change === 'stopped' ? file.change : invalid(`${at}.change`);
        return {
          file: path(file.file, `${at}.file`),
          tests: count(file.tests, `${at}.tests`),
          change,
          config: file.config === null ? null : path(file.config, `${at}.config`),
        };
      }),
      turnedOff: array(sections.turnedOff, 'turnedOff', (entry, at) => {
        const group = object(entry, at);
        const state = STATES.has(group.state as TestState) ? (group.state as TestState) : invalid(`${at}.state`);
        return {
          state,
          condition: strOrNull(group.condition, `${at}.condition`),
          reason: strOrNull(group.reason, `${at}.reason`),
          was: strOrNull(group.was, `${at}.was`),
          tests: array(group.tests, `${at}.tests`, (test, place) => ({
            ...testRef(test, place),
            count: count(object(test, place).count, `${place}.count`),
          })),
        };
      }),
      removed: array(sections.removed, 'removed', testRef),
      deletedFiles: array(sections.deletedFiles, 'deletedFiles', (entry, at) => {
        const file = object(entry, at);
        return { file: path(file.file, `${at}.file`), tests: count(file.tests, `${at}.tests`) };
      }),
      assertsNothing: array(sections.assertsNothing, 'assertsNothing', (entry, at) => ({
        ...testRef(entry, at),
        from: count(object(entry, at).from, `${at}.from`),
      })),
      rewritten: array(sections.rewritten, 'rewritten', (entry, at) => {
        const file = object(entry, at);
        return {
          file: path(file.file, `${at}.file`),
          removed: count(file.removed, `${at}.removed`),
          added: count(file.added, `${at}.added`),
        };
      }),
      renamed: array(sections.renamed, 'renamed', (entry, at) => {
        const pair = object(entry, at);
        return { from: testRef(pair.from, `${at}.from`), to: testRef(pair.to, `${at}.to`) };
      }),
      helpersChanged: array(sections.helpersChanged, 'helpersChanged', (entry, at) => {
        const group = object(entry, at);
        return { file: path(group.file, `${at}.file`), tests: array(group.tests, `${at}.tests`, testRef) };
      }),
      fewerAssertions: array(sections.fewerAssertions, 'fewerAssertions', (entry, at) => ({
        ...testRef(entry, at),
        from: count(object(entry, at).from, `${at}.from`),
        to: count(object(entry, at).to, `${at}.to`),
      })),
      added: array(sections.added, 'added', testRef),
    },
    facts: {
      runners: array(facts.runners, 'facts.runners', (entry, at) => {
        const runner = object(entry, at);
        return {
          framework:
            typeof runner.framework === 'string' && Object.hasOwn(RUNNER_NAMES, runner.framework)
              ? (runner.framework as Framework)
              : invalid(`${at}.framework`),
          version: strOrNull(runner.version, `${at}.version`, SHORT),
        };
      }),
      base: sha(facts.base, 'facts.base'),
      // Links are built from this commit, so it must be the one the comment step checks the pull request is at.
      head: facts.head === report.head ? sha(facts.head, 'facts.head') : invalid('facts.head'),
      tests: count(facts.tests, 'facts.tests'),
      seconds:
        typeof facts.seconds === 'number' && Number.isFinite(facts.seconds) && facts.seconds >= 0
          ? facts.seconds
          : invalid('facts.seconds'),
      core: str(facts.core, 'facts.core', SHORT),
    },
  };
}
