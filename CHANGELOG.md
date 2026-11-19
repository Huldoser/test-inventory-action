# test-inventory-action

## 0.2.2

### Patch Changes

- Scan with [test-inventory 0.11.1](https://github.com/Huldoser/test-inventory/releases/tag/v0.11.1), which includes
  parser fixes and counts imported test table rows even when some row values cannot be worked out.

## 0.2.1

### Patch Changes

- Scan test files whose names hold glob characters, as Next.js route groups `app/(desk)/` and dynamic segments
  `app/orders/[orderId]/`, on Windows runners too
  ([#10](https://github.com/Huldoser/test-inventory-action/pull/10)): each character was escaped with a backslash,
  which test-inventory reads as a folder separator on Windows, so those files were left out there. A backslash in a
  Linux or macOS file name is now escaped too.

## 0.2.0

### Minor Changes

- Scans with [test-inventory 0.11.0](https://github.com/Huldoser/test-inventory/releases/tag/v0.11.0)
  ([#8](https://github.com/Huldoser/test-inventory-action/pull/8)): projects on Playwright 1.31 to 1.41, Vitest 1
  and 2, Jest 27 and 28, Jasmine 3, Cypress 10 to 12 and WebdriverIO 7 and 8 are scanned with their own rules instead
  of getting an `unsupported-framework-version` warning, and tests in helpers, re-exported test objects and config
  factories that 0.10.4 missed or misread are compared.

## 0.1.0

### Minor Changes

- The first release. On each pull request, the action scans the base and head with test-inventory 0.10.4 and
  comments with what the change does to the tests, without running them
  ([#1](https://github.com/Huldoser/test-inventory-action/pull/1),
  [#3](https://github.com/Huldoser/test-inventory-action/pull/3),
  [#4](https://github.com/Huldoser/test-inventory-action/pull/4)):
  - tests no runner config collects, naming the config; tests turned off, with the condition and reason, including
    tests that skipped only on a condition and now always skip; tests removed; test files deleted; and tests left
    without assertions;
  - collapsed: rewrites in place, renames and moves, tests whose helpers or source changed, fewer assertions and
    added tests;
  - a verdict at the top, a line on what each finding means and what to do, and every file and test linked to its
    line;
  - one comment, updated on every push, and none when nothing needs a look; it never fails a check.
- Two workflows: a read-only scan on `pull_request`, and a `workflow_run` step that posts the comment, so pull
  requests from forks get it too. The comment step treats the scan's report as untrusted: it checks every field,
  refuses paths and sizes that could change the comment's markup, posts only when the pull request is at the commit
  that was scanned, and only edits a comment a bot wrote
  ([#6](https://github.com/Huldoser/test-inventory-action/pull/6)).
