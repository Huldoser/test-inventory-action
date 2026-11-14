# test-inventory-action

Comments on each pull request with what it does to the tests, without running them.

The action scans the pull request's base and head with [test-inventory](https://github.com/Huldoser/test-inventory),
which reads Playwright, Vitest, Jest, Mocha, Jasmine, Cypress, WebdriverIO, node:test and Bun tests from source. It
needs no build, no browsers and no install of your project, and it never fails a check.

The comment shows what a reviewer should look at:

- **Won't run**: a new test file no runner config collects, or tests a config change stopped collecting.
- **Turned off**: existing tests that now skip, grouped by the condition or reason.
- **Removed**: tests taken out of a file that gained none.
- **Test files deleted**.
- **No assertions left**: tests that had `expect` calls and now have none.

The rest is collapsed:

- tests rewritten or replaced in the same file;
- renamed or moved tests;
- tests whose helpers or source changed;
- fewer assertions;
- added tests.

When nothing needs a look, the action posts no comment, or updates its earlier one to say so.

## Usage

Two workflows: one scans with read-only access, and one posts the comment once the scan has finished. The second one
never checks out the pull request's code, so the comment works for pull requests from forks too.

```yaml
# .github/workflows/test-changes.yml
name: Test changes
on: pull_request
permissions:
  contents: read
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - id: tests
        uses: Huldoser/test-inventory-action@<commit SHA> # v0.1.0
      - uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: test-inventory-report
          path: ${{ steps.tests.outputs.report-dir }}
          if-no-files-found: ignore
```

```yaml
# .github/workflows/test-changes-comment.yml
name: Test changes comment
on:
  workflow_run:
    workflows: [Test changes]
    types: [completed]
permissions:
  actions: read
  pull-requests: write
jobs:
  comment:
    if: github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: Huldoser/test-inventory-action@<commit SHA> # v0.1.0
        with:
          mode: comment
```

Pin the action to a full commit SHA, as in the examples, and let Dependabot or your workflow lockfile move the pin.

The comment workflow reads the report the scan uploaded as data and checks it field by field. It posts only if the
pull request is still at the commit that was scanned.

## Inputs

| Input             | Default                 | What it does                                                                     |
| ----------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `mode`            | `scan`                  | `scan` in the `pull_request` workflow, `comment` in the `workflow_run` workflow. |
| `github-token`    | `${{ github.token }}`   | Downloads the report and writes the comment, in comment mode.                    |
| `artifact-name`   | `test-inventory-report` | The artifact comment mode downloads; match the scan's upload.                    |
| `timeout-minutes` | `10`                    | The time the scan may take; past it the action stops and writes no report.       |

## Outputs

`wont-run`, `turned-off`, `removed` and `asserts-nothing` count the tests in those sections, and `report-dir` is the
folder with `report.json`. The action never fails because of what it finds. To make a finding block a pull request,
add a step of your own:

```yaml
- if: steps.tests.outputs.wont-run != '0'
  run: |
    echo "::error::Some tests in this pull request won't run; see the job summary."
    exit 1
```

## What it can't see

The scan reads source and configs; it runs nothing. These are out of its reach:

- Tests registered at run time, configs computed from environment variables, and settings it can't work out, which it
  reports as unknown rather than guess.
- A config named only in a CI workflow, or chosen by a wrapper script, rather than in a package.json script.
- Very large repositories may pass the time limit; the job summary then says so.

[Known limits](https://huldoser.github.io/test-inventory/guide/limits) has the scanner's full list.

## Requirements

Node.js 22.12 or newer on the runner, which every GitHub-hosted image has. Self-hosted runners may need
`actions/setup-node` first. The action needs network access to npm to install test-inventory.

## License

[MIT](LICENSE), copyright © 2026 Andrey Rychkov.
