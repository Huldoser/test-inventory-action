import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Framework } from 'test-inventory';
import { discover } from './discover.ts';
import { GitHub } from './github.ts';
import { COMMENT_LIMIT, renderReport, SUMMARY_LIMIT, type ScanFacts, type Source } from './render.ts';
import { parseReport, type Report } from './report.ts';
import { scanRevision } from './scan.ts';
import { isQuiet, sectionsOf, turnedOffCount } from './sections.ts';

/** What a step of the action reads from its environment, as GitHub Actions and `action.yml` set it. */
export interface Context {
  env: Record<string, string | undefined>;
  /** Runs git in a folder, with more environment variables if given, and gives its output. */
  git: (args: string[], cwd: string, env?: Record<string, string>) => string;
  /** The GitHub API client. */
  github: (token: string, apiUrl: string) => GitHub;
  /** Scans one revision. */
  scan: typeof scanRevision;
}

const core = (createRequire(import.meta.url)('test-inventory/package.json') as { version: string }).version;

function required(env: Context['env'], name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set; the action runs in a GitHub Actions workflow.`);
  return value;
}

/** Appends `name=value` lines to the step's outputs. */
function setOutputs(env: Context['env'], outputs: Record<string, string | number>): void {
  const file = required(env, 'GITHUB_OUTPUT');
  appendFileSync(
    file,
    Object.entries(outputs)
      .map(([name, value]) => `${name}=${value}\n`)
      .join(''),
  );
}

/**
 * Git settings that make a fetch from GitHub send the job's token, as `actions/checkout` does: a private repository's
 * checkout without persisted credentials can't fetch otherwise. They go in the environment, never the command line.
 */
function withToken(env: Context['env']): Record<string, string> {
  const credentials = Buffer.from(`x-access-token:${required(env, 'GITHUB_TOKEN')}`).toString('base64');
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: `http.${required(env, 'GITHUB_SERVER_URL')}/.extraheader`,
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${credentials}`,
  };
}

/** Where the report links to, from the step's own run, never from a report a pull request's workflow wrote. */
function sourceOf(env: Context['env']): Source {
  return { server: required(env, 'GITHUB_SERVER_URL'), repository: required(env, 'GITHUB_REPOSITORY') };
}

/** The parts of a `pull_request` event's pull request the scan reads. */
interface PullRequestEvent {
  number: number;
  base: { sha: string; ref: string };
  head: { sha: string };
}

/**
 * The commit a pull request's changes are measured from. A `pull_request` run checks out the pull request merged into
 * its base branch as it is now, so that is the merge's first parent: the event's base.sha doesn't move as the base
 * branch gains commits, and measuring from it would credit the pull request with them. A checkout of the pull
 * request's own head is measured from where it last met the base branch, which GitHub works out without the history
 * a shallow checkout lacks.
 */
async function baseOf(context: Context, pull: PullRequestEvent, workspace: string): Promise<string> {
  const { env, git } = context;
  const parents = [...git(['cat-file', '-p', 'HEAD'], workspace).matchAll(/^parent (\w+)$/gm)].map((match) => match[1]);
  if (parents.length === 2 && parents[1] === pull.head.sha) return parents[0];
  const github = context.github(required(env, 'GITHUB_TOKEN'), env.GITHUB_API_URL ?? 'https://api.github.com');
  return github.mergeBase(required(env, 'GITHUB_REPOSITORY'), pull.base.ref, pull.head.sha);
}

/**
 * Scan mode, in a `pull_request` workflow: scans the pull request's base and head, writes the report to the job summary
 * and to `report.json` in the report folder for the comment step, and sets the outputs. It never fails because of what
 * the report says.
 */
