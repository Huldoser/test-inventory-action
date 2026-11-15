import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { onTestFinished } from 'vitest';

/** A new temporary folder, removed when the test finishes. */
export function folder(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'test-inventory-action-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

/** Writes files into a folder; a null content removes the file. */
export function write(root: string, files: Record<string, string | null>): void {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    if (content === null) rmSync(file);
    else {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
  }
}

export function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Trading Desk', '-c', 'user.email=desk@example.invalid', ...args], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
}

/**
 * A pull request's checkout as a `pull_request` run has it: the head merged into the base branch. The head's files
 * change the base's, and a null removes one. With `mainAfter`, main moves on after the pull request branched, and
 * `base` is where it branched, as the event's base.sha still says.
 */
export function pullRequest(
  base: Record<string, string>,
  head: Record<string, string | null>,
  mainAfter?: Record<string, string | null>,
): { root: string; base: string; head: string; main: string } {
  const root = folder();
  const commit = (files: Record<string, string | null>, message: string) => {
    write(root, files);
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--allow-empty', '-m', message);
    return git(root, 'rev-parse', 'HEAD');
  };
  git(root, 'init', '-q', '-b', 'main');
  const baseSha = commit(base, 'base');
  git(root, 'checkout', '-q', '-b', 'pr');
  const headSha = commit(head, 'head');
  git(root, 'checkout', '-q', 'main');
  const main = mainAfter ? commit(mainAfter, 'main moves on') : baseSha;
  git(root, 'checkout', '-q', '--detach', 'main');
  git(root, 'merge', '-q', '--no-ff', '-m', 'merge pr into main', 'pr');
  return { root, base: baseSha, head: headSha, main };
}

export const VITEST_PACKAGE = JSON.stringify({ devDependencies: { vitest: '5.0.5' } });
