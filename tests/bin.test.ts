import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { folder } from './project.ts';

describe('the step the action runs', () => {
  it('writes what it did to the log', async () => {
    const temp = folder();
    for (const name of ['event.json', 'summary.md', 'output.txt'])
      writeFileSync(path.join(temp, name), name === 'event.json' ? '{}' : '');
    vi.stubEnv('MODE', 'scan');
    vi.stubEnv('GITHUB_EVENT_PATH', path.join(temp, 'event.json'));
    vi.stubEnv('GITHUB_STEP_SUMMARY', path.join(temp, 'summary.md'));
    vi.stubEnv('GITHUB_OUTPUT', path.join(temp, 'output.txt'));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await import('../src/bin.ts');
    expect(write).toHaveBeenCalledWith('Scanned the pull request.\n');
    write.mockRestore();
    vi.unstubAllEnvs();
  });
});
