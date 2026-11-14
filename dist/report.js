const STATES = new Set(['active', 'skip', 'fixme', 'todo', 'expectedToFail', 'notLoaded']);
/** A value that isn't what the report format says, from a scan the comment step can't trust. */
function invalid(where) {
    throw new Error(`The scan's report.json isn't one this version of the action writes: ${where} is not valid.`);
}
const isObject = (value) => typeof value === 'object' && value !== null;
const str = (value, where) => (typeof value === 'string' ? value : invalid(where));
const sha = (value, where) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value) ? value : invalid(where);
const slug = (value, where) => typeof value === 'string' && /^[\w.-]+\/[\w.-]+$/.test(value) ? value : invalid(where);
const strOrNull = (value, where) => (value === null ? null : str(value, where));
const count = (value, where) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : invalid(where);
const array = (value, where, item) => Array.isArray(value) ? value.map((entry, index) => item(entry, `${where}[${index}]`)) : invalid(where);
const object = (value, where) => (isObject(value) ? value : invalid(where));
function testRef(value, where) {
    const entry = object(value, where);
    return {
        name: str(entry.name, `${where}.name`),
        file: str(entry.file, `${where}.file`),
        line: count(entry.line, `${where}.line`),
    };
}
/**
 * Reads a report the comment step got from the scan's artifact. A pull request from a fork runs its own copy of the
 * workflow, so the file may be anything: every field is checked, as Markdown is made from it.
 */
export function parseReport(value) {
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
                return { file: str(file.file, `${at}.file`), tests: count(file.tests, `${at}.tests`), change };
            }),
            turnedOff: array(sections.turnedOff, 'turnedOff', (entry, at) => {
                const group = object(entry, at);
                const state = STATES.has(group.state) ? group.state : invalid(`${at}.state`);
                return {
                    state,
                    condition: strOrNull(group.condition, `${at}.condition`),
                    reason: strOrNull(group.reason, `${at}.reason`),
                    tests: array(group.tests, `${at}.tests`, testRef),
                };
            }),
            removed: array(sections.removed, 'removed', testRef),
            deletedFiles: array(sections.deletedFiles, 'deletedFiles', (entry, at) => {
                const file = object(entry, at);
                return { file: str(file.file, `${at}.file`), tests: count(file.tests, `${at}.tests`) };
            }),
            assertsNothing: array(sections.assertsNothing, 'assertsNothing', (entry, at) => ({
                ...testRef(entry, at),
                from: count(object(entry, at).from, `${at}.from`),
            })),
            rewritten: array(sections.rewritten, 'rewritten', (entry, at) => {
                const file = object(entry, at);
                return {
                    file: str(file.file, `${at}.file`),
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
                return { file: str(group.file, `${at}.file`), tests: array(group.tests, `${at}.tests`, testRef) };
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
                    framework: str(runner.framework, `${at}.framework`),
                    version: strOrNull(runner.version, `${at}.version`),
                };
            }),
            base: sha(facts.base, 'facts.base'),
            head: sha(facts.head, 'facts.head'),
            tests: count(facts.tests, 'facts.tests'),
            seconds: typeof facts.seconds === 'number' && Number.isFinite(facts.seconds) && facts.seconds >= 0
                ? facts.seconds
                : invalid('facts.seconds'),
            core: str(facts.core, 'facts.core'),
        },
    };
}
