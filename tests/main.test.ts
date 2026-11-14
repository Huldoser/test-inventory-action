import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { GitHub } from '../src/github.ts';
import { commentOnPullRequest, main, scanPullRequest, type Context } from '../src/main.ts';
import { MARKER } from '../src/render.ts';
import { scanRevision } from '../src/scan.ts';
import { folder, pullRequest, VITEST_PACKAGE } from './project.ts';

const CONFIG = "export default { test: { include: ['tests/**/*.test.ts'] } };\n";
const LIMIT_ORDER =
  "import { expect, it } from 'vitest';\nit('rejects a zero quantity', () => {\n  expect(0 > 0).toBe(false);\n});\n";
const STOP_ORDER = (call: string) =>
  `import { expect, it } from 'vitest';\n${call}('triggers below the stop price', () => {\n  expect(189 < 190).toBe(true);\n});\n`;
const MEAN_REVERSION =
  "import { expect, it } from 'vitest';\nit('buys below the lower band', () => {\n  expect(94 < 95).toBe(true);\n});\n";

/** A runner's files for one step: the event, the summary and outputs, and where the report goes. */
function runner(event: unknown) {
  const temp = folder();
  const files = {
    event: path.join(temp, 'event.json'),
    summary: path.join(temp, 'summary.md'),
    output: path.join(temp, 'output.txt'),
    reportDir: path.join(temp, 'report'),
  };
  writeFileSync(files.event, JSON.stringify(event));
  writeFileSync(files.summary, '');
  writeFileSync(files.output, '');
  const env = {
    GITHUB_EVENT_PATH: files.event,
    GITHUB_STEP_SUMMARY: files.summary,
    GITHUB_OUTPUT: files.output,
    REPORT_DIR: files.reportDir,
    RUNNER_TEMP: temp,
    GITHUB_REPOSITORY: 'trading-desk/strategy-engine',
  };
  return { env, files, read: (file: string) => readFileSync(file, 'utf8') };
}

const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8' });

function context(env: Context['env'], overrides: Partial<Context> = {}): Context {
  return { env, git, github: (token, apiUrl) => new GitHub(token, apiUrl), scan: scanRevision, ...overrides };
}

/** A pull request that adds a strategy whose tests no config collects and removes a test file. */
function strategyPullRequest() {
  return pullRequest(
    {
      'package.json': VITEST_PACKAGE,
      'vitest.config.ts': CONFIG,
      'tests/orders/limit-order.test.ts': LIMIT_ORDER,
      'tests/orders/stop-order.test.ts': STOP_ORDER('it'),
    },
    {
      'tests/orders/limit-order.test.ts': null,
      'tests/orders/stop-order.test.ts': STOP_ORDER('it.skip'),
      'tests/strategies/mean-reversion.spec.ts': MEAN_REVERSION,
    },
  );
}

