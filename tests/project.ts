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
 * A git repository with a base commit and a head commit on top of it, as a pull request's checkout: the head's files
 * change the base's, and a null removes one.
 */
export function pullRequest(
  base: Record<string, string>,
  head: Record<string, string | null>,
): { root: string; base: string; head: string } {
  const root = folder();
  git(root, 'init', '-q', '-b', 'main');
  write(root, base);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'base');
  const baseSha = git(root, 'rev-parse', 'HEAD');
  write(root, head);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'head');
  return { root, base: baseSha, head: git(root, 'rev-parse', 'HEAD') };
}

export const VITEST_PACKAGE = JSON.stringify({ devDependencies: { vitest: '5.0.5' } });