export async function scanPullRequest(context: Context): Promise<void> {
  const { env, git, scan } = context;
  const event = JSON.parse(readFileSync(required(env, 'GITHUB_EVENT_PATH'), 'utf8')) as {
    pull_request?: PullRequestEvent;
  };
  const summary = required(env, 'GITHUB_STEP_SUMMARY');
  const pull = event.pull_request;
  if (!pull) {
    appendFileSync(summary, 'test-inventory reports on `pull_request` events; this run had none to compare.\n');
    setOutputs(env, { 'wont-run': 0, 'turned-off': 0, removed: 0, 'asserts-nothing': 0, 'report-dir': '' });
    return;
  }
  const workspace = required(env, 'GITHUB_WORKSPACE');
  const reportDir = required(env, 'REPORT_DIR');
  const base = await baseOf(context, pull, workspace);
  const started = performance.now();
  try {
    git(['cat-file', '-e', `${base}^{commit}`], workspace);
  } catch {
    git(['fetch', '--no-tags', '--depth=1', 'origin', base], workspace, withToken(env));
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
    } catch (error) {
      if (!signal.aborted) throw error;
      appendFileSync(summary, `test-inventory stopped scanning after ${minutes} minutes, the time limit; no report.\n`);
      setOutputs(env, { 'wont-run': 0, 'turned-off': 0, removed: 0, 'asserts-nothing': 0, 'report-dir': '' });
      return;
    }
    const [baseScan, headScan] = scans;
    const sections = sectionsOf(baseScan, headScan, changed);
    const facts: ScanFacts = {
      runners: Object.entries(headScan.inventories).map(([framework, inventory]) => ({
        framework: framework as Framework,
        version: inventory.frameworkVersion,
      })),
      base,
      head: pull.head.sha,
      tests: Object.values(headScan.inventories).reduce((sum, inventory) => sum + inventory.tests.length, 0),
      seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
      core,
    };
    const report: Report = {
      repository: required(env, 'GITHUB_REPOSITORY'),
      number: pull.number,
      head: pull.head.sha,
      sections,
      facts,
    };
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(path.join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    appendFileSync(summary, renderReport(sections, facts, SUMMARY_LIMIT, sourceOf(env)));
    setOutputs(env, {
      'wont-run': sections.wontRun.reduce((sum, file) => sum + file.tests, 0),
      'turned-off': turnedOffCount(sections),
      removed: sections.removed.length,
      'asserts-nothing': sections.assertsNothing.length,
      'report-dir': reportDir,
    });
  } finally {
    git(['worktree', 'remove', '--force', baseRoot], workspace);
  }
}

/**
 * Comment mode, in a `workflow_run` workflow that runs after the scan: posts the report the scan's artifact holds as
 * the action's one comment on its pull request. The workflow that wrote the artifact ran the pull request's own copy,
 * so the report is checked field by field, and the pull request it names must be at the commit that workflow scanned.
 */
export async function commentOnPullRequest(context: Context): Promise<string> {
  const { env } = context;
  const event = JSON.parse(readFileSync(required(env, 'GITHUB_EVENT_PATH'), 'utf8')) as {
    workflow_run?: { head_sha: string };
  };
  const run = event.workflow_run;
  if (!run) throw new Error('Comment mode runs in a workflow_run workflow, after the workflow that scans.');
  const file = path.join(required(env, 'REPORT_DIR'), 'report.json');
  if (!existsSync(file))
    return 'The scan wrote no report, as on a run that was not for a pull request; nothing to post.';
  const report = parseReport(JSON.parse(readFileSync(file, 'utf8')));
  const repository = required(env, 'GITHUB_REPOSITORY');
  if (report.repository !== repository) throw new Error(`The report is for ${report.repository}, not ${repository}.`);
  const github = context.github(required(env, 'GITHUB_TOKEN'), env.GITHUB_API_URL ?? 'https://api.github.com');
  const head = await github.headOf(repository, report.number);
  if (report.head !== run.head_sha || head !== run.head_sha) {
    return `Pull request #${report.number} is no longer at the commit the scan ran on; a newer scan will post.`;
  }
  const body = renderReport(report.sections, report.facts, COMMENT_LIMIT, sourceOf(env));
  const result = await github.upsertComment(repository, report.number, body, isQuiet(report.sections));
  return `Comment on #${report.number}: ${result}.`;
}

/** Runs the step `MODE` names, with git and the GitHub API of the runner. */
export async function main(env: Context['env']): Promise<string> {
  const context: Context = {
    env,
    git: (args, cwd, extra) =>
      execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        env: { ...process.env, ...extra },
      }),
    github: (token, apiUrl) => new GitHub(token, apiUrl),
    scan: scanRevision,
  };
  if (env.MODE === 'comment') return commentOnPullRequest(context);
  if ((env.MODE ?? 'scan') !== 'scan') throw new Error(`The mode input is scan or comment, not ${env.MODE}.`);
  await scanPullRequest(context);
  return 'Scanned the pull request.';
}