describe('scan mode, in a pull_request workflow', () => {
  it('writes the report to the job summary and report.json, sets the outputs and removes the base worktree', async () => {
    const pr = strategyPullRequest();
    const { env, files, read } = runner({
      pull_request: { number: 42, base: { sha: pr.base }, head: { sha: pr.head } },
    });
    expect(await main({ ...env, GITHUB_WORKSPACE: pr.root, MODE: 'scan' })).toBe('Scanned the pull request.');
    expect(read(files.summary)).toContain("**1 test won't run** · 1 test turned off · 1 test file deleted.");
    expect(read(files.output)).toBe(
      `wont-run=1\nturned-off=1\nremoved=0\nasserts-nothing=0\nreport-dir=${files.reportDir}\n`,
    );
    const report = JSON.parse(read(path.join(files.reportDir, 'report.json'))) as { number: number; head: string };
    expect(report).toMatchObject({ number: 42, head: pr.head, repository: 'trading-desk/strategy-engine' });
    expect(git(['worktree', 'list'], pr.root).trim().split('\n')).toHaveLength(1);
  });

  it('fetches the base commit when the checkout lacks it', async () => {
    const pr = strategyPullRequest();
    const { env } = runner({ pull_request: { number: 42, base: { sha: pr.base }, head: { sha: pr.head } } });
    const calls: string[][] = [];
    const lacking = (args: string[], cwd: string) => {
      calls.push(args);
      if (args[0] === 'cat-file') throw new Error('fatal: Not a valid object name');
      return args[0] === 'fetch' ? '' : git(args, cwd);
    };
    await scanPullRequest(context({ ...env, GITHUB_WORKSPACE: pr.root }, { git: lacking }));
    expect(calls).toContainEqual(['fetch', '--no-tags', '--depth=1', 'origin', pr.base]);
  });

  it('writes no report when the scan passes its time limit, and fails the step on any other scan error', async () => {
    const pr = strategyPullRequest();
    const { env, files, read } = runner({
      pull_request: { number: 42, base: { sha: pr.base }, head: { sha: pr.head } },
    });
    await scanPullRequest(context({ ...env, GITHUB_WORKSPACE: pr.root, TIMEOUT_MINUTES: '0' }));
    expect(read(files.summary)).toBe('test-inventory stopped scanning after 0 minutes, the time limit; no report.\n');
    expect(read(files.output)).toContain('wont-run=0\n');
    const broken = () => Promise.reject(new Error('EIO: i/o error, read'));
    await expect(scanPullRequest(context({ ...env, GITHUB_WORKSPACE: pr.root }, { scan: broken }))).rejects.toThrow(
      'EIO',
    );
    expect(git(['worktree', 'list'], pr.root).trim().split('\n')).toHaveLength(1);
  });

  it('says it reports on pull requests on another event', async () => {
    const { env, files, read } = runner({ ref: 'refs/heads/main' });
    await scanPullRequest(context(env));
    expect(read(files.summary)).toBe(
      'test-inventory reports on `pull_request` events; this run had none to compare.\n',
    );
    expect(read(files.output)).toBe('wont-run=0\nturned-off=0\nremoved=0\nasserts-nothing=0\nreport-dir=\n');
  });

  it('needs the variables GitHub Actions sets, and scans when no mode is given', async () => {
    await expect(main({})).rejects.toThrow(
      'GITHUB_EVENT_PATH is not set; the action runs in a GitHub Actions workflow.',
    );
  });
});

