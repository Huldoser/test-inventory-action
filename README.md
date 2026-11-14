# repo-template

The starting point for new repositories: editor and Git settings, `CODEOWNERS`, and a CI workflow whose last job,
`ci`, is the one check a branch ruleset requires.

The community files come from [Huldoser/.github](https://github.com/Huldoser/.github): GitHub shows its code of
conduct, security policy, contributing rules, issue and pull request forms and sponsor links in every repository that
has none of its own. They aren't in clones, packages or downloads.

## Creating a repository

```sh
gh repo create Huldoser/new-repo --template Huldoser/repo-template --private --clone
```

GitHub copies only the files, so each new repository needs its settings set. On AGENVEX, in a WSL terminal,
`agx repo apply Huldoser/new-repo` sets them and reads them back, and `agx repo check Huldoser/new-repo` only shows
what differs. The settings are the same in every repository:

- **Merging:** squash only, with the pull request's title and description as the commit; branches can be updated
  from the pull request and are deleted after the merge; no Projects, Wiki or Discussions.
- **Actions:** only actions pinned to a full commit SHA run; the workflow token is read-only by default and can't
  create or approve pull requests.
- **Releases:** immutable once published.
- **Dependabot:** off: no alerts, security updates or `dependabot.yml`.
- **Sponsoring:** the sponsor button, with the links in Huldoser/.github's `FUNDING.yml`.
- **Public repositories also:** private vulnerability reporting, secret scanning with push protection, CodeQL's
  default setup, and two rulesets that nobody may bypass (GitHub Free has none for private repositories):
  - the default branch: no deletion or force pushes, linear history, a squash-merged pull request and the `ci` check;
  - `v*` tags: no deletion or moving.

## After creating

1. Rewrite this README for the new project, with how to set it up and run its checks.
2. Add the project's jobs to `.github/workflows/ci.yml` and list each in the `ci` job's `needs`.
3. Pin every action to a full commit SHA with its version as a comment, and update the pins by hand when a new
   version comes out.
4. Add a community file only when the project needs more than the shared one, such as a `SECURITY.md` that says what
   counts as a vulnerability. A repository's own `.github/ISSUE_TEMPLATE` folder replaces all the shared issue forms,
   so copy the ones it still wants.
5. Public repositories: choose a licence and add `LICENSE`.
