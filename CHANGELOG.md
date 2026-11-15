# test-inventory-action

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
