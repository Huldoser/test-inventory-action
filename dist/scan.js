import { scan } from 'test-inventory';
import { fileStatuses } from "./statuses.js";
/**
 * Scans a revision's possible test files with every runner it uses. A file several runners read keeps its tests under
 * one runner, so a change to it is reported once: the first that runs it, else the first that refuses it, else the
 * first that sees tests in it without a config or as another framework's.
 */
export async function scanRevision(root, discovery, signal) {
    const patterns = discovery.files.map(literalPattern);
    const scans = [];
    if (patterns.length > 0) {
        for (const framework of discovery.runners)
            scans.push([framework, await scan({ root, framework, patterns, signal })]);
    }
    const statuses = fileStatuses(Object.fromEntries(scans));
    const owners = new Map();
    for (const [framework, inventory] of scans) {
        const about = (code) => new Set(inventory.diagnostics.filter((d) => d.code === code).map((d) => d.relativeFilePath));
        const refused = about('file-not-run');
        const mismatched = about('framework-mismatch');
        for (const file of inventory.files) {
            if (file.testCount === 0)
                continue;
            const { relativeFilePath } = file;
            const rank = mismatched.has(relativeFilePath)
                ? 0
                : refused.has(relativeFilePath)
                    ? 1
                    : file.config === null
                        ? 0
                        : 2;
            const current = owners.get(file.relativeFilePath);
            if (!current || rank > current.rank)
                owners.set(file.relativeFilePath, { framework, rank });
        }
    }
    const inventories = Object.fromEntries(scans.map(([framework, inventory]) => [
        framework,
        {
            ...inventory,
            tests: inventory.tests.filter((test) => owners.get(test.relativeFilePath)?.framework === framework),
        },
    ]));
    return { root, inventories, statuses };
}
/**
 * A glob that matches only this file. Each glob character goes in a class of its own, as `[(]`: a backslash escape
 * would be a folder separator on Windows, and a backslash in a Linux or macOS file name needs escaping too.
 */
export function literalPattern(file) {
    return file.replace(/[\\()[\]{}*?!+@]/g, (character) => `[${character === '\\' ? '\\\\' : character}]`);
}
