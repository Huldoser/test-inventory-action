const FIXTURE_PATH = /(?:^|\/)(?:__)?(?:fixtures?|templates?|examples?|benchmarks?|bench|mocks?)(?:__)?\//i;
const TYPE_TEST = /[-.](?:test|spec)-d\.[cm]?[jt]sx?$/;
/**
 * The status of each file that a runner's scan reports as `file-not-run`. A file counts as collected only when a config
 * runs it and the runner doesn't report it as another framework's (`framework-mismatch`).
 */
export function fileStatuses(inventories) {
    const collected = new Set();
    const maybeCollected = new Set();
    const notRun = new Set();
    for (const inventory of Object.values(inventories)) {
        const refused = new Set();
        const mismatched = new Set();
        for (const diagnostic of inventory.diagnostics) {
            if (diagnostic.code === 'file-not-run')
                refused.add(diagnostic.relativeFilePath);
            if (diagnostic.code === 'framework-mismatch')
                mismatched.add(diagnostic.relativeFilePath);
        }
        for (const file of refused)
            notRun.add(file);
        for (const file of inventory.files) {
            if (file.testCount === 0 || refused.has(file.relativeFilePath) || mismatched.has(file.relativeFilePath))
                continue;
            (file.config === null ? maybeCollected : collected).add(file.relativeFilePath);
        }
    }
    const statuses = new Map();
    for (const file of notRun) {
        statuses.set(file, collected.has(file)
            ? 'collected-by-another-runner'
            : FIXTURE_PATH.test(file)
                ? 'fixture'
                : TYPE_TEST.test(file)
                    ? 'type-test'
                    : maybeCollected.has(file)
                        ? 'runner-without-config'
                        : 'wont-run');
    }
    return statuses;
}