/** A local stand-in for the GitHub API: a pull request at a commit, and its comments. */
async function api(head: string) {
  const comments: { id: number; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const route = `${request.method as string} ${(request.url as string).split('?')[0]}`;
      response.setHeader('content-type', 'application/json');
      if (route === 'GET /repos/trading-desk/strategy-engine/pulls/42')
        response.end(JSON.stringify({ head: { sha: head } }));
      else if (route === 'GET /repos/trading-desk/strategy-engine/issues/42/comments')
        response.end(JSON.stringify(comments));
      else if (route === 'POST /repos/trading-desk/strategy-engine/issues/42/comments') {
        comments.push({ id: comments.length + 1, body: (JSON.parse(body) as { body: string }).body });
        response.statusCode = 201;
        response.end('{}');
      } else {
        response.statusCode = 404;
        response.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  onTestFinished(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  );
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, comments };
}

describe('comment mode, in a workflow_run workflow', () => {
  /** The scan's report for a pull request, as scan mode writes it. */
  async function scanned() {
    const pr = strategyPullRequest();
    const scan = runner({ pull_request: { number: 42, base: { sha: pr.base }, head: { sha: pr.head } } });
    await scanPullRequest(context({ ...scan.env, GITHUB_WORKSPACE: pr.root }));
    return { pr, reportDir: scan.files.reportDir };
  }

  it("posts the report on the pull request the scan ran on, as the action's one comment", async () => {
    const { pr, reportDir } = await scanned();
    const github = await api(pr.head);
    const { env } = runner({ workflow_run: { id: 77, head_sha: pr.head } });
    const steps = {
      ...env,
      REPORT_DIR: reportDir,
      GITHUB_TOKEN: 'ghs_EXAMPLE',
      GITHUB_API_URL: github.url,
      MODE: 'comment',
    };
    expect(await main(steps)).toBe('Comment on #42: created.');
    expect(github.comments).toHaveLength(1);
    expect(github.comments[0].body.startsWith(MARKER)).toBe(true);
    expect(github.comments[0].body).toContain('`tests/strategies/mean-reversion.spec.ts`, 1 test');
  });

  it('posts nothing when the pull request moved on from the commit the scan ran on', async () => {
    const { pr, reportDir } = await scanned();
    const moved = await api('0123456789abcdef0123456789abcdef01234567');
    const { env } = runner({ workflow_run: { id: 77, head_sha: pr.head } });
    const steps = context({ ...env, REPORT_DIR: reportDir, GITHUB_TOKEN: 'ghs_EXAMPLE', GITHUB_API_URL: moved.url });
    expect(await commentOnPullRequest(steps)).toBe(
      'Pull request #42 is no longer at the commit the scan ran on; a newer scan will post.',
    );
    const other = runner({ workflow_run: { id: 78, head_sha: '0123456789abcdef0123456789abcdef01234567' } });
    const forged = context({
      ...other.env,
      REPORT_DIR: reportDir,
      GITHUB_TOKEN: 'ghs_EXAMPLE',
      GITHUB_API_URL: moved.url,
    });
    expect(await commentOnPullRequest(forged)).toContain('is no longer at the commit the scan ran on');
    expect(moved.comments).toEqual([]);
  });

  it('refuses a report for another repository, and needs a workflow_run event', async () => {
    const { pr, reportDir } = await scanned();
    const { env } = runner({ workflow_run: { id: 77, head_sha: pr.head } });
    await expect(
      commentOnPullRequest(context({ ...env, REPORT_DIR: reportDir, GITHUB_REPOSITORY: 'trading-desk/risk-engine' })),
    ).rejects.toThrow('The report is for trading-desk/strategy-engine, not trading-desk/risk-engine.');
    const push = runner({ ref: 'refs/heads/main' });
    await expect(main({ ...push.env, MODE: 'comment' })).rejects.toThrow(
      'Comment mode runs in a workflow_run workflow, after the workflow that scans.',
    );
  });

  it('posts nothing when the scan wrote no report', async () => {
    const { env } = runner({ workflow_run: { id: 77, head_sha: '36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00' } });
    mkdirSync(env.REPORT_DIR, { recursive: true });
    expect(await commentOnPullRequest(context(env))).toBe(
      'The scan wrote no report, as on a run that was not for a pull request; nothing to post.',
    );
  });
});

describe('the API the comment step calls', () => {
  it("is GitHub's unless the runner names another", async () => {
    const { pr, reportDir } = await (async () => {
      const pullRequest = strategyPullRequest();
      const scan = runner({
        pull_request: { number: 42, base: { sha: pullRequest.base }, head: { sha: pullRequest.head } },
      });
      await scanPullRequest(context({ ...scan.env, GITHUB_WORKSPACE: pullRequest.root }));
      return { pr: pullRequest, reportDir: scan.files.reportDir };
    })();
    const { env } = runner({ workflow_run: { id: 77, head_sha: pr.head } });
    const urls: string[] = [];
    const github = (token: string, apiUrl: string) => {
      urls.push(apiUrl);
      return new GitHub(token, apiUrl, () => Promise.resolve(new Response('{"message":"stop here"}', { status: 418 })));
    };
    await expect(
      commentOnPullRequest(context({ ...env, REPORT_DIR: reportDir, GITHUB_TOKEN: 'ghs_EXAMPLE' }, { github })),
    ).rejects.toThrow('418');
    expect(urls).toEqual(['https://api.github.com']);
  });
});

describe('the mode input', () => {
  it('is scan or comment', async () => {
    await expect(main({ MODE: 'review' })).rejects.toThrow('The mode input is scan or comment, not review.');
  });
});
