# AGENTS.md

Notes for coding agents working in this repository.

## Commands

- `npm ci --ignore-scripts` to install, Node.js 22.12 or newer.
- `npm test` runs the tests; `npm run coverage` must report 100% for every file in `src/`.
- `npm run typecheck`, `npm run lint` and `npm run format:check` must pass.
- `npm run build` after any change to `src/`, and commit `dist/`: the action runs the committed JavaScript, and CI
  fails when `dist/` isn't what the sources build.

## Layout

- `action.yml`: the composite action. It installs the pinned test-inventory with `npm ci --omit=dev` in the action's
  folder and runs `dist/bin.js`. It holds no `uses:` of other actions.
- `src/discover.ts` finds a repository's runners and possible test files; `src/scan.ts` scans one revision with each
  of them; `src/statuses.ts` decides which refused files are reported as won't run.
- `src/sections.ts` sorts a base and head comparison into the comment's sections; `src/render.ts` writes the Markdown.
- `src/report.ts` checks the report the comment step reads; `src/github.ts` is the REST client; `src/main.ts` holds the
  two modes.
- `tests/golden/comment.md`: the comment for a realistic pull request, updated only with
  `npx vitest run tests/render.test.ts -u` and reviewed.

## Conventions that are easy to get wrong

- The action never fails a check because of what it finds; teams gate on its outputs themselves.
- Everything from the scanned project, such as titles, paths, conditions and reasons, reaches Markdown only through
  `text()` or `code()` in `src/render.ts`, and into a table only through `table()`, which escapes the `|` that would
  end a cell.
- The comment step treats `report.json` as untrusted: a fork's workflow writes it. `parseReport` checks every field,
  and the comment is posted only when the pull request is at the commit the scan ran on.
- Inputs reach scripts through `env:`, never `${{ }}` inside `run:`.
- Test examples use the made-up trading app. No toy titles.
