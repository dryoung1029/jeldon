# Migration

How engine changes reach consumer projects, and how to apply breaking changes.

## Routine updates (no action)

Package version bumps ride **Renovate** (config shipped in the template). A new
`@jeldon/*` release opens an auto-update PR in every consumer repo; it
auto-merges on green CI. Most updates need nothing from you.

## Scaffold/template updates

Changes to template-owned files (configs, CI workflows, `AGENTS.md`) propagate
via `copier update`, which re-merges upstream template diffs into an existing
project and opens a PR. Resolve any conflicts the same way you would a rebase.

## Breaking changes (codemods)

Structural changes across a major version ship as codemods:

```bash
npx jeldon migrate            # detects current engine version, applies the chain
npx jeldon migrate --to 2.0   # target a specific version
```

Each codemod is idempotent and prints a summary of files touched. Review the
diff, run `jeldon doctor`, and confirm CI is green before merging.

## Versioning

The engine uses **Changesets**. Every change to a `@jeldon/*` package ships with
a changeset describing the bump (patch/minor/major). Major bumps that require a
codemod link the codemod in their changelog entry.
