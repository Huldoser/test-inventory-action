import { existsSync } from 'node:fs';
import path from 'node:path';
import { diffInventories } from 'test-inventory';
/** The sections the comment shows; the others are collapsed. */
export const VISIBLE = ['wontRun', 'turnedOff', 'removed', 'deletedFiles', 'assertsNothing'];
const ref = (test) => ({ name: test.fullName, file: test.relativeFilePath, line: test.lineStart });
/** Orders tests as a reader meets them: by file, then line. */
const byLocation = (a, b) => a.file.localeCompare(b.file, 'en') || a.line - b.line;
/** How many tests a pull request turns off. */
export function turnedOffCount(sections) {
    return sections.turnedOff.reduce((sum, group) => sum + group.tests.reduce((tests, row) => tests + row.count, 0), 0);
}
/** The turned-off tests as rows: one for each describe that turns off two or more of them, one for each other test. */
function rowsOf(tests) {
    const rows = [];
    const bySuite = new Map();
    for (const test of tests.sort((a, b) => byLocation(ref(a), ref(b)))) {
        if (test.stateSource !== 'suite')
            rows.push({ ...ref(test), count: 1 });
        else {
            const key = `${test.relativeFilePath}\0${test.stateLine}`;
            bySuite.set(key, [...(bySuite.get(key) ?? []), test]);
        }
    }
    for (const [first, ...others] of bySuite.values()) {
        if (others.length === 0) {
            rows.push({ ...ref(first), count: 1 });
            continue;
        }
        const shared = others.reduce((prefix, test) => {
            const differs = prefix.findIndex((suite, index) => test.suitePath[index] !== suite);
            return differs === -1 ? prefix : prefix.slice(0, differs);
        }, first.suitePath);
        // A test whose state comes from its suite has the line of the describe that sets it.
        const line = first.stateLine;
        rows.push({ name: shared.join(' > '), file: first.relativeFilePath, line, count: others.length + 1 });
    }
    return rows.sort(byLocation);
}
/**
 * Compares the scans of a pull request's base and head, runner by runner, and sorts what changed into sections. Tests
 * in files that won't run are reported there only, and `changedFiles` says which files a dependency change came from.
 */
export function sectionsOf(base, head, changedFiles) {
    const changed = new Set(changedFiles);
    const testFiles = (scan) => new Set(Object.values(scan.inventories).flatMap((inventory) => inventory.tests.map((test) => test.relativeFilePath)));
    const baseFiles = testFiles(base);
    const testsIn = (scan, file) => Object.values(scan.inventories).reduce((sum, inventory) => sum + inventory.tests.filter((t) => t.relativeFilePath === file).length, 0);
    const sections = {
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
    const wontRun = new Set();
    for (const [file, status] of head.statuses) {
        if (status !== 'wont-run')
            continue;
        wontRun.add(file);
        if (base.statuses.get(file) === 'wont-run')
            continue;
        sections.wontRun.push({ file, tests: testsIn(head, file), change: baseFiles.has(file) ? 'stopped' : 'new' });
    }
    const removed = [];
    const added = [];
    const turnedOff = new Map();
    const helpers = new Map();
    const frameworks = new Set([...Object.keys(base.inventories), ...Object.keys(head.inventories)]);
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
                if (change.after)
                    added.push(change.after);
                else
                    removed.push(change.before);
                continue;
            }
            const { kinds, before: was, after: now } = change;
            if (wontRun.has(now.relativeFilePath))
                continue;
            // A test that skipped only on a condition, such as a missing secret, ran wherever the condition was false:
            // skipping it always turns it off there, though the diff sees only its condition change.
            const always = was.isConditional && !now.isConditional && !now.isActive;
            if (kinds.includes('newlySkipped') || always) {
                const before = always ? was.condition : null;
                const key = `${now.state}\0${now.condition ?? ''}\0${now.reason ?? ''}\0${before ?? ''}`;
                const group = turnedOff.get(key) ?? {
                    state: now.state,
                    condition: now.condition,
                    reason: now.reason,
                    was: before,
                    tests: [],
                };
                group.tests.push(now);
                turnedOff.set(key, group);
            }
            if (was.expectCount > 0 && now.expectCount === 0)
                sections.assertsNothing.push({ ...ref(now), from: was.expectCount });
            else if (now.expectCount < was.expectCount)
                sections.fewerAssertions.push({ ...ref(now), from: was.expectCount, to: now.expectCount });
            if (kinds.includes('renamed') || kinds.includes('moved'))
                sections.renamed.push({ from: ref(was), to: ref(now) });
            if (kinds.includes('dependenciesChanged') && !change.changedFields.includes('bodyHash')) {
                for (const file of now.dependencies) {
                    if (file === now.relativeFilePath || !changed.has(file))
                        continue;
                    helpers.set(file, [...(helpers.get(file) ?? []), ref(now)]);
                }
            }
        }
    }
    sections.turnedOff = [...turnedOff.values()].map((group) => ({ ...group, tests: rowsOf(group.tests) }));
    sections.helpersChanged = [...helpers].map(([file, tests]) => ({ file, tests }));
    // A file that lost tests and gained others was rewritten, or its tests renamed and edited, or replaced: the diff
    // can't tell these apart, so the comment groups them rather than call the old tests removed.
    const addedIn = new Map();
    for (const test of added) {
        if (wontRun.has(test.relativeFilePath))
            continue;
        addedIn.set(test.relativeFilePath, (addedIn.get(test.relativeFilePath) ?? 0) + 1);
    }
    const rewritten = new Map();
    const deleted = new Map();
    for (const test of removed) {
        const file = test.relativeFilePath;
        if (addedIn.has(file))
            rewritten.set(file, (rewritten.get(file) ?? 0) + 1);
        else if (!existsSync(path.join(head.root, file)))
            deleted.set(file, (deleted.get(file) ?? 0) + 1);
        else
            sections.removed.push(ref(test));
    }
    sections.rewritten = [...rewritten].map(([file, count]) => ({
        file,
        removed: count,
        added: addedIn.get(file),
    }));
    sections.deletedFiles = [...deleted].map(([file, tests]) => ({ file, tests }));
    sections.added = added
        .filter((test) => !wontRun.has(test.relativeFilePath) && !rewritten.has(test.relativeFilePath))
        .map(ref)
        .sort(byLocation);
    sections.removed.sort(byLocation);
    sections.assertsNothing.sort(byLocation);
    sections.fewerAssertions.sort(byLocation);
    return sections;
}
/** Whether the comment has nothing to show outside its collapsed sections. */
export function isQuiet(sections) {
    return VISIBLE.every((key) => sections[key].length === 0);
}
