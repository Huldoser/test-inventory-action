import type { Framework, Inventory } from 'test-inventory';

/**
 * What the action says about a test file a runner's config refuses: `wont-run` when no runner collects it, or why it
 * leaves the file out: another runner's config runs it, a collected test imports it, it sits in a fixture, template or
 * example folder, it holds type tests that `tsc` checks, or a runner without a config may run it.
 */
export type FileStatus =
  'wont-run' | 'collected-by-another-runner' | 'helper' | 'fixture' | 'type-test' | 'runner-without-config';

const FIXTURE_PATH = /(?:^|\/)(?:__)?(?:fixtures?|templates?|examples?|benchmarks?|bench|mocks?)(?:__)?\//i;
const TYPE_TEST = /[-.](?:test|spec)-d\.[cm]?[jt]sx?$/;

/**
 * The status of each file that a runner's scan reports as `file-not-run`. A file counts as collected only when a config
 * runs it and the runner doesn't report it as another framework's (`framework-mismatch`).
 */
export function fileStatuses(inventories: Partial<Record<Framework, Inventory>>): Map<string, FileStatus> {
  const collected = new Set<string>();
  const maybeCollected = new Set<string>();
  const notRun = new Set<string>();
  const helpers = new Set<string>();
  for (const inventory of Object.values(inventories)) {
    const refused = new Set<string>();
    const mismatched = new Set<string>();
    for (const diagnostic of inventory.diagnostics) {
      if (diagnostic.code === 'file-not-run') refused.add(diagnostic.relativeFilePath);
      if (diagnostic.code === 'framework-mismatch') mismatched.add(diagnostic.relativeFilePath);
    }
    for (const file of refused) notRun.add(file);
    for (const file of inventory.files) {
      if (file.testCount === 0 || refused.has(file.relativeFilePath) || mismatched.has(file.relativeFilePath)) continue;
      (file.config === null ? maybeCollected : collected).add(file.relativeFilePath);
    }
    for (const test of inventory.tests) {
      if (!collected.has(test.relativeFilePath)) continue;
      for (const dependency of test.dependencies) if (dependency !== test.relativeFilePath) helpers.add(dependency);
    }
  }
  const statuses = new Map<string, FileStatus>();
  for (const file of notRun) {
    statuses.set(
      file,
      collected.has(file)
        ? 'collected-by-another-runner'
        : helpers.has(file)
          ? 'helper'
          : FIXTURE_PATH.test(file)
            ? 'fixture'
            : TYPE_TEST.test(file)
              ? 'type-test'
              : maybeCollected.has(file)
                ? 'runner-without-config'
                : 'wont-run',
    );
  }
  return statuses;
}
