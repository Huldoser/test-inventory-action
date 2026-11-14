import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each test scans git repositories it builds; parallel scans can starve time limits on slow CI runners.
    maxWorkers: 1,
    include: ['tests/**/*.test.ts'],
    // The fixture projects contain test files of their own, which are scanned, never run.
    exclude: [...configDefaults.exclude, 'tests/fixtures/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: { 100: true, perFile: true },
    },
  },
});
