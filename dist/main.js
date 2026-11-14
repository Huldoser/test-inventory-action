import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { discover } from "./discover.js";
import { GitHub } from "./github.js";
import { COMMENT_LIMIT, renderReport, SUMMARY_LIMIT } from "./render.js";
import { parseReport } from "./report.js";
import { scanRevision } from "./scan.js";
import { isQuiet, sectionsOf } from "./sections.js";
const core = createRequire(import.meta.url)('test-inventory/package.json').version;
function required(env, name) {
    const value = env[name];
    if (!value)
        throw new Error(`${name} is not set; the action runs in a GitHub Actions workflow.`);
    return value;
}
/** Appends `name=value` lines to the step's outputs. */
function setOutputs(env, outputs) {
    const file = required(env, 'GITHUB_OUTPUT');
    appendFileSync(file, Object.entries(outputs)
        .map(([name, value]) => `${name}=${value}\n`)
        .join(''));
}
/**
 * Scan mode, in a `pull_request` workflow: scans the pull request's base and head, writes the report to the job summary
 * and to `report.json` in the report folder for the comment step, and sets the outputs. It never fails because of what
 * the report says.
 */
export async function scanPullRequest(context) {
    const { env, git, scan } = context;
    const event = JSON.parse(readFileSync(required(env, 'GITHUB_EVENT_PATH'), 'utf8'));
    const summary = required(env, 'GITHUB_STEP_SUMMARY');
    const pull = event.pull_request;
    if (!pull) {
        appendFileSync(summary, 'test-inventory reports on `pull_request` events; this run had none to compare.\n');
        setOutputs(env, { 'wont-run': 0, 'turned-off': 0, removed: 0, 'asserts-nothing': 0, 'report-dir': '' });
        return;
    }
    const workspace = required(env, 'GITHUB_WORKSPACE');
    const reportDir = required(env, 'REPORT_DIR');
    const base = pull.base.sha;
    const started = performance.now();
    try {
        git(['cat-file', '-e', `${base}^{commit}`], workspace);
    }
    catch {
        git(['fetch', '--no-tags', '--depth=1', 'origin', base], workspace);
    }
    const baseRoot = path.join(required(env, 'RUNNER_TEMP'), 'test-inventory-base');
    git(['worktree', 'add', '--force', '--detach', baseRoot, base], workspace);
    try {
        const changed = git(['diff', '--name-only', '--no-renames', base, 'HEAD'], workspace).split('\n').filter(Boolean);
        const minutes = Number(env.TIMEOUT_MINUTES ?? '10');
        const signal = AbortSignal.timeout(minutes * 60_000);
        let scans;
        try {
            scans = [await scan(baseRoot, discover(baseRoot), signal), await scan(workspace, discover(workspace), signal)];
        }
        catch (error) {
            if (!signal.aborted)
                throw error;
            appendFileSync(summary, `test-inventory stopped scanning after ${minutes} minutes, the time limit; no report.\n`);
            setOutputs(env, { 'wont-run': 0, 'turned-off': 0, removed: 0, 'asserts-nothing': 0, 'report-dir': '' });
            return;
        }
        const [baseScan, headScan] = scans;
        const sections = sectionsOf(baseScan, headScan, changed);
        const facts = {
            runners: Object.entries(headScan.inventories).map(([framework, inventory]) => ({
                framework,
                version: inventory.frameworkVersion,
            })),
            base,
            head: pull.head.sha,
            tests: Object.values(headScan.inventories).reduce((sum, inventory) => sum + inventory.tests.length, 0),
            seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
            core,
        };
        const report = {
            repository: required(env, 'GITHUB_REPOSITORY'),
            number: pull.number,
            head: pull.head.sha,
            sections,
            facts,
        };
        mkdirSync(reportDir, { recursive: true });
        writeFileSync(path.join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
        appendFileSync(summary, renderReport(sections, facts, SUMMARY_LIMIT));
        setOutputs(env, {
            'wont-run': sections.wontRun.reduce((sum, file) => sum + file.tests, 0),
            'turned-off': sections.turnedOff.reduce((sum, group) => sum + group.tests.length, 0),
            removed: sections.removed.length,
            'asserts-nothing': sections.assertsNothing.length,
            'report-dir': reportDir,
        });
    }
    finally {
        git(['worktree', 'remove', '--force', baseRoot], workspace);
    }
}
/**
 * Comment mode, in a `workflow_run` workflow that runs after the scan: posts the report the scan's artifact holds as
 * the action's one comment on its pull request. The workflow that wrote the artifact ran the pull request's own copy,
 * so the report is checked field by field, and the pull request it names must be at the commit that workflow scanned.
 */
export async function commentOnPullRequest(context) {
    const { env } = context;
    const event = JSON.parse(readFileSync(required(env, 'GITHUB_EVENT_PATH'), 'utf8'));
    const run = event.workflow_run;
    if (!run)
        throw new Error('Comment mode runs in a workflow_run workflow, after the workflow that scans.');
    const file = path.join(required(env, 'REPORT_DIR'), 'report.json');
    if (!existsSync(file))
        return 'The scan wrote no report, as on a run that was not for a pull request; nothing to post.';
    const report = parseReport(JSON.parse(readFileSync(file, 'utf8')));
    const repository = required(env, 'GITHUB_REPOSITORY');
    if (report.repository !== repository)
        throw new Error(`The report is for ${report.repository}, not ${repository}.`);
    const github = context.github(required(env, 'GITHUB_TOKEN'), env.GITHUB_API_URL ?? 'https://api.github.com');
    const head = await github.headOf(repository, report.number);
    if (report.head !== run.head_sha || head !== run.head_sha) {
        return `Pull request #${report.number} is no longer at the commit the scan ran on; a newer scan will post.`;
    }
    const body = renderReport(report.sections, report.facts, COMMENT_LIMIT);
    const result = await github.upsertComment(repository, report.number, body, isQuiet(report.sections));
    return `Comment on #${report.number}: ${result}.`;
}
/** Runs the step `MODE` names, with git and the GitHub API of the runner. */
export async function main(env) {
    const context = {
        env,
        git: (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }),
        github: (token, apiUrl) => new GitHub(token, apiUrl),
        scan: scanRevision,
    };
    if (env.MODE === 'comment')
        return commentOnPullRequest(context);
    if ((env.MODE ?? 'scan') !== 'scan')
        throw new Error(`The mode input is scan or comment, not ${env.MODE}.`);
    await scanPullRequest(context);
    return 'Scanned the pull request.';
}
