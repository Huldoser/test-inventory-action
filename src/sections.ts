import { existsSync } from 'node:fs';
import path from 'node:path';
import { diffInventories, type Framework, type TestRecord, type TestState } from 'test-inventory';
import type { RevisionScan } from './scan.ts';

/** A test, as the comment names it. */
export interface TestRef {
  name: string;
  file: string;
  line: number;
}

/** What a pull request does to the tests, sorted into the comment's sections. */
export interface Sections {
  /** Test files no runner collects: new ones, and ones a change stopped collecting. */
  wontRun: { file: string; tests: number; change: 'new' | 'stopped' }[];
  /** Existing tests that now skip, grouped by what turns them off. */
  turnedOff: { state: TestState; condition: string | null; reason: string | null; tests: TestRef[] }[];
  /** Tests removed from a file that gained none. */
  removed: TestRef[];
  /** Test files the change deletes. */
  deletedFiles: { file: string; tests: number }[];
  /** Tests that had assertions and now have none. */
  assertsNothing: (TestRef & { from: number })[];
  /** Files where tests were removed and others added: rewritten, renamed and edited, or replaced. */
  rewritten: { file: string; removed: number; added: number }[];
  renamed: { from: TestRef; to: TestRef }[];
  /** Tests whose own code is unchanged but that run a changed file, by that file. */
  helpersChanged: { file: string; tests: TestRef[] }[];
  fewerAssertions: (TestRef & { from: number; to: number })[];
  added: TestRef[];
}

/** The sections the comment shows; the others are collapsed. */
export const VISIBLE = ['wontRun', 'turnedOff', 'removed', 'deletedFiles', 'assertsNothing'] as const;

const ref = (test: TestRecord): TestRef => ({ name: test.fullName, file: test.relativeFilePath, line: test.lineStart });

/**
 * Compares the scans of a pull request's base and head, runner by runner, and sorts what changed into sections. Tests
 * in files that won't run are reported there only, and `changedFiles` says which files a dependency change came from.
 */
export function sectionsOf(base: RevisionScan, head: RevisionScan, changedFiles: string[]): Sections {
  const changed = new Set(changedFiles);
  const testFiles = (scan: RevisionScan) =>
    new Set(
      Object.values(scan.inventories).flatMap((inventory) => inventory.tests.map((test) => test.relativeFilePath)),
    );
  const baseFiles = testFiles(base);
  const testsIn = (scan: RevisionScan, file: string) =>
    Object.values(scan.inventories).reduce(
      (sum, inventory) => sum + inventory.tests.filter((t) => t.relativeFilePath === file).length,
      0,
    );

  const sections: Sections = {
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
  const wontRun = new Set<string>();
  for (const [file, status] of head.statuses) {
    if (status !== 'wont-run') continue;
    wontRun.add(file);
    if (base.statuses.get(file) === 'wont-run') continue;
    sections.wontRun.push({ file, tests: testsIn(head, file), change: baseFiles.has(file) ? 'stopped' : 'new' });
  }

  const removed: TestRecord[] = [];
  const added: TestRecord[] = [];
  const turnedOff = new Map<string, Sections['turnedOff'][number]>();
  const helpers = new Map<string, TestRef[]>();
  const frameworks = new Set([...Object.keys(base.inventories), ...Object.keys(head.inventories)]) as Set<Framework>;
  for (const framework of frameworks) {
    const before = base.inventories[framework];
    const after = head.inventories[framework];
    if (!before || !after) {
      added.push(...(after?.tests ?? []));
      removed.push(...(before?.tests ?? []));
      continue;
    }
    for (const change of diffInventories(before, after).changes) {
      if (change.match === null) {
        if (change.after) added.push(change.after);
        else removed.push(change.before);
        continue;
      }
      const { kinds, before: was, after: now } = change;
      if (wontRun.has(now.relativeFilePath)) continue;
      if (kinds.includes('newlySkipped')) {
        const key = `${now.state}\0${now.condition ?? ''}\0${now.reason ?? ''}`;
        const group = turnedOff.get(key) ?? {
          state: now.state,
          condition: now.condition,
          reason: now.reason,
          tests: [],
        };
        group.tests.push(ref(now));
        turnedOff.set(key, group);
      }
      if (was.expectCount > 0 && now.expectCount === 0)
        sections.assertsNothing.push({ ...ref(now), from: was.expectCount });
      else if (now.expectCount < was.expectCount)
        sections.fewerAssertions.push({ ...ref(now), from: was.expectCount, to: now.expectCount });
      if (kinds.includes('renamed') || kinds.includes('moved')) sections.renamed.push({ from: ref(was), to: ref(now) });
      if (kinds.includes('dependenciesChanged') && !change.changedFields.includes('bodyHash')) {
        for (const file of now.dependencies) {
          if (file === now.relativeFilePath || !changed.has(file)) continue;
          helpers.set(file, [...(helpers.get(file) ?? []), ref(now)]);
        }
      }
    }
  }
  sections.turnedOff = [...turnedOff.values()];
  sections.helpersChanged = [...helpers].map(([file, tests]) => ({ file, tests }));

  // A file that lost tests and gained others was rewritten, or its tests renamed and edited, or replaced: the diff
  // can't tell these apart, so the comment groups them rather than call the old tests removed.
  const addedIn = new Map<string, number>();
  for (const test of added) {
    if (wontRun.has(test.relativeFilePath)) continue;
    addedIn.set(test.relativeFilePath, (addedIn.get(test.relativeFilePath) ?? 0) + 1);
  }
  const rewritten = new Map<string, number>();
  const deleted = new Map<string, number>();
  for (const test of removed) {
    const file = test.relativeFilePath;
    if (addedIn.has(file)) rewritten.set(file, (rewritten.get(file) ?? 0) + 1);
    else if (!existsSync(path.join(head.root, file))) deleted.set(file, (deleted.get(file) ?? 0) + 1);
    else sections.removed.push(ref(test));
  }
  sections.rewritten = [...rewritten].map(([file, count]) => ({
    file,
    removed: count,
    added: addedIn.get(file) as number,
  }));
  sections.deletedFiles = [...deleted].map(([file, tests]) => ({ file, tests }));
  sections.added = added
    .filter((test) => !wontRun.has(test.relativeFilePath) && !rewritten.has(test.relativeFilePath))
    .map(ref);
  return sections;
}

/** Whether the comment has nothing to show outside its collapsed sections. */
export function isQuiet(sections: Sections): boolean {
  return VISIBLE.every((key) => sections[key].length === 0);
}
